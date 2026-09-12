/**
 * Health/demographic context about the app's single user. Used only to
 * inform the AI-generated Interaction Report — has no role in the reorder
 * workflow. See CONTEXT.md.
 */
export interface Patient {
  birthdate: string
  sex: string
  allergies: string[]
  conditions: string[]
  weight: string
}
