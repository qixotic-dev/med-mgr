import {
  effect,
  type ChangeDetectorRef,
  type Signal,
  type WritableSignal,
} from '@angular/core'
import type { Medication } from '../models/medication.model'

/**
 * The "hydrate selection once, then clear if deleted elsewhere" lifecycle for
 * a component consuming SelectedMedicationService's cross-tab selection (see
 * TODO.md #6/#9). Before TODO.md #14, MedicationsComponent,
 * InteractionsComponent, and PrescriptionsComponent each hand-copied this --
 * flagged by code review on #9's PR as a Shotgun-Surgery risk (a bug in the
 * lifecycle needed fixing in all three). Must be called from an injection
 * context (e.g. a component constructor), since it registers `effect()`s.
 *
 * Two effects:
 * - Hydrate once: a selection made on another page before this component
 *   ever mounted needs to be adopted into this component's own
 *   per-selection state (e.g. a `select()`-populated `draft`) the first time
 *   a real medications snapshot arrives -- see `onHydrated`. Runs exactly
 *   once per call to this function.
 * - Reconcile to null: whenever the selected medication doesn't exist --
 *   whether that's discovered right away during hydration, or later because
 *   it was deleted (from any tab/device) while already selected here -- the
 *   shared selection must not keep pointing at it, and neither should this
 *   component's own per-selection state -- see `onCleared`. Optional (see
 *   `clearWhenMissing`): a component that itself sets `selectedId` to an id
 *   `medications()` hasn't caught up to yet needs this off.
 */
export function reconcileSelectedMedication(options: {
  selectedId: WritableSignal<string | null>
  medications: Signal<Medication[]>
  /** `undefined` until the medications snapshot has emitted at least once --
   * distinguishes "no medications yet" from "haven't heard from Firestore
   * yet", which both effects need to tell a stale selection from one that
   * just hasn't been confirmed yet. */
  medicationsLoaded: Signal<boolean>
  changeDetectorRef: ChangeDetectorRef
  /** Called once, during hydration, when a pre-existing shared selection
   * matches a real medication -- e.g. to run the same per-selection setup
   * select() does for a sidebar click. Not called when there's nothing to
   * hydrate, or the hydration target doesn't exist (see `onCleared` for
   * that case instead). */
  onHydrated?: (id: string) => void
  /** Called whenever the shared selection is reset to null because its
   * medication doesn't exist -- either found missing during hydration, or
   * (with `clearWhenMissing`) deleted elsewhere while already selected here.
   * Lets the caller clear its own per-selection state (draft, errors, etc). */
  onCleared?: () => void
  /** Whether to also register the continuous "clear the selection if its
   * medication no longer exists" effect below (default true). Off for
   * MedicationsComponent: `save()`'s create branch deliberately sets
   * `selectedId` to an id `medications()` hasn't caught up to yet (a
   * Firestore listener-lag race its own doc comment names), and this effect
   * would otherwise read that as "deleted" and immediately clear the
   * just-created selection/draft straight back out -- reproduced live via a
   * test that flushes after `save()` (see medications.component.spec.ts).
   * The hydrate-once effect above is unaffected by that race (it only
   * matters after hydration has already finished) and stays on regardless.
   * TODO.md #14 leaves the resulting inconsistency -- Medications alone
   * doesn't clear a selection deleted elsewhere once already selected -- as
   * a known follow-up rather than fixing it here. */
  clearWhenMissing?: boolean
}): void {
  const {
    selectedId,
    medications,
    medicationsLoaded,
    changeDetectorRef,
    onHydrated,
    onCleared,
    clearWhenMissing = true,
  } = options
  let hydrated = false

  effect(() => {
    if (hydrated || !medicationsLoaded()) {
      return
    }
    hydrated = true
    const id = selectedId()
    if (!id) {
      return
    }
    if (medications().some((m) => m.id === id)) {
      onHydrated?.(id)
    } else {
      // Stale -- the medication behind a cross-tab selection was deleted
      // elsewhere before this component ever loaded it.
      selectedId.set(null)
      onCleared?.()
    }
    // Either branch above may mutate plain fields via the callbacks (not
    // signals), so the OnPush view needs an explicit nudge -- see
    // MedicationsComponent.draftBaseline's doc comment for why `draft` etc.
    // are plain fields, not signals.
    changeDetectorRef.markForCheck()
  })

  if (clearWhenMissing) {
    effect(() => {
      if (!medicationsLoaded()) {
        return
      }
      const id = selectedId()
      if (id && !medications().some((m) => m.id === id)) {
        selectedId.set(null)
        onCleared?.()
        changeDetectorRef.markForCheck()
      }
    })
  }
}
