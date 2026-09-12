import { requestFindings } from './claude'

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

describe('requestFindings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the parsed findings and calls the requested Claude model with high effort', async () => {
    const findings = [
      {
        type: 'caveat',
        severity: 'minor',
        medicationIds: ['aspirin'],
        detail: 'take with food',
      },
    ]
    parseMock.mockResolvedValue({ parsed_output: { findings } })

    const result = await requestFindings(
      'key',
      'claude-sonnet-4-5',
      [{ id: 'aspirin', commonName: 'Aspirin', dose: '81mg' }],
      null,
    )

    expect(result).toEqual(findings)
    expect(parseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-5',
        thinking: { type: 'adaptive' },
        output_config: expect.objectContaining({ effort: 'high' }),
      }),
    )
  })

  it('uses the supplied model id', async () => {
    parseMock.mockResolvedValue({ parsed_output: { findings: [] } })

    await requestFindings(
      'key',
      'claude-opus-4-1',
      [{ id: 'aspirin', commonName: 'Aspirin', dose: '81mg' }],
      null,
    )

    expect(parseMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-1' }),
    )
  })

  it('throws when the response does not match the schema', async () => {
    parseMock.mockResolvedValue({ parsed_output: null })

    await expect(
      requestFindings(
        'key',
        'claude-sonnet-4-5',
        [{ id: 'aspirin', commonName: 'Aspirin', dose: '81mg' }],
        null,
      ),
    ).rejects.toThrow('did not match the expected findings schema')
  })

  it('throws when Claude returns a finding for an unknown medication id', async () => {
    parseMock.mockResolvedValue({
      parsed_output: {
        findings: [
          {
            type: 'caveat',
            severity: 'minor',
            medicationIds: ['invented-id'],
            detail: 'x',
          },
        ],
      },
    })

    await expect(
      requestFindings(
        'key',
        'claude-sonnet-4-5',
        [{ id: 'aspirin', commonName: 'Aspirin', dose: '81mg' }],
        null,
      ),
    ).rejects.toThrow('unknown medication id')
  })

  it('throws when Claude returns the wrong medication count for a finding', async () => {
    parseMock.mockResolvedValue({
      parsed_output: {
        findings: [
          {
            type: 'drug-drug',
            severity: 'moderate',
            medicationIds: ['aspirin'],
            detail: 'x',
          },
        ],
      },
    })

    await expect(
      requestFindings(
        'key',
        'claude-sonnet-4-5',
        [
          { id: 'aspirin', commonName: 'Aspirin', dose: '81mg' },
          { id: 'ibuprofen', commonName: 'Ibuprofen', dose: '200mg' },
        ],
        null,
      ),
    ).rejects.toThrow('invalid medication count')
  })
})
