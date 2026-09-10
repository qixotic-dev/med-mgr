import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AsyncPipe } from '@angular/common';
import { Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [AsyncPipe],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly session$ = this.auth.session$;

  constructor() {
    // React to the session actually becoming 'authorized' rather than
    // navigating right after signInWithGoogle() resolves: Firebase's
    // authState() can emit the updated user a tick later than the popup
    // promise settles, so an immediate navigate here can lose the race
    // against authGuard's snapshot and bounce back to /login.
    this.session$
      .pipe(
        filter((session) => session.status === 'authorized'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.router.navigateByUrl('/'));
  }

  async signIn(): Promise<void> {
    await this.auth.signInWithGoogle();
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
