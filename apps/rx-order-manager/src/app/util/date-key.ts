/**
 * Local-time (DST-safe) date keys.
 *
 * Everything here uses the browser's local calendar date, never UTC —
 * `Date#toISOString()` is deliberately avoided because it reports the UTC
 * date, which drifts from the local day near midnight and across DST
 * transitions.
 */

/** A calendar date's identity: `YYYY-MM-DD` in local time. */
export type DateKey = string

/** An inclusive `[start, end]` DateKey span — calendar month bounds, range queries. */
export interface DateRange {
  start: DateKey
  end: DateKey
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function toDateKey(date: Date): DateKey {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now)
}

export function isValidDateKey(key: string): key is DateKey {
  if (!DATE_KEY_PATTERN.test(key)) {
    return false
  }
  const [year, month, day] = key.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  )
}

export function fromDateKey(key: DateKey): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Adds `days` (negative to go backward) to a date key, in local time. */
export function addDays(key: DateKey, days: number): DateKey {
  const date = fromDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/** The `YYYY-MM` prefix of a DateKey — string-comparable, like DateKey itself. */
export function monthKey(key: DateKey): string {
  return key.slice(0, 7)
}

/** The first day of the month containing `key`. */
export function startOfMonth(key: DateKey): DateKey {
  return `${monthKey(key)}-01`
}

/** The last day of the month containing `key`. */
export function endOfMonth(key: DateKey): DateKey {
  const date = fromDateKey(startOfMonth(key))
  date.setMonth(date.getMonth() + 1)
  date.setDate(date.getDate() - 1)
  return toDateKey(date)
}

/**
 * Adds `months` calendar months (negative to go backward), anchored to the
 * 1st of the month. Callers must pass a DateKey already normalized via
 * `startOfMonth` — this doesn't handle day-of-month overflow (e.g. adding a
 * month to the 31st).
 */
export function addMonths(key: DateKey, months: number): DateKey {
  const date = fromDateKey(key)
  date.setMonth(date.getMonth() + months)
  return toDateKey(date)
}
