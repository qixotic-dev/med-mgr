/**
 * The drug itself: common name, dose, category, and how often it needs
 * reordering. `clinicalName`/`purpose`/`instructions` are AI-generated once
 * (on creation) then hand-editable; `infoStatus`/`infoError` mirror
 * InteractionReport's status/error so "generating" and "failed" are visible
 * instead of blank fields -- unset means never generated (e.g. a
 * pre-migration record), and clinicalName can also come back blank when the
 * AI doesn't recognize the drug. Deliberately excludes drug-drug/
 * Patient-specific content, which stays in the Interaction Report. Not a
 * dose-taken record — that's day-mgr's concept of the same word, a
 * different app. See CONTEXT.md.
 */
export interface Medication {
  id: string
  commonName: string
  clinicalName?: string
  dose: string
  category: string
  intervalDays: number
  purpose?: string
  instructions?: string
  infoStatus?: 'pending' | 'ready' | 'error'
  /** Present only when infoStatus === 'error'. */
  infoError?: string
}
