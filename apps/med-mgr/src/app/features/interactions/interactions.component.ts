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

/**
 * True when `report` was generated for a different medication list than
 * `medications` — Firestore triggers give no ordering guarantee, so a
 * `ready` report can finish for an older list after a newer change already
 * started (see InteractionReport.generatedFor). Exported for direct unit
 * testing.
 */
export function isReportStale(
  report: InteractionReport | undefined,
  medications: Medication[],
): boolean {
  if (!report) {
    return false
  }
  const currentIds = [...medications].map((m) => m.id).sort()
  const reportIds = [...report.generatedFor].sort()
  return JSON.stringify(currentIds) !== JSON.stringify(reportIds)
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
    medications.find((m) => m.id === id)?.name ?? id
  return FINDING_TYPE_ORDER.map((type) => ({
    type,
    label: FINDING_TYPE_LABELS[type],
    findings: findings
      .filter((f) => f.type === type)
      .map((f) => ({ ...f, medicationNames: f.medicationIds.map(nameFor) })),
  })).filter((group) => group.findings.length > 0)
}

/**
 * The Interaction Report page (see CONTEXT.md: Interaction Report, Finding,
 * Patient). Read-only display of the AI-generated report plus a Patient
 * profile editor — regeneration itself happens server-side (the
 * interaction-report Cloud Function), triggered by writes to `medications`
 * or `patients/me`; this component never calls the AI directly.
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

  private readonly medications = toSignal(this.medicationService.all$, {
    initialValue: [],
  })
  protected readonly report = toSignal(this.interactionReportService.report$)

  /** `undefined` until patient$ has emitted at least once (wrapped so a
   * genuinely absent profile — itself `undefined` — is still distinguishable
   * from "haven't heard from Firestore yet"), so the one-time draft
   * hydration below never fires before there's real data to hydrate from. */
  private readonly patientLoad = toSignal(
    this.patientService.patient$.pipe(map((patient) => ({ patient }))),
  )

  private hydratedDraft = false

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

  protected readonly isStale = computed(() =>
    isReportStale(this.report(), this.medications()),
  )

  protected readonly findingGroups = computed(() =>
    groupFindings(this.report()?.findings ?? [], this.medications()),
  )

  constructor() {
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
  }

  async saveProfile(): Promise<void> {
    await this.patientService.save(fromDraft(this.draft))
  }
}
