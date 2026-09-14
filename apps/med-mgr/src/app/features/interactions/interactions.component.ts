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
import { map } from 'rxjs'
import { SeverityBadgeComponent } from '../../shared/severity-badge.component'
import { MedicationService } from '../../services/medication.service'
import { PatientService } from '../../services/patient.service'
import { InteractionReportService } from '../../services/interaction-report.service'
import { SelectedMedicationService } from '../../services/selected-medication.service'
import { reconcileSelectedMedication } from '../../services/selected-medication-reconciliation'
import type { Medication } from '../../models/medication.model'
import type { Patient } from '../../models/patient.model'
import type {
  Finding,
  FindingType,
  InteractionReport,
} from '../../models/interaction-report.model'

/** Editable form shape for Patient — allergies/conditions as comma-separated
 * text rather than a dynamic add/remove list, to keep the form to plain
 * inputs. Converted to/from Patient's string[] fields at the read/write
 * boundary (toDraft/fromDraft below). */
export interface PatientDraft {
  birthdate: string
  sex: string
  allergiesText: string
  conditionsText: string
  weight: string
}

function emptyDraft(): PatientDraft {
  return {
    birthdate: '',
    sex: '',
    allergiesText: '',
    conditionsText: '',
    weight: '',
  }
}

/** Exported for direct unit testing. */
export function toDraft(patient: Patient | undefined): PatientDraft {
  if (!patient) {
    return emptyDraft()
  }
  return {
    birthdate: patient.birthdate,
    sex: patient.sex,
    allergiesText: patient.allergies.join(', '),
    conditionsText: patient.conditions.join(', '),
    weight: patient.weight,
  }
}

/** Exported for direct unit testing. */
export function fromDraft(draft: PatientDraft): Patient {
  return {
    birthdate: draft.birthdate,
    sex: draft.sex,
    allergies: splitList(draft.allergiesText),
    conditions: splitList(draft.conditionsText),
    weight: draft.weight,
  }
}

/** Compares the patient-editor form's editable fields — mirrors
 * MedicationsComponent's isSameMedicationData/PrescriptionsComponent's
 * isSamePrescriptionData, used the same way here: telling an untouched
 * draft from an in-progress edit for canSaveProfile()'s dirty check.
 * Exported for direct unit testing. */
export function isSamePatientDraft(a: PatientDraft, b: PatientDraft): boolean {
  return (
    a.birthdate === b.birthdate &&
    a.sex === b.sex &&
    a.allergiesText === b.allergiesText &&
    a.conditionsText === b.conditionsText &&
    a.weight === b.weight
  )
}

function splitList(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

function normalizePatient(patient: Patient | undefined): Patient | null {
  if (!patient) {
    return null
  }

  return {
    birthdate: patient.birthdate,
    sex: patient.sex,
    allergies: patient.allergies,
    conditions: patient.conditions,
    weight: patient.weight,
  }
}

function reportInputFingerprint(
  report: InteractionReport | undefined,
): string | undefined {
  const { inputFingerprint } = (report ?? {}) as Partial<InteractionReport>
  return typeof inputFingerprint === 'string' ? inputFingerprint : undefined
}

/** clinicalName stays in this fingerprint even though it's generator-owned
 * now, not user-typed: regenerateInteractionReport reads it as an input, so
 * a change to it must still count as stale here. It's kept off
 * MEDICATION_INFO_FIELDS (generate-medication-info.ts) for the matching
 * reason -- see that constant's doc comment. */
export function buildReportInputFingerprint(
  medications: Medication[],
  patient: Patient | undefined,
): string {
  return JSON.stringify({
    medications: [...medications]
      .map(({ id, commonName, clinicalName, dose }) => ({
        id,
        commonName,
        clinicalName,
        dose,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    patient: normalizePatient(patient),
  })
}

/**
 * True when `report` was generated for different medication/patient inputs
 * than the live ones — Firestore triggers give no ordering guarantee, so a
 * `ready` report can finish for older inputs after a newer change already
 * started. Exported for direct unit testing.
 */
export function isReportStale(
  report: InteractionReport | undefined,
  medications: Medication[],
  patient: Patient | undefined,
): boolean {
  if (!report) {
    return false
  }

  const currentFingerprint = buildReportInputFingerprint(medications, patient)
  const currentReportFingerprint = reportInputFingerprint(report)

  if (!currentReportFingerprint) {
    return medications.length > 0
  }

  return currentReportFingerprint !== currentFingerprint
}

const FINDING_TYPE_ORDER: FindingType[] = [
  'drug-drug',
  'drug-condition',
  'drug-allergy',
  'caveat',
]

const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  'drug-drug': 'Drug interactions',
  'drug-condition': 'Condition warnings',
  'drug-allergy': 'Allergy alerts',
  caveat: 'Caveats',
}

export interface DisplayFinding extends Finding {
  medicationNames: string[]
}

export interface FindingGroup {
  type: FindingType
  label: string
  findings: DisplayFinding[]
}

/**
 * Findings grouped by type in a fixed display order, each with its
 * medication ids already resolved to names, empty groups omitted. Exported
 * for direct unit testing.
 */
export function groupFindings(
  findings: Finding[],
  medications: Medication[],
): FindingGroup[] {
  const nameFor = (id: string) =>
    medications.find((m) => m.id === id)?.commonName ?? id
  return FINDING_TYPE_ORDER.map((type) => ({
    type,
    label: FINDING_TYPE_LABELS[type],
    findings: findings
      .filter((f) => f.type === type)
      .map((f) => ({ ...f, medicationNames: f.medicationIds.map(nameFor) })),
  })).filter((group) => group.findings.length > 0)
}

/**
 * Narrows `findings` to those mentioning `medicationId` — every Finding type
 * (unlike MedicationsComponent.medicationFindingGroups, which limits itself
 * to 'caveat' since drug-drug pairs don't read sensibly scoped to a single
 * medication there; here the *other* medication in a drug-drug pair is still
 * shown via medicationNames, so the pair itself is relevant). `null` means no
 * filter selected — the page's default "all medications" view. Exported for
 * direct unit testing.
 */
export function filterFindingsByMedication(
  findings: Finding[],
  medicationId: string | null,
): Finding[] {
  return medicationId
    ? findings.filter((f) => f.medicationIds.includes(medicationId))
    : findings
}

/**
 * The Interaction Report page (see CONTEXT.md: Interaction Report, Finding,
 * Patient). Read-only display of the AI-generated report plus a Patient
 * profile editor — regeneration itself happens server-side (the
 * interaction-report Cloud Function), usually from writes to `medications`
 * or `patients/me`, with an on-demand backfill call when older data has no
 * current report yet; this component never calls the AI directly. An
 * optional per-medication filter (selectedMedicationId) narrows the findings
 * shown below without changing any of that — see TODO.md #5.
 */
@Component({
  selector: 'app-interactions',
  standalone: true,
  imports: [FormsModule, SeverityBadgeComponent],
  templateUrl: './interactions.component.html',
  styleUrl: './interactions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InteractionsComponent {
  private readonly medicationService = inject(MedicationService)
  private readonly patientService = inject(PatientService)
  private readonly interactionReportService = inject(InteractionReportService)
  private readonly changeDetectorRef = inject(ChangeDetectorRef)

  /** `undefined` until all$ has emitted at least once -- distinguishes "no
   * medications yet" from "haven't heard from Firestore yet" for the
   * reconcile effect below, mirroring MedicationsComponent's
   * medicationsSnapshot/medicationsLoaded. */
  private readonly medicationsSnapshot = toSignal(this.medicationService.all$)
  /** protected (not private) so the template can list options for the
   * medication filter below. */
  protected readonly medications = computed(
    () => this.medicationsSnapshot() ?? [],
  )
  private readonly medicationsLoaded = computed(
    () => this.medicationsSnapshot() !== undefined,
  )
  protected readonly report = toSignal(this.interactionReportService.report$)

  /** Optional filter narrowing the report below to one medication's
   * findings — supplements the default all-medications view rather than
   * replacing it. Shared with MedicationsComponent via
   * SelectedMedicationService (see TODO.md #6), so selecting a medication on
   * either page carries over to the other. `null` shows every finding. A
   * deleted selection is reset back to `null` by the reconcile effect below,
   * not handled here. Public (like MedicationsComponent.selectedId), not
   * protected, so tests can drive it directly — see this file's spec. */
  readonly selectedMedicationId = inject(SelectedMedicationService).selectedId

  /** The selected medication's display name, for the filtered empty-state
   * message below. `?? id` is a harmless backstop for the brief render
   * before the reconcile effect below resets a deleted selection back to
   * `null` — that effect is what actually owns "selection no longer exists",
   * not this fallback. `null` when no filter is selected. */
  protected readonly selectedMedicationName = computed(() => {
    const id = this.selectedMedicationId()
    if (!id) {
      return null
    }
    return this.medications().find((m) => m.id === id)?.commonName ?? id
  })

  /** `undefined` until patient$ has emitted at least once (wrapped so a
   * genuinely absent profile — itself `undefined` — is still distinguishable
   * from "haven't heard from Firestore yet"), so the one-time draft
   * hydration below never fires before there's real data to hydrate from. */
  private readonly patientLoad = toSignal(
    this.patientService.patient$.pipe(map((patient) => ({ patient }))),
  )

  private hydratedDraft = false
  private lastOnDemandRequestKey: string | null = null

  /** Editable copy of the Patient profile — a plain field, not a signal, so
   * `[(ngModel)]` can mutate it in place (see MedicationsComponent.draft's
   * doc comment for why). Hydrated once from Firestore in the constructor
   * below; not kept in sync afterward — this app has exactly one user
   * editing their own profile, so there's no concurrent-writer case to
   * reconcile against, unlike PrescriptionsComponent's per-selection draft. */
  draft: PatientDraft = emptyDraft()

  /** What `draft` was last hydrated/saved to — compared against `draft` by
   * canSaveProfile() below to tell an untouched form from an in-progress
   * edit. A separate object from `draft`, never aliased to it: see
   * MedicationsComponent.draftBaseline's doc comment for why an aliased
   * baseline would defeat the comparison. */
  private draftBaseline: PatientDraft = emptyDraft()

  protected readonly hasMedications = computed(
    () => this.medications().length > 0,
  )

  protected readonly isStale = computed(() => {
    const load = this.patientLoad()
    if (load === undefined) {
      return false
    }

    return isReportStale(this.report(), this.medications(), load.patient)
  })

  protected readonly findingGroups = computed(() =>
    groupFindings(
      filterFindingsByMedication(
        this.report()?.findings ?? [],
        this.selectedMedicationId(),
      ),
      this.medications(),
    ),
  )

  constructor() {
    // Resets the filter back to "All medications" if the selected medication
    // is deleted from another tab/device while this page has it filtered --
    // otherwise the <select> would show a value with no matching <option>
    // (blank) alongside a findings list that silently never explains why
    // it's empty. This page has no per-selection state to hydrate (the
    // shared id is used directly as the filter, not loaded into a draft), so
    // onHydrated is unneeded -- see reconcileSelectedMedication's doc
    // comment (TODO.md #14; previously hand-copied here as a single effect).
    reconcileSelectedMedication({
      selectedId: this.selectedMedicationId,
      medications: this.medications,
      medicationsLoaded: this.medicationsLoaded,
      changeDetectorRef: this.changeDetectorRef,
    })

    effect(() => {
      const load = this.patientLoad()
      if (this.hydratedDraft || load === undefined) {
        return
      }
      // TODO: the patient-editor form's inputs aren't disabled before
      // hydration (only the Save button is, via canSaveProfile()'s
      // hydratedDraft check), so a user who starts typing before patient$'s
      // first emission has their edits silently discarded by the
      // this.draft overwrite below. Flagged by Copilot's PR #19 review --
      // narrow window (patient$ typically resolves fast), left as a known
      // gap rather than disabling the whole form or merging edits, either
      // of which is a bigger UX change than this task asked for.
      this.hydratedDraft = true
      this.draft = toDraft(load.patient)
      // A separate object, not the same reference as `draft` -- see
      // draftBaseline's doc comment above for why.
      this.draftBaseline = { ...this.draft }
      // A plain field write from a reactive effect (not a template event
      // binding), so it needs an explicit nudge to reach the OnPush view —
      // see PrescriptionsComponent's reconcile effect for the same pattern.
      this.changeDetectorRef.markForCheck()
    })

    effect(() => {
      const load = this.patientLoad()
      if (load === undefined || !this.hasMedications()) {
        return
      }

      const report = this.report()
      if (report?.status === 'pending') {
        return
      }

      const missingReport = report === undefined
      const missingFingerprint =
        !missingReport && !reportInputFingerprint(report)
      if (!missingReport && !missingFingerprint) {
        return
      }

      const requestKey = `${missingReport ? 'missing' : 'legacy'}:${buildReportInputFingerprint(this.medications(), load.patient)}`
      if (requestKey === this.lastOnDemandRequestKey) {
        return
      }

      this.lastOnDemandRequestKey = requestKey
      void this.interactionReportService
        .regenerateOnDemand()
        .catch(() => undefined)
    })
  }

  /** Guards saveProfile() against a second submit firing a concurrent
   * Firestore write while the first is still in flight -- flagged as
   * Critical by Copilot's PR #19 review: without it, two overlapping
   * patientService.save() calls can resolve out of order, leaving
   * draftBaseline (and so canSaveProfile()) reflecting whichever finished
   * last rather than whichever was submitted last. Mirrors
   * MedicationsComponent.isDeleting. */
  readonly isSavingProfile = signal(false)

  /** Gates the patient-editor form's Save button. Patient has no required
   * fields (see its model), so there's no field validity to check here --
   * unlike canSave() on the other two pages. Instead mirrors the other half
   * of what those pages' canSave() guards against: MedicationsComponent's
   * canSave() requires medicationsLoaded() before allowing a create-save;
   * here, requiring hydratedDraft prevents Save persisting `draft`'s
   * emptyDraft() placeholder over a real profile before patient$ has
   * emitted. Combined with a dirty check so Save is also disabled once
   * there's nothing new to persist, and isSavingProfile so it's disabled
   * while a save is already in flight. */
  canSaveProfile(): boolean {
    return (
      this.hydratedDraft &&
      !this.isSavingProfile() &&
      !isSamePatientDraft(this.draft, this.draftBaseline)
    )
  }

  async saveProfile(): Promise<void> {
    // Guards the method itself, not just the Save button's [disabled] --
    // matches MedicationsComponent.save()/PrescriptionsComponent.save()'s
    // own `if (!this.canSave())` guard. Flagged by Copilot's PR #19 review:
    // an implicit form submit ((ngSubmit) fires independently of a
    // disabled submit button in some cases) could otherwise persist
    // draft's still-blank emptyDraft() before hydration, or perform a
    // pointless write when nothing changed. Subsumes the old standalone
    // isSavingProfile() check below, since canSaveProfile() already folds
    // that in.
    if (!this.canSaveProfile()) {
      return
    }
    this.isSavingProfile.set(true)
    try {
      // Snapshot before the await -- `draft`'s fields keep mutating in place
      // via [(ngModel)] while the write is in flight, mirroring
      // PrescriptionsComponent.save()'s `submitted` snapshot.
      const submitted = { ...this.draft }
      await this.patientService.save(fromDraft(submitted))
      this.draftBaseline = submitted
    } finally {
      this.isSavingProfile.set(false)
    }
    // This app runs zoneless (see app.config.ts's
    // provideZonelessChangeDetection()). draftBaseline is a plain field
    // mutated after an `await`, not a signal and not inside a template
    // event handler, so nothing above would otherwise tell the OnPush view
    // canSaveProfile() might now return a different value -- flagged by
    // Copilot's PR #19 review. Mirrors the same nudge the hydration effect
    // above already needs for the same reason.
    this.changeDetectorRef.markForCheck()
  }
}
