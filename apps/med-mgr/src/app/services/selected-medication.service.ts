import { Injectable, signal } from '@angular/core'

/**
 * The Medication selection shared across the Medications, Interactions, and
 * Prescriptions tabs (see TODO.md #6, #9) — MedicationsComponent and
 * PrescriptionsComponent use it to choose which medication's edit form
 * (`draft`) is shown, InteractionsComponent uses the same id to optionally
 * filter the Interaction Report to one medication.
 * `providedIn: 'root'` (like ThemeService) makes all three pages read/write
 * the same signal instead of each tracking its own, so the selection
 * survives switching tabs. A plain in-memory signal, not persisted to
 * Firestore — it only needs to survive navigating between tabs within one
 * running app, not page reloads or other devices.
 */
@Injectable({ providedIn: 'root' })
export class SelectedMedicationService {
  readonly selectedId = signal<string | null>(null)
}
