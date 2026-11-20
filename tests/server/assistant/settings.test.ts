// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createProviderRegistry,
  DEFAULT_PROVIDER_FACTORIES,
} from '../../../server/assistant/llm/registry';
import { createSettingsStore } from '../../../server/assistant/settings';
import { openSettingsFile } from '../../../server/assistant/settingsFile';

const registry = createProviderRegistry(DEFAULT_PROVIDER_FACTORIES);

let dir: string;
let path: string;
const logs: string[] = [];
const log = (message: string) => void logs.push(message);
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'assistant-settings-'));
  path = join(dir, 'data', 'assistant-settings.json');
  logs.length = 0;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const fileJson = () => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const store = () => createSettingsStore({ registry, file: openSettingsFile(path, log), log });

describe('ADR-0014 §7: the assistant settings file', () => {
  it('is empty when missing, and is written with every section kept', () => {
    const file = openSettingsFile(path, log);
    expect(file.read()).toEqual({});
    expect(file.update({ settings: { a: 1 } })).toBe(true);
    expect(file.update({ evaluations: [] })).toBe(true);
    expect(fileJson()).toEqual({ settings: { a: 1 }, evaluations: [] });
    expect(openSettingsFile(path, log).read()).toEqual({ settings: { a: 1 }, evaluations: [] });
  });

  it('shares one file between the settings and the model test results', () => {
    const file = openSettingsFile(path, log);
    file.update({ evaluations: [{ x: 1 }] });
    createSettingsStore({ registry, file, log }).update({ model: 'qwen3:8b' });
    expect(fileJson()).toMatchObject({ evaluations: [{ x: 1 }], settings: { model: 'qwen3:8b' } });
  });

  it.each([
    ['not valid JSON', '{ broken'],
    ['not a JSON object', '[1, 2]'],
  ])('leaves a file that is %s unchanged, and keeps settings in memory', (problem, content) => {
    openSettingsFile(path, log).update({}); // creates data/
    writeFileSync(path, content, 'utf8');
    const file = openSettingsFile(path, log);
    expect(file.update({ settings: { a: 1 } })).toBe(false);
    expect(file.read()).toEqual({ settings: { a: 1 } });
    expect(readFileSync(path, 'utf8')).toBe(content);
    expect(logs[0]).toContain(problem);
  });

  it('keeps settings in memory only without a path', () => {
    const file = openSettingsFile(null, log);
    expect(file.update({ settings: { a: 1 } })).toBe(true);
    expect(file.read()).toEqual({ settings: { a: 1 } });
  });
});

describe('BR-41 / BR-42: assistant settings', () => {
  it('starts with Ollama on this computer and no model', () => {
    expect(store().get()).toEqual({
      provider: 'ollama',
      serverUrl: 'http://127.0.0.1:11434',
      model: null,
    });
  });

  it('saves a local address and a model, and loads them after a restart', () => {
    const update = store().update({ serverUrl: 'http://localhost:11500/', model: ' Qwen3:8B ' });
    expect(update).toEqual({
      ok: true,
      settings: { provider: 'ollama', serverUrl: 'http://localhost:11500', model: 'qwen3:8b' },
    });
    expect(store().get()).toEqual({
      provider: 'ollama',
      serverUrl: 'http://localhost:11500',
      model: 'qwen3:8b',
    });
  });

  it('clears the model with null', () => {
    const settings = store();
    settings.update({ model: 'qwen3:8b' });
    expect(settings.update({ model: null })).toMatchObject({ ok: true, settings: { model: null } });
  });

  it.each([
    [{ serverUrl: 'http://192.168.1.5:11434' }, 'on this computer'],
    [{ serverUrl: 'http://127.0.0.1:11434/api' }, 'path'],
    [{ serverUrl: 42 }, 'text'],
    [{ model: 'gpt-oss:120b-cloud' }, 'Cloud models'],
    [{ model: '../etc' }, 'not a valid model name'],
    [{ model: 7 }, 'text or null'],
  ])('refuses %j and keeps the settings as they were', (patch, problem) => {
    const settings = store();
    const update = settings.update(patch);
    expect(update.ok).toBe(false);
    expect(!update.ok && update.problems.join(' ')).toContain(problem);
    expect(settings.get()).toEqual({
      provider: 'ollama',
      serverUrl: 'http://127.0.0.1:11434',
      model: null,
    });
  });

  it('ignores invalid saved values, and says so in the log', () => {
    openSettingsFile(path, log).update({
      settings: { provider: 'ollama', serverUrl: 'http://10.0.0.2:11434', model: 'x:cloud' },
    });
    expect(store().get()).toEqual({
      provider: 'ollama',
      serverUrl: 'http://127.0.0.1:11434',
      model: null,
    });
    expect(logs).toHaveLength(2);
  });

  it('falls back to the defaults for a saved provider that does not exist', () => {
    openSettingsFile(path, log).update({ settings: { provider: 'cloud-ai', model: 'qwen3:8b' } });
    expect(store().get()).toMatchObject({ provider: 'ollama', model: null });
  });
});
