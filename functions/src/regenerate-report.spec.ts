import { getFirestore } from 'firebase-admin/firestore'
import { requestFindings } from './claude'
import { regenerateInteractionReport } from './regenerate-report'

jest.mock('firebase-admin/firestore')
jest.mock('./claude')

describe('regenerateInteractionReport', () => {
  const setMock = jest.fn().mockResolvedValue(undefined)
  const reportGetMock = jest.fn()
  const reportRef = { get: reportGetMock, set: setMock }
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
    reportGetMock.mockResolvedValue({ data: () => undefined })
    patientGetMock.mockResolvedValue({ exists: false, updateTime: undefined })
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

    await regenerateInteractionReport('test-key', 'claude-sonnet-4-5')

    expect(setMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: 'pending',
        findings: [],
        generatedFor: [],
      }),
    )
    expect(setMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'ready',
        findings: [],
        generatedFor: [],
        patientProfileUpdatedAt: null,
      }),
    )
    expect(requestFindings).not.toHaveBeenCalled()
  })

  it('writes a ready report with sorted generatedFor and an input fingerprint on success', async () => {
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

    await regenerateInteractionReport('test-key', 'claude-sonnet-4-5')

    expect(setMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'ready',
        findings,
        generatedFor: ['aspirin', 'ibuprofen'],
        inputFingerprint: expect.any(String),
        patientProfileUpdatedAt: null,
      }),
    )
  })

  it('writes an error status without touching prior findings when the Claude call fails', async () => {
    reportGetMock.mockResolvedValue({
      data: () => ({
        findings: [
          {
            type: 'caveat',
            severity: 'minor',
            medicationIds: ['aspirin'],
            detail: 'take with food',
          },
        ],
        generatedFor: ['aspirin'],
        inputFingerprint: 'old-fingerprint',
        patientProfileUpdatedAt: null,
      }),
    })
    medicationsGetMock.mockResolvedValue({
      docs: [medicationDoc('aspirin', 'Aspirin', '81mg')],
    })
    patientGetMock.mockResolvedValue({ exists: false, updateTime: undefined })
    ;(requestFindings as jest.Mock).mockRejectedValue(new Error('boom'))

    await regenerateInteractionReport('test-key', 'claude-sonnet-4-5')

    expect(setMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'error',
        error: 'boom',
        findings: [
          {
            type: 'caveat',
            severity: 'minor',
            medicationIds: ['aspirin'],
            detail: 'take with food',
          },
        ],
        generatedFor: ['aspirin'],
        inputFingerprint:
          '{"medications":[{"id":"aspirin","name":"Aspirin","dose":"81mg"}],"patient":null}',
      }),
    )
  })

  it('does not overwrite a newer report when the inputs change before Claude returns', async () => {
    reportGetMock
      .mockResolvedValueOnce({ data: () => undefined })
      .mockResolvedValueOnce({
        data: () => ({
          inputFingerprint:
            '{"medications":[{"id":"aspirin","name":"Aspirin","dose":"81mg"}],"patient":null}',
        }),
      })
    medicationsGetMock
      .mockResolvedValueOnce({
        docs: [medicationDoc('aspirin', 'Aspirin', '81mg')],
      })
      .mockResolvedValueOnce({
        docs: [medicationDoc('ibuprofen', 'Ibuprofen', '200mg')],
      })
    patientGetMock.mockResolvedValue({ exists: false, updateTime: undefined })
    ;(requestFindings as jest.Mock).mockResolvedValue([
      {
        type: 'caveat',
        severity: 'minor',
        medicationIds: ['aspirin'],
        detail: 'take with food',
      },
    ])

    await regenerateInteractionReport('test-key', 'claude-sonnet-4-5')

    expect(setMock).toHaveBeenCalledTimes(2)
    expect(setMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: 'pending' }),
    )
    expect(setMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'pending',
        findings: [],
        generatedFor: ['ibuprofen'],
      }),
    )
  })

  it('does not rewrite the report when another invocation already advanced it', async () => {
    reportGetMock
      .mockResolvedValueOnce({ data: () => undefined })
      .mockResolvedValueOnce({
        data: () => ({
          inputFingerprint:
            '{"medications":[{"id":"ibuprofen","name":"Ibuprofen","dose":"200mg"}],"patient":null}',
        }),
      })
    medicationsGetMock
      .mockResolvedValueOnce({
        docs: [medicationDoc('aspirin', 'Aspirin', '81mg')],
      })
      .mockResolvedValueOnce({
        docs: [medicationDoc('ibuprofen', 'Ibuprofen', '200mg')],
      })
    patientGetMock.mockResolvedValue({ exists: false, updateTime: undefined })
    ;(requestFindings as jest.Mock).mockResolvedValue([
      {
        type: 'caveat',
        severity: 'minor',
        medicationIds: ['aspirin'],
        detail: 'take with food',
      },
    ])

    await regenerateInteractionReport('test-key', 'claude-sonnet-4-5')

    expect(setMock).toHaveBeenCalledTimes(1)
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', generatedFor: ['aspirin'] }),
    )
  })
})
