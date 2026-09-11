import type { DateKey } from './date-key'
import { addDays, fromDateKey, todayKey } from './date-key'

/** Reorder urgency for a Prescription's badge (see CONTEXT.md) — derived from `nextOrderDate`, never stored. */
export type ReorderStatus =
  'not-scheduled' | 'scheduled' | 'due-soon' | 'overdue'

const DUE_SOON_WINDOW_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * `nextOrderDate` compared against `today`: no date set is `not-scheduled`;
 * a past date is `overdue`; a date within `DUE_SOON_WINDOW_DAYS` (inclusive)
 * is `due-soon`; anything further out is `scheduled`.
 */
export function reorderStatus(
  nextOrderDate: DateKey | null,
  today: DateKey = todayKey(),
): ReorderStatus {
  if (nextOrderDate === null) {
    return 'not-scheduled'
  }
  if (nextOrderDate < today) {
    return 'overdue'
  }
  return nextOrderDate <= addDays(today, DUE_SOON_WINDOW_DAYS)
    ? 'due-soon'
    : 'scheduled'
}

/**
 * Badge display text, per CONTEXT.md's glossary wording — "Not scheduled" /
 * "In 42 days" / "Due in 3 days" / "Overdue" — a live day count, not the old
 * Electron app's abbreviated "3d"/"Due in 3d".
 */
export function reorderStatusLabel(
  nextOrderDate: DateKey | null,
  today: DateKey = todayKey(),
): string {
  if (nextOrderDate === null) {
    return 'Not scheduled'
  }
  const status = reorderStatus(nextOrderDate, today)
  if (status === 'overdue') {
    return 'Overdue'
  }
  const days = daysUntil(nextOrderDate, today)
  const plural = days === 1 ? 'day' : 'days'
  return status === 'due-soon'
    ? `Due in ${days} ${plural}`
    : `In ${days} ${plural}`
}

/** Whole-day gap between two DateKeys, DST-safe (see date-key.ts's header comment). */
function daysUntil(nextOrderDate: DateKey, today: DateKey): number {
  return Math.round(
    (fromDateKey(nextOrderDate).getTime() - fromDateKey(today).getTime()) /
      MS_PER_DAY,
  )
}
