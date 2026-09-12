import { TestBed } from '@angular/core/testing'
import { Firestore } from '@angular/fire/firestore'
import * as firestoreFns from '@angular/fire/firestore'
import { of } from 'rxjs'
import { PatientService } from './patient.service'

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(() => 'doc-ref'),
  docData: jest.fn(() => of(undefined)),
  setDoc: jest.fn().mockResolvedValue(undefined),
}))

describe('PatientService', () => {
  let service: PatientService

  beforeEach(() => {
    jest.clearAllMocks()
    TestBed.configureTestingModule({
      providers: [{ provide: Firestore, useValue: {} }],
    })
    service = TestBed.inject(PatientService)
  })

  it('reads the profile from the singleton doc', () => {
    expect(firestoreFns.doc).toHaveBeenCalledWith({}, 'patients', 'me')
    expect(firestoreFns.docData).toHaveBeenCalledWith('doc-ref')
  })

  it('save() writes the full profile under the singleton doc id', async () => {
    await service.save({
      birthdate: '1980-01-01',
      sex: 'female',
      allergies: ['penicillin'],
      conditions: ['kidney disease'],
      weight: '160 lbs',
    })

    expect(firestoreFns.doc).toHaveBeenCalledWith({}, 'patients', 'me')
    expect(firestoreFns.setDoc).toHaveBeenCalledWith('doc-ref', {
      birthdate: '1980-01-01',
      sex: 'female',
      allergies: ['penicillin'],
      conditions: ['kidney disease'],
      weight: '160 lbs',
    })
  })
})
