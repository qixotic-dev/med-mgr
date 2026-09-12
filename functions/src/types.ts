/**
 * Mirrors apps/med-mgr/src/app/models/interaction-report.model.ts. Duplicated
 * rather than imported — functions/ is a separate deployable package with
 * its own dependency graph and build, outside the Nx/Angular workspace.
 */
export type Severity = 'minor' | 'moderate' | 'major'

export type FindingType =
  'drug-drug' | 'drug-condition' | 'drug-allergy' | 'caveat'

export interface Finding {
  type: FindingType
  severity: Severity
  medicationIds: string[]
  detail: string
}
