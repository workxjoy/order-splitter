import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from './instrumentation';

describe('register', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails the startup hook with an invalid TRUSTED_PROXY_COUNT', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('TRUSTED_PROXY_COUNT', 'two');

    await expect(register()).rejects.toThrow('TRUSTED_PROXY_COUNT must be a whole number');
  });

  it('starts with a valid setting', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('TRUSTED_PROXY_COUNT', '1');

    await expect(register()).resolves.toBeUndefined();
  });

  it('skips the check outside the Node.js runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('TRUSTED_PROXY_COUNT', 'two');

    await expect(register()).resolves.toBeUndefined();
  });
});
