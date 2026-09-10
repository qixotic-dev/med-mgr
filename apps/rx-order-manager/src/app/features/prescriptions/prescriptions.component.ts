import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { CalendarPickerComponent } from '../../shared/calendar-picker.component';
import { MedicationService } from '../../services/medication.service';
import { PrescriptionService } from '../../services/prescription.service';
import { CalendarService } from '../../core/calendar.service';
import type { Medication } from '../../models/medication.model';
import type { Prescription } from '../../models/prescription.model';
import { emptyPrescription } from '../../models/prescription.model';
import type { DateKey } from '../../util/date-key';
import { addDays, todayKey } from '../../util/date-key';

export interface PrescriptionListItem {
  medication: Medication;
  prescription: Prescription;
}

export interface CategoryGroup {
  category: string;
  items: PrescriptionListItem[];
}

/** Picker range stand-in for "unbounded": the old Electron app's date picker
 * had no min/max at all, but the ported CalendarPickerComponent (see
 * shared/calendar-picker.component.ts) requires both — these are wide
 * enough that no real next-order date will ever hit them. */
const MIN_PICKABLE_DATE: DateKey = '2000-01-01';
const MAX_PICKABLE_DATE_DAYS_OUT = 3650;

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
  private readonly medicationService = inject(MedicationService);
  private readonly prescriptionService = inject(PrescriptionService);
  private readonly calendarService = inject(CalendarService);

  private readonly medications = toSignal(this.medicationService.all$, {
    initialValue: [],
  });
  private readonly prescriptions = toSignal(this.prescriptionService.all$, {
    initialValue: [],
  });

  readonly categories = computed(() =>
    groupByCategory(this.medications(), this.prescriptions()),
  );

  readonly selectedId = signal<string | null>(null);

  readonly selectedMedication = computed(
    () => this.medications().find((m) => m.id === this.selectedId()) ?? null,
  );

  readonly today = todayKey();
  readonly minPickableDate = MIN_PICKABLE_DATE;
  readonly maxPickableDate = addDays(this.today, MAX_PICKABLE_DATE_DAYS_OUT);

  /**
   * Editable copy of the selected Prescription — a snapshot taken on
   * selection, not a live binding to `prescriptions()`, so a Firestore
   * update from elsewhere can't clobber in-progress edits (matches the old
   * app, which only ever read its form inputs back on Save). A plain field,
   * not a signal: `[(ngModel)]` mutates it directly, and a signal wrapping a
   * mutated-in-place object wouldn't notify `computed()`s that depend on
   * it — see canSave().
   */
  draft: Prescription | null = null;

  select(medicationId: string): void {
    this.selectedId.set(medicationId);
    const existing = this.prescriptions().find(
      (p) => p.medicationId === medicationId,
    );
    this.draft = existing ? { ...existing } : emptyPrescription(medicationId);
  }

  canSave(): boolean {
    const draft = this.draft;
    return (
      !!draft &&
      draft.pharmacyName.trim() !== '' &&
      draft.pharmacyPhone.trim() !== '' &&
      draft.prescriberName.trim() !== '' &&
      draft.prescriberPhone.trim() !== ''
    );
  }

  async save(): Promise<void> {
    const medicationId = this.selectedId();
    const draft = this.draft;
    if (!medicationId || !draft || !this.canSave()) {
      return;
    }
    await this.prescriptionService.save(medicationId, {
      pharmacyName: draft.pharmacyName,
      pharmacyPhone: draft.pharmacyPhone,
      pharmacyAddress: draft.pharmacyAddress,
      prescriberName: draft.prescriberName,
      prescriberPhone: draft.prescriberPhone,
      howToOrder: draft.howToOrder,
      lastOrderDate: draft.lastOrderDate,
      nextOrderDate: draft.nextOrderDate,
      scheduleNotes: draft.scheduleNotes,
    });
  }

  /** Picking a date both updates the draft and, matching the old app,
   * immediately creates the Calendar reminder — independent of Save. */
  async pickNextOrderDate(nextOrderDate: DateKey): Promise<void> {
    const medication = this.selectedMedication();
    if (!medication || !this.draft) {
      return;
    }
    this.draft = { ...this.draft, nextOrderDate };
    await this.calendarService.scheduleReminder(
      medication,
      nextOrderDate,
      this.draft.howToOrder,
    );
  }
}

/**
 * Medications grouped by category, each paired with its Prescription (or an
 * empty one if it has never been saved). Exported for direct unit testing.
 */
export function groupByCategory(
  medications: Medication[],
  prescriptions: Prescription[],
): CategoryGroup[] {
  const byMedicationId = new Map(prescriptions.map((p) => [p.medicationId, p]));
  const groups = new Map<string, PrescriptionListItem[]>();
  for (const medication of medications) {
    const items = groups.get(medication.category) ?? [];
    items.push({
      medication,
      prescription:
        byMedicationId.get(medication.id) ?? emptyPrescription(medication.id),
    });
    groups.set(medication.category, items);
  }
  return Array.from(groups, ([category, items]) => ({ category, items }));
}
