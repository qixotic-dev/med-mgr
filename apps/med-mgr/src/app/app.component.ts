import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router'
import { filter, map } from 'rxjs'
import { AuthService } from './core/auth.service'
import { ThemeService } from './core/theme.service'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly theme = inject(ThemeService)
  private readonly auth = inject(AuthService)
  private readonly router = inject(Router)

  /** Drives the header — hidden while signed out/unauthorized. */
  protected readonly isAuthenticated = toSignal(
    this.auth.session$.pipe(map((session) => session.status === 'authorized')),
    { initialValue: false },
  )

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  )

  /** Tab bar entries — mirrors day-mgr's app.component navTabs. Prescriptions
   * is active whenever the URL matches none of the other tabs, rather than a
   * bare `=== '/'`, so exactly one tab is active even before the first
   * NavigationEnd resolves (e.g. a hard refresh on /medications) — it's the
   * fallback/home tab. */
  protected readonly navTabs = computed(() => {
    const url = this.currentUrl()
    const onMedications = url.startsWith('/medications')
    const onInteractions = url.startsWith('/interactions')
    return [
      {
        route: '/',
        label: 'Prescriptions',
        active: !onMedications && !onInteractions,
      },
      {
        route: '/medications',
        label: 'Medications',
        active: onMedications,
      },
      {
        route: '/interactions',
        label: 'Interactions',
        active: onInteractions,
      },
    ]
  })

  constructor() {
    // authGuard only runs on navigation attempts, so a session that goes
    // unauthorized while already sitting on the protected page (e.g. the
    // user clicks Sign out) needs its own reactive redirect back to
    // /login — mirrors LoginComponent's reactive redirect the other way.
    this.auth.session$
      .pipe(
        filter((session) => session.status !== 'authorized'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.router.navigateByUrl('/login'))
  }

  signOut(): void {
    void this.auth.signOut()
  }
}
