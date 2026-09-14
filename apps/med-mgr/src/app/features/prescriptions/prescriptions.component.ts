import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { StatusBadgeComponent } from '../../shared/status-badge.component'
import { CalendarPickerComponent } from '../../shared/calendar-picker.component'
import { MedicationService } from '../../services/medication.service'
import { PrescriptionService } from '../../services/prescription.service'
import { CalendarService } from '../../core/calendar.service'
import { SelectedMedicationService } from '../../services/selected-medication.service'
import { CalendarSchedulingService } from '../../services/calendar-scheduling.service'
import type { Medication } from '../../models/medication.model'
import type { Prescription } from '../../models/prescription.model'
import { emptyPrescription } from '../../models/prescription.model'
import type { DateKey } from '../../util/date-key'
import { addDays, todayKey } from '../../util/date-key'

export interface PrescriptionListItem {
  medication: Medication
  prescription: Prescription
}

export interface CategoryGroup {
  category: string
  items: PrescriptionListItem[]
}

/** Picker range stand-in for "unbounded": the old Electron app's date picker
 * had no min/max at all, but the ported CalendarPickerComponent (see
 * shared/calendar-picker.component.ts) requires both — these are wide
 * enough that no real next-order date will ever hit them. */
const MIN_PICKABLE_DATE: DateKey = '2000-01-01'
const MAX_PICKABLE_DATE_DAYS_OUT = 3650

/**
 * Category-tree sidebar + detail form (see CONTEXT.md: Medication/
 * Prescription). Ports the old Electron app's interaction model — select a
 * medication from the grouped list, edit its Prescription in the panel,
 * pick a next-order date to also create a Calendar reminder — not its
 * markup/CSS, which was single-file and not idiomatic Angular.
 */
@Component({
  selector: 'app-prescriptions',
  standalone: true,
  imports: [FormsModule, StatusBadgeComponent, CalendarPickerComponent],
  templateUrl: './prescriptions.component.html',
  styleUrl: './prescriptions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrescriptionsComponent {
  private readonly medicationService = inject(MedicationService)
  private readonly prescriptionService = inject(PrescriptionService)
  private readonly calendarService = inject(CalendarService)
  private readonly changeDetectorRef = inject(ChangeDetectorRef)

  /** `undefined` until all$ has emitted at least once -- distinguishes "no
   * medications yet" from "haven't heard from Firestore yet", which matters
   * for the hydration effect below (see MedicationsComponent's identical
   * medicationsLoaded, added for the same reason). */
  private readonly medicationsSnapshot = toSignal(this.medicationService.all$)
  private readonly medications = computed(
    () => this.medicationsSnapshot() ?? [],
  )
  private readonly medicationsLoaded = computed(
    () => this.medicationsSnapshot() !== undefined,
  )
  private readonly prescriptions = toSignal(this.prescriptionService.all$, {
    initialValue: [],
  })

  readonly categories = computed(() =>
    groupByCategory(this.medications(), this.prescriptions()),
  )

  /** Shared with Medications/Interactions via SelectedMedicationService (see
   * TODO.md #9) so the same medication stays selected across tabs. */
  readonly selectedId = inject(SelectedMedicationService).selectedId

  readonly selectedMedication = computed(
    () => this.medications().find((m) => m.id === this.selectedId()) ?? null,
  )

  readonly today = todayKey()
  readonly minPickableDate = MIN_PICKABLE_DATE
  readonly maxPickableDate = addDays(this.today, MAX_PICKABLE_DATE_DAYS_OUT)

  /**
   * Editable copy of the selected Prescription — a snapshot taken on
   * selection, not a live binding to `prescriptions()`, so a Firestore
   * update from elsewhere can't clobber in-progress edits (matches the old
   * app, which only ever read its form inputs back on Save). A plain field,
   * not a signal: `[(ngModel)]` mutates it directly, and a signal wrapping a
   * mutated-in-place object wouldn't notify `computed()`s that depend on
   * it — see canSave().
   */
  draft: Prescription | null = null

  /** What `draft` was last set to by `select()` or the reconcile effect
   * below — compared against `draft` to tell an untouched snapshot from an
   * in-progress edit. */
  private draftBaseline: Prescription | null = null

  /** Whether the one-time hydration effect below has already run. */
  private hydratedSelection = false

  /** Root-scoped, not a component field: Angular's router destroys this
   * component on navigating away from Prescriptions, and a component field
   * would forget a Calendar write still pending from before the user left
   * -- see CalendarSchedulingService's doc comment (added after Copilot
   * review on this item's PR caught the component-field version losing the
   * lock across navigation). */
  private readonly calendarScheduling = inject(CalendarSchedulingService)

  /** True only while a Calendar write is in flight *for the currently
   * selected medication* -- mirrors isDeleting/isRegenerating in
   * MedicationsComponent (see TODO.md #8) as the in-flight indicator, but
   * see CalendarSchedulingService's doc comment for why the lock itself
   * lives in a service and why this is derived rather than a plain signal:
   * a still-in-flight write for a medication the user has since navigated
   * away from must not show "Scheduling…" against whatever they've
   * switched to instead. */
  readonly isScheduling = computed(() => {
    const id = this.calendarScheduling.schedulingMedicationId()
    return id !== null && id === this.selectedId()
  })

  /** True while a Calendar write is in flight for *any* medication --
   * unlike isScheduling(), not scoped to the current selection. Used to
   * disable the date picker entirely while true: the single global lock
   * (see CalendarSchedulingService) means a pick for a different medication
   * would silently no-op anyway, and a disabled picker says so instead of
   * looking like the click was accepted (caught by Copilot review on this
   * item's PR). */
  readonly isCalendarBusy = computed(
    () => this.calendarScheduling.schedulingMedicationId() !== null,
  )

  /** The scheduling-failure message for the currently selected medication,
   * if any -- see CalendarSchedulingService's doc comment. */
  readonly error = computed(() => {
    const failure = this.calendarScheduling.failure()
    return failure && failure.medicationId === this.selectedId()
      ? failure.message
      : null
  })

  constructor() {
    // Loads `draft` from a selection already made on the Medications/
    // Interactions pages before this page was ever mounted -- selectedId is
    // shared (see its doc comment above), but select() is otherwise only
    // ever called from this component's own sidebar clicks, so a
    // pre-existing selection needs this one-time hydration to actually show
    // up in the form. Mirrors MedicationsComponent's identical effect.
    // Waits for medicationsLoaded() so it can tell "not found yet" from
    // "was deleted elsewhere", then never runs again.
    effect(() => {
      if (this.hydratedSelection || !this.medicationsLoaded()) {
        return
      }
      this.hydratedSelection = true
      const id = this.selectedId()
      if (!id) {
        return
      }
      if (this.medications().some((m) => m.id === id)) {
        this.select(id)
        // select() is otherwise only ever called from a template click,
        // which marks the view on its own -- see the reconcile effect
        // below for the same nudge.
        this.changeDetectorRef.markForCheck()
      } else {
        // Stale -- the medication behind a cross-tab selection was deleted
        // elsewhere before this page ever loaded it.
        this.selectedId.set(null)
      }
    })

    // Resets the shared selection (and this page's draft) back to null if
    // the selected medication is deleted from another tab/device while
    // sitting on Prescriptions -- otherwise the sidebar/header would keep
    // pointing at a dead id. Mirrors InteractionsComponent's identical
    // effect, added there for the same shared-signal reason (see TODO.md
    // #6, #9).
    effect(() => {
      if (!this.medicationsLoaded()) {
        return
      }
      const id = this.selectedId()
      if (id && !this.medications().some((m) => m.id === id)) {
        this.selectedId.set(null)
        this.draft = null
        this.draftBaseline = null
        this.calendarScheduling.failure.set(null)
        // A plain field write from a reactive effect (not a template event
        // binding), so it needs an explicit nudge to reach the OnPush view.
        this.changeDetectorRef.markForCheck()
      }
    })

    // `select()` can run before `prescriptions()` has received its first
    // Firestore snapshot (still at its `[]` initialValue), producing an
    // empty draft for a medication that actually has saved data. Once real
    // data arrives, adopt it here — but only while the draft still matches
    // its baseline, so an in-progress edit (including a picked-but-unsaved
    // date, see pickNextOrderDate()) is never clobbered.
    effect(() => {
      const medicationId = this.selectedId()
      const prescriptions = this.prescriptions()
      if (
        !medicationId ||
        !this.draft ||
        !this.draftBaseline ||
        !isSamePrescriptionData(this.draft, this.draftBaseline)
      ) {
        return
      }
      const existing = prescriptions.find(
        (p) => p.medicationId === medicationId,
      )
      if (existing && !isSamePrescriptionData(existing, this.draft)) {
        this.draft = { ...existing }
        // A separate copy, not the same reference as `draft`: `[(ngModel)]`
        // mutates `draft`'s fields in place, and an aliased baseline would
        // "see" every keystroke too, making isSamePrescriptionData() above
        // always pass and defeating this whole guard.
        this.draftBaseline = { ...this.draft }
        // `draft` is a plain field, not a signal (see its doc comment), so
        // unlike select()/pickNextOrderDate() -- both called from template
        // event bindings, which Angular already schedules a render after --
        // this reactive-graph-driven write needs an explicit nudge to reach
        // the view.
        this.changeDetectorRef.markForCheck()
      }
    })
  }

  select(medicationId: string): void {
    this.selectedId.set(medicationId)
    this.calendarScheduling.failure.set(null)
    const existing = this.prescriptions().find(
      (p) => p.medicationId === medicationId,
    )
    this.draft = existing ? { ...existing } : emptyPrescription(medicationId)
    // A separate copy -- see the reconcile effect's comment above for why
    // draftBaseline must never alias `draft`.
    this.draftBaseline = { ...this.draft }
  }

  canSave(): boolean {
    const draft = this.draft
    return (
      !!draft &&
      draft.pharmacyName.trim() !== '' &&
      draft.pharmacyPhone.trim() !== '' &&
      draft.prescriberName.trim() !== '' &&
      draft.prescriberPhone.trim() !== ''
    )
  }

  /** Whether the Clear button should be enabled -- true while there's a
   * next-order date *or* a Calendar event still on record for it to act on.
   * Checked as "either field", not just nextOrderDate: a failed
   * clearSchedule() deliberately leaves calendarEventId set (see its doc
   * comment) even after nextOrderDate has already gone optimistically null,
   * and gating on nextOrderDate alone made that failure's event permanently
   * unreachable through the UI -- there was no way left to retry the delete
   * (caught by Copilot review on this item's PR). */
  canClearSchedule(): boolean {
    const draft = this.draft
    return (
      !this.isCalendarBusy() &&
      !!draft &&
      (draft.nextOrderDate !== null || draft.calendarEventId !== null)
    )
  }

  async save(): Promise<void> {
    const medicationId = this.selectedId()
    const draft = this.draft
    if (!medicationId || !draft || !this.canSave()) {
      return
    }
    // Snapshot what's actually being sent -- `draft`'s fields keep mutating
    // in place via [(ngModel)] while the write below is in flight, so
    // reading them again after the await would record whatever the user
    // has typed *since* Save was clicked, not what was actually persisted.
    const submitted = { ...draft }
    // nextOrderDate/calendarEventId deliberately omitted -- saveSchedule()
    // is their sole writer (see PrescriptionService.save()'s doc comment).
    await this.prescriptionService.save(medicationId, {
      pharmacyName: submitted.pharmacyName,
      pharmacyPhone: submitted.pharmacyPhone,
      pharmacyAddress: submitted.pharmacyAddress,
      prescriberName: submitted.prescriberName,
      prescriberPhone: submitted.prescriberPhone,
      howToOrder: submitted.howToOrder,
      lastOrderDate: submitted.lastOrderDate,
      scheduleNotes: submitted.scheduleNotes,
    })
    // Only adopt this as the new baseline if the user is still on the same
    // medication -- if they've since selected another one, select() already
    // set its own draft/baseline and this stale write shouldn't touch it.
    if (this.selectedId() === medicationId) {
      this.draftBaseline = submitted
    }
  }

  /** Picking a date both updates the draft and, matching the old app,
   * immediately creates the Calendar reminder — independent of Save.
   * CalendarService.scheduleReminder() can throw (expired/missing token,
   * a blocked or dismissed Google sign-in popup, a Calendar API error) --
   * previously this was awaited with no try/catch, so a real failure
   * surfaced nothing to the user: the badge still updated (the draft write
   * above happens unconditionally) as if a reminder had been scheduled,
   * while the Calendar API was never actually reached. Confirmed live
   * against the deployed app: a `signInWithPopup` failure/cancellation
   * threw before any request to googleapis.com/calendar/v3 was made. */
  async pickNextOrderDate(nextOrderDate: DateKey): Promise<void> {
    const medication = this.selectedMedication()
    if (
      !medication ||
      !this.draft ||
      this.calendarScheduling.schedulingMedicationId() !== null
    ) {
      return
    }
    const medicationId = medication.id
    const existingEventId = this.draft.calendarEventId
    this.draft = { ...this.draft, nextOrderDate }
    this.calendarScheduling.schedulingMedicationId.set(medicationId)
    this.calendarScheduling.failure.set(null)
    try {
      const calendarEventId = await this.calendarService.scheduleReminder(
        medication,
        nextOrderDate,
        this.draft.howToOrder,
        existingEventId,
      )
      // Adopted into the draft *before* the Firestore write below, not
      // after: if saveSchedule() throws, this session's own next pick still
      // must target the event scheduleReminder() actually just created/
      // moved, not the stale id it was called with -- otherwise a
      // saveSchedule() failure here would silently orphan that event on the
      // very next pick, the exact bug TODO.md #13 exists to close. Only
      // while the user is still on this medication -- mirrors save()'s
      // guard; a stale completion for a medication switched away from must
      // not land in whatever draft is now showing.
      if (this.selectedId() === medicationId && this.draft) {
        this.draft = { ...this.draft, calendarEventId }
      }
      // Persisted immediately, independent of Save, matching how the
      // Calendar write itself is independent of Save -- otherwise a picked
      // date whose event id is never saved (the user navigates away without
      // clicking Save) would be un-trackable next time, leaving the next
      // pick unable to replace it (TODO.md #13's original bug, one layer
      // deeper). If this specific write fails, the Firestore doc is left
      // stale (still pointing at the old id/date) until a later successful
      // pick or Save overwrites it -- the draft above is already correct,
      // so this session doesn't orphan anything; only a reload before that
      // happens would see the stale doc.
      await this.prescriptionService.saveSchedule(
        medicationId,
        nextOrderDate,
        calendarEventId,
      )
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Failed to schedule calendar reminder. Please try again.'
      this.calendarScheduling.failure.set({
        medicationId,
        message,
      })
    } finally {
      // Only one Calendar write is ever in flight at a time (see
      // CalendarSchedulingService's doc comment), so it's always this
      // call's own id to release.
      this.calendarScheduling.schedulingMedicationId.set(null)
    }
  }

  /** Clears a scheduled next-order date, including deleting its Calendar
   * event (TODO.md #13 -- "no way to remove a schedule"). Mirrors
   * pickNextOrderDate()'s shape (same lock, same in-flight/error signals) so
   * a clear and a pick can never race each other. Unlike pickNextOrderDate,
   * a failed delete leaves `calendarEventId` untouched rather than nulling
   * it, so nothing is orphaned -- a retry, or a later pick reusing the same
   * id via scheduleReminder()'s update-in-place, can still reach it.
   * `nextOrderDate` clears optimistically either way, matching
   * pickNextOrderDate()'s "the field updates independent of the Calendar
   * write" behavior. */
  async clearSchedule(): Promise<void> {
    const medication = this.selectedMedication()
    if (
      !medication ||
      !this.draft ||
      this.calendarScheduling.schedulingMedicationId() !== null
    ) {
      return
    }
    const medicationId = medication.id
    const eventId = this.draft.calendarEventId
    this.draft = { ...this.draft, nextOrderDate: null }
    this.calendarScheduling.schedulingMedicationId.set(medicationId)
    this.calendarScheduling.failure.set(null)
    try {
      if (eventId) {
        await this.calendarService.deleteReminder(eventId)
      }
      await this.prescriptionService.saveSchedule(medicationId, null, null)
      if (this.selectedId() === medicationId && this.draft) {
        this.draft = { ...this.draft, calendarEventId: null }
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Failed to clear the calendar reminder. Please try again.'
      this.calendarScheduling.failure.set({
        medicationId,
        message,
      })
    } finally {
      this.calendarScheduling.schedulingMedicationId.set(null)
    }
  }
}

/** Compares the user-editable fields only — ignores `medicationId`, the
 * server-set `updatedAt`, and `calendarEventId` (machine-set by
 * pickNextOrderDate()/clearSchedule(), like updatedAt, not something the
 * user edits) — so a freshly-fetched Prescription can be compared against a
 * draft the user hasn't touched yet. Exported for direct unit testing. */
export function isSamePrescriptionData(
  a: Prescription,
  b: Prescription,
): boolean {
  return (
    a.pharmacyName === b.pharmacyName &&
    a.pharmacyPhone === b.pharmacyPhone &&
    a.pharmacyAddress === b.pharmacyAddress &&
    a.prescriberName === b.prescriberName &&
    a.prescriberPhone === b.prescriberPhone &&
    a.howToOrder === b.howToOrder &&
    a.lastOrderDate === b.lastOrderDate &&
    a.nextOrderDate === b.nextOrderDate &&
    a.scheduleNotes === b.scheduleNotes
  )
}

/**
 * Medications grouped by category, each paired with its Prescription (or an
 * empty one if it has never been saved). Exported for direct unit testing.
 */
export function groupByCategory(
  medications: Medication[],
  prescriptions: Prescription[],
): CategoryGroup[] {
  const byMedicationId = new Map(prescriptions.map((p) => [p.medicationId, p]))
  const groups = new Map<string, PrescriptionListItem[]>()
  for (const medication of medications) {
    const items = groups.get(medication.category) ?? []
    items.push({
      medication,
      prescription:
        byMedicationId.get(medication.id) ?? emptyPrescription(medication.id),
    })
    groups.set(medication.category, items)
  }
  return Array.from(groups, ([category, items]) => ({ category, items }))
}
