import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MedicationService } from '../services/medication.service'
import { SelectedMedicationService } from '../services/selected-medication.service'

/**
 * Persistent header row showing the selected medication's `commonName` (see
 * TODO.md #7), shared across the Medications/Interactions tabs via
 * SelectedMedicationService (TODO.md #6). Its own component -- mounted only
 * inside AppComponent's `@if (isAuthenticated())` -- rather than living
 * directly on AppComponent: AppComponent is constructed at app bootstrap,
 * before sign-in resolves, and MedicationService.all$ requires auth (see
 * firestore.rules); subscribing that early would hit a permission-denied
 * error that toSignal never recovers from. This component's lifecycle
 * matches auth instead -- created on sign-in, destroyed on sign-out -- so its
 * own field-initializer subscription only ever starts once authenticated.
 */
@Component({
  selector: 'app-selected-medication-bar',
  standalone: true,
  templateUrl: './selected-medication-bar.component.html',
  styleUrl: './selected-medication-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectedMedicationBarComponent {
  private readonly medications = toSignal(inject(MedicationService).all$, {
    initialValue: [],
  })
  private readonly selectedMedicationId = inject(SelectedMedicationService)
    .selectedId

  /** `null` hides the row -- both for "nothing selected" and for a selected
   * id that matches no medication. No fallback to the raw id (unlike
   * InteractionsComponent.selectedMedicationName's harmless fallback): this
   * component has no reconcile effect of its own to clear a stale selection,
   * and neither Medications nor Interactions may be mounted to run theirs
   * (e.g. the selection is deleted elsewhere while sitting on Prescriptions)
   * -- so an unresolved id just hides the row instead of showing a stale id
   * indefinitely. */
  protected readonly name = computed(() => {
    const id = this.selectedMedicationId()
    if (!id) {
      return null
    }
    return this.medications().find((m) => m.id === id)?.commonName ?? null
  })
}
