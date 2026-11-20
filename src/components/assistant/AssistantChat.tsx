import { useId, useState, type FormEvent } from 'react';
import { StatusMessage, type StatusTone } from '@/components/assistant/StatusMessage';

/** One question and answer, prepared by the caller (`describeTurn`). */
export interface ChatTurnItem {
  readonly id: number;
  readonly question: string;
  readonly answer: string;
  readonly answering: boolean;
  readonly toolsUsed: readonly string[];
  readonly warning: string | null;
  readonly note: string | null;
  readonly error: string | null;
}

interface AssistantChatProps {
  turns: readonly ChatTurnItem[];
  /** Why no question can be sent now, or null when one can (RULE-26). */
  blocked: { readonly text: string; readonly tone: StatusTone } | null;
  answering: boolean;
  maxQuestionLength: number;
  onAsk: (question: string) => void;
  onStop: () => void;
  onNewConversation: () => void;
}

/**
 * The assistant chat (UX-13): questions and streamed answers, the analytics each answer used, a
 * warning for numbers that did not come from the analytics, Stop and a new conversation.
 * Presentational: it reports questions and clicks.
 */
export function AssistantChat({
  turns,
  blocked,
  answering,
  maxQuestionLength,
  onAsk,
  onStop,
  onNewConversation,
}: AssistantChatProps) {
  const [question, setQuestion] = useState('');
  const inputId = useId();
  const canSend = blocked === null && !answering && question.trim() !== '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    onAsk(question);
    setQuestion('');
  };

  return (
    <div className="flex flex-col gap-3">
      {turns.length === 0 ? (
        <p className="text-sm text-slate-600">
          Ask about your stored rides, for example “How far did I ride each month in 2024?”. The
          answers come from your ride analytics, computed on this computer.
        </p>
      ) : (
        <ol aria-label="Conversation" className="flex flex-col gap-3">
          {turns.map((turn) => (
            <li key={turn.id} className="flex flex-col gap-1.5">
              <p className="self-end rounded-lg bg-orange-100 px-3 py-2 text-sm text-slate-900">
                <span className="sr-only">You: </span>
                {turn.question}
              </p>
              <article
                aria-label={`Answer to: ${turn.question}`}
                aria-busy={turn.answering}
                className="flex flex-col gap-1.5 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200"
              >
                {turn.answer ? (
                  <p className="whitespace-pre-wrap">{turn.answer}</p>
                ) : turn.answering ? (
                  <p className="text-slate-500">Working on it…</p>
                ) : null}
                {turn.toolsUsed.length > 0 ? (
                  <div className="text-xs text-slate-600">
                    <p className="font-medium">Used:</p>
                    <ul aria-label="Analytics used" className="list-disc pl-4">
                      {turn.toolsUsed.map((tool, index) => (
                        <li key={index}>{tool}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {turn.warning ? <StatusMessage tone="warning">{turn.warning}</StatusMessage> : null}
                {turn.note ? <p className="text-xs text-slate-500">{turn.note}</p> : null}
                {turn.error ? (
                  <StatusMessage tone="error" role="alert">
                    {turn.error}
                  </StatusMessage>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      )}

      {blocked ? (
        <StatusMessage tone={blocked.tone} role="status">
          {blocked.text}
        </StatusMessage>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          Your question
        </label>
        <textarea
          id={inputId}
          value={question}
          maxLength={maxQuestionLength}
          rows={3}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) submit(event);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {answering ? (
            <button
              type="button"
              onClick={onStop}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ask
            </button>
          )}
          <button
            type="button"
            onClick={onNewConversation}
            disabled={turns.length === 0}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            New conversation
          </button>
        </div>
      </form>
    </div>
  );
}
