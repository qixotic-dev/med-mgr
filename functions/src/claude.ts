import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod/v4'
import type { Finding } from './types'

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5'

const FindingSchema = z.object({
  type: z.enum(['drug-drug', 'drug-condition', 'drug-allergy', 'caveat']),
  severity: z.enum(['minor', 'moderate', 'major']),
  medicationIds: z.array(z.string()),
  detail: z.string(),
})

const FindingsSchema = z.object({
  findings: z.array(FindingSchema),
})

const EXPECTED_MEDICATION_COUNTS: Record<Finding['type'], number> = {
  'drug-drug': 2,
  'drug-condition': 1,
  'drug-allergy': 1,
  caveat: 1,
}

export interface MedicationInput {
  id: string
  name: string
  dose: string
}

export interface PatientInput {
  birthdate?: string
  sex?: string
  allergies?: string[]
  conditions?: string[]
  weight?: string
}

function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL
}

function validateFindings(
  findings: Finding[],
  medications: MedicationInput[],
): Finding[] {
  const medicationIds = new Set(medications.map((medication) => medication.id))

  return findings.map((finding) => {
    const expectedMedicationCount = EXPECTED_MEDICATION_COUNTS[finding.type]
    const uniqueMedicationIds = new Set(finding.medicationIds)

    if (
      finding.medicationIds.length !== expectedMedicationCount ||
      uniqueMedicationIds.size !== expectedMedicationCount
    ) {
      throw new Error(
        `Claude returned an invalid medication count for ${finding.type}`,
      )
    }

    if (
      finding.medicationIds.some(
        (medicationId) => !medicationIds.has(medicationId),
      )
    ) {
      throw new Error('Claude returned a finding for an unknown medication id')
    }

    return finding
  })
}

const SYSTEM_PROMPT = `You help one person track possible drug interactions and caveats among their own medications. This is an educational aid, not medical advice — hedge appropriately and never state a finding with more certainty than the evidence supports; the person should confirm anything important with their pharmacist or doctor.

Identify findings in four categories:
- "drug-drug": an interaction between two of the listed medications. medicationIds must contain exactly the two medication ids involved.
- "drug-condition": a medication that warrants caution given one of the patient's listed conditions. medicationIds must contain exactly that one medication id; name the condition in "detail".
- "drug-allergy": a medication that conflicts with one of the patient's listed allergies. medicationIds must contain exactly that one medication id; name the allergy in "detail".
- "caveat": a general caution about one medication on its own (e.g. take with food, common side effects), independent of the other medications or the patient profile. medicationIds must contain exactly that one medication id.

Only report findings you have reasonable confidence in — omit a category entirely rather than inventing findings to fill it. Use medication ids exactly as given; never invent one.`

/** Calls Claude to generate the Interaction Report findings for one medication list + patient profile. */
export async function requestFindings(
  apiKey: string,
  medications: MedicationInput[],
  patient: PatientInput | null,
): Promise<Finding[]> {
  const client = new Anthropic({ apiKey })

  const userContent = JSON.stringify(
    { medications, patient: patient ?? {} },
    null,
    2,
  )

  const response = await client.messages.parse({
    model: anthropicModel(),
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: zodOutputFormat(FindingsSchema),
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  if (!response.parsed_output) {
    throw new Error(
      'Claude response did not match the expected findings schema',
    )
  }

  return validateFindings(response.parsed_output.findings, medications)
}
