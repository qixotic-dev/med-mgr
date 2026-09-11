/**
 * The drug itself: name, dose, category, and how often it needs reordering.
 * Not a dose-taken record — that's day-mgr's concept of the same word, a
 * different app. See CONTEXT.md.
 */
export interface Medication {
  id: string
  name: string
  dose: string
  category: string
  intervalDays: number
}
