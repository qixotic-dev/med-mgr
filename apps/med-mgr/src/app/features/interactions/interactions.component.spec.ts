import type { Medication } from '../../models/medication.model'
import type { InteractionReport } from '../../models/interaction-report.model'
import {
  fromDraft,
  groupFindings,
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
      name: 'Aspirin',
      dose: '81mg',
      category: 'Heart',
      intervalDays: 30,
    },
    {
      id: 'ibuprofen',
      name: 'Ibuprofen',
      dose: '200mg',
      category: 'Pain',
      intervalDays: 30,
    },
  ]

  function reportWith(generatedFor: string[]): InteractionReport {
    return {
      status: 'ready',
      findings: [],
      generatedFor,
      patientProfileUpdatedAt: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
  }

  it('is false when there is no report yet', () => {
    expect(isReportStale(undefined, medications)).toBe(false)
  })

  it('is true when generatedFor does not match the current medication ids', () => {
    expect(isReportStale(reportWith(['aspirin']), medications)).toBe(true)
  })

  it('is false when generatedFor matches the current medication ids regardless of order', () => {
    expect(
      isReportStale(reportWith(['ibuprofen', 'aspirin']), medications),
    ).toBe(false)
  })
})

describe('groupFindings', () => {
  const medications: Medication[] = [
    {
      id: 'aspirin',
      name: 'Aspirin',
      dose: '81mg',
      category: 'Heart',
      intervalDays: 30,
    },
    {
      id: 'ibuprofen',
      name: 'Ibuprofen',
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
