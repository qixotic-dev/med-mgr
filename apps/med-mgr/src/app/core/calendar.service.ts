import { Injectable, inject } from '@angular/core'
import type { Medication } from '../models/medication.model'
import type { DateKey } from '../util/date-key'
import { addDays } from '../util/date-key'
import { AuthService } from './auth.service'

const CALENDAR_EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events'

/** 24h before the event's start, matching the old Electron app's reminder lead time. */
const REMINDER_MINUTES_BEFORE = 1440

interface CalendarEvent {
  summary: string
  description: string
  start: { date: DateKey }
  end: { date: DateKey }
  reminders: {
    useDefault: false
    overrides: { method: 'email'; minutes: number }[]
  }
}

/**
 * Creates a Google Calendar reminder for a Prescription's next-order date
 * (see the implementation plan's "Calendar mechanism"). Uses AuthService's
 * cached access token from the same Google sign-in, not a second auth flow.
 * That token is in-memory only and expires after ~1h; a missing or expired
 * token re-triggers the sign-in popup to refresh it before retrying, rather
 * than failing silently.
 */
@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly authService = inject(AuthService)

  async scheduleReminder(
    medication: Medication,
    nextOrderDate: DateKey,
    howToOrder: string,
  ): Promise<void> {
    const event = buildEvent(medication, nextOrderDate, howToOrder)
    let token = await this.ensureAccessToken()
    let response = await postEvent(token, event)
    if (response.status === 401) {
      token = await this.ensureAccessToken({ forceRefresh: true })
      response = await postEvent(token, event)
    }
    if (!response.ok) {
      throw new Error(`Calendar API error: ${response.status}`)
    }
  }

  private async ensureAccessToken(
    options: { forceRefresh?: boolean } = {},
  ): Promise<string> {
    let token = this.authService.calendarAccessToken()
    if (!token || options.forceRefresh) {
      await this.authService.signInWithGoogle()
      token = this.authService.calendarAccessToken()
    }
    if (!token) {
      throw new Error('Google sign-in did not return a Calendar access token.')
    }
    return token
  }
}

/** Exported for direct unit testing — no Firestore/HTTP to mock. */
export function buildEvent(
  medication: Medication,
  nextOrderDate: DateKey,
  howToOrder: string,
): CalendarEvent {
  return {
    summary: `Rx: Order ${medication.name} (${medication.dose})`,
    description: `Reminder to order ${medication.name} ${medication.dose}.\n\n${howToOrder}`,
    start: { date: nextOrderDate },
    end: { date: addDays(nextOrderDate, 1) },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'email', minutes: REMINDER_MINUTES_BEFORE }],
    },
  }
}

function postEvent(token: string, event: CalendarEvent): Promise<Response> {
  return fetch(CALENDAR_EVENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })
}
