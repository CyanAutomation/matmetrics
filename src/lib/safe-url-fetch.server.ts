import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent } from 'undici';

import {
  isBlockedNetworkHostname,
  normalizeNetworkHostname,
} from './network-safety';

export type ResolvedAddress = { address: string; family: number };
type AddressResolver = (hostname: string) => Promise<ResolvedAddress[]>;
type FetchWithDispatcher = (
  input: RequestInfo | URL,
  init?: RequestInit & { dispatcher?: unknown }
) => Promise<Response>;

async function resolveAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const family = isIP(hostname);
  if (family) return [{ address: hostname, family }];
  return lookup(hostname, { all: true, verbatim: true });
}

export type PinnedLookup = (
  hostname: string,
  options: { all?: boolean } | number,
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | ResolvedAddress[],
    family?: number
  ) => void
) => void;

export function createPinnedLookup(
  addresses: readonly ResolvedAddress[]
): PinnedLookup {
  if (!addresses.length) {
    throw new Error('Cannot pin an empty DNS result');
  }
  const pinnedAddresses = addresses.map(({ address, family }) => ({
    address,
    family,
  }));
  let nextAddress = 0;
  return (_hostname, options, callback) => {
    if (typeof options === 'object' && options.all) {
      callback(null, pinnedAddresses);
      return;
    }
    const address = pinnedAddresses[nextAddress % pinnedAddresses.length]!;
    nextAddress += 1;
    callback(null, address.address, address.family);
  };
}

function assertPublicAddresses(
  hostname: string,
  addresses: ResolvedAddress[]
): void {
  if (!addresses.length) {
    throw new Error(`Hostname did not resolve: ${hostname}`);
  }
  if (
    addresses.some(
      ({ address, family }) =>
        ![4, 6].includes(family) ||
        isIP(address) !== family ||
        isBlockedNetworkHostname(address)
    )
  ) {
    throw new Error(`Blocked network hostname resolved: ${hostname}`);
  }
}

export function createSafeUrlFetcher(
  resolve: AddressResolver = resolveAddresses,
  fetchImpl: FetchWithDispatcher = fetch
): (url: string, method: 'HEAD' | 'GET') => Promise<Response> {
  return async (url, method) => {
    const parsed = new URL(url);
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error('Unsupported outbound URL');
    }

    const hostname = normalizeNetworkHostname(parsed.hostname);
    if (isBlockedNetworkHostname(hostname)) {
      throw new Error(`Blocked network hostname: ${hostname}`);
    }

    const addresses = await resolve(hostname);
    assertPublicAddresses(hostname, addresses);

    const agent = new Agent({
      connect: { lookup: createPinnedLookup(addresses) as never },
      connections: 1,
      pipelining: 0,
    });
    try {
      const response = await fetchImpl(url, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
        dispatcher: agent,
      });
      const status = response.status;
      const headers = new Headers();
      const location = response.headers.get('location');
      if (location) headers.set('location', location);
      await response.body?.cancel().catch(() => {});
      return new Response(null, { status, headers });
    } finally {
      await agent.close();
    }
  };
}

export const safeUrlFetch = createSafeUrlFetcher();
