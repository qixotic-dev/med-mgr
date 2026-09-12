import { getFirestore } from 'firebase-admin/firestore'
import {
  requestFindings,
  type MedicationInput,
  type PatientInput,
} from './claude'

const MEDICATIONS_COLLECTION = 'medications'
const PATIENT_DOC_PATH = 'patients/me'
const REPORT_DOC_PATH = 'interactionReports/current'

/**
 * Rebuilds the Interaction Report from the current medications + patient
 * profile. Called by both Firestore triggers in index.ts — a Medication
 * write and a Patient write invalidate the report the same way.
 */
export async function regenerateInteractionReport(
  apiKey: string,
): Promise<void> {
  const db = getFirestore()
  const reportRef = db.doc(REPORT_DOC_PATH)

  // Fast optimistic write so the page shows "regenerating" immediately.
  await reportRef.set({ status: 'pending' }, { merge: true })

  const medicationsSnapshot = await db.collection(MEDICATIONS_COLLECTION).get()
  const medications: MedicationInput[] = medicationsSnapshot.docs.map((d) => ({
    id: d.id,
    name: d.get('name') as string,
    dose: d.get('dose') as string,
  }))

  if (medications.length === 0) {
    await reportRef.set(
      {
        status: 'ready',
        findings: [],
        generatedFor: [],
        patientProfileUpdatedAt: null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    )
    return
  }

  const patientSnapshot = await db.doc(PATIENT_DOC_PATH).get()
  const patient = (
    patientSnapshot.exists ? patientSnapshot.data() : null
  ) as PatientInput | null
  const patientProfileUpdatedAt = patientSnapshot.updateTime
    ? patientSnapshot.updateTime.toDate().toISOString()
    : null

  // Sorted so the page can compare it directly against the live medication
  // id list to detect a stale report (see InteractionReport.generatedFor).
  const generatedFor = medications.map((m) => m.id).sort()

  try {
    const findings = await requestFindings(apiKey, medications, patient)
    await reportRef.set(
      {
        status: 'ready',
        findings,
        generatedFor,
        patientProfileUpdatedAt,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    )
  } catch (err) {
    // Leave the previous findings/generatedFor in place — the page falls
    // back to the last known-good report alongside the error banner.
    await reportRef.set(
      {
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { merge: true },
    )
  }
}
