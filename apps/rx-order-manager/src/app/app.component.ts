import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Drives the header — hidden while signed out/unauthorized. */
  protected readonly isAuthenticated = toSignal(
    this.auth.session$.pipe(map((session) => session.status === 'authorized')),
    { initialValue: false },
  );

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
      .subscribe(() => this.router.navigateByUrl('/login'));
  }

  signOut(): void {
    void this.auth.signOut();
  }
}
