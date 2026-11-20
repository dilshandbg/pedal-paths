import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_QUESTION_LENGTH } from '../../src/features/assistant/utils/limits';
import type { AssistantErrorCode } from '../../src/types/assistant';
import { isLLMError } from '../assistant/llm/errors';
import { parseLocalEndpoint } from '../assistant/llm/localEndpoint';
import { ASSISTANT_MESSAGES } from '../assistant/messages';
import { checkModelName, modelKey } from '../assistant/modelRules';
import { AssistantFailure, type AssistantService } from '../assistant/service';
import {
  ApiError,
  apiMiddleware,
  checkLocalRequest,
  pathUnder,
  readJson,
  send,
  type Middleware,
} from './apiSupport';

/*
 * The local assistant API (BR-39 – BR-45, ADR-0014 §7), under `/api/assistant`. Local and checked
 * like the other APIs (NFR-07, NFR-08): loopback peers only, the app's own origin, bounded and
 * validated bodies, and error codes with plain messages only (NFR-12). The browser never talks to
 * the provider: every request goes through this backend.
 *
 * Long answers stream as Server-Sent Events. Closing the stream stops the work behind it.
 */

export const ASSISTANT_PREFIX = '/api/assistant';

/** Request bodies are small JSON objects. */
const MAX_BODY_BYTES = 16 * 1024;
export { MAX_QUESTION_LENGTH };

const STATUS_FOR: Partial<Record<AssistantErrorCode, number>> = {
  'provider-unavailable': 503,
  busy: 503,
  timeout: 504,
  'not-local': 400,
  'model-not-installed': 404,
  'conversation-not-found': 404,
  'no-model-selected': 409,
  'model-remote': 409,
  'model-no-tools': 409,
  'model-not-evaluated': 409,
  'model-failed-evaluation': 409,
  'conversation-busy': 409,
  'model-test-running': 409,
  'invalid-response': 502,
  'model-error': 502,
  'context-too-long': 502,
};

const assistantError = (code: AssistantErrorCode) =>
  new ApiError(STATUS_FOR[code] ?? 500, code, { message: ASSISTANT_MESSAGES[code] });

const invalid = (...problems: string[]) => new ApiError(400, 'invalid-payload', { problems });

/** An abort signal for a request: it aborts when the client goes away before the answer ends. */
function requestSignal(res: ServerResponse): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  return controller.signal;
}

/** Starts a Server-Sent Events response; each event is one JSON object. */
function eventStream(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  return {
    send: (event: unknown) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    end: () => {
      if (!res.writableEnded) res.end();
    },
  };
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const json = await readJson(req, MAX_BODY_BYTES);
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw invalid('The body must be a JSON object.');
  }
  return json as Record<string, unknown>;
}

function only(json: Record<string, unknown>, keys: readonly string[]): void {
  const unknown = Object.keys(json).filter((key) => !keys.includes(key));
  if (unknown.length > 0) throw invalid(`Unknown fields: ${unknown.join(', ')}.`);
}

/** A model name from the path (`/models/<name>` or `/models/<name>/test`), URL-decoded. */
function modelFromPath(encoded: string): string {
  let name: string;
  try {
    name = decodeURIComponent(encoded);
  } catch {
    throw invalid('The model name is not valid.');
  }
  const checked = checkModelName(name);
  if (!checked.ok) throw invalid(checked.problem);
  return checked.name;
}

/** Runs a service call; assistant failures become their error response. */
async function call<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (signal?.aborted) throw new ApiClosed();
    if (error instanceof AssistantFailure) throw assistantError(error.code);
    if (isLLMError(error) && error.kind === 'cancelled') throw new ApiClosed();
    throw error;
  }
}

/** The client went away; there is nobody to answer. */
class ApiClosed extends Error {}

/**
 * Creates the `/api/assistant` middleware. `getService` builds the assistant on first use.
 */
// Implements: BR-39, BR-41, BR-42, BR-43, BR-45, NFR-07, NFR-08, NFR-12
export function createAssistantApi(getService: () => AssistantService): Middleware {
  const watchers = new Map<string, number>();

  async function install(req: IncomingMessage, res: ServerResponse, service: AssistantService) {
    const json = await body(req);
    only(json, ['name']);
    if (typeof json.name !== 'string') throw invalid('name must be a model name.');
    const started = service.downloads.start(json.name);
    if (!started.ok) throw invalid(started.problem);
    const name = started.download.model;
    const key = modelKey(name);
    const stream = eventStream(res);
    watchers.set(key, (watchers.get(key) ?? 0) + 1);
    const stop = service.downloads.watch(name, (download) => {
      stream.send(download);
      if (download.status !== 'downloading') stream.end();
    });
    stream.send(service.downloads.get(name));
    res.on('close', () => {
      stop();
      const left = (watchers.get(key) ?? 1) - 1;
      if (left > 0) watchers.set(key, left);
      else {
        watchers.delete(key);
        // Closing the last stream cancels the download (ADR-0014 §7); joined streams keep it.
        service.downloads.cancel(name);
      }
    });
    const settled = await service.downloads.settled(name);
    if (settled) stream.send(settled);
    stream.end();
  }

  async function ask(
    req: IncomingMessage,
    res: ServerResponse,
    service: AssistantService,
    id: string,
  ) {
    const json = await body(req);
    only(json, ['question']);
    const question = typeof json.question === 'string' ? json.question.trim() : '';
    if (question === '') throw invalid('question must be a non-empty text.');
    if (question.length > MAX_QUESTION_LENGTH) {
      throw invalid(`question must be at most ${MAX_QUESTION_LENGTH} characters.`);
    }
    const signal = requestSignal(res);
    const stream = eventStream(res);
    try {
      for await (const event of service.ask(id, question, signal)) stream.send(event);
    } finally {
      stream.end();
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    checkLocalRequest(req);
    const path = pathUnder(url, ASSISTANT_PREFIX) ?? '';
    const method = req.method ?? 'GET';
    const service = getService();
    const route = (expected: string) => {
      if (method !== expected) throw new ApiError(405, 'method-not-allowed');
    };

    try {
      if (path === '/status') {
        route('GET');
        const signal = requestSignal(res);
        return send(res, 200, await call(() => service.status(signal), signal));
      }
      if (path === '/settings') {
        if (method === 'GET') {
          return send(res, 200, { settings: service.settings(), providers: service.providers() });
        }
        route('PUT');
        const json = await body(req);
        only(json, ['serverUrl', 'model']);
        const updated = service.updateSettings(json);
        if (!updated.ok) throw invalid(...updated.problems);
        return send(res, 200, { settings: updated.settings });
      }
      if (path === '/test-connection') {
        route('POST');
        const json = await body(req);
        only(json, ['serverUrl']);
        let serverUrl: string | null = null;
        if (json.serverUrl !== undefined) {
          const checked =
            typeof json.serverUrl === 'string' ? parseLocalEndpoint(json.serverUrl) : null;
          if (!checked) throw invalid('serverUrl must be a text.');
          if (!checked.ok) throw invalid(checked.problem);
          serverUrl = checked.url.origin;
        }
        const signal = requestSignal(res);
        return send(res, 200, await call(() => service.testConnection(serverUrl, signal), signal));
      }
      if (path === '/models') {
        route('GET');
        const signal = requestSignal(res);
        const models = await call(() => service.listModels(signal), signal);
        return send(res, 200, { models, downloads: service.downloads.list() });
      }
      if (path === '/models/install') {
        route('POST');
        return await install(req, res, service);
      }
      if (path.startsWith('/models/')) {
        const rest = path.slice('/models/'.length);
        if (rest.endsWith('/test')) {
          route('POST');
          const name = modelFromPath(rest.slice(0, -'/test'.length));
          const signal = requestSignal(res);
          const evaluation = await call(() => service.testModel(name, signal), signal);
          return send(res, 200, { evaluation });
        }
        route('DELETE');
        const name = modelFromPath(rest);
        const signal = requestSignal(res);
        return send(res, 200, await call(() => service.removeModel(name, signal), signal));
      }
      if (path === '/conversations') {
        route('POST');
        return send(res, 201, { id: service.startConversation() });
      }
      const conversation = /^\/conversations\/([A-Za-z0-9_-]{1,64})(\/messages)?$/.exec(path);
      if (conversation) {
        const id = conversation[1]!; // the pattern matched, so the group exists
        if (conversation[2]) {
          route('POST');
          return await ask(req, res, service, id);
        }
        route('DELETE');
        service.endConversation(id);
        return send(res, 204);
      }
      throw new ApiError(404, 'not-found');
    } catch (error) {
      if (error instanceof ApiClosed) {
        if (!res.writableEnded) res.end();
        return;
      }
      throw error;
    }
  }

  return apiMiddleware([ASSISTANT_PREFIX], 'Assistant API', handle);
}
