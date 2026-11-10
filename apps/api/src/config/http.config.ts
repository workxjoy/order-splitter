import { registerAs, type ConfigType } from '@nestjs/config';
import proxyaddr from 'proxy-addr';
import { z } from 'zod';
import { ConfigDefault, ConfigNamespace } from './config.constants.js';
import { envInteger, parseConfig } from './parse-config.js';

const LIST_SEPARATOR = ',';
const DIGITS_PATTERN = /^\d+$/;
const TRUST_PROXY_DISABLED = 'false';
const TRUST_PROXY_FORMAT =
  'Must be "false", a hop count, or a comma-separated list of IP addresses, CIDR ranges, ' +
  '"loopback", "linklocal" or "uniquelocal"';

type TrustProxy = false | number | string[];

// Which proxies may set X-Forwarded-For. This decides req.ip, and so the rate-limit key.
const trustProxySchema = z
  .string()
  .trim()
  .transform((value, ctx): TrustProxy => {
    if (value === TRUST_PROXY_DISABLED) return false;
    if (DIGITS_PATTERN.test(value)) return Number(value);
    const entries = value
      .split(LIST_SEPARATOR)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (entries.length === 0) {
      ctx.addIssue({ code: 'custom', message: TRUST_PROXY_FORMAT });
      return z.NEVER;
    }
    try {
      // Same parser Express uses, so anything accepted here also works at startup.
      proxyaddr.compile(entries);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      ctx.addIssue({ code: 'custom', message: `${TRUST_PROXY_FORMAT} (${reason})` });
      return z.NEVER;
    }
    return entries;
  });

// Browsers send the bare origin, so http://localhost:3000/ would never match. A trailing slash is
// dropped; a path, query or credentials are rejected rather than silently ignored.
const corsOriginSchema = z.url({ protocol: /^https?$/ }).transform((value, ctx) => {
  const url = new URL(value);
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    ctx.addIssue({
      code: 'custom',
      message: `Must be an origin such as https://app.example.com, without a path: ${value}`,
    });
    return z.NEVER;
  }
  return url.origin;
});

const httpEnvSchema = z.object({
  CORS_ORIGINS: z
    .string()
    .default(ConfigDefault.CORS_ORIGINS)
    .transform((value) =>
      value
        .split(LIST_SEPARATOR)
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(corsOriginSchema)),
  API_DOCS_ENABLED: z.stringbool().default(ConfigDefault.API_DOCS_ENABLED),
  THROTTLE_TTL_MS: envInteger().pipe(z.int().positive()).default(ConfigDefault.THROTTLE_TTL_MS),
  THROTTLE_LIMIT: envInteger().pipe(z.int().positive()).default(ConfigDefault.THROTTLE_LIMIT),
  TRUST_PROXY: trustProxySchema.prefault(ConfigDefault.TRUST_PROXY),
});

export const httpConfig = registerAs(ConfigNamespace.HTTP, () => {
  const env = parseConfig(ConfigNamespace.HTTP, httpEnvSchema);
  return {
    corsOrigins: env.CORS_ORIGINS,
    apiDocsEnabled: env.API_DOCS_ENABLED,
    throttle: { ttlMs: env.THROTTLE_TTL_MS, limit: env.THROTTLE_LIMIT },
    trustProxy: env.TRUST_PROXY,
  };
});

export type HttpConfig = ConfigType<typeof httpConfig>;
