import { LLMError } from './errors';

/*
 * Provider-neutral stream helpers (ADR-0014 §3). Adapters use them to read line-delimited
 * responses (NDJSON, SSE); the orchestrator uses `withTimeouts` around any model stream.
 */

/** The lines of a byte stream, UTF-8, without line endings. Empty lines are skipped. */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8');
  const reader = body.getReader();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line !== '') yield line;
        newline = buffer.indexOf('\n');
      }
      if (done) break;
    }
    const last = buffer.replace(/\r$/, '');
    if (last !== '') yield last;
  } finally {
    // Stops the underlying request when the consumer stops early.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export interface StreamTimeouts {
  /** Longest wait for the first item (a model may still be loading). */
  readonly firstMs: number;
  /** Longest wait between two items. */
  readonly idleMs: number;
}

/**
 * Passes a stream through, failing with `LLMError('timeout')` when the first item or the next one
 * takes too long. `onTimeout` runs first, so the caller can abort the request behind the stream.
 */
export async function* withTimeouts<T>(
  source: AsyncIterable<T>,
  timeouts: StreamTimeouts,
  onTimeout: () => void,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  let first = true;
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => {
            onTimeout();
            reject(new LLMError('timeout', first ? 'no first response' : 'stream idle'));
          },
          first ? timeouts.firstMs : timeouts.idleMs,
        );
      });
      let next: IteratorResult<T>;
      try {
        next = await Promise.race([iterator.next(), timeout]);
      } finally {
        clearTimeout(timer);
      }
      if (next.done) return;
      first = false;
      yield next.value;
    }
  } finally {
    // Do not await: a stuck source would keep the caller waiting after a timeout.
    void iterator.return?.()?.catch(() => {});
  }
}
