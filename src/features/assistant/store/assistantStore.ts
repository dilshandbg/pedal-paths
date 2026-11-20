import { create } from 'zustand';
import type { ChatTurn } from '@/features/assistant/utils/describeAssistant';
import { modelKey } from '@/features/assistant/utils/modelKey';
import {
  AssistantApiError,
  assistantClient,
  type AssistantClient,
} from '@/services/assistant-api/assistantClient';
import type {
  AssistantEvent,
  AssistantModel,
  AssistantProviderInfo,
  AssistantSettings,
  AssistantStatus,
  ConnectionTestResult,
  ModelDownload,
} from '@/types/assistant';

/*
 * The assistant screens' state (BR-39, BR-41 – BR-43, BR-45, UX-13, UX-14). It keeps what the local
 * assistant API returned and the conversation as it is streamed; everything shown is derived from
 * it. The model is only changed when the user selects one (RULE-26).
 */

export type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

export interface AssistantState {
  readonly status: AssistantStatus | null;
  readonly statusState: LoadState;
  readonly settings: AssistantSettings | null;
  readonly providers: readonly AssistantProviderInfo[];
  readonly models: readonly AssistantModel[];
  readonly modelsState: LoadState;
  readonly modelsError: string | null;
  /** Downloads by model, as last reported. */
  readonly downloads: Readonly<Record<string, ModelDownload>>;
  readonly connectionTest: ConnectionTestResult | null;
  readonly testingConnection: boolean;
  /** Problems with the last settings change, in words. */
  readonly settingsProblems: readonly string[];
  /** A message about the last model action (e.g. a removed selected model, AC-49). */
  readonly notice: string | null;
  readonly conversationId: string | null;
  readonly turns: readonly ChatTurn[];

  /** Loads status, settings and models (on opening the assistant). */
  load: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshModels: () => Promise<void>;
  saveServerUrl: (serverUrl: string) => Promise<void>;
  testConnection: (serverUrl: string) => Promise<void>;
  selectModel: (name: string) => Promise<void>;
  testModel: (name: string) => Promise<void>;
  removeModel: (name: string) => Promise<void>;
  downloadModel: (name: string) => Promise<void>;
  cancelDownload: (name: string) => void;
  ask: (question: string) => Promise<void>;
  /** Stops the current answer (AC-52). */
  stop: () => void;
  /** Forgets the conversation; the next question starts a new one. */
  newConversation: () => void;
  dismissNotice: () => void;
}

/** Download error codes in plain words (the API reports only the code for a download). */
const DOWNLOAD_ERRORS: Readonly<Record<string, string>> = {
  'provider-unavailable': 'the model provider is not reachable.',
  'model-not-installed': 'there is no model with that name.',
  'not-local': 'the provider address is not on this computer.',
  timeout: 'there was no progress for too long.',
  'invalid-response': 'the download ended before it completed.',
  'model-error': 'the provider could not download it.',
};
export const downloadErrorMessage = (code: string) =>
  DOWNLOAD_ERRORS[code] ?? 'something went wrong.';

const messageOf = (error: unknown) =>
  error instanceof AssistantApiError ? error.message : 'Something went wrong. Try again.';

/** Request controllers are not state: they live here, by model or for the current answer. */
const downloadControllers = new Map<string, AbortController>();
let answerController: AbortController | null = null;
let nextTurnId = 1;

export const createAssistantState = (client: AssistantClient) =>
  create<AssistantState>()((set, get) => {
    const updateTurn = (id: number, patch: (turn: ChatTurn) => Partial<ChatTurn>) =>
      set((state) => ({
        turns: state.turns.map((turn) => (turn.id === id ? { ...turn, ...patch(turn) } : turn)),
      }));

    const refreshStatus = async () => {
      set({ statusState: 'loading' });
      try {
        set({ status: await client.status(), statusState: 'ready' });
      } catch {
        set({ statusState: 'failed' });
      }
    };

    const refreshModels = async () => {
      set({ modelsState: 'loading' });
      try {
        const { models, downloads } = await client.models();
        const reported = Object.fromEntries(downloads.map((d) => [modelKey(d.model), d]));
        set((state) => ({
          models,
          modelsState: 'ready',
          modelsError: null,
          // A download this screen is watching is newer than the list.
          downloads: { ...reported, ...pickRunning(state.downloads) },
        }));
      } catch (error) {
        set({ models: [], modelsState: 'failed', modelsError: messageOf(error) });
      }
    };

    const refreshAll = () => Promise.all([refreshStatus(), refreshModels()]).then(() => {});

    return {
      status: null,
      statusState: 'idle',
      settings: null,
      providers: [],
      models: [],
      modelsState: 'idle',
      modelsError: null,
      downloads: {},
      connectionTest: null,
      testingConnection: false,
      settingsProblems: [],
      notice: null,
      conversationId: null,
      turns: [],

      load: async () => {
        try {
          const { settings, providers } = await client.settings();
          set({ settings, providers });
        } catch (error) {
          set({ settingsProblems: [messageOf(error)] });
        }
        await refreshAll();
      },
      refreshStatus,
      refreshModels,

      // Implements: BR-41, AC-46
      saveServerUrl: async (serverUrl) => {
        try {
          const settings = await client.saveSettings({ serverUrl });
          set({ settings, settingsProblems: [], connectionTest: null });
        } catch (error) {
          set({
            settingsProblems:
              error instanceof AssistantApiError && error.problems.length > 0
                ? error.problems
                : [messageOf(error)],
          });
          return;
        }
        await refreshAll();
      },

      testConnection: async (serverUrl) => {
        set({ testingConnection: true, settingsProblems: [] });
        try {
          set({ connectionTest: await client.testConnection(serverUrl) });
        } catch (error) {
          set({
            connectionTest: null,
            settingsProblems:
              error instanceof AssistantApiError && error.problems.length > 0
                ? error.problems
                : [messageOf(error)],
          });
        } finally {
          set({ testingConnection: false });
        }
      },

      // Implements: BR-42, RULE-26
      selectModel: async (name) => {
        try {
          const settings = await client.saveSettings({ model: name });
          set({ settings, notice: null });
        } catch (error) {
          set({ notice: messageOf(error) });
        }
        await refreshAll();
      },

      // Implements: BR-43, AC-50
      testModel: async (name) => {
        set((state) => ({
          notice: null,
          models: state.models.map((m) => (m.id === name ? { ...m, testing: true } : m)),
        }));
        try {
          const evaluation = await client.test(name);
          set({
            notice: evaluation.passed
              ? `${name} passed the test and can answer ride questions.`
              : `${name} did not pass the test, so it isn't used for ride questions. The results show why.`,
          });
        } catch (error) {
          set({ notice: messageOf(error) });
        }
        await refreshAll();
      },

      // Implements: BR-42, AC-49
      removeModel: async (name) => {
        try {
          const removal = await client.remove(name);
          set({
            notice: removal.selectionCleared
              ? `${removal.model} was removed. It was the selected model, so choose another one.`
              : `${removal.model} was removed.`,
          });
          if (removal.selectionCleared) {
            set((state) =>
              state.settings ? { settings: { ...state.settings, model: null } } : {},
            );
          }
        } catch (error) {
          set({ notice: messageOf(error) });
        }
        await refreshAll();
      },

      // Implements: BR-42, AC-48
      downloadModel: async (name) => {
        const key = modelKey(name);
        if (downloadControllers.has(key)) return; // already watching this download
        const controller = new AbortController();
        downloadControllers.set(key, controller);
        set({ notice: null });
        try {
          await client.install(
            name,
            (download) =>
              set((state) => ({
                downloads: { ...state.downloads, [modelKey(download.model)]: download },
              })),
            controller.signal,
          );
        } catch (error) {
          if (!controller.signal.aborted) set({ notice: messageOf(error) });
        } finally {
          downloadControllers.delete(key);
        }
        if (controller.signal.aborted) {
          set((state) => {
            const current = state.downloads[key];
            return current?.status === 'downloading'
              ? { downloads: { ...state.downloads, [key]: { ...current, status: 'cancelled' } } }
              : {};
          });
          // Nothing was installed. The server finishes cancelling after the stream closed, so a
          // list fetched now could still report the download as running.
          return;
        }
        await refreshModels();
      },

      cancelDownload: (name) => {
        // Closing the stream cancels the download (ADR-0014 §7).
        downloadControllers.get(modelKey(name))?.abort();
      },

      // Implements: BR-39, BR-45, AC-43, AC-52, AC-53, AC-55
      ask: async (question) => {
        const text = question.trim();
        if (text === '' || answerController) return;
        const controller = new AbortController();
        answerController = controller;
        const id = nextTurnId++;
        set((state) => ({
          turns: [
            ...state.turns,
            {
              id,
              question: text,
              answer: '',
              tools: [],
              unverifiedNumbers: [],
              state: 'answering',
              error: null,
            },
          ],
        }));
        const onEvent = (event: AssistantEvent) => {
          switch (event.type) {
            case 'text':
              return updateTurn(id, (turn) => ({ answer: turn.answer + event.delta }));
            case 'tool':
              return updateTurn(id, (turn) => ({ tools: [...turn.tools, event.use] }));
            case 'unverified-numbers':
              return updateTurn(id, () => ({ unverifiedNumbers: event.numbers }));
            case 'done':
              return updateTurn(id, () => ({
                state:
                  event.reason === 'length'
                    ? 'cut'
                    : event.reason === 'cancelled'
                      ? 'stopped'
                      : 'done',
              }));
            case 'error':
              return updateTurn(id, () => ({ state: 'failed', error: event.message }));
          }
        };
        try {
          let conversationId = get().conversationId;
          if (!conversationId) {
            conversationId = await client.startConversation();
            set({ conversationId });
          }
          await client.ask(conversationId, text, onEvent, controller.signal);
          // A stream that ended without a last event was interrupted.
          updateTurn(id, (turn) =>
            turn.state === 'answering'
              ? { state: 'failed', error: 'The answer was interrupted. Try again.' }
              : {},
          );
        } catch (error) {
          updateTurn(id, () =>
            controller.signal.aborted
              ? { state: 'stopped' }
              : { state: 'failed', error: messageOf(error) },
          );
        } finally {
          if (answerController === controller) answerController = null;
        }
        if (get().turns.find((t) => t.id === id)?.state === 'failed') void refreshStatus();
      },

      stop: () => answerController?.abort(),

      newConversation: () => {
        answerController?.abort();
        const id = get().conversationId;
        if (id) void client.endConversation(id).catch(() => {});
        set({ conversationId: null, turns: [] });
      },

      dismissNotice: () => set({ notice: null }),
    };
  });

const pickRunning = (downloads: Readonly<Record<string, ModelDownload>>) =>
  Object.fromEntries(
    Object.entries(downloads).filter(
      ([key, d]) => d.status === 'downloading' && downloadControllers.has(key),
    ),
  );

export const useAssistantStore = createAssistantState(assistantClient);

/** Whether an answer is being written now. */
export const selectIsAnswering = (state: AssistantState) =>
  state.turns.some((turn) => turn.state === 'answering');
