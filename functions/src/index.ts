import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { defineSecret, defineString } from 'firebase-functions/params'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import {
  CallableRequest,
  HttpsError,
  onCall,
} from 'firebase-functions/v2/https'
import {
  isInfoOnlyChange,
  regenerateMedicationInfo,
} from './generate-medication-info'
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
  params: [anthropicModel],
  secrets: [anthropicApiKey],
}

const TRIGGER_OPTIONS = {
  ...COMMON_FUNCTION_OPTIONS,
  // Firestore triggers are at-least-once; retrying a failure would mean a
  // duplicate paid Claude call, so failures surface via the report's
  // 'error' status instead of a function retry.
  retry: false,
}

/** Throws unless the caller is the signed-in, email-verified owner. */
function assertIsOwner(request: CallableRequest, action: string): void {
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
    throw new HttpsError('permission-denied', `Only the owner can ${action}`)
  }
}

/**
 * Regenerates the Interaction Report whenever a Medication is added, edited,
 * or removed, and generates the AI purpose/instructions once when a
 * Medication is first created.
 *
 * An update whose only changed keys are the medication-info fields (see
 * MEDICATION_INFO_FIELDS) is skipped -- that's either the generator's own
 * write-back or a hand-edit to those fields, and the Interaction Report
 * doesn't consume any of them. A write with no changed keys at all (a
 * no-op/redelivered event) is vacuously "info-only" too and also skipped --
 * intentional, not a bug.
 */
export const onMedicationWritten = onDocumentWritten(
  { document: 'medications/{medicationId}', ...TRIGGER_OPTIONS },
  async (event) => {
    const before = event.data?.before
    const after = event.data?.after
    const isCreate = !!event.data && !before?.exists && !!after?.exists

    if (
      before?.exists &&
      after?.exists &&
      isInfoOnlyChange(before.data() ?? {}, after.data() ?? {})
    ) {
      return
    }

    const tasks: Promise<void>[] = [
      regenerateInteractionReport(
        anthropicApiKey.value(),
        anthropicModel.value(),
      ),
    ]
    if (isCreate) {
      tasks.push(
        regenerateMedicationInfo(
          anthropicApiKey.value(),
          anthropicModel.value(),
          event.params.medicationId,
        ),
      )
    }
    await Promise.all(tasks)
  },
)

/** Allows the signed-in owner to generate or backfill one medication's AI purpose/instructions on demand. */
export const regenerateMedicationInfoOnDemand = onCall(
  COMMON_FUNCTION_OPTIONS,
  async (request) => {
    assertIsOwner(request, 'regenerate medication info')

    const medicationId = request.data?.medicationId
    if (typeof medicationId !== 'string' || medicationId.trim() === '') {
      throw new HttpsError('invalid-argument', 'medicationId is required')
    }
    const exists = (
      await getFirestore().collection('medications').doc(medicationId).get()
    ).exists
    if (!exists) {
      throw new HttpsError('not-found', `No medication with id ${medicationId}`)
    }

    await regenerateMedicationInfo(
      anthropicApiKey.value(),
      anthropicModel.value(),
      medicationId,
    )
    return { ok: true }
  },
)

/** Allows the signed-in owner to generate or backfill the current Interaction Report on demand. */
export const regenerateInteractionReportOnDemand = onCall(
  COMMON_FUNCTION_OPTIONS,
  async (request) => {
    assertIsOwner(request, 'regenerate reports')

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
