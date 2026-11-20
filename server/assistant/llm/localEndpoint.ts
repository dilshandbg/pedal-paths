import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { LLMError } from './errors';

/*
 * Local endpoints (BR-41, BR-44, RULE-27, OD-36). A local provider such as Ollama may only be
 * reached on this machine:
 *
 * 1. The address must be `http(s)://<host>[:port][/]`, without credentials, path, query or hash.
 * 2. The host must be `localhost` or a loopback IP (127.0.0.0/8, ::1).
 * 3. Before every request the host is resolved, every address it resolves to must be loopback,
 *    and the request goes to that resolved IP, so a changed hosts file or DNS answer can't
 *    redirect it.
 * 4. Redirects are never followed.
 */

export type EndpointCheck =
  { readonly ok: true; readonly url: URL } | { readonly ok: false; readonly problem: string };

/** Resolves a host name to all its addresses. Injected in tests. */
export type Lookup = (host: string) => Promise<readonly string[]>;

export const systemLookup: Lookup = async (host) =>
  (await dnsLookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

const unbracket = (host: string) => host.replace(/^\[(.*)\]$/, '$1');

/** Whether an IP address is a loopback address (127.0.0.0/8, ::1, or IPv4-mapped 127.x). */
export function isLoopbackAddress(address: string): boolean {
  const ip = unbracket(address).toLowerCase();
  const version = isIP(ip);
  if (version === 4) return ip.startsWith('127.');
  if (version === 6) {
    if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    return mapped !== null && mapped[1]!.startsWith('127.'); // [1] exists when the pattern matched
  }
  return false;
}

const NOT_LOCAL = 'The address must be on this computer, e.g. http://127.0.0.1:11434.';

/** Checks the form of a local endpoint address (step 1 and 2 above). Does not resolve it. */
export function parseLocalEndpoint(raw: string): EndpointCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, problem: 'The address is not a valid URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, problem: 'The address must start with http:// or https://.' };
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, problem: 'The address must not contain a user name or password.' };
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '') {
    return { ok: false, problem: 'The address must not contain a path, query or fragment.' };
  }
  const host = unbracket(url.hostname).toLowerCase();
  if (host !== 'localhost' && !isLoopbackAddress(host)) return { ok: false, problem: NOT_LOCAL };
  return { ok: true, url: new URL(url.origin) };
}

/**
 * Resolves a checked endpoint to a loopback IP (step 3). Throws `LLMError('not-local')` when the
 * host resolves to nothing or to any address that is not loopback.
 */
export async function resolveLocalEndpoint(
  endpoint: URL,
  lookup: Lookup = systemLookup,
): Promise<URL> {
  const host = unbracket(endpoint.hostname);
  if (isIP(host) !== 0) {
    if (!isLoopbackAddress(host)) throw new LLMError('not-local', 'address is not loopback');
    return new URL(endpoint.origin);
  }
  let addresses: readonly string[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new LLMError('not-local', 'host name could not be resolved');
  }
  if (addresses.length === 0 || !addresses.every(isLoopbackAddress)) {
    throw new LLMError('not-local', 'host name resolves to a non-loopback address');
  }
  const resolved = new URL(endpoint.origin);
  const address = addresses[0]!; // length checked above
  resolved.hostname = isIP(address) === 6 ? `[${address}]` : address;
  return resolved;
}

export interface LocalFetchOptions {
  readonly lookup?: Lookup;
  readonly fetch?: typeof fetch;
}

/**
 * `fetch` to a path on a local endpoint (steps 1–4). A redirect response is refused with
 * `LLMError('not-local')`, and a refused connection becomes `LLMError('unavailable')`.
 */
export async function localFetch(
  endpoint: string,
  path: string,
  init: RequestInit,
  options: LocalFetchOptions = {},
): Promise<Response> {
  const checked = parseLocalEndpoint(endpoint);
  if (!checked.ok) throw new LLMError('not-local', checked.problem);
  const base = await resolveLocalEndpoint(checked.url, options.lookup);
  const fetcher = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetcher(new URL(path, base), { ...init, redirect: 'manual' });
  } catch (error) {
    if (init.signal?.aborted) throw new LLMError('cancelled');
    throw new LLMError('unavailable', (error as Error).message);
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    throw new LLMError('not-local', `redirect refused (${response.status})`);
  }
  return response;
}
