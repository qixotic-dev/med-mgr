import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod/v4'

const MEDICATIONS_COLLECTION = 'medications'

/**
 * Fields the generator writes back to a medication doc -- also everything a
 * hand-edit is allowed to touch without invalidating the Interaction Report.
 * Single source of truth for onMedicationWritten's ignore-list (index.ts).
 */
export const MEDICATION_INFO_FIELDS = [
  'purpose',
  'instructions',
  'infoStatus',
  'infoError',
] as const

/**
 * True when every key that differs between `before` and `after` (the union
 * of both key sets, so a FieldValue.delete() still counts as "changed") is
 * one of MEDICATION_INFO_FIELDS. Vacuously true when nothing changed at all
 * -- correct for a no-op/redelivered write, not just an "only info fields
 * changed" write. All Medication fields are primitives today, so `!==` per
 * key is sufficient; a future non-primitive field would need a deeper
 * compare here. Exported for direct unit testing.
 */
export function isInfoOnlyChange(
  before: FirebaseFirestore.DocumentData,
  after: FirebaseFirestore.DocumentData,
): boolean {
  const infoFields = new Set<string>(MEDICATION_INFO_FIELDS)
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].every(
    (key) => before[key] === after[key] || infoFields.has(key),
  )
}

const MedicationInfoSchema = z.object({
  purpose: z.string(),
  instructions: z.string(),
})

export interface MedicationInfoInput {
  commonName: string
  clinicalName?: string
  dose: string
}

interface MedicationGenerationState extends MedicationInfoInput {
  infoStatus?: 'pending' | 'ready' | 'error'
}

function readMedicationGenerationState(
  snapshot: FirebaseFirestore.DocumentSnapshot,
): MedicationGenerationState {
  return {
    commonName: snapshot.get('commonName') as string,
    clinicalName: snapshot.get('clinicalName') as string | undefined,
    dose: snapshot.get('dose') as string,
    infoStatus: snapshot.get('infoStatus') as
      | 'pending'
      | 'ready'
      | 'error'
      | undefined,
  }
}

const SYSTEM_PROMPT = `You provide standalone educational information about a single medication for the person taking it. This is an educational aid, not medical advice — hedge appropriately; the person should confirm anything important with their pharmacist or doctor.

Given a medication's common name, optional clinical/generic name, and dose, produce:
- "purpose": a one-to-two sentence plain-language explanation of what it's generally used for.
- "instructions": general guidance on how it's commonly taken (timing, with/without food, etc.), in plain language.

Describe this medication standalone only — never mention interactions, conflicts, or cautions relative to any other medication, and never reference any patient-specific condition, allergy, or profile detail. That information belongs in the separate Interaction Report and is out of scope here.`

/** Calls Claude for one medication's standalone purpose/instructions. */
export async function generateMedicationInfo(
  apiKey: string,
  model: string,
  medication: MedicationInfoInput,
): Promise<{ purpose: string; instructions: string }> {
  const client = new Anthropic({ apiKey })

  const response = await client.messages.parse({
    model,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: zodOutputFormat(MedicationInfoSchema),
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(medication, null, 2) }],
  })

  if (!response.parsed_output) {
    throw new Error(
      'Claude response did not match the expected medication info schema',
    )
  }
  return response.parsed_output
}

/**
 * Regenerates and writes back purpose/instructions/infoStatus/infoError
 * directly onto the medication's own doc -- there's no separate report doc
 * the way there is for the Interaction Report. Called from
 * onMedicationWritten's create branch and from
 * regenerateMedicationInfoOnDemand. Never throws -- mirrors
 * regenerateInteractionReport's catch-and-write-error-status shape.
 */
export async function regenerateMedicationInfo(
  apiKey: string,
  model: string,
  medicationId: string,
): Promise<void> {
  const ref = getFirestore()
    .collection(MEDICATIONS_COLLECTION)
    .doc(medicationId)

  try {
    const snapshot = await ref.get()
    if (!snapshot.exists) {
      return // deleted before generation ran
    }

    const initialState = readMedicationGenerationState(snapshot)
    const info = await generateMedicationInfo(apiKey, model, initialState)
    await getFirestore().runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(ref)
      if (!currentSnapshot.exists) {
        return
      }

      const currentState = readMedicationGenerationState(currentSnapshot)
      if (
        currentState.commonName !== initialState.commonName ||
        currentState.clinicalName !== initialState.clinicalName ||
        currentState.dose !== initialState.dose ||
        currentState.infoStatus !== initialState.infoStatus
      ) {
        return
      }

      transaction.update(ref, {
        purpose: info.purpose,
        instructions: info.instructions,
        infoStatus: 'ready',
        infoError: FieldValue.delete(),
      })
    })
  } catch (err) {
    // Best-effort: if the doc was deleted mid-flight (e.g. the user deleted
    // it while Claude was generating), this write-back can itself fail --
    // that's fine, there's nothing left to update.
    await ref
      .update({
        infoStatus: 'error',
        infoError: err instanceof Error ? err.message : 'Unknown error',
      })
      .catch(() => undefined)
  }
}
