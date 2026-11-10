import { Money } from '../../src/common/utils/money.js';
import type { MarketConfig } from '../../src/config/market.config.js';
import { NYSE_EARLY_CLOSES, NYSE_HOLIDAYS } from '../../src/config/nyse-holidays.js';
import type { TradingConfig } from '../../src/config/trading.config.js';

export function tradingConfigFixture(overrides: Partial<TradingConfig> = {}): TradingConfig {
  return {
    quantityDecimalPlaces: 3,
    defaultStockPrice: new Money(100),
    minOrderAmount: new Money(1),
    ...overrides,
  };
}

export function marketConfigFixture(overrides: Partial<MarketConfig> = {}): MarketConfig {
  return {
    timezone: 'America/New_York',
    openTime: { hour: 9, minute: 30 },
    closeTime: { hour: 16, minute: 0 },
    earlyCloseTime: { hour: 13, minute: 0 },
    holidays: new Set(NYSE_HOLIDAYS),
    earlyCloses: new Set(NYSE_EARLY_CLOSES),
    ...overrides,
  };
}
