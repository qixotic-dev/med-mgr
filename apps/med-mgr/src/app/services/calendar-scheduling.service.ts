import { Injectable, signal } from '@angular/core'

/**
 * The single global "a Calendar write is in flight" lock used by
 * PrescriptionsComponent.pickNextOrderDate() (see TODO.md #12) —
 * root-scoped (like SelectedMedicationService) rather than a component
 * field, because Angular's router destroys and recreates
 * PrescriptionsComponent on navigation: a component-instance field would
 * forget a write still pending from before the user navigated away, so a
 * second attempt after they return could call signInWithPopup()
 * concurrently with the first — the exact `auth/cancelled-popup-request`
 * cancellation this lock exists to prevent (caught by Copilot review on
 * this item's PR).
 */
@Injectable({ providedIn: 'root' })
export class CalendarSchedulingService {
  /** Medication id the in-flight write belongs to, or `null`. A single
   * slot, not per-medication: two concurrent signInWithPopup() calls cancel
   * each other no matter which medication triggered them. */
  readonly schedulingMedicationId = signal<string | null>(null)

  /** The most recent write failure, tagged with which medication it was
   * for — lets a caller show it only while that same medication is still
   * selected, rather than against whatever the user has since switched to. */
  readonly failure = signal<{ medicationId: string; message: string } | null>(
    null,
  )
}
