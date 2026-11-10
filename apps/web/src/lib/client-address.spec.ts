import { describe, expect, it } from 'vitest';
import { clientAddress, trustedProxyCount } from './client-address';

describe('trustedProxyCount', () => {
  it.each([
    [undefined, 0],
    ['', 0],
    [' 2 ', 2],
  ])('reads %j as %d', (value, expected) => {
    expect(trustedProxyCount(value)).toBe(expected);
  });

  it.each(['-1', '1.5', 'one'])('rejects %j', (value) => {
    expect(() => trustedProxyCount(value)).toThrow('TRUSTED_PROXY_COUNT must be a whole number');
  });
});

describe('clientAddress', () => {
  it('trusts nothing without a trusted proxy, since the browser may have set the header', () => {
    expect(clientAddress('203.0.113.7', 0)).toBeNull();
  });

  it('returns null when there is no header', () => {
    expect(clientAddress(null, 1)).toBeNull();
  });

  it('takes the entry written by the outermost trusted proxy, ignoring ones the browser sent', () => {
    // The browser claimed 198.51.100.1; the proxy appended the address it really saw.
    expect(clientAddress('198.51.100.1, 203.0.113.7', 1)).toBe('203.0.113.7');
    // Two proxies: the outer one recorded the browser, the inner one recorded the outer proxy.
    expect(clientAddress('198.51.100.1, 203.0.113.7, 10.0.0.5', 2)).toBe('203.0.113.7');
    expect(clientAddress('2001:db8::1', 1)).toBe('2001:db8::1');
  });

  it('returns null when the header is shorter than the proxy chain or is not an address', () => {
    expect(clientAddress('203.0.113.7', 2)).toBeNull();
    expect(clientAddress('not-an-ip', 1)).toBeNull();
    expect(clientAddress(' , ', 1)).toBeNull();
  });
});
