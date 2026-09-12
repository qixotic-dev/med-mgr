import { getFirestore } from 'firebase-admin/firestore'
import {
  generateMedicationInfo,
  isInfoOnlyChange,
  regenerateMedicationInfo,
} from './generate-medication-info'

const parseMock = jest.fn()

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { parse: parseMock },
  })),
}))

jest.mock('@anthropic-ai/sdk/helpers/zod', () => ({
  zodOutputFormat: jest.fn(() => ({ type: 'json_schema', schema: {} })),
}))

jest.mock('firebase-admin/firestore')

describe('isInfoOnlyChange', () => {
  it('is true when nothing changed', () => {
    expect(
      isInfoOnlyChange({ commonName: 'Aspirin' }, { commonName: 'Aspirin' }),
    ).toBe(true)
  })

  it('is true when only info fields changed', () => {
    expect(
      isInfoOnlyChange(
        { commonName: 'Aspirin', dose: '81mg' },
        {
          commonName: 'Aspirin',
          dose: '81mg',
          purpose: 'pain relief',
          instructions: 'take with food',
          infoStatus: 'ready',
        },
      ),
    ).toBe(true)
  })

  it('is true when an info field was cleared (present in before, absent in after)', () => {
    expect(
      isInfoOnlyChange(
        { commonName: 'Aspirin', infoStatus: 'error', infoError: 'boom' },
        { commonName: 'Aspirin', infoStatus: 'ready' },
      ),
    ).toBe(true)
  })

  it('is false when a non-info field also changed', () => {
    expect(
      isInfoOnlyChange(
        { commonName: 'Aspirin' },
        { commonName: 'Aspirin XL', infoStatus: 'ready' },
      ),
    ).toBe(false)
  })

  it('is false when a non-info field was added', () => {
    expect(
      isInfoOnlyChange(
        { commonName: 'Aspirin' },
        { commonName: 'Aspirin', dose: '81mg' },
      ),
    ).toBe(false)
  })
})

describe('generateMedicationInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the parsed info and calls Claude with medium effort', async () => {
    parseMock.mockResolvedValue({
      parsed_output: { purpose: 'pain relief', instructions: 'take with food' },
    })

    const result = await generateMedicationInfo('key', 'claude-sonnet-4-5', {
      commonName: 'Aspirin',
      dose: '81mg',
    })

    expect(result).toEqual({
      purpose: 'pain relief',
      instructions: 'take with food',
    })
    expect(parseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-5',
        thinking: { type: 'adaptive' },
        output_config: expect.objectContaining({ effort: 'medium' }),
      }),
    )
  })

  it('throws when the response does not match the schema', async () => {
    parseMock.mockResolvedValue({ parsed_output: null })

    await expect(
      generateMedicationInfo('key', 'claude-sonnet-4-5', {
        commonName: 'Aspirin',
        dose: '81mg',
      }),
    ).rejects.toThrow('did not match the expected medication info schema')
  })
})

describe('regenerateMedicationInfo', () => {
  const updateMock = jest.fn().mockResolvedValue(undefined)
  const getMock = jest.fn()
  const docRef = { get: getMock, update: updateMock }
  const transactionGetMock = jest.fn()
  const transactionUpdateMock = jest.fn()
  const dbMock = {
    collection: jest.fn(() => ({ doc: jest.fn(() => docRef) })),
    runTransaction: jest.fn(
      async (updateFn: (transaction: unknown) => unknown) =>
        updateFn({
          get: transactionGetMock,
          update: transactionUpdateMock,
        }),
    ),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    updateMock.mockResolvedValue(undefined)
    transactionUpdateMock.mockResolvedValue(undefined)
    ;(getFirestore as jest.Mock).mockReturnValue(dbMock)
  })

  it('writes purpose/instructions/infoStatus back on success', async () => {
    getMock.mockResolvedValue({
      exists: true,
      get: (field: string) =>
        (({ commonName: 'Aspirin', dose: '81mg' }) as Record<string, string>)[
          field
        ],
    })
    transactionGetMock.mockResolvedValue({
      exists: true,
      get: (field: string) =>
        (({ commonName: 'Aspirin', dose: '81mg' }) as Record<string, string>)[
          field
        ],
    })
    parseMock.mockResolvedValue({
      parsed_output: { purpose: 'pain relief', instructions: 'take with food' },
    })

    await regenerateMedicationInfo('key', 'claude-sonnet-4-5', 'aspirin')

    expect(transactionUpdateMock).toHaveBeenCalledWith(
      docRef,
      expect.objectContaining({
        purpose: 'pain relief',
        instructions: 'take with food',
        infoStatus: 'ready',
      }),
    )
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('writes an error status when the Claude call fails', async () => {
    getMock.mockResolvedValue({
      exists: true,
      get: () => 'Aspirin',
    })
    parseMock.mockRejectedValue(new Error('boom'))

    await regenerateMedicationInfo('key', 'claude-sonnet-4-5', 'aspirin')

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ infoStatus: 'error', infoError: 'boom' }),
    )
  })

  it('does not overwrite newer medication data when the source fields changed mid-flight', async () => {
    getMock.mockResolvedValue({
      exists: true,
      get: (field: string) =>
        (
          {
            commonName: 'Aspirin',
            clinicalName: 'Acetylsalicylic acid',
            dose: '81mg',
            infoStatus: 'pending',
          } as Record<string, string>
        )[field],
    })
    transactionGetMock.mockResolvedValue({
      exists: true,
      get: (field: string) =>
        (
          {
            commonName: 'Aspirin',
            clinicalName: 'Acetylsalicylic acid',
            dose: '325mg',
            infoStatus: 'pending',
          } as Record<string, string>
        )[field],
    })
    parseMock.mockResolvedValue({
      parsed_output: { purpose: 'pain relief', instructions: 'take with food' },
    })

    await regenerateMedicationInfo('key', 'claude-sonnet-4-5', 'aspirin')

    expect(transactionUpdateMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('does nothing when the medication was deleted before generation ran', async () => {
    getMock.mockResolvedValue({ exists: false })

    await regenerateMedicationInfo('key', 'claude-sonnet-4-5', 'aspirin')

    expect(updateMock).not.toHaveBeenCalled()
  })
})
