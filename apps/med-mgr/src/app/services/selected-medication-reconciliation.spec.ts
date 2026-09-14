import {
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { Medication } from '../models/medication.model'
import { reconcileSelectedMedication } from './selected-medication-reconciliation'

const aspirin: Medication = {
  id: 'aspirin',
  commonName: 'Aspirin',
  dose: '81mg',
  category: 'Heart',
  intervalDays: 30,
}
const ibuprofen: Medication = {
  id: 'ibuprofen',
  commonName: 'Ibuprofen',
  dose: '200mg',
  category: 'Pain',
  intervalDays: 30,
}

describe('reconcileSelectedMedication', () => {
  /** `initialMedications: undefined` mirrors Firestore's collectionData()
   * not having emitted yet -- medicationsLoaded() starts false. */
  function setup(options: {
    initialSelectedId?: string | null
    initialMedications?: Medication[] | undefined
    onHydrated?: (id: string) => void
    onCleared?: () => void
    clearWhenMissing?: boolean
  }) {
    const selectedId = signal<string | null>(options.initialSelectedId ?? null)
    const medicationsSnapshot = signal<Medication[] | undefined>(
      options.initialMedications,
    )
    const medications = computed(() => medicationsSnapshot() ?? [])
    const medicationsLoaded = computed(
      () => medicationsSnapshot() !== undefined,
    )

    @Component({ template: '', standalone: true })
    class HostComponent {
      constructor() {
        reconcileSelectedMedication({
          selectedId,
          medications,
          medicationsLoaded,
          changeDetectorRef: inject(ChangeDetectorRef),
          onHydrated: options.onHydrated,
          onCleared: options.onCleared,
          clearWhenMissing: options.clearWhenMissing,
        })
      }
    }

    TestBed.configureTestingModule({ imports: [HostComponent] })
    const fixture = TestBed.createComponent(HostComponent)
    fixture.detectChanges()
    return { fixture, selectedId, medicationsSnapshot }
  }

  it('does nothing when nothing is selected and medications are already loaded', () => {
    const onHydrated = jest.fn()
    const onCleared = jest.fn()
    const { selectedId } = setup({
      initialMedications: [aspirin],
      onHydrated,
      onCleared,
    })

    expect(selectedId()).toBeNull()
    expect(onHydrated).not.toHaveBeenCalled()
    expect(onCleared).not.toHaveBeenCalled()
  })

  it('hydrates once medications are already loaded and the selection exists', () => {
    const onHydrated = jest.fn()
    setup({
      initialSelectedId: 'aspirin',
      initialMedications: [aspirin, ibuprofen],
      onHydrated,
    })

    expect(onHydrated).toHaveBeenCalledWith('aspirin')
    expect(onHydrated).toHaveBeenCalledTimes(1)
  })

  it('hydrates once medications arrive later', async () => {
    const onHydrated = jest.fn()
    const { fixture, medicationsSnapshot } = setup({
      initialSelectedId: 'aspirin',
      initialMedications: undefined,
      onHydrated,
    })

    expect(onHydrated).not.toHaveBeenCalled()

    medicationsSnapshot.set([aspirin])
    await fixture.whenStable()

    expect(onHydrated).toHaveBeenCalledWith('aspirin')
  })

  it('clears the selection and calls onCleared, not onHydrated, when the preselected medication does not exist', () => {
    const onHydrated = jest.fn()
    const onCleared = jest.fn()
    const { selectedId } = setup({
      initialSelectedId: 'no-such-id',
      initialMedications: [aspirin],
      onHydrated,
      onCleared,
    })

    expect(selectedId()).toBeNull()
    expect(onCleared).toHaveBeenCalledTimes(1)
    expect(onHydrated).not.toHaveBeenCalled()
  })

  it('only hydrates once -- a later selection made elsewhere is not treated as a fresh hydration', async () => {
    const onHydrated = jest.fn()
    const { fixture, selectedId } = setup({
      initialMedications: [aspirin],
      onHydrated,
    })

    selectedId.set('aspirin')
    await fixture.whenStable()

    expect(onHydrated).not.toHaveBeenCalled()
  })

  it('clears the selection and calls onCleared when the selected medication is deleted elsewhere', async () => {
    const onCleared = jest.fn()
    const { fixture, selectedId, medicationsSnapshot } = setup({
      initialMedications: [aspirin],
      onCleared,
    })
    selectedId.set('aspirin')

    medicationsSnapshot.set([])
    await fixture.whenStable()

    expect(selectedId()).toBeNull()
    expect(onCleared).toHaveBeenCalledTimes(1)
  })

  it('leaves the selection alone while the medication still exists', async () => {
    const onCleared = jest.fn()
    const { fixture, medicationsSnapshot } = setup({
      initialSelectedId: 'aspirin',
      initialMedications: [aspirin],
      onCleared,
    })

    medicationsSnapshot.set([aspirin, ibuprofen])
    await fixture.whenStable()

    expect(onCleared).not.toHaveBeenCalled()
  })

  describe('clearWhenMissing: false', () => {
    it('does not clear a selection that is not (yet) in medications()', async () => {
      // Mirrors MedicationsComponent.save()'s create branch: it sets
      // selectedId to an id medications() hasn't caught up to yet, and
      // relies on clearWhenMissing: false so this isn't read as "deleted".
      const onCleared = jest.fn()
      const { fixture, selectedId } = setup({
        initialMedications: [aspirin],
        onCleared,
        clearWhenMissing: false,
      })

      selectedId.set('vitamin-d3')
      await fixture.whenStable()

      expect(selectedId()).toBe('vitamin-d3')
      expect(onCleared).not.toHaveBeenCalled()
    })

    it('still clears via the hydrate effect when the preselected medication does not exist', () => {
      // clearWhenMissing only turns off the continuous effect -- hydration's
      // own not-found branch is unaffected (see its doc comment for why).
      const onCleared = jest.fn()
      const { selectedId } = setup({
        initialSelectedId: 'no-such-id',
        initialMedications: [aspirin],
        onCleared,
        clearWhenMissing: false,
      })

      expect(selectedId()).toBeNull()
      expect(onCleared).toHaveBeenCalledTimes(1)
    })
  })
})
