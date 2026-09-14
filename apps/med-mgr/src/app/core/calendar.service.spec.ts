import { TestBed } from '@angular/core/testing'
import type { Medication } from '../models/medication.model'
import { AuthService } from './auth.service'
import { buildEvent, CalendarService } from './calendar.service'

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

describe('CalendarService', () => {
  const med: Medication = {
    id: 'med-1',
    commonName: 'Test Med',
    dose: '10mg',
    category: 'General',
    intervalDays: 30,
  }

  let service: CalendarService
  let token: string | null
  let signInWithGoogle: jest.Mock

  const response = (status: number, body: unknown = {}) =>
    ({
      status,
      ok: status >= 200 && status < 300,
      json: jest.fn().mockResolvedValue(body),
    }) as unknown as Response

  beforeEach(() => {
    token = 'token-1'
    signInWithGoogle = jest.fn().mockImplementation(async () => {
      token = 'token-2'
    })
    TestBed.configureTestingModule({
      providers: [
        CalendarService,
        {
          provide: AuthService,
          useValue: {
            calendarAccessToken: () => token,
            signInWithGoogle,
          },
        },
      ],
    })
    service = TestBed.inject(CalendarService)
    jest.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses POST when no existing event id is provided', async () => {
    ;(globalThis.fetch as jest.Mock).mockResolvedValueOnce(
      response(200, { id: 'created' }),
    )

    await service.scheduleReminder(med, '2026-12-31', 'Call ahead', null)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('uses PUT when an existing event id is provided', async () => {
    ;(globalThis.fetch as jest.Mock).mockResolvedValueOnce(
      response(200, { id: 'event-1' }),
    )

    await service.scheduleReminder(med, '2026-12-31', 'Call ahead', 'event-1')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/event-1',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('falls back to POST when updating a missing event (404/410)', async () => {
    ;(globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(200, { id: 'new-event' }))

    await service.scheduleReminder(med, '2026-12-31', 'Call ahead', 'event-1')

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/event-1',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('refreshes auth if the fallback POST returns 401', async () => {
    ;(globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, { id: 'new-event' }))

    await service.scheduleReminder(med, '2026-12-31', 'Call ahead', 'event-1')

    expect(signInWithGoogle).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('refreshes auth and retries once on 401 while scheduling', async () => {
    ;(globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, { id: 'event-1' }))

    await service.scheduleReminder(med, '2026-12-31', 'Call ahead', null)

    expect(signInWithGoogle).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('uses DELETE and refreshes auth on 401 while deleting', async () => {
    ;(globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(204))

    await service.deleteReminder('event-1')

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/event-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(signInWithGoogle).toHaveBeenCalledTimes(1)
  })
})
