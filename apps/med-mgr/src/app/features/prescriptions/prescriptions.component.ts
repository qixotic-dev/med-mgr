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
    await this.prescriptionService.save(medicationId, {
      pharmacyName: submitted.pharmacyName,
      pharmacyPhone: submitted.pharmacyPhone,
      pharmacyAddress: submitted.pharmacyAddress,
      prescriberName: submitted.prescriberName,
      prescriberPhone: submitted.prescriberPhone,
      howToOrder: submitted.howToOrder,
      lastOrderDate: submitted.lastOrderDate,
      nextOrderDate: submitted.nextOrderDate,
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
   * immediately creates the Calendar reminder — independent of Save. */
  async pickNextOrderDate(nextOrderDate: DateKey): Promise<void> {
    const medication = this.selectedMedication()
    if (!medication || !this.draft) {
      return
    }
    this.draft = { ...this.draft, nextOrderDate }
    await this.calendarService.scheduleReminder(
      medication,
      nextOrderDate,
      this.draft.howToOrder,
    )
  }
}

/** Compares the user-editable fields only — ignores `medicationId` and the
 * server-set `updatedAt`, so a freshly-fetched Prescription can be compared
 * against a draft the user hasn't touched yet. Exported for direct unit
 * testing. */
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
