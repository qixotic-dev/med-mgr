import type { DateKey } from '../util/date-key'

/**
 * The reorder logistics for one Medication: which pharmacy, which
 * prescriber, how to place the order, and when it was last ordered / is
 * next due. Exactly one Prescription per Medication today — doc ID is
 * `medicationId` (the owning Medication's `id` slug), not a separate
 * autoId. See CONTEXT.md.
 */
export interface Prescription {
  medicationId: string
  pharmacyName: string
  pharmacyPhone: string
  pharmacyAddress: string
  prescriberName: string
  prescriberPhone: string
  howToOrder: string
  lastOrderDate: DateKey | null
  nextOrderDate: DateKey | null
  /** The Google Calendar event id backing `nextOrderDate`'s reminder, or
   * `null` if nothing is scheduled (or the schedule was cleared). Lets a
   * later pick update the same Calendar event instead of leaving the old
   * one behind, and lets a clear delete it. See TODO.md #13. */
  calendarEventId: string | null
  scheduleNotes: string
  updatedAt: Date | null
}

export function emptyPrescription(medicationId: string): Prescription {
  return {
    medicationId,
    pharmacyName: '',
    pharmacyPhone: '',
    pharmacyAddress: '',
    prescriberName: '',
    prescriberPhone: '',
    howToOrder: '',
    lastOrderDate: null,
    nextOrderDate: null,
    calendarEventId: null,
    scheduleNotes: '',
    updatedAt: null,
  }
}
