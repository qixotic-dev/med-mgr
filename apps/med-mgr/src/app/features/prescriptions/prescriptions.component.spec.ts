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

  const medication2: Medication = {
    id: 'med-2',
    commonName: 'Other Med',
    dose: '5mg',
    category: 'General',
    intervalDays: 14,
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
    calendarEventId: 'event-1',
    scheduleNotes: '',
    updatedAt: new Date('2026-08-01'),
  }

  let prescriptions$: BehaviorSubject<Prescription[]>
  let saveSpy: jest.Mock
  let saveScheduleSpy: jest.Mock
  let scheduleReminderSpy: jest.Mock
  let deleteReminderSpy: jest.Mock

  function setup() {
    prescriptions$ = new BehaviorSubject<Prescription[]>([])
    saveSpy = jest.fn().mockResolvedValue(undefined)
    saveScheduleSpy = jest.fn().mockResolvedValue(undefined)
    scheduleReminderSpy = jest.fn().mockResolvedValue('new-event-id')
    deleteReminderSpy = jest.fn().mockResolvedValue(undefined)
    TestBed.configureTestingModule({
      imports: [PrescriptionsComponent],
      providers: [
        {
          provide: MedicationService,
          useValue: { all$: new BehaviorSubject<Medication[]>([medication]) },
        },
        {
          provide: PrescriptionService,
          useValue: {
            all$: prescriptions$,
            save: saveSpy,
            saveSchedule: saveScheduleSpy,
          },
        },
        {
          provide: CalendarService,
          useValue: {
            scheduleReminder: scheduleReminderSpy,
            deleteReminder: deleteReminderSpy,
          },
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
    it("passes the previous pick's event id to scheduleReminder so it updates that event instead of leaving it behind", async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      prescriptions$.next([savedPrescription])
      await fixture.whenStable()
      component.select('med-1')

      await component.pickNextOrderDate('2026-10-01')

      expect(scheduleReminderSpy).toHaveBeenCalledWith(
        medication,
        '2026-10-01',
        savedPrescription.howToOrder,
        'event-1',
      )
      expect(saveScheduleSpy).toHaveBeenCalledWith(
        'med-1',
        '2026-10-01',
        'new-event-id',
      )
      expect(component.draft?.calendarEventId).toBe('new-event-id')

      // A second pick reuses *that* event's id, not the original one --
      // otherwise this pick's own event would be left behind next time too.
      await component.pickNextOrderDate('2026-10-02')

      expect(scheduleReminderSpy).toHaveBeenLastCalledWith(
        medication,
        '2026-10-02',
        savedPrescription.howToOrder,
        'new-event-id',
      )
    })

    it('adopts the new event id even when saveSchedule() fails, so a retry does not orphan it', async () => {
      // If scheduleReminder() creates/moves an event but the Firestore write
      // right after it throws, the *next* pick must still target the event
      // that actually exists on Google's side -- not the stale id it was
      // called with -- or that event is orphaned exactly like TODO.md #13's
      // original bug.
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('med-1')
      saveScheduleSpy.mockRejectedValueOnce(new Error('offline'))

      await component.pickNextOrderDate('2026-10-01')

      expect(component.draft?.calendarEventId).toBe('new-event-id')
      expect(component.error()).toBe('offline')

      await component.pickNextOrderDate('2026-10-02')

      expect(scheduleReminderSpy).toHaveBeenLastCalledWith(
        medication,
        '2026-10-02',
        '',
        'new-event-id',
      )
    })

    it('surfaces the Calendar error and clears isScheduling when the write fails', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('med-1')
      scheduleReminderSpy.mockRejectedValue(new Error('boom'))

      const picking = component.pickNextOrderDate('2026-10-01')
      expect(component.isScheduling()).toBe(true)
      await picking

      expect(component.isScheduling()).toBe(false)
      expect(component.error()).toBe('boom')
      // The draft still reflects the picked date -- matches the old app's
      // behavior of updating the field independent of the Calendar write.
      expect(component.draft?.nextOrderDate).toBe('2026-10-01')
    })

    it('falls back to a generic message when a thrown value has no message', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('med-1')
      scheduleReminderSpy.mockRejectedValue('boom')

      await component.pickNextOrderDate('2026-10-01')

      expect(component.error()).toBe(
        'Failed to schedule calendar reminder. Please try again.',
      )
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

    it('clears error() when reselecting the same medication', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('med-1')
      scheduleReminderSpy.mockRejectedValue(new Error('boom'))
      await component.pickNextOrderDate('2026-10-01')
      expect(component.error()).not.toBeNull()

      component.select('med-1')

      expect(component.error()).toBeNull()
    })

    /** Registers a second medication alongside 'med-1' -- the shared
     * setup() only has one, which can't exercise a scheduling operation
     * outliving a switch to a *different* medication. */
    function setupWithTwoMedications() {
      prescriptions$ = new BehaviorSubject<Prescription[]>([])
      scheduleReminderSpy = jest.fn().mockResolvedValue('new-event-id')
      deleteReminderSpy = jest.fn().mockResolvedValue(undefined)
      TestBed.configureTestingModule({
        imports: [PrescriptionsComponent],
        providers: [
          {
            provide: MedicationService,
            useValue: {
              all$: new BehaviorSubject<Medication[]>([
                medication,
                medication2,
              ]),
            },
          },
          {
            provide: PrescriptionService,
            useValue: {
              all$: prescriptions$,
              saveSchedule: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: CalendarService,
            useValue: {
              scheduleReminder: scheduleReminderSpy,
              deleteReminder: deleteReminderSpy,
            },
          },
        ],
      })
      const fixture = TestBed.createComponent(PrescriptionsComponent)
      fixture.detectChanges()
      return fixture
    }

    it('does not leak a stale scheduling completion onto a medication switched to mid-flight', async () => {
      // Caught by Copilot review on this item's PR: isScheduling()/error()
      // used to be plain component-wide signals, so switching medications
      // while a Calendar write was still in flight for the *previous*
      // medication made the newly-selected one incorrectly show
      // "Scheduling…", and a later failure wrote its error into the new
      // medication's form instead of the one it was actually for.
      const component = setupWithTwoMedications().componentInstance
      component.select('med-1')
      const deferred: { reject?: (err: Error) => void } = {}
      scheduleReminderSpy.mockReturnValue(
        new Promise<void>((_resolve, reject) => {
          deferred.reject = reject
        }),
      )

      const stalePick = component.pickNextOrderDate('2026-10-01')
      expect(component.isScheduling()).toBe(true)

      component.select('med-2')
      // The still-in-flight write belongs to med-1, not the newly-selected
      // med-2 -- its form should read as idle, not "Scheduling…".
      expect(component.isScheduling()).toBe(false)
      expect(component.error()).toBeNull()

      deferred.reject?.(new Error('boom'))
      await stalePick

      // The failure is med-1's, so it must not appear while med-2 is
      // selected.
      expect(component.isScheduling()).toBe(false)
      expect(component.error()).toBeNull()

      // select() always starts from a clean slate (matches
      // MedicationsComponent.select()), so switching back to med-1 doesn't
      // resurface the stale error either -- it's not a persistent flag on
      // the medication, just feedback for the attempt that just ran.
      component.select('med-1')
      expect(component.error()).toBeNull()
    })

    it('marks isCalendarBusy() true for any medication while a write is in flight elsewhere', async () => {
      // The single global lock (CalendarSchedulingService) means a pick for
      // a different medication would silently no-op while one write is
      // already in flight -- isCalendarBusy() drives disabling the picker
      // instead of letting that click look accepted (caught by Copilot
      // review on this item's PR).
      const component = setupWithTwoMedications().componentInstance
      component.select('med-1')
      const deferred: { resolve?: () => void } = {}
      scheduleReminderSpy.mockReturnValue(
        new Promise<void>((resolve) => {
          deferred.resolve = resolve
        }),
      )

      const picking = component.pickNextOrderDate('2026-10-01')
      component.select('med-2')

      // Not scheduling *for med-2* -- isScheduling() stays scoped to it --
      // but the picker should still read as busy globally.
      expect(component.isScheduling()).toBe(false)
      expect(component.isCalendarBusy()).toBe(true)

      deferred.resolve?.()
      await picking

      expect(component.isCalendarBusy()).toBe(false)
    })

    it('keeps the lock across a route destroy/recreate (navigating away and back)', async () => {
      // Caught by Copilot review on this item's PR: a component-instance
      // field would forget an in-flight write when Angular's router
      // destroys PrescriptionsComponent on navigating away, letting a
      // second attempt after the user returns call signInWithPopup()
      // concurrently with the first -- the exact cancellation this lock
      // exists to prevent. CalendarSchedulingService is root-scoped
      // specifically so it survives that destroy/recreate, which this test
      // simulates directly (no TestBed.resetTestingModule() between the two
      // createComponent() calls, so the same singleton backs both).
      const fixtureA = setup()
      const componentA = fixtureA.componentInstance
      componentA.select('med-1')
      const deferred: { resolve?: () => void } = {}
      scheduleReminderSpy.mockReturnValue(
        new Promise<void>((resolve) => {
          deferred.resolve = resolve
        }),
      )
      const stalePick = componentA.pickNextOrderDate('2026-10-01')

      fixtureA.destroy()
      const fixtureB = TestBed.createComponent(PrescriptionsComponent)
      fixtureB.detectChanges()
      const componentB = fixtureB.componentInstance
      componentB.select('med-1')
      await componentB.pickNextOrderDate('2026-10-02')

      // Still only the one call from componentA -- componentB's guard saw
      // the lock componentA's still-pending write is holding.
      expect(scheduleReminderSpy).toHaveBeenCalledTimes(1)

      deferred.resolve?.()
      await stalePick
    })
  })

  describe('clearSchedule', () => {
    it('deletes the stored Calendar event and nulls both fields on success', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      prescriptions$.next([savedPrescription])
      await fixture.whenStable()
      component.select('med-1')

      await component.clearSchedule()

      expect(deleteReminderSpy).toHaveBeenCalledWith('event-1')
      expect(saveScheduleSpy).toHaveBeenCalledWith('med-1', null, null)
      expect(component.draft?.nextOrderDate).toBeNull()
      expect(component.draft?.calendarEventId).toBeNull()
    })

    it('is a no-op Calendar-wise but still clears the date when nothing was scheduled', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('med-1')

      await component.clearSchedule()

      expect(deleteReminderSpy).not.toHaveBeenCalled()
      expect(saveScheduleSpy).toHaveBeenCalledWith('med-1', null, null)
      expect(component.draft?.nextOrderDate).toBeNull()
    })

    it('surfaces an error and leaves calendarEventId intact when the delete fails', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      prescriptions$.next([savedPrescription])
      await fixture.whenStable()
      component.select('med-1')
      deleteReminderSpy.mockRejectedValue(new Error('boom'))

      await component.clearSchedule()

      expect(component.error()).toBe('boom')
      // Not nulled -- a failed delete must not orphan the still-live event
      // by losing the only id that can reach it.
      expect(component.draft?.calendarEventId).toBe('event-1')
      expect(saveScheduleSpy).not.toHaveBeenCalled()
      // Optimistic, matching pickNextOrderDate()'s same pattern.
      expect(component.draft?.nextOrderDate).toBeNull()
      // The button must stay enabled so the user can retry the delete --
      // otherwise this event is unreachable through the UI forever (caught
      // by Copilot review on this item's PR).
      expect(component.canClearSchedule()).toBe(true)
    })

    it('is blocked while a pick is in flight, and vice versa', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      prescriptions$.next([savedPrescription])
      await fixture.whenStable()
      component.select('med-1')
      const deferred: { resolve?: () => void } = {}
      scheduleReminderSpy.mockReturnValue(
        new Promise<string>((resolve) => {
          deferred.resolve = resolve
        }),
      )

      const picking = component.pickNextOrderDate('2026-10-01')
      await component.clearSchedule()

      expect(deleteReminderSpy).not.toHaveBeenCalled()

      deferred.resolve?.('new-event-id')
      await picking
    })
  })

  describe('canClearSchedule', () => {
    it('is false when neither a date nor an event is on record', () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('med-1')

      expect(component.canClearSchedule()).toBe(false)
    })

    it('is true when only calendarEventId remains (the failed-clear case)', () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('med-1')
      if (component.draft === null) {
        throw new Error('expected select() to set a draft')
      }
      component.draft = {
        ...component.draft,
        nextOrderDate: null,
        calendarEventId: 'event-1',
      }

      expect(component.canClearSchedule()).toBe(true)
    })

    it('is false while a Calendar write is in flight', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      prescriptions$.next([savedPrescription])
      await fixture.whenStable()
      component.select('med-1')
      const deferred: { resolve?: (id: string) => void } = {}
      scheduleReminderSpy.mockReturnValue(
        new Promise<string>((resolve) => {
          deferred.resolve = resolve
        }),
      )

      const picking = component.pickNextOrderDate('2026-10-01')

      expect(component.canClearSchedule()).toBe(false)

      deferred.resolve?.('new-event-id')
      await picking
    })
  })

  describe('save', () => {
    it('does not send nextOrderDate/calendarEventId -- saveSchedule() is their sole writer', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('med-1')
      if (component.draft === null) {
        throw new Error('expected select() to set a draft')
      }
      component.draft = {
        ...component.draft,
        pharmacyName: 'Real Pharmacy',
        pharmacyPhone: '555-0100',
        prescriberName: 'Dr. Real',
        prescriberPhone: '555-0200',
        nextOrderDate: '2026-09-01',
        calendarEventId: 'event-1',
      }

      await component.save()

      expect(saveSpy).toHaveBeenCalledTimes(1)
      const sent = saveSpy.mock.calls[0][1] as Record<string, unknown>
      // Absent, not just falsy -- a merge write with an explicit null would
      // still clobber Firestore's real value, the same bug this omission
      // exists to prevent.
      expect(sent).not.toHaveProperty('nextOrderDate')
      expect(sent).not.toHaveProperty('calendarEventId')
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
