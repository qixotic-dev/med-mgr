import { Injectable, inject, signal } from '@angular/core'
import {
  Auth,
  GoogleAuthProvider,
  authState,
  signInWithPopup,
  signOut,
} from '@angular/fire/auth'
import { Observable, map, shareReplay } from 'rxjs'
import { environment } from '../../environments/environment'

export interface AuthUser {
  uid: string
  email: string | null
  emailVerified: boolean
}

/** Sign-in state, gated to a single owner email (see CONTEXT.md: single-user scope). */
export type SessionState =
  | { status: 'signed-out' }
  | { status: 'unauthorized'; email: string | null }
  | { status: 'authorized'; user: AuthUser }

/**
 * Requested alongside the sign-in scopes (not a second auth flow) so
 * CalendarService (see core/calendar.service.ts) can create reminder events
 * with the same Google session — see the plan's "Calendar mechanism".
 */
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth)

  private readonly _calendarAccessToken = signal<string | null>(null)
  /**
   * The Google access token from the last sign-in, for CalendarService to
   * call the Calendar API with. In-memory only (not persisted) and expires
   * after ~1h, same as Firebase Auth's own popup credential — CalendarService
   * re-triggers `signInWithGoogle` to refresh it when a write needs it.
   */
  readonly calendarAccessToken = this._calendarAccessToken.asReadonly()

  /** True login state including users who are signed in but not the owner. */
  readonly session$: Observable<SessionState> = authState(this.auth).pipe(
    map(toSessionState),
    shareReplay({ bufferSize: 1, refCount: false }),
  )

  async signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider()
    provider.addScope(CALENDAR_SCOPE)
    const result = await signInWithPopup(this.auth, provider)
    const credential = GoogleAuthProvider.credentialFromResult(result)
    this._calendarAccessToken.set(credential?.accessToken ?? null)
  }

  async signOut(): Promise<void> {
    await signOut(this.auth)
    this._calendarAccessToken.set(null)
  }
}

export function isOwner(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === environment.ownerEmail.toLowerCase()
}

/** Pure mapping from a Firebase user (or null) to our session state — kept
 * separate from the Observable pipeline so it's testable without mocking
 * Firebase Auth. */
export function toSessionState(user: AuthUser | null): SessionState {
  if (!user) {
    return { status: 'signed-out' }
  }
  // Unverified counts as not the owner: an email claim is only as good as
  // the provider that minted it, and firestore.rules requires
  // email_verified too — agreeing here keeps the app from looking signed in
  // while every read comes back permission-denied.
  if (!isOwner(user.email) || !user.emailVerified) {
    return { status: 'unauthorized', email: user.email }
  }
  return { status: 'authorized', user }
}
