import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MedicationService } from '../../services/medication.service'
import type { Medication } from '../../models/medication.model'

export interface CategoryGroup {
  category: string
  items: Medication[]
}

/** Sentinel <option> value for "Add new category…". Real category
 * `<option>`s are given the distinct `CATEGORY_OPTION_PREFIX` below so a
 * category literally named "__new__" can never collide with this. Exported
 * (rather than only exposed as a protected class field, which the template
 * can reach but external code like tests can't) for direct unit testing. */
export const NEW_CATEGORY_OPTION = '__new__'

/** Prefix applied to real category `<option>` values so they can never
 * equal NEW_CATEGORY_OPTION, no matter what a category is named. */
const CATEGORY_OPTION_PREFIX = 'category:'

/** Maps a category to its `<option value>`. A blank category (the initial
 * "nothing chosen yet" state — canSave() rejects a blank category, so real
 * data never has one) maps to `''` itself, matching the disabled placeholder
 * option's value, rather than `CATEGORY_OPTION_PREFIX + ''`, which would
 * match no `<option>` and leave the select showing nothing. Exported for
 * direct unit testing. */
export function categoryOptionValue(category: string): string {
  return category === '' ? '' : CATEGORY_OPTION_PREFIX + category
}

function emptyMedication(): Omit<Medication, 'id'> {
  return { name: '', dose: '', category: '', intervalDays: 0 }
}

/** Slugifies a name into a Firestore-safe id matching the seed data's
 * convention (e.g. 'aspirin') — see MedicationService.create()'s doc
 * comment. */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Add/edit page for the Medication catalog (see CONTEXT.md). Mirrors
 * PrescriptionsComponent's category-tree sidebar + detail-form shape, but
 * edits the Medication itself (name/dose/category/intervalDays) via
 * MedicationService.create()/update() rather than Prescription reorder
 * logistics.
 */
@Component({
  selector: 'app-medications',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './medications.component.html',
  styleUrl: './medications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MedicationsComponent {
  private readonly medicationService = inject(MedicationService)

  protected readonly NEW_CATEGORY_OPTION = NEW_CATEGORY_OPTION
  protected readonly categoryOptionValue = categoryOptionValue

  /** `undefined` until all$ has emitted at least once — distinguishes "no
   * medications yet" from "haven't heard from Firestore yet", which matters
   * for the create-mode collision check in save() (see canSave()). */
  private readonly medicationsSnapshot = toSignal(this.medicationService.all$)
  private readonly medications = computed(
    () => this.medicationsSnapshot() ?? [],
  )
  private readonly medicationsLoaded = computed(
    () => this.medicationsSnapshot() !== undefined,
  )

  readonly categories = computed(() => groupByCategory(this.medications()))
  readonly categoryOptions = computed(() => [
    ...new Set(this.medications().map((m) => m.category)),
  ])

  readonly selectedId = signal<string | null>(null)
  readonly selectedMedication = computed(
    () => this.medications().find((m) => m.id === this.selectedId()) ?? null,
  )

  readonly error = signal<string | null>(null)

  /** Editable copy of the selected (or new) medication — a plain field, not
   * a signal, so `[(ngModel)]` can mutate it in place; see
   * PrescriptionsComponent.draft's doc comment for why. `null` means
   * nothing selected and not adding (empty state). */
  draft: Omit<Medication, 'id'> | null = null
  isNewCategory = false

  select(medicationId: string): void {
    const medication = this.medications().find((m) => m.id === medicationId)
    if (!medication) {
      return
    }
    this.selectedId.set(medicationId)
    this.error.set(null)
    this.isNewCategory = false
    this.draft = {
      name: medication.name,
      dose: medication.dose,
      category: medication.category,
      intervalDays: medication.intervalDays,
    }
  }

  startAdd(): void {
    this.selectedId.set(null)
    this.error.set(null)
    this.isNewCategory = false
    this.draft = emptyMedication()
  }

  onCategorySelect(value: string): void {
    if (!this.draft) {
      return
    }
    this.isNewCategory = value === NEW_CATEGORY_OPTION
    this.draft.category = this.isNewCategory
      ? ''
      : value.slice(CATEGORY_OPTION_PREFIX.length)
  }

  canSave(): boolean {
    const draft = this.draft
    if (
      !draft ||
      draft.name.trim() === '' ||
      draft.dose.trim() === '' ||
      draft.category.trim() === '' ||
      !Number.isInteger(draft.intervalDays) ||
      draft.intervalDays <= 0
    ) {
      return false
    }
    // Creating needs a real medications snapshot to check the generated id
    // against — see the collision guard in save().
    return this.selectedId() !== null || this.medicationsLoaded()
  }

  async save(): Promise<void> {
    const draft = this.draft
    if (!draft || !this.canSave()) {
      return
    }
    this.error.set(null)

    const id = this.selectedId()
    if (id) {
      await this.medicationService.update(id, { ...draft })
      // Only clear isNewCategory if the user is still on this same draft --
      // otherwise this stale completion would clobber whatever they've since
      // switched to (another selection, or a fresh add).
      if (this.draft === draft && this.selectedId() === id) {
        this.isNewCategory = false
      }
      return
    }

    const newId = slugify(draft.name)
    if (!newId) {
      this.error.set('Name must contain at least one letter or number.')
      return
    }
    if (this.medications().some((m) => m.id === newId)) {
      this.error.set(
        'A medication with this name already exists — edit it instead.',
      )
      return
    }
    await this.medicationService.create(newId, { ...draft })
    // Only select the new id if the user is still on this same draft -- see
    // the update branch above for why. Selected directly (rather than via
    // select(newId)) since select() looks up the record in medications(),
    // which depends on the Firestore snapshot listener catching up to the
    // just-created doc -- a race that could leave nothing selected. draft
    // already holds the just-created data.
    if (this.draft === draft && this.selectedId() === null) {
      this.selectedId.set(newId)
      this.isNewCategory = false
    }
  }
}

/** Medications grouped by category, in first-encountered order. Exported
 * for direct unit testing. */
export function groupByCategory(medications: Medication[]): CategoryGroup[] {
  const groups = new Map<string, Medication[]>()
  for (const medication of medications) {
    const items = groups.get(medication.category) ?? []
    items.push(medication)
    groups.set(medication.category, items)
  }
  return Array.from(groups, ([category, items]) => ({ category, items }))
}
