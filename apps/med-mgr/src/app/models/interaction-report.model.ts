/**
 * The AI-generated, point-in-time assessment of the current medication list
 * and Patient profile: possible drug interactions and per-drug caveats.
 * Regenerated whenever a Medication or the Patient profile changes; only
 * the current snapshot is kept, no history. See CONTEXT.md.
 */
export type Severity = 'minor' | 'moderate' | 'major'

export type FindingType =
  'drug-drug' | 'drug-condition' | 'drug-allergy' | 'caveat'

/**
 * One item in an InteractionReport. `medicationIds` holds 2 entries for a
 * 'drug-drug' Finding, 1 for the other three types.
 */
export interface Finding {
  type: FindingType
  severity: Severity
  medicationIds: string[]
  detail: string
}

export interface InteractionReport {
  status: 'pending' | 'ready' | 'error'
  findings: Finding[]
  /**
   * Sorted Medication ids this report was generated from. Kept for display /
   * inspection; freshness checks use inputFingerprint because the report also
   * depends on medication names/doses and the Patient profile.
   */
  generatedFor: string[]
  /** Deterministic fingerprint of the medication names/doses plus Patient inputs used for generation. */
  inputFingerprint: string
  patientProfileUpdatedAt: string | null
  /** Present only when status === 'error'. */
  error?: string
  updatedAt: string
}
