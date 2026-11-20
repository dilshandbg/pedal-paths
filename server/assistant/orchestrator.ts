import { localDate } from '../../src/features/analytics/services/dateRange';
import type {
  AssistantErrorCode,
  AssistantEvent,
  AssistantToolUse,
  ModelSuitability,
} from '../../src/types/assistant';
import type { ConversationStore } from './conversations';
import { cancelled, isLLMError } from './llm/errors';
import { withTimeouts } from './llm/streams';
import type { ChatMessage, LLMProvider, ModelInfo, ToolCall } from './llm/types';
import { ASSISTANT_MESSAGES, codeForLLMError } from './messages';
import { findModel, isLocalModel } from './modelRules';
import { buildSystemPrompt, type HistorySummary } from './systemPrompt';
import type { AssistantTool } from './tools/analyticsTools';

/*
 * The assistant's orchestrator (BR-39, BR-45, RULE-25, RULE-26, ADR-0014 §5). Provider-neutral:
 * it talks to a model only through `LLMProvider`, and to the ride data only through tools.
 *
 * One question is one turn: check the model, then up to `maxRounds` model calls, running the
 * tools the model asks for in between, until the model answers without calling a tool.
 */

export interface AssistantLimits {
  /** Connection check before a question (OD-37). */
  readonly connectionCheckMs: number;
  /** Wait for the first part of each model response; a model may be loading (OD-37). */
  readonly firstResponseMs: number;
  /** Wait between two parts of a model response (OD-37). */
  readonly idleMs: number;
  /** Model calls per question (OD-37). */
  readonly maxRounds: number;
  /** Largest context window used, in tokens (OD-37). */
  readonly maxContextTokens: number;
  /** Context window when the model does not report one. */
  readonly defaultContextTokens: number;
  readonly maxOutputTokens: number;
}

export const DEFAULT_LIMITS: AssistantLimits = {
  connectionCheckMs: 3_000,
  firstResponseMs: 180_000,
  idleMs: 60_000,
  maxRounds: 6,
  maxContextTokens: 16_384,
  defaultContextTokens: 8_192,
  maxOutputTokens: 1_024,
};

/** A rough, conservative size of a token in characters, to fit history into the context. */
const CHARS_PER_TOKEN = 3;

const error = (code: AssistantErrorCode): AssistantEvent => ({
  type: 'error',
  code,
  message: ASSISTANT_MESSAGES[code],
});

const messageSize = (message: ChatMessage): number =>
  message.role === 'tool'
    ? message.content.length
    : message.role === 'user'
      ? message.text.length
      : message.text.length + JSON.stringify(message.toolCalls).length;

/**
 * The newest whole turns of a conversation that fit in `budgetChars`. A turn starts with a user
 * message; older turns are dropped first, and a turn is never cut in half.
 */
export function fitHistory(
  history: readonly ChatMessage[],
  budgetChars: number,
): readonly ChatMessage[] {
  const turns: ChatMessage[][] = [];
  for (const message of history) {
    if (message.role === 'user' || turns.length === 0) turns.push([]);
    turns[turns.length - 1]!.push(message); // a turn was pushed just above when there was none
  }
  const kept: ChatMessage[][] = [];
  let size = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i]!; // i is in range
    const turnSize = turn.reduce((sum, message) => sum + messageSize(message), 0);
    if (size + turnSize > budgetChars) break;
    size += turnSize;
    kept.unshift(turn);
  }
  return kept.flat();
}

export const contextTokensFor = (model: ModelInfo, limits: AssistantLimits): number =>
  Math.min(model.contextWindow ?? limits.defaultContextTokens, limits.maxContextTokens);

export type ModelCheck =
  | { readonly ok: true; readonly model: ModelInfo }
  | { readonly ok: false; readonly code: AssistantErrorCode };

/**
 * Whether a model may be asked at all (RULE-26, RULE-27): the provider is reachable, and the model
 * is installed, local and not known to lack tool calling. Generates nothing.
 */
export async function checkModel(
  provider: LLMProvider,
  modelName: string,
  limits: AssistantLimits,
  signal: AbortSignal,
): Promise<ModelCheck> {
  const timeout = AbortSignal.timeout(limits.connectionCheckMs);
  const both = AbortSignal.any([signal, timeout]);
  try {
    await provider.checkConnection(both);
    const model = findModel(await provider.listModels(both), modelName);
    if (!model) return { ok: false, code: 'model-not-installed' };
    if (!isLocalModel(model)) return { ok: false, code: 'model-remote' };
    if (model.capabilities.toolCalling === false) return { ok: false, code: 'model-no-tools' };
    return { ok: true, model };
  } catch (failure) {
    if (timeout.aborted && !signal.aborted) return { ok: false, code: 'provider-unavailable' };
    if (isLLMError(failure)) {
      return {
        ok: false,
        code: failure.kind === 'timeout' ? 'provider-unavailable' : codeForLLMError(failure.kind),
      };
    }
    throw failure;
  }
}

export interface TurnInput {
  readonly provider: LLMProvider;
  readonly model: ModelInfo;
  readonly tools: readonly AssistantTool[];
  readonly system: string;
  readonly history: readonly ChatMessage[];
  readonly question: string;
  readonly limits: AssistantLimits;
  readonly signal: AbortSignal;
  /** Receives the turn's messages (question, answers, tool results) when it completes. */
  readonly onComplete?: (messages: readonly ChatMessage[]) => void;
  readonly log?: (message: string) => void;
}

/**
 * Runs one question against a model that passed `checkModel`. Yields text and tool uses as they
 * happen, then exactly one `done` or `error`. Nothing is kept unless the turn completes.
 */
// Implements: BR-39, BR-45, RULE-25, AC-43, AC-44, AC-52, AC-53
export async function* runTurn(input: TurnInput): AsyncGenerator<AssistantEvent> {
  const { provider, model, tools, system, limits, signal } = input;
  const definitions = tools.map((tool) => tool.definition);
  const contextTokens = contextTokensFor(model, limits);
  const reserved =
    system.length +
    JSON.stringify(definitions).length +
    input.question.length +
    limits.maxOutputTokens * CHARS_PER_TOKEN;
  const history = fitHistory(input.history, contextTokens * CHARS_PER_TOKEN - reserved);
  const turn: ChatMessage[] = [{ role: 'user', text: input.question }];
  let callCount = 0;

  try {
    for (let round = 1; round <= limits.maxRounds; round += 1) {
      const inner = new AbortController();
      const stream = withTimeouts(
        provider.generate(
          {
            model: model.id,
            system,
            messages: [...history, ...turn],
            tools: definitions,
            contextTokens,
            maxOutputTokens: limits.maxOutputTokens,
          },
          AbortSignal.any([signal, inner.signal]),
        ),
        { firstMs: limits.firstResponseMs, idleMs: limits.idleMs },
        () => inner.abort(),
      );
      let text = '';
      const calls: ToolCall[] = [];
      let reason: 'stop' | 'tool-calls' | 'length' = 'stop';
      for await (const event of stream) {
        if (signal.aborted) throw cancelled(); // even if a provider ignores the signal
        if (event.type === 'text') {
          if (event.delta === '') continue;
          text += event.delta;
          yield { type: 'text', delta: event.delta };
        } else if (event.type === 'tool-call') {
          // Ids must be unique in the conversation; a provider's own may repeat across rounds.
          callCount += 1;
          calls.push({ ...event.call, id: `${event.call.id}#${callCount}` });
        } else {
          reason = event.reason;
        }
      }
      turn.push({ role: 'assistant', text, toolCalls: calls });

      if (calls.length === 0) {
        if (text.trim() === '') {
          yield error('invalid-response');
          return;
        }
        input.onComplete?.(turn);
        yield { type: 'done', reason: reason === 'length' ? 'length' : 'stop' };
        return;
      }
      if (round === limits.maxRounds) break;

      for (const call of calls) {
        const { use, message } = runTool(tools, call, input.log);
        turn.push(message);
        yield { type: 'tool', use };
      }
    }
    yield error('round-limit');
  } catch (failure) {
    if (signal.aborted) {
      yield { type: 'done', reason: 'cancelled' };
    } else if (isLLMError(failure)) {
      input.log?.(`Assistant: model request failed (${failure.message}).`);
      yield error(failure.kind === 'cancelled' ? 'internal' : codeForLLMError(failure.kind));
    } else {
      input.log?.(`Assistant: unexpected failure (${(failure as Error).message}).`);
      yield error('internal');
    }
  }
}

/** Runs one tool call locally; unknown tools and failures go back to the model as tool errors. */
function runTool(
  tools: readonly AssistantTool[],
  call: ToolCall,
  log?: (message: string) => void,
): { use: AssistantToolUse; message: ChatMessage } {
  const tool = tools.find((candidate) => candidate.definition.name === call.name);
  let ok = false;
  let content: string;
  if (!tool) {
    content = JSON.stringify({
      error: 'unknown-tool',
      availableTools: tools.map((candidate) => candidate.definition.name),
    });
  } else {
    try {
      const run = tool.run(call.arguments);
      ok = run.ok;
      content = run.content;
    } catch (failure) {
      log?.(`Assistant: tool ${call.name} failed (${(failure as Error).message}).`);
      content = JSON.stringify({ error: 'analytics-failed' });
    }
  }
  return {
    use: {
      name: call.name,
      label: tool?.label ?? call.name,
      summary: tool ? tool.summarize(call.arguments) : 'unknown tool',
      arguments: call.arguments,
      ok,
    },
    message: { role: 'tool', callId: call.id, name: call.name, content, isError: !ok },
  };
}

export interface AssistantTarget {
  readonly provider: LLMProvider;
  readonly model: string;
}

export interface OrchestratorDeps {
  readonly tools: readonly AssistantTool[];
  readonly conversations: ConversationStore;
  /** The selected provider and model, or null when none is selected. */
  readonly target: () => AssistantTarget | null;
  /** Whether the model passed the model evaluation for its current revision (BR-43). */
  readonly suitability: (providerId: string, model: ModelInfo) => ModelSuitability;
  readonly history: () => HistorySummary;
  readonly timeZone: string;
  readonly clock?: () => Date;
  readonly limits?: Partial<AssistantLimits>;
  readonly log?: (message: string) => void;
}

export interface Orchestrator {
  startConversation(): string;
  endConversation(id: string): void;
  /** Answers one question in a conversation; see `runTurn` for the events. */
  ask(
    conversationId: string,
    question: string,
    signal: AbortSignal,
  ): AsyncGenerator<AssistantEvent>;
}

// Implements: BR-39, BR-40, RULE-26, AC-47, AC-50
export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  const limits = { ...DEFAULT_LIMITS, ...deps.limits };
  const clock = deps.clock ?? (() => new Date());
  const log = deps.log ?? ((message: string) => console.warn(message));

  async function* ask(
    conversationId: string,
    question: string,
    signal: AbortSignal,
  ): AsyncGenerator<AssistantEvent> {
    const text = question.trim();
    if (text === '') throw new TypeError('A question must not be empty.');
    if (!deps.conversations.has(conversationId)) {
      yield error('conversation-not-found');
      return;
    }
    if (!deps.conversations.begin(conversationId)) {
      yield error('conversation-busy');
      return;
    }
    try {
      const target = deps.target();
      if (!target) {
        yield error('no-model-selected');
        return;
      }
      const check = await checkModel(target.provider, target.model, limits, signal);
      if (signal.aborted) {
        yield { type: 'done', reason: 'cancelled' };
        return;
      }
      if (!check.ok) {
        yield error(check.code);
        return;
      }
      const suitability = deps.suitability(target.provider.descriptor.id, check.model);
      if (suitability !== 'suitable') {
        yield error(suitability === 'untested' ? 'model-not-evaluated' : 'model-failed-evaluation');
        return;
      }
      yield* runTurn({
        provider: target.provider,
        model: check.model,
        tools: deps.tools,
        system: buildSystemPrompt({
          today:
            localDate(clock().toISOString(), deps.timeZone) ?? clock().toISOString().slice(0, 10),
          timeZone: deps.timeZone,
          history: deps.history(),
        }),
        history: deps.conversations.messages(conversationId) ?? [],
        question: text,
        limits,
        signal,
        log,
        onComplete: (messages) => deps.conversations.append(conversationId, messages),
      });
    } finally {
      deps.conversations.end(conversationId);
    }
  }

  return {
    startConversation: () => deps.conversations.create(),
    endConversation: (id) => deps.conversations.remove(id),
    ask,
  };
}
