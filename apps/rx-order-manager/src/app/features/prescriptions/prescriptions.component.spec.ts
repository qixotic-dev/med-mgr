import { TestBed } from '@angular/core/testing'
import { BehaviorSubject } from 'rxjs'
import { MedicationService } from '../../services/medication.service'
import { PrescriptionService } from '../../services/prescription.service'
import { CalendarService } from '../../core/calendar.service'
import type { Medication } from '../../models/medication.model'
import type { Prescription } from '../../models/prescription.model'
import { PrescriptionsComponent } from './prescriptions.component'

describe('PrescriptionsComponent', () => {
  const medication: Medication = {
    id: 'med-1',
    name: 'Test Med',
    dose: '10mg',
    category: 'General',
    intervalDays: 30,
  }

  const savedPrescription: Prescription = {
    medicationId: 'med-1',
    pharmacyName: 'Real Pharmacy',
    pharmacyPhone: '555-0100',
    pharmacyAddress: '1 Main St',
    prescriberName: 'Dr. Real',
    prescriberPhone: '555-0200',
    howToOrder: 'Call ahead',
    lastOrderDate: '2026-08-01',
    nextOrderDate: '2026-09-01',
    scheduleNotes: '',
    updatedAt: new Date('2026-08-01'),
  }

  let prescriptions$: BehaviorSubject<Prescription[]>
  let saveSpy: jest.Mock

  function setup() {
    prescriptions$ = new BehaviorSubject<Prescription[]>([])
    saveSpy = jest.fn().mockResolvedValue(undefined)
    TestBed.configureTestingModule({
      imports: [PrescriptionsComponent],
      providers: [
        {
          provide: MedicationService,
          useValue: { all$: new BehaviorSubject<Medication[]>([medication]) },
        },
        {
          provide: PrescriptionService,
          useValue: { all$: prescriptions$, save: saveSpy },
        },
        { provide: CalendarService, useValue: { scheduleReminder: jest.fn() } },
      ],
    })
    const fixture = TestBed.createComponent(PrescriptionsComponent)
    fixture.detectChanges()
    return fixture
  }

  it('reconciles an empty draft once the delayed prescriptions snapshot arrives', async () => {
    const fixture = setup()
    const component = fixture.componentInstance

    // Selection happens before the Firestore listener's first emission
    // (prescriptions$ is still []), so this necessarily starts empty.
    component.select('med-1')
    expect(component.draft?.pharmacyName).toBe('')

    // The real snapshot lands after selection.
    prescriptions$.next([savedPrescription])
    await fixture.whenStable()

    expect(component.draft?.pharmacyName).toBe('Real Pharmacy')
    expect(component.draft?.nextOrderDate).toBe('2026-09-01')
  })

  it('does not clobber an in-progress edit when a later snapshot arrives', async () => {
    const fixture = setup()
    const component = fixture.componentInstance

    component.select('med-1')
    if (component.draft === null) {
      throw new Error('expected select() to set a draft')
    }
    // Mutate the field in place, matching what [(ngModel)] actually does in
    // the template -- reassigning `component.draft` to a new object here
    // wouldn't exercise the same code path a real keystroke does.
    component.draft.pharmacyName = 'User typed this'

    prescriptions$.next([savedPrescription])
    await fixture.whenStable()

    expect(component.draft?.pharmacyName).toBe('User typed this')
  })

  it('leaves the draft alone once it already matches the loaded data', async () => {
    const fixture = setup()
    const component = fixture.componentInstance

    prescriptions$.next([savedPrescription])
    await fixture.whenStable()
    component.select('med-1')
    const draftAfterSelect = component.draft

    prescriptions$.next([savedPrescription])
    await fixture.whenStable()

    expect(component.draft).toBe(draftAfterSelect)
  })

  it('does not fold in-flight typing into the baseline set by an in-progress save()', async () => {
    const fixture = setup()
    const component = fixture.componentInstance

    component.select('med-1')
    if (component.draft === null) {
      throw new Error('expected select() to set a draft')
    }
    component.draft.pharmacyName = 'Original Pharmacy'
    component.draft.pharmacyPhone = '555-0000'
    component.draft.prescriberName = 'Dr. Original'
    component.draft.prescriberPhone = '555-0001'

    const deferred: { resolve?: () => void } = {}
    saveSpy.mockReturnValue(
      new Promise<void>((resolve) => {
        deferred.resolve = resolve
      }),
    )
    const savePromise = component.save()

    // The user keeps typing while the write above is still in flight.
    component.draft.pharmacyName = 'Newer Edit'
    deferred.resolve?.()
    await savePromise

    // A snapshot echoing back exactly what was actually submitted (the
    // pre-edit values) arrives -- it must not be treated as "already
    // reflected in the draft" and clobber the newer, unsaved edit.
    prescriptions$.next([
      {
        ...savedPrescription,
        medicationId: 'med-1',
        pharmacyName: 'Original Pharmacy',
        pharmacyPhone: '555-0000',
        prescriberName: 'Dr. Original',
        prescriberPhone: '555-0001',
      },
    ])
    await fixture.whenStable()

    expect(component.draft?.pharmacyName).toBe('Newer Edit')
  })
})
