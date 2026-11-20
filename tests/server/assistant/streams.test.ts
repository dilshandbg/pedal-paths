// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readLines, withTimeouts } from '../../../server/assistant/llm/streams';

const bytes = (...chunks: (string | Uint8Array)[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
      controller.close();
    },
  });

const all = async <T>(source: AsyncIterable<T>) => {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
};

describe('readLines', () => {
  it('splits on newlines across chunks, without CR and empty lines', async () => {
    expect(await all(readLines(bytes('{"a":1}\r\n{"b"', ':2}\n\n{"c":3}')))).toEqual([
      '{"a":1}',
      '{"b":2}',
      '{"c":3}',
    ]);
  });

  it('keeps multi-byte characters split across chunks', async () => {
    const encoded = new TextEncoder().encode('Côte\n');
    expect(await all(readLines(bytes(encoded.slice(0, 2), encoded.slice(2))))).toEqual(['Côte']);
  });

  it('yields nothing for an empty stream', async () => {
    expect(await all(readLines(bytes()))).toEqual([]);
  });
});

async function* items(delaysMs: number[]) {
  for (const [i, delay] of delaysMs.entries()) {
    await new Promise((r) => setTimeout(r, delay));
    yield i;
  }
}

describe('NFR-12: stream time limits', () => {
  it('passes a stream through that stays within the limits', async () => {
    expect(
      await all(withTimeouts(items([5, 5, 5]), { firstMs: 200, idleMs: 200 }, () => {})),
    ).toEqual([0, 1, 2]);
  });

  it('fails with a timeout when the first item is late, and aborts the source', async () => {
    let aborted = false;
    await expect(
      all(withTimeouts(items([300]), { firstMs: 20, idleMs: 1000 }, () => (aborted = true))),
    ).rejects.toMatchObject({
      kind: 'timeout',
    });
    expect(aborted).toBe(true);
  });

  it('fails with a timeout when the stream goes quiet after the first item', async () => {
    await expect(
      all(withTimeouts(items([1, 300]), { firstMs: 1000, idleMs: 20 }, () => {})),
    ).rejects.toMatchObject({
      kind: 'timeout',
    });
  });
});
