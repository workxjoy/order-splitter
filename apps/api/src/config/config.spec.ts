import { afterEach, describe, expect, it, vi } from 'vitest';
import { appConfig } from './app.config.js';
import { ConfigDefault, LogLevel, NodeEnv } from './config.constants.js';
import { httpConfig } from './http.config.js';
import { marketConfig } from './market.config.js';
import { NYSE_EARLY_CLOSES, NYSE_HOLIDAYS } from './nyse-holidays.js';
import { tradingConfig } from './trading.config.js';

const CONFIG_VARIABLES = [
  'NODE_ENV',
  'PORT',
  'LOG_LEVEL',
  'CORS_ORIGINS',
  'API_DOCS_ENABLED',
  'THROTTLE_TTL_MS',
  'THROTTLE_LIMIT',
  'TRUST_PROXY',
  'QUANTITY_DECIMAL_PLACES',
  'DEFAULT_STOCK_PRICE',
  'MIN_ORDER_AMOUNT',
  'MARKET_TIMEZONE',
  'MARKET_OPEN_TIME',
  'MARKET_CLOSE_TIME',
  'MARKET_EARLY_CLOSE_TIME',
  'MARKET_HOLIDAYS',
  'MARKET_EARLY_CLOSES',
];

function withEnv(variables: Record<string, string>): void {
  for (const name of CONFIG_VARIABLES) vi.stubEnv(name, undefined);
  for (const [name, value] of Object.entries(variables)) vi.stubEnv(name, value);
}

describe('configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('applies documented defaults when nothing is set', () => {
    withEnv({});

    expect(appConfig()).toEqual({
      nodeEnv: NodeEnv.DEVELOPMENT,
      isProduction: false,
      port: ConfigDefault.PORT,
      logLevel: LogLevel.INFO,
    });
    expect(httpConfig()).toEqual({
      corsOrigins: [ConfigDefault.CORS_ORIGINS],
      apiDocsEnabled: true,
      throttle: { ttlMs: ConfigDefault.THROTTLE_TTL_MS, limit: ConfigDefault.THROTTLE_LIMIT },
      trustProxy: ['loopback'],
    });
    const trading = tradingConfig();
    expect(trading.quantityDecimalPlaces).toBe(3);
    expect(trading.defaultStockPrice.toFixed()).toBe('100');
    expect(trading.minOrderAmount.toFixed()).toBe('1');
    expect(marketConfig()).toEqual({
      timezone: 'America/New_York',
      openTime: { hour: 9, minute: 30 },
      closeTime: { hour: 16, minute: 0 },
      earlyCloseTime: { hour: 13, minute: 0 },
      holidays: new Set(NYSE_HOLIDAYS),
      earlyCloses: new Set(NYSE_EARLY_CLOSES),
    });
  });

  it('reads overrides, including a higher quantity precision', () => {
    withEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      CORS_ORIGINS: 'https://a.example.com, https://b.example.com',
      API_DOCS_ENABLED: 'false',
      QUANTITY_DECIMAL_PLACES: '7',
      DEFAULT_STOCK_PRICE: '99.5',
      MIN_ORDER_AMOUNT: '0',
      MARKET_TIMEZONE: 'Europe/London',
      MARKET_OPEN_TIME: '08:00',
      MARKET_CLOSE_TIME: '16:30',
      MARKET_EARLY_CLOSE_TIME: '12:30',
      MARKET_HOLIDAYS: '2026-12-25, 2026-12-28',
      MARKET_EARLY_CLOSES: '2026-12-24',
    });

    expect(appConfig()).toMatchObject({ isProduction: true, port: 8080 });
    expect(httpConfig()).toMatchObject({
      corsOrigins: ['https://a.example.com', 'https://b.example.com'],
      apiDocsEnabled: false,
    });
    expect(tradingConfig().quantityDecimalPlaces).toBe(7);
    expect(tradingConfig().defaultStockPrice.toFixed()).toBe('99.5');
    expect(tradingConfig().minOrderAmount.toFixed()).toBe('0');
    expect(marketConfig()).toEqual({
      timezone: 'Europe/London',
      openTime: { hour: 8, minute: 0 },
      closeTime: { hour: 16, minute: 30 },
      earlyCloseTime: { hour: 12, minute: 30 },
      holidays: new Set(['2026-12-25', '2026-12-28']),
      earlyCloses: new Set(['2026-12-24']),
    });
  });

  it('reduces each CORS origin to the form browsers send', () => {
    withEnv({ CORS_ORIGINS: 'http://localhost:3000/, HTTPS://App.Example.com:443' });

    expect(httpConfig().corsOrigins).toEqual(['http://localhost:3000', 'https://app.example.com']);
  });

  it('accepts an empty market calendar (Monday to Friday only)', () => {
    withEnv({ MARKET_HOLIDAYS: '', MARKET_EARLY_CLOSES: ' ' });

    expect(marketConfig()).toMatchObject({ holidays: new Set(), earlyCloses: new Set() });
  });

  it.each([
    ['2', 2],
    ['false', false],
    ['loopback, 10.0.0.0/8, ::1', ['loopback', '10.0.0.0/8', '::1']],
    // Express also accepts a netmask in place of a prefix length.
    ['10.0.0.0/255.0.0.0', ['10.0.0.0/255.0.0.0']],
  ])('reads TRUST_PROXY=%s', (value, expected) => {
    withEnv({ TRUST_PROXY: value });

    expect(httpConfig().trustProxy).toEqual(expected);
  });

  it.each([
    ['QUANTITY_DECIMAL_PLACES', '10', tradingConfig, 'trading'],
    ['QUANTITY_DECIMAL_PLACES', '-1', tradingConfig, 'trading'],
    ['QUANTITY_DECIMAL_PLACES', '2.5', tradingConfig, 'trading'],
    // Blank values must not be coerced to 0 (whole-share precision).
    ['QUANTITY_DECIMAL_PLACES', '', tradingConfig, 'trading'],
    ['QUANTITY_DECIMAL_PLACES', '1e1', tradingConfig, 'trading'],
    ['DEFAULT_STOCK_PRICE', '0', tradingConfig, 'trading'],
    ['PORT', '70000', appConfig, 'app'],
    ['PORT', '', appConfig, 'app'],
    ['THROTTLE_LIMIT', ' ', httpConfig, 'http'],
    ['TRUST_PROXY', 'proxy.internal', httpConfig, 'http'],
    ['TRUST_PROXY', '10.0.0.0/8/1', httpConfig, 'http'],
    ['TRUST_PROXY', ',', httpConfig, 'http'],
    // Prefix lengths beyond the address size would otherwise crash Express at startup.
    ['TRUST_PROXY', '10.0.0.0/99', httpConfig, 'http'],
    ['TRUST_PROXY', '::1/200', httpConfig, 'http'],
    ['LOG_LEVEL', 'verbose', appConfig, 'app'],
    ['CORS_ORIGINS', 'not-a-url', httpConfig, 'http'],
    ['CORS_ORIGINS', 'https://app.example.com/console', httpConfig, 'http'],
    ['CORS_ORIGINS', 'https://app.example.com/?x=1', httpConfig, 'http'],
    ['MARKET_TIMEZONE', 'Mars/Olympus', marketConfig, 'market'],
    ['MARKET_OPEN_TIME', '9:30', marketConfig, 'market'],
    ['MARKET_OPEN_TIME', '17:00', marketConfig, 'market'],
    ['MARKET_HOLIDAYS', '2026-13-01', marketConfig, 'market'],
    ['MARKET_HOLIDAYS', 'Thanksgiving', marketConfig, 'market'],
    ['MARKET_EARLY_CLOSES', '27/11/2026', marketConfig, 'market'],
    // The default early-close days need an early close inside the session.
    ['MARKET_EARLY_CLOSE_TIME', '16:30', marketConfig, 'market'],
    // Thanksgiving is already a default holiday.
    ['MARKET_EARLY_CLOSES', '2026-11-26', marketConfig, 'market'],
    ['MIN_ORDER_AMOUNT', '-1', tradingConfig, 'trading'],
    ['MIN_ORDER_AMOUNT', '0.005', tradingConfig, 'trading'],
    ['MIN_ORDER_AMOUNT', 'one dollar', tradingConfig, 'trading'],
  ])('fails fast when %s=%s', (name, value, factory, namespace) => {
    withEnv({ [name]: value });

    expect(() => factory()).toThrow(`Invalid "${namespace}" configuration`);
  });

  it('reports only the format error for a malformed session time', () => {
    withEnv({ MARKET_OPEN_TIME: '9:30' });

    const error = (() => {
      try {
        marketConfig();
      } catch (thrown) {
        return thrown;
      }
      return undefined;
    })();

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Must be a 24-hour time such as 09:30');
    expect((error as Error).message).not.toContain('must be earlier than');
  });
});
