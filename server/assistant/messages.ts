import type { AssistantErrorCode } from '../../src/types/assistant';
import type { LLMErrorKind } from './llm/errors';

/*
 * Plain messages for every way a question can fail (NFR-12, BRD v2.4 error scenarios). They never
 * include a provider's own error text.
 */

export const ASSISTANT_MESSAGES: Readonly<Record<AssistantErrorCode, string>> = {
  'no-model-selected': 'Choose a model in the assistant settings first.',
  'provider-unavailable':
    'Ollama is not reachable. Start Ollama (or install it from ollama.com) and check the address in the assistant settings.',
  'not-local':
    'The Ollama address must be on this computer, e.g. http://127.0.0.1:11434. Other addresses and redirects are refused.',
  'model-not-installed':
    'The selected model is not installed in Ollama any more. Download it again or choose another model.',
  'model-remote':
    'The selected model runs in a cloud service, not on this computer, so it is not used. Choose a local model.',
  'model-no-tools':
    "The selected model can't call the ride analytics, so it can't answer ride questions. Choose a model that supports tool calling.",
  'model-not-evaluated':
    'Test the selected model in the assistant settings first. Only a model that passes the test answers ride questions.',
  'model-failed-evaluation':
    "The selected model did not pass the test, so it isn't used for ride questions. Choose or test another model.",
  timeout:
    'The model took too long to answer. Try again; a model that is still loading can be slow.',
  busy: 'Ollama is busy with other requests. Try again in a moment.',
  'context-too-long': 'The conversation is too long for this model. Start a new conversation.',
  'invalid-response':
    'The model sent a response the app could not read. Try again or choose another model.',
  'model-error': 'The model failed while answering. Try again or choose another model.',
  'round-limit':
    'The model kept calling the analytics without answering, so the answer was stopped. Try a simpler question.',
  'conversation-not-found': 'This conversation has ended. Start a new one.',
  'conversation-busy': 'Wait for the current answer to finish, or stop it, before asking again.',
  internal: 'Something went wrong in the assistant. Try again.',
};

/** The error code for a provider failure. */
export function codeForLLMError(kind: LLMErrorKind): AssistantErrorCode {
  switch (kind) {
    case 'unavailable':
      return 'provider-unavailable';
    case 'not-local':
      return 'not-local';
    case 'timeout':
      return 'timeout';
    case 'model-unavailable':
      return 'model-not-installed';
    case 'tools-unsupported':
      return 'model-no-tools';
    case 'busy':
      return 'busy';
    case 'context-too-long':
      return 'context-too-long';
    case 'invalid-response':
      return 'invalid-response';
    case 'model-error':
    case 'bad-request':
      return 'model-error';
    case 'cancelled':
      return 'internal'; // a cancelled answer ends with `done: cancelled`, never as an error
  }
}
