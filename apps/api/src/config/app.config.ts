import { registerAs, type ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { ConfigDefault, ConfigNamespace, LogLevel, MAX_PORT, NodeEnv } from './config.constants.js';
import { envInteger, parseConfig } from './parse-config.js';

const appEnvSchema = z.object({
  NODE_ENV: z.enum(NodeEnv).default(NodeEnv.DEVELOPMENT),
  PORT: envInteger().pipe(z.int().min(1).max(MAX_PORT)).default(ConfigDefault.PORT),
  LOG_LEVEL: z.enum(LogLevel).default(LogLevel.INFO),
});

export const appConfig = registerAs(ConfigNamespace.APP, () => {
  const env = parseConfig(ConfigNamespace.APP, appEnvSchema);
  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === NodeEnv.PRODUCTION,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
