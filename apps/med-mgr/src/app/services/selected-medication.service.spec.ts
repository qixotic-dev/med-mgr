import { TestBed } from '@angular/core/testing'
import { SelectedMedicationService } from './selected-medication.service'

describe('SelectedMedicationService', () => {
  it('starts with nothing selected', () => {
    TestBed.configureTestingModule({})
    expect(TestBed.inject(SelectedMedicationService).selectedId()).toBeNull()
  })

  it('is a single shared instance -- a write from one injection site is seen by another', () => {
    TestBed.configureTestingModule({})
    const first = TestBed.inject(SelectedMedicationService)
    const second = TestBed.inject(SelectedMedicationService)

    first.selectedId.set('aspirin')

    expect(second.selectedId()).toBe('aspirin')
  })
})
