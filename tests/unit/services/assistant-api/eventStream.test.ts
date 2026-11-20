import { describe, expect, it } from 'vitest';
import { readEvents } from '@/services/assistant-api/eventStream';

const body = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });

const all = async (stream: ReadableStream<Uint8Array>) => {
  const events: unknown[] = [];
  for await (const event of readEvents(stream)) events.push(event);
  return events;
};

describe('BR-45: reading the event streams of the assistant API', () => {
  it('reads one JSON object per event, also split across chunks', async () => {
    expect(
      await all(body('data: {"type":"text","delta":"Hi"}\n\ndata: {"ty', 'pe":"done"}\n\n')),
    ).toEqual([{ type: 'text', delta: 'Hi' }, { type: 'done' }]);
  });

  it('accepts CRLF line endings, skips blocks without data, and reads a last unterminated event', async () => {
    expect(await all(body(': keep-alive\r\n\r\ndata: 1\r\n\r\ndata: 2'))).toEqual([1, 2]);
  });

  it('joins multi-line data', async () => {
    expect(await all(body('data: {"a":\ndata: 1}\n\n'))).toEqual([{ a: 1 }]);
  });

  it('reads nothing from an empty stream', async () => {
    expect(await all(body())).toEqual([]);
  });
});
