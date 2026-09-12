import { initializeApp } from 'firebase-admin/app'
import { defineSecret, defineString } from 'firebase-functions/params'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { regenerateInteractionReport } from './regenerate-report'

initializeApp()

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY')
const anthropicModel = defineString('ANTHROPIC_MODEL', {
  default: 'claude-sonnet-4-5',
})
const ownerEmail = defineString('OWNER_EMAIL')

const COMMON_FUNCTION_OPTIONS = {
  // A high-effort Claude call can exceed the v2 default of 60s.
  timeoutSeconds: 300,
  memory: '512MiB' as const,
  secrets: [anthropicApiKey],
}

const TRIGGER_OPTIONS = {
  ...COMMON_FUNCTION_OPTIONS,
  // Firestore triggers are at-least-once; retrying a failure would mean a
  // duplicate paid Claude call, so failures surface via the report's
  // 'error' status instead of a function retry.
  retry: false,
}

/** Regenerates the Interaction Report whenever a Medication is added, edited, or removed. */
export const onMedicationWritten = onDocumentWritten(
  { document: 'medications/{medicationId}', ...TRIGGER_OPTIONS },
  async () => {
    await regenerateInteractionReport(
      anthropicApiKey.value(),
      anthropicModel.value(),
    )
  },
)

/** Allows the signed-in owner to generate or backfill the current Interaction Report on demand. */
export const regenerateInteractionReportOnDemand = onCall(
  COMMON_FUNCTION_OPTIONS,
  async (request) => {
    const configuredOwnerEmail = ownerEmail.value().trim().toLowerCase()
    const email = request.auth?.token.email
    const emailVerified = request.auth?.token.email_verified === true

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required')
    }

    if (
      typeof email !== 'string' ||
      email.toLowerCase() !== configuredOwnerEmail ||
      !emailVerified
    ) {
      throw new HttpsError('permission-denied', 'Only the owner can regenerate reports')
    }

    await regenerateInteractionReport(
      anthropicApiKey.value(),
      anthropicModel.value(),
    )
    return { ok: true }
  },
)

/** Regenerates the Interaction Report whenever the Patient profile is added or edited. */
export const onPatientWritten = onDocumentWritten(
  { document: 'patients/me', ...TRIGGER_OPTIONS },
  async () => {
    await regenerateInteractionReport(
      anthropicApiKey.value(),
      anthropicModel.value(),
    )
  },
)
