import { TestBed } from '@angular/core/testing'
import { Firestore } from '@angular/fire/firestore'
import * as firestoreFns from '@angular/fire/firestore'
import { of } from 'rxjs'
import { InteractionReportService } from './interaction-report.service'

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(() => 'doc-ref'),
  docData: jest.fn(() => of(undefined)),
}))

describe('InteractionReportService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    TestBed.configureTestingModule({
      providers: [{ provide: Firestore, useValue: {} }],
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
})
