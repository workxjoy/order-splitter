import { registerAs, type ConfigType } from '@nestjs/config';
import { IANAZone } from 'luxon';
import { z } from 'zod';
import { ConfigDefault, ConfigNamespace } from './config.constants.js';
import { parseConfig } from './parse-config.js';

const TIME_SEPARATOR = ':';
const LIST_SEPARATOR = ',';
const MINUTES_PER_HOUR = 60;

interface TimeOfDay {
  hour: number;
  minute: number;
}

// hh:mm, e.g. 09:30
const timeOfDaySchema = z.iso
  .time({ precision: -1, error: 'Must be a 24-hour time such as 09:30' })
  .transform((value): TimeOfDay => {
    const [hour, minute] = value.split(TIME_SEPARATOR);
    return { hour: Number(hour), minute: Number(minute) };
  });

// Comma-separated YYYY-MM-DD dates in the market time zone. Empty means none.
const marketDatesSchema = z
  .string()
  .transform((value) =>
    value
      .split(LIST_SEPARATOR)
      .map((date) => date.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.iso.date({ error: 'Must be a date such as 2026-11-26' })))
  .transform((dates): ReadonlySet<string> => new Set(dates));

const toMinutes = ({ hour, minute }: TimeOfDay): number => hour * MINUTES_PER_HOUR + minute;

// Skip cross-field checks when one of the fields already failed, to avoid a misleading second error.
function whenParsed(...fields: string[]) {
  return ({ issues }: z.core.ParsePayload): boolean =>
    !issues.some((issue) => fields.includes(String(issue.path?.[0] ?? '')));
}

const marketEnvSchema = z
  .object({
    MARKET_TIMEZONE: z
      .string()
      .default(ConfigDefault.MARKET_TIMEZONE)
      .refine((zone) => IANAZone.isValidZone(zone), 'Must be a valid IANA time zone'),
    MARKET_OPEN_TIME: timeOfDaySchema.prefault(ConfigDefault.MARKET_OPEN_TIME),
    MARKET_CLOSE_TIME: timeOfDaySchema.prefault(ConfigDefault.MARKET_CLOSE_TIME),
    MARKET_EARLY_CLOSE_TIME: timeOfDaySchema.prefault(ConfigDefault.MARKET_EARLY_CLOSE_TIME),
    MARKET_HOLIDAYS: marketDatesSchema.prefault(ConfigDefault.MARKET_HOLIDAYS),
    MARKET_EARLY_CLOSES: marketDatesSchema.prefault(ConfigDefault.MARKET_EARLY_CLOSES),
  })
  .refine((env) => toMinutes(env.MARKET_OPEN_TIME) < toMinutes(env.MARKET_CLOSE_TIME), {
    message: 'MARKET_OPEN_TIME must be earlier than MARKET_CLOSE_TIME',
    path: ['MARKET_OPEN_TIME'],
    when: whenParsed('MARKET_OPEN_TIME', 'MARKET_CLOSE_TIME'),
  })
  .refine(
    (env) =>
      env.MARKET_EARLY_CLOSES.size === 0 ||
      (toMinutes(env.MARKET_OPEN_TIME) < toMinutes(env.MARKET_EARLY_CLOSE_TIME) &&
        toMinutes(env.MARKET_EARLY_CLOSE_TIME) < toMinutes(env.MARKET_CLOSE_TIME)),
    {
      message: 'MARKET_EARLY_CLOSE_TIME must be between MARKET_OPEN_TIME and MARKET_CLOSE_TIME',
      path: ['MARKET_EARLY_CLOSE_TIME'],
      when: whenParsed(
        'MARKET_OPEN_TIME',
        'MARKET_CLOSE_TIME',
        'MARKET_EARLY_CLOSE_TIME',
        'MARKET_EARLY_CLOSES',
      ),
    },
  )
  .refine((env) => ![...env.MARKET_EARLY_CLOSES].some((date) => env.MARKET_HOLIDAYS.has(date)), {
    message: 'A date cannot be both in MARKET_HOLIDAYS and in MARKET_EARLY_CLOSES',
    path: ['MARKET_EARLY_CLOSES'],
    when: whenParsed('MARKET_HOLIDAYS', 'MARKET_EARLY_CLOSES'),
  });

export const marketConfig = registerAs(ConfigNamespace.MARKET, () => {
  const env = parseConfig(ConfigNamespace.MARKET, marketEnvSchema);
  return {
    timezone: env.MARKET_TIMEZONE,
    openTime: env.MARKET_OPEN_TIME,
    closeTime: env.MARKET_CLOSE_TIME,
    earlyCloseTime: env.MARKET_EARLY_CLOSE_TIME,
    holidays: env.MARKET_HOLIDAYS,
    earlyCloses: env.MARKET_EARLY_CLOSES,
  };
});

export type MarketConfig = ConfigType<typeof marketConfig>;
