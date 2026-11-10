import { isIP } from 'node:net';

const LIST_SEPARATOR = ',';
const WHOLE_NUMBER = /^\d+$/;

/** How many reverse proxies in front of the console append to X-Forwarded-For (default 0). */
export function trustedProxyCount(value = process.env.TRUSTED_PROXY_COUNT): number {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') return 0;
  if (!WHOLE_NUMBER.test(trimmed)) {
    throw new Error(`TRUSTED_PROXY_COUNT must be a whole number, got "${trimmed}"`);
  }
  return Number(trimmed);
}

/**
 * The browser's address as recorded by the outermost trusted proxy, or null if it cannot be
 * trusted. Next.js passes an incoming X-Forwarded-For through unchanged, so with no trusted proxy
 * every entry may have been written by the browser itself and nothing is returned.
 */
export function clientAddress(forwardedFor: string | null, proxyCount: number): string | null {
  if (proxyCount === 0 || forwardedFor === null) return null;
  const entries = forwardedFor
    .split(LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);
  // Each trusted proxy appends one entry, so the client is proxyCount entries from the end.
  const address = entries.length >= proxyCount ? entries[entries.length - proxyCount] : undefined;
  return address !== undefined && isIP(address) !== 0 ? address : null;
}
