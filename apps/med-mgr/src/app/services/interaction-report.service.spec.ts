import { TestBed } from '@angular/core/testing'
import { Firestore } from '@angular/fire/firestore'
import * as firestoreFns from '@angular/fire/firestore'
import { Functions } from '@angular/fire/functions'
import * as functionsFns from '@angular/fire/functions'
import { of } from 'rxjs'
import { InteractionReportService } from './interaction-report.service'

const callableMock = jest.fn().mockResolvedValue({ data: { ok: true } })

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(() => 'doc-ref'),
  docData: jest.fn(() => of(undefined)),
}))

jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: jest.fn(() => callableMock),
}))

describe('InteractionReportService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    TestBed.configureTestingModule({
      providers: [
        { provide: Firestore, useValue: {} },
        { provide: Functions, useValue: {} },
      ],
    })
  })

  it('reads the current report from the singleton doc', () => {
    TestBed.inject(InteractionReportService)

    expect(firestoreFns.doc).toHaveBeenCalledWith(
      {},
      'interactionReports',
      'current',
    )
    expect(firestoreFns.docData).toHaveBeenCalledWith('doc-ref')
  })

  it('calls the on-demand regeneration function', async () => {
    const service = TestBed.inject(InteractionReportService)

    await service.regenerateOnDemand()

    expect(functionsFns.httpsCallable).toHaveBeenCalledWith(
      {},
      'regenerateInteractionReportOnDemand',
    )
    expect(callableMock).toHaveBeenCalledWith({})
  })
})
