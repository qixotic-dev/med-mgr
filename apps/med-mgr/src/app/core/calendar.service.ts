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
 * Creates or updates a Google Calendar reminder for a Prescription's
 * next-order date (see the implementation plan's "Calendar mechanism").
 * Uses AuthService's cached access token from the same Google sign-in, not a
 * second auth flow. That token is in-memory only and expires after ~1h; a
 * missing or expired token re-triggers the sign-in popup to refresh it
 * before retrying, rather than failing silently.
 */
@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly authService = inject(AuthService)

  /**
   * Passing `existingEventId` updates that event in place (PUT) instead of
   * creating a new one (POST) -- picking a new date used to always POST, so
   * every previous pick's event was left behind on the calendar (TODO.md
   * #13). Returns the event's id so the caller can persist it and pass it
   * back in on the next pick. If `existingEventId` no longer exists on
   * Google's side (404/410 -- e.g. manually deleted in Google Calendar),
   * falls back to creating a fresh event rather than failing every
   * subsequent pick against a dead id.
   */
  async scheduleReminder(
    medication: Medication,
    nextOrderDate: DateKey,
    howToOrder: string,
    existingEventId: string | null,
  ): Promise<string> {
    const event = buildEvent(medication, nextOrderDate, howToOrder)
    let token = await this.ensureAccessToken()
    let response = await putOrPostEvent(token, event, existingEventId)
    if (response.status === 401) {
      token = await this.ensureAccessToken({ forceRefresh: true })
      response = await putOrPostEvent(token, event, existingEventId)
    }
    if (existingEventId && isGone(response.status)) {
      response = await putOrPostEvent(token, event, null)
      if (response.status === 401) {
        token = await this.ensureAccessToken({ forceRefresh: true })
        response = await putOrPostEvent(token, event, null)
      }
    }
    if (!response.ok) {
      throw new Error(`Calendar API error: ${response.status}`)
    }
    const body = (await response.json()) as { id: string }
    return body.id
  }

  /** Deletes a Calendar event -- used by "clear schedule" and by deleting a
   * Medication that still had one scheduled (see TODO.md #13). An event
   * already gone (404/410, e.g. manually deleted in Google Calendar) counts
   * as success: the caller wanted it gone either way. */
  async deleteReminder(eventId: string): Promise<void> {
    let token = await this.ensureAccessToken()
    let response = await deleteEvent(token, eventId)
    if (response.status === 401) {
      token = await this.ensureAccessToken({ forceRefresh: true })
      response = await deleteEvent(token, eventId)
    }
    if (!response.ok && !isGone(response.status)) {
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
    summary: `Rx: Order ${medication.commonName} (${medication.dose})`,
    description: `Reminder to order ${medication.commonName} ${medication.dose}.\n\n${howToOrder}`,
    start: { date: nextOrderDate },
    end: { date: addDays(nextOrderDate, 1) },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'email', minutes: REMINDER_MINUTES_BEFORE }],
    },
  }
}

function putOrPostEvent(
  token: string,
  event: CalendarEvent,
  existingEventId: string | null,
): Promise<Response> {
  const url = existingEventId
    ? `${CALENDAR_EVENTS_URL}/${existingEventId}`
    : CALENDAR_EVENTS_URL
  return fetch(url, {
    method: existingEventId ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })
}

function deleteEvent(token: string, eventId: string): Promise<Response> {
  return fetch(`${CALENDAR_EVENTS_URL}/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** 404 Not Found or 410 Gone -- the two statuses the Calendar API uses for
 * "this event id doesn't exist (any more)". */
function isGone(status: number): boolean {
  return status === 404 || status === 410
}
