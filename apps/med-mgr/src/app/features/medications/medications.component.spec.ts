import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, Observable, Subject } from 'rxjs'
import { MedicationService } from '../../services/medication.service'
import type { Medication } from '../../models/medication.model'
import {
  categoryOptionValue,
  groupByCategory,
  MedicationsComponent,
  NEW_CATEGORY_OPTION,
} from './medications.component'

describe('MedicationsComponent', () => {
  const aspirin: Medication = {
    id: 'aspirin',
    name: 'Aspirin',
    dose: '81mg',
    category: 'Heart',
    intervalDays: 90,
  }
  const ibuprofen: Medication = {
    id: 'ibuprofen',
    name: 'Ibuprofen',
    dose: '200mg',
    category: 'Pain',
    intervalDays: 30,
  }

  let createSpy: jest.Mock
  let updateSpy: jest.Mock
  let deleteSpy: jest.Mock

  function setup(
    source: Observable<Medication[]> = new BehaviorSubject([
      aspirin,
      ibuprofen,
    ]),
  ) {
    createSpy = jest.fn().mockResolvedValue(undefined)
    updateSpy = jest.fn().mockResolvedValue(undefined)
    deleteSpy = jest.fn().mockResolvedValue(undefined)
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
          },
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
      component.draft.name = 'New Med'
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
      component.draft.name = 'New Med'
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
        name: 'Ibuprofen',
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
      expect(component.draft?.name).toBe('')
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
        name: 'Aspirin',
        dose: '162mg',
        category: 'Heart',
        intervalDays: 90,
      })
      expect(createSpy).not.toHaveBeenCalled()
    })

    it('slugifies the name and calls create() for a new medication', async () => {
      const fixture = setup()
      const component = fixture.componentInstance
      component.startAdd()
      if (!component.draft) {
        throw new Error('expected startAdd() to set a draft')
      }
      component.draft.name = 'Vitamin D3'
      component.draft.dose = '2000IU'
      component.draft.category = 'Supplements'
      component.draft.intervalDays = 60

      await component.save()

      expect(createSpy).toHaveBeenCalledWith('vitamin-d3', {
        name: 'Vitamin D3',
        dose: '2000IU',
        category: 'Supplements',
        intervalDays: 60,
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
      component.draft.name = 'Aspirin'
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
      component.draft.name = '***'
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
      component.draft.name = 'Vitamin D3'
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
      component.draft.name = 'Vitamin D3'
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
