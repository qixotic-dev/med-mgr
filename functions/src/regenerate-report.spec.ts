import { getFirestore } from 'firebase-admin/firestore'
import { requestFindings } from './claude'
import { regenerateInteractionReport } from './regenerate-report'

jest.mock('firebase-admin/firestore')
jest.mock('./claude')

describe('regenerateInteractionReport', () => {
  const setMock = jest.fn().mockResolvedValue(undefined)
  const reportRef = { set: setMock }
  const medicationsGetMock = jest.fn()
  const patientGetMock = jest.fn()

  const dbMock = {
    doc: jest.fn((path: string) => {
      if (path === 'interactionReports/current') return reportRef
      if (path === 'patients/me') return { get: patientGetMock }
      throw new Error(`unexpected doc path ${path}`)
    }),
    collection: jest.fn(() => ({ get: medicationsGetMock })),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    setMock.mockResolvedValue(undefined)
    ;(getFirestore as jest.Mock).mockReturnValue(dbMock)
  })

  function medicationDoc(id: string, name: string, dose: string) {
    return {
      id,
      get: (field: string) =>
        (({ name, dose }) as Record<string, string>)[field],
    }
  }

  it('writes an empty ready report and skips the Claude call when there are no medications', async () => {
    medicationsGetMock.mockResolvedValue({ docs: [] })

    await regenerateInteractionReport('test-key')

    expect(setMock).toHaveBeenNthCalledWith(
      1,
      { status: 'pending' },
      { merge: true },
    )
    expect(setMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'ready',
        findings: [],
        generatedFor: [],
        patientProfileUpdatedAt: null,
      }),
      { merge: true },
    )
    expect(requestFindings).not.toHaveBeenCalled()
  })

  it('writes a ready report with sorted generatedFor on success', async () => {
    medicationsGetMock.mockResolvedValue({
      docs: [
        medicationDoc('ibuprofen', 'Ibuprofen', '200mg'),
        medicationDoc('aspirin', 'Aspirin', '81mg'),
      ],
    })
    patientGetMock.mockResolvedValue({ exists: false, updateTime: undefined })
    const findings = [
      {
        type: 'drug-drug',
        severity: 'moderate',
        medicationIds: ['aspirin', 'ibuprofen'],
        detail: 'increased bleeding risk',
      },
    ]
    ;(requestFindings as jest.Mock).mockResolvedValue(findings)

    await regenerateInteractionReport('test-key')

    expect(setMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'ready',
        findings,
        generatedFor: ['aspirin', 'ibuprofen'],
        patientProfileUpdatedAt: null,
      }),
      { merge: true },
    )
  })

  it('writes an error status without touching prior findings when the Claude call fails', async () => {
    medicationsGetMock.mockResolvedValue({
      docs: [medicationDoc('aspirin', 'Aspirin', '81mg')],
    })
    patientGetMock.mockResolvedValue({ exists: false, updateTime: undefined })
    ;(requestFindings as jest.Mock).mockRejectedValue(new Error('boom'))

    await regenerateInteractionReport('test-key')

    expect(setMock).toHaveBeenLastCalledWith(
      { status: 'error', error: 'boom' },
      { merge: true },
    )
  })
})
