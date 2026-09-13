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

  /** protected (not private) so the template can list options for the
   * medication filter below. */
  protected readonly medications = toSignal(this.medicationService.all$, {
    initialValue: [],
  })
  protected readonly report = toSignal(this.interactionReportService.report$)

  /** Optional filter narrowing the report below to one medication's
   * findings — supplements the default all-medications view rather than
   * replacing it (per-page state, not shared with MedicationsComponent's own
   * selectedId; see TODO.md #5/#6). `null` shows every finding. A deleted
   * selection is reset back to `null` by the reconcile effect below, not
   * handled here. Public (like MedicationsComponent.selectedId), not
   * protected, so tests can drive it directly — see this file's spec. */
  readonly selectedMedicationId = signal<string | null>(null)

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
    effect(() => {
      // Resets the filter back to "All medications" if the selected
      // medication is deleted from another tab/device while this page has
      // it filtered — otherwise the <select> would show a value with no
      // matching <option> (blank) alongside a findings list that silently
      // never explains why it's empty.
      const id = this.selectedMedicationId()
      if (id && !this.medications().some((m) => m.id === id)) {
        this.selectedMedicationId.set(null)
      }
    })

    effect(() => {
      const load = this.patientLoad()
      if (this.hydratedDraft || load === undefined) {
        return
      }
      this.hydratedDraft = true
      this.draft = toDraft(load.patient)
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

  async saveProfile(): Promise<void> {
    await this.patientService.save(fromDraft(this.draft))
  }
}
