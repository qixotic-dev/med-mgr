import { initializeApp } from 'firebase-admin/app'
import { defineSecret } from 'firebase-functions/params'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { regenerateInteractionReport } from './regenerate-report'

initializeApp()

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY')

const TRIGGER_OPTIONS = {
  // A high-effort Opus 5 call can exceed the v2 default of 60s.
  timeoutSeconds: 300,
  memory: '512MiB' as const,
  // Firestore triggers are at-least-once; retrying a failure would mean a
  // duplicate paid Claude call, so failures surface via the report's
  // 'error' status instead of a function retry.
  retry: false,
  secrets: [anthropicApiKey],
}

/** Regenerates the Interaction Report whenever a Medication is added, edited, or removed. */
export const onMedicationWritten = onDocumentWritten(
  { document: 'medications/{medicationId}', ...TRIGGER_OPTIONS },
  async () => {
    await regenerateInteractionReport(anthropicApiKey.value())
  },
)

/** Regenerates the Interaction Report whenever the Patient profile is added or edited. */
export const onPatientWritten = onDocumentWritten(
  { document: 'patients/me', ...TRIGGER_OPTIONS },
  async () => {
    await regenerateInteractionReport(anthropicApiKey.value())
  },
)
