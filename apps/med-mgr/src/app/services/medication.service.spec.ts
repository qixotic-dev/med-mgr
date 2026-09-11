import { TestBed } from '@angular/core/testing'
import { Firestore } from '@angular/fire/firestore'
import * as firestoreFns from '@angular/fire/firestore'
import { of } from 'rxjs'
import { MedicationService } from './medication.service'

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  collection: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  collectionData: jest.fn(() => of([])),
  doc: jest.fn(() => 'doc-ref'),
  setDoc: jest.fn().mockResolvedValue(undefined),
  updateDoc: jest.fn().mockResolvedValue(undefined),
  writeBatch: jest.fn(),
}))

describe('MedicationService', () => {
  let service: MedicationService

  beforeEach(() => {
    jest.clearAllMocks()
    TestBed.configureTestingModule({
      providers: [{ provide: Firestore, useValue: {} }],
    })
    service = TestBed.inject(MedicationService)
  })

  it('create() writes exactly the data fields under the given id — no id key in the payload', async () => {
    await service.create('ibuprofen', {
      name: 'Ibuprofen',
      dose: '200mg',
      category: 'Pain',
      intervalDays: 30,
    })

    expect(firestoreFns.doc).toHaveBeenCalledWith(
      {},
      'medications',
      'ibuprofen',
    )
    expect(firestoreFns.setDoc).toHaveBeenCalledWith('doc-ref', {
      name: 'Ibuprofen',
      dose: '200mg',
      category: 'Pain',
      intervalDays: 30,
    })
  })

  it('update() sends only the changed fields via updateDoc', async () => {
    await service.update('aspirin', { intervalDays: 45 })

    expect(firestoreFns.doc).toHaveBeenCalledWith({}, 'medications', 'aspirin')
    expect(firestoreFns.updateDoc).toHaveBeenCalledWith('doc-ref', {
      intervalDays: 45,
    })
  })

  it('delete() deletes the medication and its prescription in one batch', async () => {
    const batchDeleteSpy = jest.fn()
    const batchCommitSpy = jest.fn().mockResolvedValue(undefined)
    ;(firestoreFns.writeBatch as jest.Mock).mockReturnValue({
      delete: batchDeleteSpy,
      commit: batchCommitSpy,
    })
    ;(firestoreFns.doc as jest.Mock)
      .mockReturnValueOnce('med-ref')
      .mockReturnValueOnce('rx-ref')

    await service.delete('aspirin')

    expect(firestoreFns.doc).toHaveBeenCalledWith({}, 'medications', 'aspirin')
    expect(firestoreFns.doc).toHaveBeenCalledWith(
      {},
      'prescriptions',
      'aspirin',
    )
    expect(batchDeleteSpy).toHaveBeenNthCalledWith(1, 'med-ref')
    expect(batchDeleteSpy).toHaveBeenNthCalledWith(2, 'rx-ref')
    expect(batchCommitSpy).toHaveBeenCalledTimes(1)
  })
})
