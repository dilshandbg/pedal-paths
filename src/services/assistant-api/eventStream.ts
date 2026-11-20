/*
 * Reads a Server-Sent Events body from the local assistant API (ADR-0014 §7). Each event is one
 * `data: <json>` block; other fields are ignored.
 */

/** The JSON payloads of an event stream, in order. Stops when the stream ends or is aborted. */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let end = buffer.indexOf('\n\n');
      while (end >= 0) {
        const payload = dataOf(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (payload !== null) yield JSON.parse(payload) as unknown;
        end = buffer.indexOf('\n\n');
      }
      if (done) break;
    }
    const last = dataOf(buffer);
    if (last !== null) yield JSON.parse(last) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** The `data` of one event block, or null when it has none. */
function dataOf(block: string): string | null {
  const lines = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  return lines.length > 0 ? lines.join('\n') : null;
}
