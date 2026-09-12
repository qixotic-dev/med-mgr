import { buildEvent } from './calendar.service'

describe('buildEvent', () => {
  it('uses the following calendar day as the exclusive end date for all-day reminders', () => {
    const event = buildEvent(
      {
        id: 'med-1',
        commonName: 'Test Med',
        dose: '10mg',
        category: 'General',
        intervalDays: 30,
      },
      '2026-12-31',
      'Call ahead',
    )

    expect(event.start.date).toBe('2026-12-31')
    expect(event.end.date).toBe('2027-01-01')
  })
})
