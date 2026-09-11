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
    scheduleNotes: '',
    updatedAt: null,
  }
}
