import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from './auth.service';

/** Blocks every route except /login to signed-in, owner-authorized users. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.session$.pipe(
    take(1),
    map((session) =>
      session.status === 'authorized' ? true : router.parseUrl('/login'),
    ),
  );
};
