import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { answerFrom, callFor } from '../server/assistant/fakeProvider';
import {
  chatLines,
  createFakeOllama,
  QWEN,
  type FakeOllama,
  type FakeOllamaModel,
  type FakeResponse,
} from '../server/assistant/providers/fakeOllama';

/*
 * A mocked Ollama for the end-to-end tests (implementation plan v2.4, phase 5): a real HTTP server
 * on 127.0.0.1 that answers like Ollama, from the permanent `fakeOllama` mock. The app's real
 * Ollama adapter talks to it over HTTP. No Ollama is installed and nothing leaves the machine.
 */

type ChatBody = {
  readonly messages: readonly { role: string; content: string; tool_name?: string }[];
};

/** A model that behaves well: it calls the right analytics tool, then quotes the result. */
export function wellBehavedModel(body: unknown): FakeResponse {
  const { messages } = body as ChatBody;
  const last = messages.at(-1);
  if (last?.role === 'tool' && last.tool_name) {
    return { lines: chatLines.text(answerFrom(last.tool_name, last.content)) };
  }
  const next = callFor(last?.content ?? '');
  return next
    ? { lines: chatLines.toolCall(next.name, next.arguments) }
    : { lines: chatLines.text("I can't answer that from your rides.") };
}

export interface MockOllama {
  readonly url: string;
  readonly fake: FakeOllama;
  /** Requests whose connection the app closed before the answer ended (Stop, Cancel). */
  readonly aborted: string[];
  close(): Promise<void>;
}

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

export async function startMockOllama(): Promise<MockOllama> {
  let models: FakeOllamaModel[] = [QWEN];
  const fake = createFakeOllama({
    models,
    remove: (body) => {
      const name = (body as { model: string }).model;
      const before = models.length;
      models = models.filter((m) => m.name !== name);
      fake.set({ models });
      return models.length < before
        ? { status: 200 }
        : { status: 404, json: { error: `model '${name}' not found` } };
    },
    chat: wellBehavedModel,
    pull: (body) => {
      // Ollama lists a model pulled without a tag as `<name>:latest`.
      const pulled = (body as { model: string }).model;
      const name = pulled.includes(':') ? pulled : `${pulled}:latest`;
      models = [
        ...models.filter((m) => m.name !== name),
        { name, capabilities: ['completion', 'tools'] },
      ];
      fake.set({ models });
      return {
        lineDelayMs: 20,
        lines: [
          { status: 'pulling manifest' },
          { status: 'pulling layer', total: 2_000_000_000, completed: 1_000_000_000 },
          { status: 'pulling layer', total: 2_000_000_000, completed: 2_000_000_000 },
          { status: 'success' },
        ],
      };
    },
  });
  const aborted: string[] = [];

  const server: Server = createServer((req, res) => {
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) {
        aborted.push(req.url ?? '');
        controller.abort();
      }
    });
    void (async () => {
      const body = await readBody(req);
      try {
        const response = await fake.fetch(`http://127.0.0.1${req.url ?? '/'}`, {
          method: req.method ?? 'GET',
          ...(body ? { body } : {}),
          signal: controller.signal,
        });
        res.writeHead(response.status, {
          'content-type': response.headers.get('content-type') ?? 'application/json',
        });
        if (!response.body) return void res.end();
        Readable.fromWeb(response.body as WebReadableStream).pipe(res);
      } catch {
        // Refused or aborted: drop the connection, as a stopped Ollama would.
        res.destroy();
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url,
    fake,
    aborted,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
