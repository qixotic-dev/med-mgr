import { getFirestore } from 'firebase-admin/firestore'
import {
  requestFindings,
  type MedicationInput,
  type PatientInput,
} from './claude'
import type { Finding } from './types'

const MEDICATIONS_COLLECTION = 'medications'
const PATIENT_DOC_PATH = 'patients/me'
const REPORT_DOC_PATH = 'interactionReports/current'

type ReportStatus = 'pending' | 'ready' | 'error'

interface StoredInteractionReport {
  status?: ReportStatus
  findings?: Finding[]
  generatedFor?: string[]
  inputFingerprint?: string
  patientProfileUpdatedAt?: string | null
}

interface ReportInputs {
  medications: MedicationInput[]
  patient: PatientInput | null
  generatedFor: string[]
  inputFingerprint: string
  patientProfileUpdatedAt: string | null
}

function normalizePatient(patient: PatientInput | null): PatientInput | null {
  if (!patient) {
    return null
  }

  return {
    birthdate: patient.birthdate ?? '',
    sex: patient.sex ?? '',
    allergies: patient.allergies ?? [],
    conditions: patient.conditions ?? [],
    weight: patient.weight ?? '',
  }
}

function buildReportInputFingerprint(
  medications: MedicationInput[],
  patient: PatientInput | null,
): string {
  return JSON.stringify({
    medications: [...medications]
      .map(({ id, commonName, dose }) => ({ id, commonName, dose }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    patient: normalizePatient(patient),
  })
}

function readStoredReport(data: unknown): StoredInteractionReport | undefined {
  if (!data || typeof data !== 'object') {
    return undefined
  }

  const report = data as StoredInteractionReport
  return {
    status:
      report.status === 'pending' ||
      report.status === 'ready' ||
      report.status === 'error'
        ? report.status
        : undefined,
    findings: Array.isArray(report.findings) ? report.findings : undefined,
    generatedFor: Array.isArray(report.generatedFor)
      ? report.generatedFor
      : undefined,
    inputFingerprint:
      typeof report.inputFingerprint === 'string'
        ? report.inputFingerprint
        : undefined,
    patientProfileUpdatedAt:
      report.patientProfileUpdatedAt === null ||
      typeof report.patientProfileUpdatedAt === 'string'
        ? report.patientProfileUpdatedAt
        : undefined,
  }
}

function buildPendingOrErrorReport(
  status: ReportStatus,
  previousReport: StoredInteractionReport | undefined,
  inputs: ReportInputs,
  updatedAt: string,
  error?: string,
) {
  return {
    status,
    findings: previousReport?.findings ?? [],
    generatedFor: inputs.generatedFor,
    inputFingerprint: inputs.inputFingerprint,
    patientProfileUpdatedAt: inputs.patientProfileUpdatedAt,
    updatedAt,
    ...(error ? { error } : {}),
  }
}

function buildReadyReport(
  findings: Finding[],
  inputs: ReportInputs,
  updatedAt: string,
) {
  return {
    status: 'ready' as ReportStatus,
    findings,
    generatedFor: inputs.generatedFor,
    inputFingerprint: inputs.inputFingerprint,
    patientProfileUpdatedAt: inputs.patientProfileUpdatedAt,
    updatedAt,
  }
}

async function loadReportInputs(db: ReturnType<typeof getFirestore>) {
  const medicationsSnapshot = await db.collection(MEDICATIONS_COLLECTION).get()
  const medications: MedicationInput[] = medicationsSnapshot.docs.map((d) => ({
    id: d.id,
    commonName: d.get('commonName') as string,
    clinicalName: d.get('clinicalName') as string | undefined,
    dose: d.get('dose') as string,
  }))

  const patientSnapshot = await db.doc(PATIENT_DOC_PATH).get()
  const patient = (
    patientSnapshot.exists ? patientSnapshot.data() : null
  ) as PatientInput | null
  const patientProfileUpdatedAt = patientSnapshot.updateTime
    ? patientSnapshot.updateTime.toDate().toISOString()
    : null

  return {
    medications,
    patient,
    generatedFor: medications.map((m) => m.id).sort(),
    inputFingerprint: buildReportInputFingerprint(medications, patient),
    patientProfileUpdatedAt,
  }
}

async function writeReadyReportIfStillCurrent(
  db: ReturnType<typeof getFirestore>,
  reportRef: ReturnType<ReturnType<typeof getFirestore>['doc']>,
  findings: Finding[],
  inputs: ReportInputs,
) {
  await db.runTransaction(async (transaction) => {
    const currentReport = readStoredReport(
      (await transaction.get(reportRef)).data(),
    )

    if (
      currentReport?.status !== 'pending' ||
      currentReport.inputFingerprint !== inputs.inputFingerprint
    ) {
      return
    }

    transaction.set(
      reportRef,
      buildReadyReport(findings, inputs, new Date().toISOString()),
    )
  })
}

/**
 * Rebuilds the Interaction Report from the current medications + patient
 * profile. Called by both Firestore triggers in index.ts — a Medication
 * write and a Patient write invalidate the report the same way.
 */
export async function regenerateInteractionReport(
  apiKey: string,
  model: string,
): Promise<void> {
  const db = getFirestore()
  const reportRef = db.doc(REPORT_DOC_PATH)
  let previousReport: StoredInteractionReport | undefined
  let inputs = {
    medications: [] as MedicationInput[],
    patient: null as PatientInput | null,
    generatedFor: [] as string[],
    inputFingerprint: buildReportInputFingerprint([], null),
    patientProfileUpdatedAt: null as string | null,
  }

  try {
    previousReport = readStoredReport((await reportRef.get()).data())
    inputs = await loadReportInputs(db)

    await reportRef.set(
      buildPendingOrErrorReport(
        'pending',
        previousReport,
        inputs,
        new Date().toISOString(),
      ),
    )

    if (inputs.medications.length === 0) {
      await reportRef.set(
        buildReadyReport([], inputs, new Date().toISOString()),
      )
      return
    }

    const findings = await requestFindings(
      apiKey,
      model,
      inputs.medications,
      inputs.patient,
    )
    const latestInputs = await loadReportInputs(db)

    if (latestInputs.inputFingerprint !== inputs.inputFingerprint) {
      const currentReport = readStoredReport((await reportRef.get()).data())
      if (currentReport?.inputFingerprint === inputs.inputFingerprint) {
        await reportRef.set(
          buildPendingOrErrorReport(
            'pending',
            currentReport,
            latestInputs,
            new Date().toISOString(),
          ),
        )
      }
      return
    }

    await writeReadyReportIfStillCurrent(db, reportRef, findings, inputs)
  } catch (err) {
    await reportRef.set(
      buildPendingOrErrorReport(
        'error',
        previousReport,
        inputs,
        new Date().toISOString(),
        err instanceof Error ? err.message : 'Unknown error',
      ),
    )
  }
}
