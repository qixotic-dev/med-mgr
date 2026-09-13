import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, Subject } from 'rxjs'
import { MedicationService } from '../../services/medication.service'
import { PatientService } from '../../services/patient.service'
import { InteractionReportService } from '../../services/interaction-report.service'
import { SelectedMedicationService } from '../../services/selected-medication.service'
import type { Medication } from '../../models/medication.model'
import type {
  Finding,
  InteractionReport,
} from '../../models/interaction-report.model'
import type { Patient } from '../../models/patient.model'
import {
  buildReportInputFingerprint,
  filterFindingsByMedication,
  fromDraft,
  groupFindings,
  InteractionsComponent,
  isReportStale,
  toDraft,
} from './interactions.component'

describe('toDraft/fromDraft', () => {
  it('toDraft() returns an empty draft when there is no patient yet', () => {
    expect(toDraft(undefined)).toEqual({
      birthdate: '',
      sex: '',
      allergiesText: '',
      conditionsText: '',
      weight: '',
    })
  })

  it('toDraft() joins list fields with ", " for editing', () => {
    expect(
      toDraft({
        birthdate: '1980-01-01',
        sex: 'female',
        allergies: ['penicillin', 'sulfa'],
        conditions: ['kidney disease'],
        weight: '160 lbs',
      }),
    ).toEqual({
      birthdate: '1980-01-01',
      sex: 'female',
      allergiesText: 'penicillin, sulfa',
      conditionsText: 'kidney disease',
      weight: '160 lbs',
    })
  })

  it('fromDraft() splits and trims comma-separated list fields, dropping blanks', () => {
    expect(
      fromDraft({
        birthdate: '1980-01-01',
        sex: 'female',
        allergiesText: ' penicillin ,  , sulfa',
        conditionsText: '',
        weight: '160 lbs',
      }),
    ).toEqual({
      birthdate: '1980-01-01',
      sex: 'female',
      allergies: ['penicillin', 'sulfa'],
      conditions: [],
      weight: '160 lbs',
    })
  })
})

describe('isReportStale', () => {
  const medications: Medication[] = [
    {
      id: 'aspirin',
      commonName: 'Aspirin',
      dose: '81mg',
      category: 'Heart',
      intervalDays: 30,
    },
    {
      id: 'ibuprofen',
      commonName: 'Ibuprofen',
      dose: '200mg',
      category: 'Pain',
      intervalDays: 30,
    },
  ]
  const patient: Patient = {
    birthdate: '1980-01-01',
    sex: 'female',
    allergies: ['penicillin'],
    conditions: ['kidney disease'],
    weight: '160 lbs',
  }

  function reportWith(
    generatedFor: string[],
    inputFingerprint = buildReportInputFingerprint(medications, patient),
  ): InteractionReport {
    return {
      status: 'ready',
      findings: [],
      generatedFor,
      inputFingerprint,
      patientProfileUpdatedAt: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
  }

  it('is false when there is no report yet', () => {
    expect(isReportStale(undefined, medications, patient)).toBe(false)
  })

  it('is true for a legacy report without an input fingerprint', () => {
    const legacyReport = {
      ...reportWith(['aspirin', 'ibuprofen']),
      inputFingerprint: undefined,
    } as unknown as InteractionReport

    expect(isReportStale(legacyReport, medications, patient)).toBe(true)
  })

  it('is false when the current inputs match regardless of medication order', () => {
    expect(
      isReportStale(reportWith(['ibuprofen', 'aspirin']), medications, patient),
    ).toBe(false)
  })

  it('is true when a medication changes but the ids stay the same', () => {
    const editedMedications = medications.map((medication) =>
      medication.id === 'aspirin'
        ? { ...medication, dose: '325mg' }
        : medication,
    )

    expect(
      isReportStale(
        reportWith(['ibuprofen', 'aspirin']),
        editedMedications,
        patient,
      ),
    ).toBe(true)
  })

  it('is true when only a clinical name changes', () => {
    const editedMedications = medications.map((medication) =>
      medication.id === 'aspirin'
        ? { ...medication, clinicalName: 'Acetylsalicylic acid' }
        : medication,
    )

    expect(
      isReportStale(
        reportWith(['ibuprofen', 'aspirin']),
        editedMedications,
        patient,
      ),
    ).toBe(true)
  })

  it('is true when the patient profile changes', () => {
    expect(
      isReportStale(reportWith(['ibuprofen', 'aspirin']), medications, {
        ...patient,
        weight: '170 lbs',
      }),
    ).toBe(true)
  })
})

describe('groupFindings', () => {
  const medications: Medication[] = [
    {
      id: 'aspirin',
      commonName: 'Aspirin',
      dose: '81mg',
      category: 'Heart',
      intervalDays: 30,
    },
    {
      id: 'ibuprofen',
      commonName: 'Ibuprofen',
      dose: '200mg',
      category: 'Pain',
      intervalDays: 30,
    },
  ]

  it('groups by type in a fixed order, resolves medication names, and drops empty groups', () => {
    const groups = groupFindings(
      [
        {
          type: 'caveat',
          severity: 'minor',
          medicationIds: ['aspirin'],
          detail: 'take with food',
        },
        {
          type: 'drug-drug',
          severity: 'moderate',
          medicationIds: ['aspirin', 'ibuprofen'],
          detail: 'increased bleeding risk',
        },
      ],
      medications,
    )

    expect(groups.map((g) => g.type)).toEqual(['drug-drug', 'caveat'])
    expect(groups[0].findings[0].medicationNames).toEqual([
      'Aspirin',
      'Ibuprofen',
    ])
  })

  it('falls back to the raw id when a medication is no longer in the list', () => {
    const groups = groupFindings(
      [
        {
          type: 'caveat',
          severity: 'minor',
          medicationIds: ['deleted-med'],
          detail: 'x',
        },
      ],
      medications,
    )

    expect(groups[0].findings[0].medicationNames).toEqual(['deleted-med'])
  })
})

describe('filterFindingsByMedication', () => {
  const findings: Finding[] = [
    {
      type: 'caveat',
      severity: 'minor',
      medicationIds: ['aspirin'],
      detail: 'take with food',
    },
    {
      type: 'drug-drug',
      severity: 'moderate',
      medicationIds: ['aspirin', 'ibuprofen'],
      detail: 'increased bleeding risk',
    },
    {
      type: 'caveat',
      severity: 'minor',
      medicationIds: ['ibuprofen'],
      detail: 'take with water',
    },
  ]

  it('returns every finding, unfiltered, when medicationId is null', () => {
    expect(filterFindingsByMedication(findings, null)).toEqual(findings)
  })

  it('keeps only findings that mention the given medication id, across all types', () => {
    expect(filterFindingsByMedication(findings, 'aspirin')).toEqual([
      findings[0],
      findings[1],
    ])
  })

  it('returns an empty array when no finding mentions the medication', () => {
    expect(filterFindingsByMedication(findings, 'acetaminophen')).toEqual([])
  })
})

describe('InteractionsComponent', () => {
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

  function setup(
    medications$: BehaviorSubject<Medication[]> = new BehaviorSubject([
      aspirin,
      ibuprofen,
    ]),
  ) {
    TestBed.configureTestingModule({
      imports: [InteractionsComponent],
      providers: [
        { provide: MedicationService, useValue: { all$: medications$ } },
        {
          provide: PatientService,
          useValue: {
            patient$: new BehaviorSubject<Patient | undefined>(undefined),
          },
        },
        {
          provide: InteractionReportService,
          useValue: {
            report$: new BehaviorSubject<InteractionReport | undefined>(
              undefined,
            ),
            regenerateOnDemand: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    })
    const fixture = TestBed.createComponent(InteractionsComponent)
    fixture.detectChanges()
    return { fixture, medications$ }
  }

  describe('medication filter reconcile effect', () => {
    it('resets the filter to "All medications" if the selected medication is deleted', async () => {
      const { fixture, medications$ } = setup()
      const component = fixture.componentInstance
      component.selectedMedicationId.set('aspirin')

      medications$.next([ibuprofen])
      await fixture.whenStable()

      expect(component.selectedMedicationId()).toBeNull()
    })

    it('leaves the filter alone while the selected medication still exists', async () => {
      const { fixture, medications$ } = setup()
      const component = fixture.componentInstance
      component.selectedMedicationId.set('aspirin')

      medications$.next([aspirin, ibuprofen])
      await fixture.whenStable()

      expect(component.selectedMedicationId()).toBe('aspirin')
    })

    it('does nothing when no filter is selected', async () => {
      const { fixture, medications$ } = setup()
      const component = fixture.componentInstance

      medications$.next([ibuprofen])
      await fixture.whenStable()

      expect(component.selectedMedicationId()).toBeNull()
    })
  })

  describe('cross-tab selection (SelectedMedicationService)', () => {
    it('reflects a selection already made on the Medications page', () => {
      const { fixture } = setup()

      TestBed.inject(SelectedMedicationService).selectedId.set('aspirin')

      expect(fixture.componentInstance.selectedMedicationId()).toBe('aspirin')
    })

    it('changing the filter here is visible to the Medications page', () => {
      const { fixture } = setup()

      fixture.componentInstance.selectedMedicationId.set('ibuprofen')

      expect(TestBed.inject(SelectedMedicationService).selectedId()).toBe(
        'ibuprofen',
      )
    })

    it('does not clear a preselected id before this page\'s own first medications snapshot arrives', async () => {
      // A bare Subject never emits an initial value (unlike the
      // BehaviorSubject setup() above uses), mirroring Firestore's
      // collectionData(): medications() starts at its toSignal initialValue
      // ([]) before the real snapshot lands. A selection made on the
      // Medications page before this page ever mounted (SelectedMedicationService
      // is shared -- see TODO.md #6) must survive that window, not get read
      // as "deleted" just because it isn't in an empty placeholder list yet.
      const source = new Subject<Medication[]>()
      TestBed.configureTestingModule({
        imports: [InteractionsComponent],
        providers: [
          { provide: MedicationService, useValue: { all$: source } },
          {
            provide: PatientService,
            useValue: {
              patient$: new BehaviorSubject<Patient | undefined>(undefined),
            },
          },
          {
            provide: InteractionReportService,
            useValue: {
              report$: new BehaviorSubject<InteractionReport | undefined>(
                undefined,
              ),
              regenerateOnDemand: jest.fn().mockResolvedValue(undefined),
            },
          },
        ],
      })
      TestBed.inject(SelectedMedicationService).selectedId.set('aspirin')
      const fixture = TestBed.createComponent(InteractionsComponent)
      fixture.detectChanges()

      expect(fixture.componentInstance.selectedMedicationId()).toBe('aspirin')

      source.next([aspirin, ibuprofen])
      await fixture.whenStable()

      expect(fixture.componentInstance.selectedMedicationId()).toBe('aspirin')
    })
  })
})
