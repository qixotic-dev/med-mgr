import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, Observable, Subject } from 'rxjs'
import { MedicationService } from '../../services/medication.service'
import { InteractionReportService } from '../../services/interaction-report.service'
import { SelectedMedicationService } from '../../services/selected-medication.service'
import type { Medication } from '../../models/medication.model'
import type { InteractionReport } from '../../models/interaction-report.model'
import {
  categoryOptionValue,
  groupByCategory,
  isSameMedicationData,
  MedicationsComponent,
  NEW_CATEGORY_OPTION,
} from './medications.component'

describe('MedicationsComponent', () => {
  const aspirin: Medication = {
    id: 'aspirin',
    commonName: 'Aspirin',
    dose: '81mg',
    category: 'Heart',
    intervalDays: 90,
  }
  const ibuprofen: Medication = {
    id: 'ibuprofen',
    commonName: 'Ibuprofen',
    dose: '200mg',
    category: 'Pain',
    intervalDays: 30,
  }

  let createSpy: jest.Mock
  let updateSpy: jest.Mock
  let deleteSpy: jest.Mock
  let regenerateInfoOnDemandSpy: jest.Mock

  function setup(
    source: Observable<Medication[]> = new BehaviorSubject([
      aspirin,
      ibuprofen,
    ]),
    report$: Observable<InteractionReport | undefined> = new BehaviorSubject<
      InteractionReport | undefined
    >(undefined),
  ) {
    createSpy = jest.fn().mockResolvedValue(undefined)
    updateSpy = jest.fn().mockResolvedValue(undefined)
    deleteSpy = jest.fn().mockResolvedValue(undefined)
    regenerateInfoOnDemandSpy = jest.fn().mockResolvedValue(undefined)
    TestBed.configureTestingModule({
      imports: [MedicationsComponent],
      providers: [
        {
          provide: MedicationService,
          useValue: {
            all$: source,
            create: createSpy,
            update: updateSpy,
            delete: deleteSpy,
            regenerateInfoOnDemand: regenerateInfoOnDemandSpy,
          },
        },
        {
          provide: InteractionReportService,
          useValue: { report$ },
        },
      ],
    })
    const fixture = TestBed.createComponent(MedicationsComponent)
    fixture.detectChanges()
    return fixture
  }

  describe('groupByCategory', () => {
    it('groups medications by category, preserving encounter order', () => {
      expect(groupByCategory([aspirin, ibuprofen])).toEqual([
        { category: 'Heart', items: [aspirin] },
        { category: 'Pain', items: [ibuprofen] },
      ])
    })
  })

  describe('isSameMedicationData', () => {
    const base: Omit<Medication, 'id'> = {
      commonName: 'Aspirin',
      dose: '81mg',
      category: 'Heart',
      intervalDays: 90,
    }

    it('is true for identical data', () => {
      expect(isSameMedicationData(base, { ...base })).toBe(true)
    })

    it('is false when a generated field differs', () => {
      expect(
        isSameMedicationData(base, { ...base, purpose: 'Pain relief' }),
      ).toBe(false)
    })

    it('is false when a core field differs', () => {
      expect(isSameMedicationData(base, { ...base, dose: '325mg' })).toBe(false)
    })
  })

  describe('canSave', () => {
    it('is false with no draft (nothing selected, not adding)', () => {
      const fixture = setup()
      expect(fixture.componentInstance.canSave()).toBe(false)
    })

    it('is false when required fields are blank', () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.startAdd()
      expect(component.canSave()).toBe(false)
    })

    it('is false when intervalDays is not a positive integer', () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.startAdd()
      if (!component.draft) {
        throw new Error('expected startAdd() to set a draft')
      }
      component.draft.commonName = 'New Med'
      component.draft.dose = '5mg'
      component.draft.category = 'Heart'
      component.draft.intervalDays = 0
      expect(component.canSave()).toBe(false)
    })

    it('is true once required fields are filled in edit mode', () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      expect(component.canSave()).toBe(true)
    })

    it('is false in create mode until the first medications snapshot arrives', () => {
      // A bare Subject never emits an initial value, so medicationsLoaded()
      // stays false — unlike the BehaviorSubject the other tests use.
      const fixture = setup(new Subject<Medication[]>())
      const component = fixture.componentInstance
      component.startAdd()
      if (!component.draft) {
        throw new Error('expected startAdd() to set a draft')
      }
      component.draft.commonName = 'New Med'
      component.draft.dose = '5mg'
      component.draft.category = 'Heart'
      component.draft.intervalDays = 30
      expect(component.canSave()).toBe(false)
    })
  })

  describe('select / startAdd', () => {
    it('select() populates the draft from the chosen medication', () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('ibuprofen')
      expect(component.draft).toEqual({
        commonName: 'Ibuprofen',
        dose: '200mg',
        category: 'Pain',
        intervalDays: 30,
      })
    })

    it('startAdd() clears the selection and blanks the draft', () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      component.startAdd()
      expect(component.selectedId()).toBeNull()
      expect(component.draft?.commonName).toBe('')
    })
  })

  describe('save', () => {
    it('calls update() with the edited fields when a medication is selected', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      if (!component.draft) {
        throw new Error('expected select() to set a draft')
      }
      component.draft.dose = '162mg'

      await component.save()

      expect(updateSpy).toHaveBeenCalledWith('aspirin', {
        commonName: 'Aspirin',
        dose: '162mg',
        category: 'Heart',
        intervalDays: 90,
      })
      expect(createSpy).not.toHaveBeenCalled()
    })

    it('clears a stale infoError via a clinicalName-only edit once purpose/instructions are already present', async () => {
      const readyAspirin: Medication = {
        ...aspirin,
        purpose: 'Pain relief',
        instructions: 'Take with food',
        infoStatus: 'error',
        infoError: 'boom',
      }
      const fixture = setup(new BehaviorSubject([readyAspirin, ibuprofen]))
      const component = fixture.componentInstance
      component.select('aspirin')
      if (!component.draft) {
        throw new Error('expected select() to set a draft')
      }
      component.draft.clinicalName = 'Acetylsalicylic acid'

      await component.save()

      expect(updateSpy).toHaveBeenCalledWith(
        'aspirin',
        expect.objectContaining({
          clinicalName: 'Acetylsalicylic acid',
          infoStatus: 'ready',
          infoError: undefined,
        }),
      )
    })

    it('sets infoStatus to ready when a hand-edit fills in both purpose and instructions', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      if (!component.draft) {
        throw new Error('expected select() to set a draft')
      }
      component.draft.infoStatus = 'error'
      component.draft.infoError = 'boom'
      component.draft.purpose = 'Pain relief'
      component.draft.instructions = 'Take with food'

      await component.save()

      expect(updateSpy).toHaveBeenCalledWith(
        'aspirin',
        expect.objectContaining({
          purpose: 'Pain relief',
          instructions: 'Take with food',
          infoStatus: 'ready',
          infoError: undefined,
        }),
      )
    })

    it('leaves infoStatus alone when purpose/instructions are still blank', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      if (!component.draft) {
        throw new Error('expected select() to set a draft')
      }
      component.draft.dose = '162mg'

      await component.save()

      expect(updateSpy).toHaveBeenCalledWith(
        'aspirin',
        expect.not.objectContaining({ infoStatus: expect.anything() }),
      )
    })

    it('leaves error status alone when only a non-info field changes', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      if (!component.draft) {
        throw new Error('expected select() to set a draft')
      }
      component.draft.infoStatus = 'error'
      component.draft.infoError = 'boom'
      component.draft.dose = '162mg'

      await component.save()

      expect(updateSpy).toHaveBeenCalledWith(
        'aspirin',
        expect.objectContaining({
          dose: '162mg',
          infoStatus: 'error',
          infoError: 'boom',
        }),
      )
    })

    it('unsets infoStatus when a purpose/instructions edit leaves either blank', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      if (!component.draft) {
        throw new Error('expected select() to set a draft')
      }
      component.draft.purpose = 'Pain relief'
      component.draft.instructions = 'Take with food'
      component.draft.infoStatus = 'ready'
      component.draft.instructions = ''

      await component.save()

      expect(updateSpy).toHaveBeenCalledWith(
        'aspirin',
        expect.objectContaining({
          purpose: 'Pain relief',
          instructions: '',
          infoStatus: undefined,
        }),
      )
    })

    it('omits generator-owned fields while pending and saving only core edits', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      if (!component.draft) {
        throw new Error('expected select() to set a draft')
      }
      component.draft.infoStatus = 'pending'
      component.draft.dose = '162mg'

      await component.save()

      expect(updateSpy).toHaveBeenCalledWith('aspirin', {
        commonName: 'Aspirin',
        dose: '162mg',
        category: 'Heart',
        intervalDays: 90,
      })
    })

    it('omits a non-blank clinicalName while pending too, not just purpose/instructions', async () => {
      const withClinicalName: Medication = {
        ...aspirin,
        clinicalName: 'Acetylsalicylic acid',
      }
      const fixture = setup(new BehaviorSubject([withClinicalName, ibuprofen]))
      const component = fixture.componentInstance
      component.select('aspirin')
      if (!component.draft) {
        throw new Error('expected select() to set a draft')
      }
      component.draft.infoStatus = 'pending'
      component.draft.dose = '162mg'

      await component.save()

      expect(updateSpy).toHaveBeenCalledWith('aspirin', {
        commonName: 'Aspirin',
        dose: '162mg',
        category: 'Heart',
        intervalDays: 90,
      })
    })

    it('slugifies the name and calls create() for a new medication', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.startAdd()
      if (!component.draft) {
        throw new Error('expected startAdd() to set a draft')
      }
      component.draft.commonName = 'Vitamin D3'
      component.draft.dose = '2000IU'
      component.draft.category = 'Supplements'
      component.draft.intervalDays = 60

      await component.save()

      expect(createSpy).toHaveBeenCalledWith('vitamin-d3', {
        commonName: 'Vitamin D3',
        dose: '2000IU',
        category: 'Supplements',
        intervalDays: 60,
        infoStatus: 'pending',
      })
    })

    it('blocks the save and sets an error when the generated id collides', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.startAdd()
      if (!component.draft) {
        throw new Error('expected startAdd() to set a draft')
      }
      // Slugifies to 'aspirin', which already exists.
      component.draft.commonName = 'Aspirin'
      component.draft.dose = '81mg'
      component.draft.category = 'Heart'
      component.draft.intervalDays = 90

      await component.save()

      expect(createSpy).not.toHaveBeenCalled()
      expect(component.error()).toContain('already exists')
    })

    it('blocks the save with a distinct message when the name slugifies to nothing', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.startAdd()
      if (!component.draft) {
        throw new Error('expected startAdd() to set a draft')
      }
      component.draft.commonName = '***'
      component.draft.dose = '81mg'
      component.draft.category = 'Heart'
      component.draft.intervalDays = 90

      await component.save()

      expect(createSpy).not.toHaveBeenCalled()
      expect(component.error()).not.toContain('already exists')
      expect(component.error()).toBeTruthy()
    })

    it('selects the newly created medication even if the collection snapshot has not caught up yet', async () => {
      // The BehaviorSubject never re-emits after create() (createSpy doesn't
      // write back to it), so medications() still won't contain the new id
      // once save() resolves -- selecting it must not depend on that.
      const fixture = setup()
      const component = fixture.componentInstance
      component.startAdd()
      if (!component.draft) {
        throw new Error('expected startAdd() to set a draft')
      }
      component.draft.commonName = 'Vitamin D3'
      component.draft.dose = '2000IU'
      component.draft.category = 'Supplements'
      component.draft.intervalDays = 60

      await component.save()

      expect(component.selectedId()).toBe('vitamin-d3')
    })

    it('clears isNewCategory after a successful update into a newly typed category', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      component.onCategorySelect(NEW_CATEGORY_OPTION)
      if (!component.draft) {
        throw new Error('expected select() to set a draft')
      }
      component.draft.category = 'Cardiac'
      expect(component.isNewCategory).toBe(true)

      await component.save()

      expect(component.isNewCategory).toBe(false)
    })

    it('does not clobber a newer draft if an earlier update() is still resolving', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      let resolveUpdate: () => void = () => {
        throw new Error('update() was not called')
      }
      updateSpy.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveUpdate = resolve
          }),
      )

      component.select('aspirin')
      const savePromise = component.save()

      // User switches to a different medication and starts a new category
      // while the aspirin update is still in flight.
      component.select('ibuprofen')
      component.onCategorySelect(NEW_CATEGORY_OPTION)

      resolveUpdate()
      await savePromise

      expect(component.selectedId()).toBe('ibuprofen')
      expect(component.isNewCategory).toBe(true)
    })

    it('does not clobber a newer draft if an earlier create() is still resolving', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      let resolveCreate: () => void = () => {
        throw new Error('create() was not called')
      }
      createSpy.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveCreate = resolve
          }),
      )

      component.startAdd()
      if (!component.draft) {
        throw new Error('expected startAdd() to set a draft')
      }
      component.draft.commonName = 'Vitamin D3'
      component.draft.dose = '2000IU'
      component.draft.category = 'Supplements'
      component.draft.intervalDays = 60
      const savePromise = component.save()

      // User switches to an existing medication while the create() for the
      // new one is still in flight.
      component.select('aspirin')

      resolveCreate()
      await savePromise

      expect(component.selectedId()).toBe('aspirin')
    })
  })

  describe('delete', () => {
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('still deletes when selectedId is set but medications() has not caught up yet', async () => {
      // Mirrors save()'s "selects the newly created medication even if the
      // collection snapshot has not caught up yet" case -- selectedId() can
      // be truthy while selectedMedication() is still null.
      const fixture = setup(new BehaviorSubject<Medication[]>([]))
      const component = fixture.componentInstance
      component.selectedId.set('aspirin')
      jest.spyOn(window, 'confirm').mockReturnValue(true)

      await component.delete()

      expect(deleteSpy).toHaveBeenCalledWith('aspirin')
    })

    it('does nothing if nothing is selected', async () => {
      const fixture = setup()
      const confirmSpy = jest.spyOn(window, 'confirm')
      await fixture.componentInstance.delete()
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(deleteSpy).not.toHaveBeenCalled()
    })

    it('asks for confirmation and does not delete if the user cancels', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      jest.spyOn(window, 'confirm').mockReturnValue(false)

      await component.delete()

      expect(deleteSpy).not.toHaveBeenCalled()
      expect(component.selectedId()).toBe('aspirin')
    })

    it('deletes the selected medication and clears the form on confirm', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      jest.spyOn(window, 'confirm').mockReturnValue(true)

      await component.delete()

      expect(deleteSpy).toHaveBeenCalledWith('aspirin')
      expect(component.selectedId()).toBeNull()
      expect(component.draft).toBeNull()
    })

    it('sets an error and keeps the selection if delete() rejects', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      jest.spyOn(window, 'confirm').mockReturnValue(true)
      deleteSpy.mockRejectedValue(new Error('offline'))

      await component.delete()

      expect(component.error()).toBeTruthy()
      expect(component.selectedId()).toBe('aspirin')
    })

    it('does not clobber a newer selection if an earlier delete() is still resolving', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      let resolveDelete: () => void = () => {
        throw new Error('delete() was not called')
      }
      deleteSpy.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDelete = resolve
          }),
      )
      component.select('aspirin')
      jest.spyOn(window, 'confirm').mockReturnValue(true)

      const deletePromise = component.delete()
      component.select('ibuprofen')

      resolveDelete()
      await deletePromise

      expect(component.selectedId()).toBe('ibuprofen')
    })

    it('ignores a second delete() call while the first is still in flight', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      let resolveDelete: () => void = () => {
        throw new Error('delete() was not called')
      }
      deleteSpy.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDelete = resolve
          }),
      )
      component.select('aspirin')
      jest.spyOn(window, 'confirm').mockReturnValue(true)

      const firstDelete = component.delete()
      expect(component.isDeleting()).toBe(true)

      await component.delete()
      expect(deleteSpy).toHaveBeenCalledTimes(1)

      resolveDelete()
      await firstDelete

      expect(component.isDeleting()).toBe(false)
    })

    it('clears isDeleting even when delete() rejects', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      jest.spyOn(window, 'confirm').mockReturnValue(true)
      deleteSpy.mockRejectedValue(new Error('offline'))

      await component.delete()

      expect(component.isDeleting()).toBe(false)
    })
  })

  describe('reconcile effect', () => {
    it('adopts freshly generated purpose/instructions into an untouched draft', async () => {
      const medications$ = new BehaviorSubject<Medication[]>([
        aspirin,
        ibuprofen,
      ])
      const fixture = setup(medications$)
      const component = fixture.componentInstance
      component.select('aspirin')

      medications$.next([
        {
          ...aspirin,
          purpose: 'Pain relief',
          instructions: 'Take with food',
          infoStatus: 'ready',
        },
        ibuprofen,
      ])
      await fixture.whenStable()

      expect(component.draft?.purpose).toBe('Pain relief')
      expect(component.draft?.instructions).toBe('Take with food')
      expect(component.draft?.infoStatus).toBe('ready')
    })

    it('does not clobber an in-progress edit when a later snapshot arrives', async () => {
      const medications$ = new BehaviorSubject<Medication[]>([
        aspirin,
        ibuprofen,
      ])
      const fixture = setup(medications$)
      const component = fixture.componentInstance
      component.select('aspirin')
      if (!component.draft) {
        throw new Error('expected select() to set a draft')
      }
      // Mutate the field in place, matching what [(ngModel)] actually does.
      component.draft.purpose = 'User typed this'

      medications$.next([
        { ...aspirin, purpose: 'Generated purpose', infoStatus: 'ready' },
        ibuprofen,
      ])
      await fixture.whenStable()

      expect(component.draft?.purpose).toBe('User typed this')
    })

    it('leaves the draft alone once it already matches the loaded data', async () => {
      const medications$ = new BehaviorSubject<Medication[]>([
        aspirin,
        ibuprofen,
      ])
      const fixture = setup(medications$)
      const component = fixture.componentInstance
      component.select('aspirin')
      const draftAfterSelect = component.draft

      medications$.next([aspirin, ibuprofen])
      await fixture.whenStable()

      expect(component.draft).toBe(draftAfterSelect)
    })

    it("adopts the create trigger's generated info into the still-open draft once save() resolves", async () => {
      // Regression check: save()'s create branch must refresh draftBaseline
      // too, or this effect never fires again after the very save that made
      // it relevant -- the sole path AI generation runs on automatically.
      const medications$ = new BehaviorSubject<Medication[]>([
        aspirin,
        ibuprofen,
      ])
      const fixture = setup(medications$)
      const component = fixture.componentInstance
      component.startAdd()
      if (!component.draft) {
        throw new Error('expected startAdd() to set a draft')
      }
      component.draft.commonName = 'Vitamin D3'
      component.draft.dose = '2000IU'
      component.draft.category = 'Supplements'
      component.draft.intervalDays = 60

      await component.save()
      expect(component.selectedId()).toBe('vitamin-d3')

      // The create trigger finishes and writes the generated info back.
      medications$.next([
        aspirin,
        ibuprofen,
        {
          id: 'vitamin-d3',
          commonName: 'Vitamin D3',
          dose: '2000IU',
          category: 'Supplements',
          intervalDays: 60,
          purpose: 'Supports bone health',
          instructions: 'Take with a meal',
          infoStatus: 'ready',
        },
      ])
      await fixture.whenStable()

      expect(component.draft?.purpose).toBe('Supports bone health')
      expect(component.draft?.infoStatus).toBe('ready')
    })

    it('adopts a later external write (e.g. Regenerate finishing) after an unrelated save()', async () => {
      // Regression check: save()'s update branch must refresh draftBaseline
      // too, or the reconcile effect stays permanently disabled after the
      // first edit -- Regenerate's write-back would never appear.
      const medications$ = new BehaviorSubject<Medication[]>([
        aspirin,
        ibuprofen,
      ])
      const fixture = setup(medications$)
      const component = fixture.componentInstance
      component.select('aspirin')
      if (!component.draft) {
        throw new Error('expected select() to set a draft')
      }
      component.draft.dose = '162mg'

      await component.save()

      medications$.next([
        {
          ...aspirin,
          dose: '162mg',
          purpose: 'Pain relief',
          infoStatus: 'ready',
        },
        ibuprofen,
      ])
      await fixture.whenStable()

      expect(component.draft?.purpose).toBe('Pain relief')
    })
  })

  describe('regenerateInfo', () => {
    it('calls regenerateInfoOnDemand for the selected medication and tracks in-flight state', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      let resolveRegenerate: () => void = () => {
        throw new Error('regenerateInfoOnDemand was not called')
      }
      regenerateInfoOnDemandSpy.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveRegenerate = resolve
        }),
      )

      const regeneratePromise = component.regenerateInfo()
      expect(component.isRegenerating()).toBe(true)

      resolveRegenerate()
      await regeneratePromise

      expect(regenerateInfoOnDemandSpy).toHaveBeenCalledWith('aspirin')
      expect(component.isRegenerating()).toBe(false)
    })

    it('sets an error when regenerateInfoOnDemand rejects', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      regenerateInfoOnDemandSpy.mockRejectedValue(new Error('boom'))

      await component.regenerateInfo()

      expect(component.error()).toBeTruthy()
      expect(component.isRegenerating()).toBe(false)
    })

    it('does nothing when nothing is selected', async () => {
      const fixture = setup()
      await fixture.componentInstance.regenerateInfo()
      expect(regenerateInfoOnDemandSpy).not.toHaveBeenCalled()
    })

    it('does nothing while generation is already pending on the medication', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.select('aspirin')
      if (!component.draft) {
        throw new Error('expected select() to set a draft')
      }
      component.draft.infoStatus = 'pending'

      await component.regenerateInfo()

      expect(regenerateInfoOnDemandSpy).not.toHaveBeenCalled()
    })
  })

  describe('medicationFindingGroups', () => {
    function reportWith(
      status: InteractionReport['status'],
      findings: InteractionReport['findings'] = [],
    ): InteractionReport {
      return {
        status,
        findings,
        generatedFor: ['aspirin', 'ibuprofen'],
        inputFingerprint: '',
        patientProfileUpdatedAt: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }
    }

    it('is empty when nothing is selected', () => {
      const fixture = setup()
      expect(fixture.componentInstance.medicationFindingGroups()).toEqual([])
    })

    it('is empty while the report is not ready', () => {
      const report$ = new BehaviorSubject<InteractionReport | undefined>(
        reportWith('pending'),
      )
      const fixture = setup(undefined, report$)
      fixture.componentInstance.select('aspirin')
      expect(fixture.componentInstance.medicationFindingGroups()).toEqual([])
    })

    it('shows only findings that mention the selected medication', () => {
      const report$ = new BehaviorSubject<InteractionReport | undefined>(
        reportWith('ready', [
          {
            type: 'caveat',
            severity: 'minor',
            medicationIds: ['aspirin'],
            detail: 'take with food',
          },
          {
            type: 'caveat',
            severity: 'minor',
            medicationIds: ['ibuprofen'],
            detail: 'unrelated',
          },
        ]),
      )
      const fixture = setup(undefined, report$)
      fixture.componentInstance.select('aspirin')

      const groups = fixture.componentInstance.medicationFindingGroups()
      expect(groups).toHaveLength(1)
      expect(groups[0].findings[0].detail).toBe('take with food')
    })

    it('excludes drug-drug/condition/allergy findings even when they mention the selected medication', () => {
      const report$ = new BehaviorSubject<InteractionReport | undefined>(
        reportWith('ready', [
          {
            type: 'drug-drug',
            severity: 'major',
            medicationIds: ['aspirin', 'ibuprofen'],
            detail: 'increased bleeding risk',
          },
          {
            type: 'caveat',
            severity: 'minor',
            medicationIds: ['aspirin'],
            detail: 'take with food',
          },
        ]),
      )
      const fixture = setup(undefined, report$)
      fixture.componentInstance.select('aspirin')

      const groups = fixture.componentInstance.medicationFindingGroups()
      expect(groups).toHaveLength(1)
      expect(groups[0].type).toBe('caveat')
      expect(groups[0].findings[0].detail).toBe('take with food')
    })
  })

  describe('onCategorySelect', () => {
    it('treats a real category literally named "__new__" as a normal category, not the sentinel', () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.startAdd()

      component.onCategorySelect(categoryOptionValue('__new__'))

      expect(component.isNewCategory).toBe(false)
      expect(component.draft?.category).toBe('__new__')
    })

    it('still recognizes the "Add new category…" sentinel', () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.startAdd()

      component.onCategorySelect(NEW_CATEGORY_OPTION)

      expect(component.isNewCategory).toBe(true)
      expect(component.draft?.category).toBe('')
    })
  })

  describe('cross-tab selection hydration (SelectedMedicationService)', () => {
    /** Mirrors setup() above, but seeds SelectedMedicationService before the
     * component is created -- simulating a selection already made on the
     * Interactions page's filter before this page was ever mounted (the two
     * pages share one instance -- see TODO.md #6). */
    function setupWithPreselectedId(id: string | null) {
      createSpy = jest.fn().mockResolvedValue(undefined)
      updateSpy = jest.fn().mockResolvedValue(undefined)
      deleteSpy = jest.fn().mockResolvedValue(undefined)
      regenerateInfoOnDemandSpy = jest.fn().mockResolvedValue(undefined)
      TestBed.configureTestingModule({
        imports: [MedicationsComponent],
        providers: [
          {
            provide: MedicationService,
            useValue: {
              all$: new BehaviorSubject([aspirin, ibuprofen]),
              create: createSpy,
              update: updateSpy,
              delete: deleteSpy,
              regenerateInfoOnDemand: regenerateInfoOnDemandSpy,
            },
          },
          {
            provide: InteractionReportService,
            useValue: {
              report$: new BehaviorSubject<InteractionReport | undefined>(
                undefined,
              ),
            },
          },
        ],
      })
      TestBed.inject(SelectedMedicationService).selectedId.set(id)
      const fixture = TestBed.createComponent(MedicationsComponent)
      fixture.detectChanges()
      return fixture
    }

    it('loads the draft from a selection already made on the Interactions page', () => {
      const component = setupWithPreselectedId('ibuprofen').componentInstance

      expect(component.selectedId()).toBe('ibuprofen')
      expect(component.draft?.commonName).toBe('Ibuprofen')
    })

    it('resets the shared selection to null if the preselected medication no longer exists', () => {
      const component =
        setupWithPreselectedId('acetaminophen').componentInstance

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
      // shape on a snapshot that genuinely arrives asynchronously, rather
      // than one already present by construction time.
      createSpy = jest.fn().mockResolvedValue(undefined)
      updateSpy = jest.fn().mockResolvedValue(undefined)
      deleteSpy = jest.fn().mockResolvedValue(undefined)
      regenerateInfoOnDemandSpy = jest.fn().mockResolvedValue(undefined)
      const source = new Subject<Medication[]>()
      TestBed.configureTestingModule({
        imports: [MedicationsComponent],
        providers: [
          {
            provide: MedicationService,
            useValue: {
              all$: source,
              create: createSpy,
              update: updateSpy,
              delete: deleteSpy,
              regenerateInfoOnDemand: regenerateInfoOnDemandSpy,
            },
          },
          {
            provide: InteractionReportService,
            useValue: {
              report$: new BehaviorSubject<InteractionReport | undefined>(
                undefined,
              ),
            },
          },
        ],
      })
      TestBed.inject(SelectedMedicationService).selectedId.set('ibuprofen')
      const fixture = TestBed.createComponent(MedicationsComponent)
      fixture.detectChanges()

      source.next([aspirin, ibuprofen])
      await fixture.whenStable()

      expect(fixture.componentInstance.draft?.commonName).toBe('Ibuprofen')
    })
  })

  describe('categoryOptionValue', () => {
    it("maps a blank category to the disabled placeholder's own value, not a prefixed empty string", () => {
      expect(categoryOptionValue('')).toBe('')
    })

    it('prefixes a real category so it can never equal NEW_CATEGORY_OPTION', () => {
      expect(categoryOptionValue('Heart')).not.toBe(NEW_CATEGORY_OPTION)
      expect(categoryOptionValue('__new__')).not.toBe(NEW_CATEGORY_OPTION)
    })
  })
})
