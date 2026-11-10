import { registerAs, type ConfigType } from '@nestjs/config';
import { OrderLimits, positiveDecimalString, tryParseDecimal } from '@order-splitter/shared';
import { z } from 'zod';
import { Money } from '../common/utils/money.js';
import { ConfigDefault, ConfigNamespace, MAX_QUANTITY_DECIMAL_PLACES } from './config.constants.js';
import { envInteger, parseConfig } from './parse-config.js';

const tradingEnvSchema = z.object({
  QUANTITY_DECIMAL_PLACES: envInteger()
    .pipe(z.int().min(0).max(MAX_QUANTITY_DECIMAL_PLACES))
    .default(ConfigDefault.QUANTITY_DECIMAL_PLACES),
  DEFAULT_STOCK_PRICE: positiveDecimalString({
    maxDecimals: OrderLimits.PRICE_MAX_DECIMALS,
    max: OrderLimits.MAX_MARKET_PRICE,
    description: 'Fixed price per share used when the partner does not supply one',
    example: ConfigDefault.DEFAULT_STOCK_PRICE,
  }).default(ConfigDefault.DEFAULT_STOCK_PRICE),
  MIN_ORDER_AMOUNT: z
    .string()
    .trim()
    .refine((value) => {
      const amount = tryParseDecimal(value);
      return amount !== null && amount.decimalPlaces() <= OrderLimits.AMOUNT_MAX_DECIMALS;
    }, 'Must be a USD amount with at most 2 decimal places, e.g. 1 or 0.50 (0 for no minimum)')
    .default(ConfigDefault.MIN_ORDER_AMOUNT),
});

export const tradingConfig = registerAs(ConfigNamespace.TRADING, () => {
  const env = parseConfig(ConfigNamespace.TRADING, tradingEnvSchema);
  return {
    quantityDecimalPlaces: env.QUANTITY_DECIMAL_PLACES,
    defaultStockPrice: new Money(env.DEFAULT_STOCK_PRICE),
    minOrderAmount: new Money(env.MIN_ORDER_AMOUNT),
  };
});

export type TradingConfig = ConfigType<typeof tradingConfig>;
