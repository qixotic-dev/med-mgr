import { TestBed } from '@angular/core/testing'
import { BehaviorSubject } from 'rxjs'
import { MedicationService } from '../services/medication.service'
import { SelectedMedicationService } from '../services/selected-medication.service'
import type { Medication } from '../models/medication.model'
import { SelectedMedicationBarComponent } from './selected-medication-bar.component'

describe('SelectedMedicationBarComponent', () => {
  const aspirin: Medication = {
    id: 'aspirin',
    commonName: 'Aspirin',
    dose: '81mg',
    category: 'Heart',
    intervalDays: 90,
  }

  function setup(
    medications: Medication[] = [aspirin],
  ): ReturnType<
    typeof TestBed.createComponent<SelectedMedicationBarComponent>
  > {
    TestBed.configureTestingModule({
      imports: [SelectedMedicationBarComponent],
      providers: [
        {
          provide: MedicationService,
          useValue: { all$: new BehaviorSubject(medications) },
        },
      ],
    })
    const fixture = TestBed.createComponent(SelectedMedicationBarComponent)
    fixture.detectChanges()
    return fixture
  }

  it('renders nothing when nothing is selected', () => {
    const fixture = setup()
    expect(
      fixture.nativeElement.querySelector('.selected-medication-bar'),
    ).toBeNull()
  })

  it("shows the selected medication's commonName", () => {
    const fixture = setup()

    TestBed.inject(SelectedMedicationService).selectedId.set('aspirin')
    fixture.detectChanges()

    const bar: HTMLElement = fixture.nativeElement.querySelector(
      '.selected-medication-bar',
    )
    expect(bar.textContent?.trim()).toBe('Selected: Aspirin')
  })

  it('hides again once the selection is cleared', () => {
    const fixture = setup()
    TestBed.inject(SelectedMedicationService).selectedId.set('aspirin')
    fixture.detectChanges()

    TestBed.inject(SelectedMedicationService).selectedId.set(null)
    fixture.detectChanges()

    expect(
      fixture.nativeElement.querySelector('.selected-medication-bar'),
    ).toBeNull()
  })

  it('hides for a selected id that matches no medication', () => {
    const fixture = setup()

    TestBed.inject(SelectedMedicationService).selectedId.set('unknown-id')
    fixture.detectChanges()

    expect(
      fixture.nativeElement.querySelector('.selected-medication-bar'),
    ).toBeNull()
  })
})
