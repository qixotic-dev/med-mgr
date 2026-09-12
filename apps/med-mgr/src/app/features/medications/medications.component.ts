import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { SeverityBadgeComponent } from '../../shared/severity-badge.component'
import { MedicationService } from '../../services/medication.service'
import { InteractionReportService } from '../../services/interaction-report.service'
import type { Medication } from '../../models/medication.model'
import {
  groupFindings,
  type FindingGroup,
} from '../interactions/interactions.component'

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
  return { commonName: '', dose: '', category: '', intervalDays: 0 }
}

function medicationCoreFields(
  medication: Omit<Medication, 'id'>,
): Pick<
  Medication,
  'commonName' | 'clinicalName' | 'dose' | 'category' | 'intervalDays'
> {
  return {
    commonName: medication.commonName,
    clinicalName: medication.clinicalName,
    dose: medication.dose,
    category: medication.category,
    intervalDays: medication.intervalDays,
  }
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

/** Copies a Medication's editable/generated fields, excluding `id` -- a
 * manual field list (rather than a `{id, ...rest}` destructure) so a newly
 * added field must be added here deliberately, and so there's no unused
 * `id` binding to trip lint. */
function toMedicationDraft(medication: Medication): Omit<Medication, 'id'> {
  return {
    commonName: medication.commonName,
    clinicalName: medication.clinicalName,
    dose: medication.dose,
    category: medication.category,
    intervalDays: medication.intervalDays,
    purpose: medication.purpose,
    instructions: medication.instructions,
    infoStatus: medication.infoStatus,
    infoError: medication.infoError,
  }
}

/** Compares the user-editable/generated fields only — ignores `id`, mirrors
 * PrescriptionsComponent's isSamePrescriptionData. Exported for direct unit
 * testing. */
export function isSameMedicationData(
  a: Omit<Medication, 'id'>,
  b: Omit<Medication, 'id'>,
): boolean {
  return (
    a.commonName === b.commonName &&
    a.clinicalName === b.clinicalName &&
    a.dose === b.dose &&
    a.category === b.category &&
    a.intervalDays === b.intervalDays &&
    a.purpose === b.purpose &&
    a.instructions === b.instructions &&
    a.infoStatus === b.infoStatus &&
    a.infoError === b.infoError
  )
}

/**
 * Add/edit page for the Medication catalog (see CONTEXT.md). Mirrors
 * PrescriptionsComponent's category-tree sidebar + detail-form shape, but
 * edits the Medication itself (commonName/clinicalName/dose/category/
 * intervalDays/purpose/instructions) via MedicationService.create()/
 * update() rather than Prescription reorder logistics. Also shows the
 * existing Interaction Report's Findings read-only, filtered to this
 * medication — no new Claude call for that, see medicationFindingGroups.
 */
@Component({
  selector: 'app-medications',
  standalone: true,
  imports: [FormsModule, SeverityBadgeComponent],
  templateUrl: './medications.component.html',
  styleUrl: './medications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MedicationsComponent {
  private readonly medicationService = inject(MedicationService)
  private readonly interactionReportService = inject(InteractionReportService)
  private readonly changeDetectorRef = inject(ChangeDetectorRef)

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

  protected readonly report = toSignal(this.interactionReportService.report$)

  readonly categories = computed(() => groupByCategory(this.medications()))
  readonly categoryOptions = computed(() => [
    ...new Set(this.medications().map((m) => m.category)),
  ])

  readonly selectedId = signal<string | null>(null)
  readonly selectedMedication = computed(
    () => this.medications().find((m) => m.id === this.selectedId()) ?? null,
  )

  readonly error = signal<string | null>(null)
  readonly isRegenerating = signal(false)

  /** The existing Interaction Report's Findings that mention the currently
   * selected medication, grouped the same way InteractionsComponent does —
   * a client-side filter of the already-computed report, no new Claude call.
   * Empty while the report isn't ready yet (pending/error/missing). */
  readonly medicationFindingGroups = computed<FindingGroup[]>(() => {
    const selected = this.selectedMedication()
    const report = this.report()
    if (!selected || report?.status !== 'ready') {
      return []
    }
    const relevant = report.findings.filter((f) =>
      f.medicationIds.includes(selected.id),
    )
    return groupFindings(relevant, this.medications())
  })

  /** Editable copy of the selected (or new) medication — a plain field, not
   * a signal, so `[(ngModel)]` can mutate it in place; see
   * PrescriptionsComponent.draft's doc comment for why. `null` means
   * nothing selected and not adding (empty state). */
  draft: Omit<Medication, 'id'> | null = null

  /** What `draft` was last set to by `select()` or the reconcile effect
   * below — compared against `draft` to tell an untouched snapshot from an
   * in-progress edit (e.g. AI generation finishing, or a Regenerate call
   * writing back, while this medication is still selected). */
  private draftBaseline: Omit<Medication, 'id'> | null = null

  isNewCategory = false

  constructor() {
    effect(() => {
      const id = this.selectedId()
      const medications = this.medications()
      if (
        !id ||
        !this.draft ||
        !this.draftBaseline ||
        !isSameMedicationData(this.draft, this.draftBaseline)
      ) {
        return
      }
      const existing = medications.find((m) => m.id === id)
      if (!existing) {
        return
      }
      const rest = toMedicationDraft(existing)
      if (!isSameMedicationData(rest, this.draft)) {
        this.draft = rest
        // A separate copy, not the same reference as `draft`: `[(ngModel)]`
        // mutates `draft`'s fields in place, and an aliased baseline would
        // "see" every keystroke too, making isSameMedicationData() above
        // always pass and defeating this whole guard.
        this.draftBaseline = { ...this.draft }
        // `draft` is a plain field, not a signal (see its doc comment), so
        // this reactive-graph-driven write needs an explicit nudge to reach
        // the OnPush view — see PrescriptionsComponent's reconcile effect
        // for the same pattern.
        this.changeDetectorRef.markForCheck()
      }
    })
  }

  select(medicationId: string): void {
    const medication = this.medications().find((m) => m.id === medicationId)
    if (!medication) {
      return
    }
    this.selectedId.set(medicationId)
    this.error.set(null)
    this.isNewCategory = false
    this.draft = toMedicationDraft(medication)
    // A separate copy -- see the reconcile effect's comment above for why
    // draftBaseline must never alias `draft`.
    this.draftBaseline = { ...this.draft }
  }

  startAdd(): void {
    this.selectedId.set(null)
    this.error.set(null)
    this.isNewCategory = false
    this.draft = emptyMedication()
    this.draftBaseline = null
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
      draft.commonName.trim() === '' ||
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
      const infoChanged =
        !!this.draftBaseline &&
        (draft.purpose !== this.draftBaseline.purpose ||
          draft.instructions !== this.draftBaseline.instructions)
      // A hand-edit that fills in both purpose and instructions clears any
      // stale pending/error/unset infoStatus immediately, regardless of how
      // it got that way -- the user just confirmed the content is good. A
      // leftover infoError from a prior failure is cleared alongside it
      // (undefined here becomes a real Firestore deleteField() -- see
      // MedicationService.update()) so it never lingers next to 'ready'.
      // Mutated directly onto `draft` (like onCategorySelect() does for
      // `category`), not just onto the submitted copy below -- otherwise
      // `draftBaseline` (set to that copy once the write settles) would
      // permanently disagree with the live `draft` object on this field,
      // and the reconcile effect above would never fire again.
      if (infoChanged) {
        draft.infoStatus =
          draft.purpose?.trim() && draft.instructions?.trim()
            ? 'ready'
            : undefined
      }
      if (infoChanged && draft.infoStatus === 'ready') {
        draft.infoError = undefined
      }
      const nextBaseline = { ...draft }
      const submitted =
        draft.infoStatus === 'pending' ? medicationCoreFields(draft) : nextBaseline
      // TODO: if update() rejects (transient network/Firestore error), this
      // returns without setting `error`, so the form gives no feedback.
      // Catch the failure and surface a retryable message.
      await this.medicationService.update(id, submitted)
      // Only clear isNewCategory if the user is still on this same draft --
      // otherwise this stale completion would clobber whatever they've since
      // switched to (another selection, or a fresh add). Also refreshes
      // draftBaseline to what was actually written -- otherwise the
      // reconcile effect above would see draft/baseline as permanently
      // diverged after any save, and never adopt a later external write
      // (e.g. a Regenerate call finishing) into this same draft.
      // TODO: `draft` is mutated in place by [(ngModel)], so this identity
      // check doesn't catch the user continuing to edit this same draft
      // while the update is in flight -- only a switch to a different
      // draft. Capture a submitted snapshot/revision instead of relying on
      // object identity to also cover that case.
      if (this.draft === draft && this.selectedId() === id) {
        this.isNewCategory = false
        this.draftBaseline = nextBaseline
      }
      return
    }

    const newId = slugify(draft.commonName)
    if (!newId) {
      this.error.set('Name must contain at least one letter or number.')
      return
    }
    // TODO: this client-side check isn't an atomic uniqueness guarantee --
    // two concurrent creates with the same slugified name can both pass it,
    // and MedicationService.create() (setDoc) silently overwrites. Make the
    // write create-only/transactional, or otherwise reject an existing id.
    if (this.medications().some((m) => m.id === newId)) {
      this.error.set(
        'A medication with this name already exists — edit it instead.',
      )
      return
    }
    // TODO: if create() rejects (transient network/Firestore error), this
    // returns without setting `error` -- same gap as the update path above.
    // Client sets infoStatus 'pending' here (not the Cloud Function) so a
    // brand-new medication never shows blank fields with no explanation --
    // the create trigger picks this up and generates purpose/instructions
    // once, writing 'ready'/'error' back. Mutated directly onto `draft` --
    // see the update branch above for why the submitted copy alone isn't
    // enough.
    draft.infoStatus = 'pending'
    const submitted: Omit<Medication, 'id'> = { ...draft }
    await this.medicationService.create(newId, submitted)
    // Only select the new id if the user is still on this same draft -- see
    // the update branch above for why. Selected directly (rather than via
    // select(newId)) since select() looks up the record in medications(),
    // which depends on the Firestore snapshot listener catching up to the
    // just-created doc -- a race that could leave nothing selected. draft
    // already holds the just-created data. Also sets draftBaseline to what
    // was actually written -- see the update branch above for why: without
    // it, the reconcile effect would never adopt the create trigger's
    // purpose/instructions write-back into this still-open draft.
    // TODO: same draft-identity gap as the update branch above -- editing
    // this same draft further while create() is in flight isn't caught.
    if (this.draft === draft && this.selectedId() === null) {
      this.selectedId.set(newId)
      this.isNewCategory = false
      this.draftBaseline = submitted
    }
  }

  async delete(): Promise<void> {
    const id = this.selectedId()
    if (!id) {
      return
    }
    // Falls back to the id if medications() hasn't caught up with a
    // just-created selection yet (see the "still catching up" case in
    // save()) -- the confirm text degrades gracefully rather than silently
    // no-opping the delete.
    const name = this.selectedMedication()?.commonName ?? id
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) {
      return
    }
    this.error.set(null)
    try {
      await this.medicationService.delete(id)
    } catch {
      this.error.set('Failed to delete. Please try again.')
      return
    }
    // Only clear the form if the user is still on this same selection --
    // otherwise this stale completion would clobber whatever they've since
    // switched to, mirroring the guard in save().
    if (this.selectedId() === id) {
      this.selectedId.set(null)
      this.draft = null
      this.draftBaseline = null
      this.isNewCategory = false
    }
  }

  /** Backfills or refreshes this medication's AI-generated purpose/
   * instructions on demand — covers a pre-migration medication that has
   * never been generated, and refreshing stale text after a name
   * correction. Own in-flight state (isRegenerating) drives the
   * "Regenerating…" UI; the write-back itself happens server-side and
   * arrives here via the normal medications() snapshot + reconcile effect. */
  async regenerateInfo(): Promise<void> {
    const id = this.selectedId()
    if (!id || this.isRegenerating() || this.draft?.infoStatus === 'pending') {
      return
    }
    this.isRegenerating.set(true)
    this.error.set(null)
    try {
      await this.medicationService.regenerateInfoOnDemand(id)
    } catch {
      this.error.set('Failed to regenerate. Please try again.')
    } finally {
      this.isRegenerating.set(false)
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
