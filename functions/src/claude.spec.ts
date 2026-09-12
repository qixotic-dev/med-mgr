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

  it('returns the parsed findings and calls Opus 5 with high effort', async () => {
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
      [{ id: 'aspirin', name: 'Aspirin', dose: '81mg' }],
      null,
    )

    expect(result).toEqual(findings)
    expect(parseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-5',
        thinking: { type: 'adaptive' },
        output_config: expect.objectContaining({ effort: 'high' }),
      }),
    )
  })

  it('throws when the response does not match the schema', async () => {
    parseMock.mockResolvedValue({ parsed_output: null })

    await expect(
      requestFindings(
        'key',
        [{ id: 'aspirin', name: 'Aspirin', dose: '81mg' }],
        null,
      ),
    ).rejects.toThrow('did not match the expected findings schema')
  })
})
