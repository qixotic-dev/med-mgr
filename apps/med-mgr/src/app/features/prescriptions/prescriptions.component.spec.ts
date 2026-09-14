import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, Subject } from 'rxjs'
import { MedicationService } from '../../services/medication.service'
import { PrescriptionService } from '../../services/prescription.service'
import { CalendarService } from '../../core/calendar.service'
import { SelectedMedicationService } from '../../services/selected-medication.service'
import type { Medication } from '../../models/medication.model'
import type { Prescription } from '../../models/prescription.model'
import { PrescriptionsComponent } from './prescriptions.component'

describe('PrescriptionsComponent', () => {
  const medication: Medication = {
    id: 'med-1',
    commonName: 'Test Med',
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
  let scheduleReminderSpy: jest.Mock

  function setup() {
    prescriptions$ = new BehaviorSubject<Prescription[]>([])
    saveSpy = jest.fn().mockResolvedValue(undefined)
    scheduleReminderSpy = jest.fn().mockResolvedValue(undefined)
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
        {
          provide: CalendarService,
          useValue: { scheduleReminder: scheduleReminderSpy },
        },
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

  describe('pickNextOrderDate', () => {
    it('surfaces an error and clears isScheduling when the Calendar write fails', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('med-1')
      scheduleReminderSpy.mockRejectedValue(new Error('boom'))

      const picking = component.pickNextOrderDate('2026-10-01')
      expect(component.isScheduling()).toBe(true)
      await picking

      expect(component.isScheduling()).toBe(false)
      expect(component.error()).toBe(
        'Failed to schedule calendar reminder. Please try again.',
      )
      // The draft still reflects the picked date -- matches the old app's
      // behavior of updating the field independent of the Calendar write.
      expect(component.draft?.nextOrderDate).toBe('2026-10-01')
    })

    it('clears a previous error once a retry succeeds', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('med-1')
      scheduleReminderSpy.mockRejectedValueOnce(new Error('boom'))
      await component.pickNextOrderDate('2026-10-01')
      expect(component.error()).not.toBeNull()

      scheduleReminderSpy.mockResolvedValueOnce(undefined)
      await component.pickNextOrderDate('2026-10-02')

      expect(component.error()).toBeNull()
    })

    it('ignores a second pick while the first is still in flight', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('med-1')
      const deferred: { resolve?: () => void } = {}
      scheduleReminderSpy.mockReturnValue(
        new Promise<void>((resolve) => {
          deferred.resolve = resolve
        }),
      )

      const first = component.pickNextOrderDate('2026-10-01')
      expect(component.isScheduling()).toBe(true)
      // Overlapping call while the first is still awaiting its Calendar
      // write -- two concurrent signInWithPopup() calls would otherwise
      // cancel each other (see pickNextOrderDate's doc comment).
      await component.pickNextOrderDate('2026-10-02')

      expect(scheduleReminderSpy).toHaveBeenCalledTimes(1)
      expect(component.draft?.nextOrderDate).toBe('2026-10-01')
      // isScheduling() (and so the template's "Scheduling…" note) is still
      // true here -- an indefinitely stuck popup reads as "still working",
      // not a silent no-op, which is the class of bug this item is about.
      expect(component.isScheduling()).toBe(true)

      deferred.resolve?.()
      await first
      expect(component.isScheduling()).toBe(false)
    })

    it('clears error() when selecting a different medication', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('med-1')
      scheduleReminderSpy.mockRejectedValue(new Error('boom'))
      await component.pickNextOrderDate('2026-10-01')
      expect(component.error()).not.toBeNull()

      component.select('med-1')

      expect(component.error()).toBeNull()
    })
  })

  describe('cross-tab selection (SelectedMedicationService)', () => {
    it('writes through select() so other tabs see the same selection', () => {
      const fixture = setup()

      fixture.componentInstance.select('med-1')

      expect(TestBed.inject(SelectedMedicationService).selectedId()).toBe(
        'med-1',
      )
    })

    /** Mirrors MedicationsComponent's identical setup -- seeds
     * SelectedMedicationService before the component is created, simulating
     * a selection already made on the Medications/Interactions pages before
     * this page was ever mounted (all three pages share one instance -- see
     * TODO.md #9). */
    function setupWithPreselectedId(id: string | null) {
      prescriptions$ = new BehaviorSubject<Prescription[]>([savedPrescription])
      TestBed.configureTestingModule({
        imports: [PrescriptionsComponent],
        providers: [
          {
            provide: MedicationService,
            useValue: { all$: new BehaviorSubject<Medication[]>([medication]) },
          },
          { provide: PrescriptionService, useValue: { all$: prescriptions$ } },
          {
            provide: CalendarService,
            useValue: { scheduleReminder: jest.fn() },
          },
        ],
      })
      TestBed.inject(SelectedMedicationService).selectedId.set(id)
      const fixture = TestBed.createComponent(PrescriptionsComponent)
      fixture.detectChanges()
      return fixture
    }

    it('loads the draft from a selection already made on another tab', () => {
      const component = setupWithPreselectedId('med-1').componentInstance

      expect(component.selectedId()).toBe('med-1')
      expect(component.draft?.pharmacyName).toBe('Real Pharmacy')
    })

    it('resets the shared selection to null if the preselected medication no longer exists', () => {
      const component = setupWithPreselectedId('no-such-med').componentInstance

      expect(component.selectedId()).toBeNull()
      expect(component.draft).toBeNull()
    })

    it('does nothing when nothing was selected elsewhere', () => {
      const component = setupWithPreselectedId(null).componentInstance

      expect(component.selectedId()).toBeNull()
      expect(component.draft).toBeNull()
    })

    it('hydrates once the first medications snapshot arrives later', async () => {
      // A bare Subject never emits an initial value (unlike the
      // BehaviorSubject the other tests above use), mirroring Firestore's
      // collectionData(): medicationsLoaded() flips true *after* the first
      // render, exercising the hydration effect's "wait, then run once"
      // shape on a snapshot that genuinely arrives asynchronously.
      const source = new Subject<Medication[]>()
      prescriptions$ = new BehaviorSubject<Prescription[]>([savedPrescription])
      TestBed.configureTestingModule({
        imports: [PrescriptionsComponent],
        providers: [
          { provide: MedicationService, useValue: { all$: source } },
          { provide: PrescriptionService, useValue: { all$: prescriptions$ } },
          {
            provide: CalendarService,
            useValue: { scheduleReminder: jest.fn() },
          },
        ],
      })
      TestBed.inject(SelectedMedicationService).selectedId.set('med-1')
      const fixture = TestBed.createComponent(PrescriptionsComponent)
      fixture.detectChanges()

      source.next([medication])
      await fixture.whenStable()

      expect(fixture.componentInstance.draft?.pharmacyName).toBe(
        'Real Pharmacy',
      )
    })

    it('clears the shared selection and draft when the selected medication is deleted elsewhere', async () => {
      const medications$ = new BehaviorSubject<Medication[]>([medication])
      prescriptions$ = new BehaviorSubject<Prescription[]>([savedPrescription])
      TestBed.configureTestingModule({
        imports: [PrescriptionsComponent],
        providers: [
          { provide: MedicationService, useValue: { all$: medications$ } },
          { provide: PrescriptionService, useValue: { all$: prescriptions$ } },
          {
            provide: CalendarService,
            useValue: { scheduleReminder: jest.fn() },
          },
        ],
      })
      const fixture = TestBed.createComponent(PrescriptionsComponent)
      fixture.detectChanges()
      fixture.componentInstance.select('med-1')

      // Deleted from another tab/device -- the next medications snapshot no
      // longer includes it.
      medications$.next([])
      await fixture.whenStable()

      expect(fixture.componentInstance.selectedId()).toBeNull()
      expect(fixture.componentInstance.draft).toBeNull()
      expect(TestBed.inject(SelectedMedicationService).selectedId()).toBeNull()
    })
  })
})
