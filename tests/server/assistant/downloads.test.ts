// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ModelDownload } from '../../../src/types/assistant';
import { createDownloadManager } from '../../../server/assistant/downloads';
import { LLMError } from '../../../server/assistant/llm/errors';
import { createFakeProvider, type FakeInstall } from './fakeProvider';

const setup = (install?: (name: string) => FakeInstall) => {
  const provider = createFakeProvider({ models: [], ...(install ? { install } : {}) });
  const downloads = createDownloadManager({
    manager: () => provider.models,
    clock: () => new Date('2026-11-20T10:00:00Z'),
    log: () => {},
  });
  return { provider, downloads };
};

const started = (result: ReturnType<ReturnType<typeof createDownloadManager>['start']>) => {
  if (!result.ok) throw new Error(result.problem);
  return result;
};

describe('AC-48: model downloads', () => {
  it('reports progress and status until the model is installed', async () => {
    const { provider, downloads } = setup();
    const seen: ModelDownload[] = [];
    const first = started(downloads.start('qwen3:8b'));
    expect(first).toMatchObject({
      started: true,
      download: { model: 'qwen3:8b', status: 'downloading' },
    });
    downloads.watch('qwen3:8b', (d) => seen.push(d));
    const final = await downloads.settled('qwen3:8b');
    expect(final).toMatchObject({
      status: 'completed',
      completedBytes: 100,
      totalBytes: 100,
      error: null,
      finishedAt: '2026-11-20T10:00:00.000Z',
    });
    expect(seen.map((d) => d.detail)).toContain('downloading');
    expect(seen.at(-1)?.status).toBe('completed');
    expect((await provider.listModels(new AbortController().signal)).map((m) => m.id)).toEqual([
      'qwen3:8b',
    ]);
  });

  it('never downloads a model twice at the same time', async () => {
    const { provider, downloads } = setup(() => ({
      steps: [{ status: 'downloading', completedBytes: 1, totalBytes: 2 }],
      stepDelayMs: 20,
    }));
    started(downloads.start('qwen3:8b'));
    expect(started(downloads.start('QWEN3:8b'))).toMatchObject({
      started: false,
      download: { status: 'downloading' },
    });
    await downloads.settled('qwen3:8b');
    expect(provider.installRequests).toEqual(['qwen3:8b']);
  });

  it('treats a name without a tag as :latest when checking for duplicates', async () => {
    const { downloads } = setup(() => ({ hang: true }));
    started(downloads.start('llama3.2'));
    expect(started(downloads.start('llama3.2:latest')).started).toBe(false);
    downloads.cancel('llama3.2');
  });

  it('can be cancelled, and started again afterwards', async () => {
    const { provider, downloads } = setup(() => ({ hang: true }));
    started(downloads.start('qwen3:8b'));
    expect(downloads.cancel('qwen3:8b')).toBe(true);
    expect(await downloads.settled('qwen3:8b')).toMatchObject({ status: 'cancelled', error: null });
    expect(downloads.cancel('qwen3:8b')).toBe(false);
    expect(started(downloads.start('qwen3:8b')).started).toBe(true);
    downloads.cancel('qwen3:8b');
    expect(provider.installRequests).toHaveLength(2);
  });

  it('reports an interrupted download as failed, not installed', async () => {
    const { provider, downloads } = setup(() => ({ outcome: 'interrupted' }));
    started(downloads.start('qwen3:8b'));
    expect(await downloads.settled('qwen3:8b')).toMatchObject({
      status: 'failed',
      error: 'invalid-response',
    });
    expect(await provider.listModels(new AbortController().signal)).toEqual([]);
  });

  it('reports a provider failure with its plain error code', async () => {
    const { downloads } = setup(() => ({
      outcome: new LLMError('unavailable', 'connection reset'),
    }));
    started(downloads.start('qwen3:8b'));
    expect(await downloads.settled('qwen3:8b')).toMatchObject({
      status: 'failed',
      error: 'provider-unavailable',
    });
  });

  it('refuses invalid and cloud model names without contacting the provider', () => {
    const { provider, downloads } = setup();
    expect(downloads.start('')).toMatchObject({ ok: false });
    expect(downloads.start('qwen3:8b; rm -rf /')).toMatchObject({
      ok: false,
      problem: expect.stringContaining('not a valid model name'),
    });
    expect(downloads.start('gpt-oss:120b-cloud')).toMatchObject({
      ok: false,
      problem: expect.stringContaining('Cloud models'),
    });
    expect(downloads.start('gemma4:cloud')).toMatchObject({ ok: false });
    expect(provider.installRequests).toEqual([]);
  });

  it('cannot download when the provider has no model manager', () => {
    const downloads = createDownloadManager({ manager: () => null });
    expect(downloads.start('qwen3:8b')).toEqual({
      ok: false,
      problem: 'This provider cannot download models.',
    });
  });

  it('lists every download and keeps watchers across a restart of the same model', async () => {
    const { downloads } = setup(() => ({ outcome: 'interrupted' }));
    const seen: string[] = [];
    started(downloads.start('qwen3:8b'));
    downloads.watch('qwen3:8b', (d) => seen.push(d.status));
    await downloads.settled('qwen3:8b');
    started(downloads.start('qwen3:8b'));
    await downloads.settled('qwen3:8b');
    expect(seen.filter((s) => s === 'failed')).toHaveLength(2);
    expect(downloads.list()).toHaveLength(1);
    expect(downloads.get('unknown')).toBeNull();
  });
});
