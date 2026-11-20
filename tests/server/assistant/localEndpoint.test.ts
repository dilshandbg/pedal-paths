// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isLoopbackAddress,
  localFetch,
  parseLocalEndpoint,
  resolveLocalEndpoint,
  type Lookup,
} from '../../../server/assistant/llm/localEndpoint';

const lookupTo =
  (...addresses: string[]): Lookup =>
  async () =>
    addresses;

describe('RULE-27: loopback addresses', () => {
  it.each(['127.0.0.1', '127.255.0.9', '::1', '[::1]', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1'])(
    'accepts %s',
    (address) => expect(isLoopbackAddress(address)).toBe(true),
  );

  it.each([
    '10.0.0.5',
    '192.168.1.2',
    '0.0.0.0',
    '::',
    '128.0.0.1',
    '::ffff:10.0.0.1',
    'localhost',
    'example.com',
    '',
  ])('rejects %s', (address) => expect(isLoopbackAddress(address)).toBe(false));
});

describe('AC-51: the Ollama address must be on this machine', () => {
  it.each([
    ['http://127.0.0.1:11434', 'http://127.0.0.1:11434'],
    ['http://localhost:11434/', 'http://localhost:11434'],
    ['  http://[::1]:11434  ', 'http://[::1]:11434'],
    ['https://127.0.0.1', 'https://127.0.0.1'],
    // The URL parser normalizes other IPv4 spellings; the normalized form is what is checked.
    ['http://2130706433:11434', 'http://127.0.0.1:11434'],
  ])('accepts %s', (raw, origin) => {
    const checked = parseLocalEndpoint(raw);
    expect(checked.ok && checked.url.origin).toBe(origin);
  });

  it.each([
    ['http://192.168.1.20:11434', 'on this computer'],
    ['http://ollama.example.com', 'on this computer'],
    ['http://0.0.0.0:11434', 'on this computer'],
    ['http://localhost.example.com:11434', 'on this computer'],
    ['http://127.0.0.1.nip.io:11434', 'on this computer'],
    ['ftp://127.0.0.1', 'http:// or https://'],
    ['http://user:pw@127.0.0.1:11434', 'user name or password'],
    ['http://127.0.0.1:11434/api', 'path, query or fragment'],
    ['http://127.0.0.1:11434/?x=1', 'path, query or fragment'],
    ['not a url', 'not a valid URL'],
  ])('rejects %s', (raw, reason) => {
    const checked = parseLocalEndpoint(raw);
    expect(checked.ok).toBe(false);
    expect(!checked.ok && checked.problem).toContain(reason);
  });
});

describe('AC-51: host names must resolve only to loopback', () => {
  const localhost = new URL('http://localhost:11434');

  it('connects to the resolved loopback IP, not the name', async () => {
    expect((await resolveLocalEndpoint(localhost, lookupTo('127.0.0.1', '::1'))).origin).toBe(
      'http://127.0.0.1:11434',
    );
    expect((await resolveLocalEndpoint(localhost, lookupTo('::1'))).origin).toBe(
      'http://[::1]:11434',
    );
  });

  it('rejects a name that resolves to any other address (e.g. a changed hosts file)', async () => {
    await expect(
      resolveLocalEndpoint(localhost, lookupTo('127.0.0.1', '10.1.2.3')),
    ).rejects.toMatchObject({ kind: 'not-local' });
    await expect(resolveLocalEndpoint(localhost, lookupTo('203.0.113.7'))).rejects.toMatchObject({
      kind: 'not-local',
    });
  });

  it('rejects a name that does not resolve', async () => {
    await expect(resolveLocalEndpoint(localhost, lookupTo())).rejects.toMatchObject({
      kind: 'not-local',
    });
    const failing: Lookup = () => Promise.reject(new Error('ENOTFOUND'));
    await expect(resolveLocalEndpoint(localhost, failing)).rejects.toMatchObject({
      kind: 'not-local',
    });
  });

  it('needs no lookup for a loopback IP', async () => {
    const lookup = vi.fn(lookupTo('10.0.0.1'));
    await expect(
      resolveLocalEndpoint(new URL('http://127.0.0.1:11434'), lookup),
    ).resolves.toBeDefined();
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('AC-51: requests to a local endpoint', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

  const listen = (handler: Parameters<typeof createServer>[1]) =>
    new Promise<string>((resolve) => {
      server = createServer(handler).listen(
        0,
        '127.0.0.1',
        () => resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`), // listening, so it has an address
      );
    });

  it('reaches a server on this machine', async () => {
    const endpoint = await listen((_, res) => res.end('{"version":"0.12.6"}'));
    const response = await localFetch(endpoint, '/api/version', {});
    expect(await response.json()).toEqual({ version: '0.12.6' });
  });

  it('refuses to follow a redirect, even to another local port', async () => {
    const endpoint = await listen((_, res) => {
      res.writeHead(302, { location: 'http://203.0.113.7/steal' });
      res.end();
    });
    await expect(localFetch(endpoint, '/api/version', {})).rejects.toMatchObject({
      kind: 'not-local',
    });
  });

  it('reports a refused connection as unavailable', async () => {
    // Port 9 (discard) is almost never open on a desktop; the fetch fails either way.
    const fetchStub = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    await expect(
      localFetch('http://127.0.0.1:9', '/api/version', {}, { fetch: fetchStub }),
    ).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('never sends a request to a non-local address', async () => {
    const fetchStub = vi.fn(() => Promise.resolve(new Response('{}')));
    await expect(
      localFetch('http://10.0.0.8:11434', '/api/tags', {}, { fetch: fetchStub }),
    ).rejects.toMatchObject({ kind: 'not-local' });
    await expect(
      localFetch(
        'http://localhost:11434',
        '/api/tags',
        {},
        { fetch: fetchStub, lookup: lookupTo('198.51.100.1') },
      ),
    ).rejects.toMatchObject({ kind: 'not-local' });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('always asks fetch not to follow redirects', async () => {
    const fetchStub = vi.fn((_url: URL, _init?: RequestInit) =>
      Promise.resolve(new Response('{}')),
    );
    await localFetch(
      'http://127.0.0.1:11434',
      '/api/tags',
      { method: 'GET' },
      { fetch: fetchStub as unknown as typeof fetch },
    );
    expect(fetchStub.mock.calls[0]?.[1]?.redirect).toBe('manual');
    expect(String(fetchStub.mock.calls[0]?.[0])).toBe('http://127.0.0.1:11434/api/tags');
  });
});
