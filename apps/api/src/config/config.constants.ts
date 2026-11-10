import { NYSE_EARLY_CLOSE_TIME, NYSE_EARLY_CLOSES, NYSE_HOLIDAYS } from './nyse-holidays.js';

export const ConfigNamespace = {
  APP: 'app',
  HTTP: 'http',
  TRADING: 'trading',
  MARKET: 'market',
} as const;

export const NodeEnv = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  PRODUCTION: 'production',
} as const;
export type NodeEnv = (typeof NodeEnv)[keyof typeof NodeEnv];

export const LogLevel = {
  FATAL: 'fatal',
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace',
  SILENT: 'silent',
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const ConfigDefault = {
  PORT: 3001,
  CORS_ORIGINS: 'http://localhost:3000',
  API_DOCS_ENABLED: true,
  THROTTLE_TTL_MS: 60_000,
  THROTTLE_LIMIT: 120,
  // Trust X-Forwarded-For from the local web console only.
  TRUST_PROXY: 'loopback',
  QUANTITY_DECIMAL_PLACES: 3,
  DEFAULT_STOCK_PRICE: '100',
  // USD per stock. $1 is the usual broker minimum for dollar-based orders.
  MIN_ORDER_AMOUNT: '1',
  MARKET_TIMEZONE: 'America/New_York',
  MARKET_OPEN_TIME: '09:30',
  MARKET_CLOSE_TIME: '16:00',
  MARKET_EARLY_CLOSE_TIME: NYSE_EARLY_CLOSE_TIME,
  MARKET_HOLIDAYS: NYSE_HOLIDAYS.join(','),
  MARKET_EARLY_CLOSES: NYSE_EARLY_CLOSES.join(','),
} as const;

// Brokers allow at most 9 decimal places for fractional shares.
export const MAX_QUANTITY_DECIMAL_PLACES = 9;
export const MAX_PORT = 65_535;
