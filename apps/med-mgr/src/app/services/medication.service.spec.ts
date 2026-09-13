import { TestBed } from '@angular/core/testing'
import { Firestore } from '@angular/fire/firestore'
import * as firestoreFns from '@angular/fire/firestore'
import { Functions } from '@angular/fire/functions'
import * as functionsFns from '@angular/fire/functions'
import { MedicationService } from './medication.service'

// Named with the `mock` prefix so jest's module-factory hoisting allows
// referencing it from inside jest.mock() below.
const mockCollectionDataSourceSubscribeSpy = jest.fn()

jest.mock('@angular/fire/firestore', () => {
  // require(), not a top-level import, so the source stays a real
  // Observable -- all$'s shareReplay (see medication.service.ts) needs a
  // genuine Observable to .pipe() off of, not a plain object. A never-
  // completing source (like a real Firestore listener) so the "does a
  // second concurrent subscriber reuse the first's connection" test below
  // is meaningful -- collectionData mocked with an already-completed `of()`
  // would trivially "share" via replay alone, without proving concurrent
  // subscribers share one listener.
  const { Observable } = require('rxjs')
  return {
    Firestore: class Firestore {},
    collection: jest.fn(),
    query: jest.fn(),
    orderBy: jest.fn(),
    collectionData: jest.fn(
      () =>
        new Observable((subscriber: { next: (value: unknown[]) => void }) => {
          mockCollectionDataSourceSubscribeSpy()
          subscriber.next([])
        }),
    ),
    doc: jest.fn(() => 'doc-ref'),
    setDoc: jest.fn().mockResolvedValue(undefined),
    updateDoc: jest.fn().mockResolvedValue(undefined),
    deleteField: jest.fn(() => 'DELETE_FIELD_SENTINEL'),
    writeBatch: jest.fn(),
  }
})

const callableMock = jest.fn().mockResolvedValue(undefined)

jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: jest.fn(() => callableMock),
}))

describe('MedicationService', () => {
  let service: MedicationService

  beforeEach(() => {
    jest.clearAllMocks()
    callableMock.mockResolvedValue(undefined)
    TestBed.configureTestingModule({
      providers: [
        { provide: Firestore, useValue: {} },
        { provide: Functions, useValue: {} },
      ],
    })
    service = TestBed.inject(MedicationService)
  })

  it('create() writes exactly the data fields under the given id — no id key in the payload', async () => {
    await service.create('ibuprofen', {
      commonName: 'Ibuprofen',
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
      commonName: 'Ibuprofen',
      dose: '200mg',
      category: 'Pain',
      intervalDays: 30,
    })
  })

  it('create() strips undefined-valued fields before writing (e.g. an unset clinicalName/infoStatus)', async () => {
    await service.create('ibuprofen', {
      commonName: 'Ibuprofen',
      clinicalName: undefined,
      dose: '200mg',
      category: 'Pain',
      intervalDays: 30,
      purpose: undefined,
      instructions: undefined,
      infoStatus: undefined,
    })

    expect(firestoreFns.setDoc).toHaveBeenCalledWith('doc-ref', {
      commonName: 'Ibuprofen',
      dose: '200mg',
      category: 'Pain',
      intervalDays: 30,
    })
  })

  it('regenerateInfoOnDemand() calls the callable with the medication id', async () => {
    await service.regenerateInfoOnDemand('aspirin')

    expect(functionsFns.httpsCallable).toHaveBeenCalledWith(
      {},
      'regenerateMedicationInfoOnDemand',
    )
    expect(callableMock).toHaveBeenCalledWith({ medicationId: 'aspirin' })
  })

  it('update() sends only the changed fields via updateDoc', async () => {
    await service.update('aspirin', { intervalDays: 45 })

    expect(firestoreFns.doc).toHaveBeenCalledWith({}, 'medications', 'aspirin')
    expect(firestoreFns.updateDoc).toHaveBeenCalledWith('doc-ref', {
      intervalDays: 45,
    })
  })

  it('update() translates an explicit undefined into deleteField() (e.g. clearing a stale infoError)', async () => {
    await service.update('aspirin', {
      infoStatus: 'ready',
      infoError: undefined,
    })

    expect(firestoreFns.updateDoc).toHaveBeenCalledWith('doc-ref', {
      infoStatus: 'ready',
      infoError: 'DELETE_FIELD_SENTINEL',
    })
  })

  it('all$ shares one underlying Firestore listener across concurrent subscribers', () => {
    // Regression test for the Copilot review finding on PR #18: all$ is now
    // subscribed by up to three places at once (whichever route component
    // is active, plus SelectedMedicationBarComponent, mounted for the whole
    // authenticated session -- see TODO.md #7). Without shareReplay, each
    // concurrent subscriber would open its own Firestore listener against
    // the same query.
    const sub1 = service.all$.subscribe()
    const sub2 = service.all$.subscribe()

    expect(mockCollectionDataSourceSubscribeSpy).toHaveBeenCalledTimes(1)

    sub1.unsubscribe()
    sub2.unsubscribe()

    // Once every subscriber unsubscribes, refCount tears the shared listener
    // down -- a later subscriber reopens it rather than leaking it for the
    // app's lifetime.
    service.all$.subscribe().unsubscribe()
    expect(mockCollectionDataSourceSubscribeSpy).toHaveBeenCalledTimes(2)
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
