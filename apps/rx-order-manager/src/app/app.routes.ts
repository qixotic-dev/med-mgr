import { Route } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { LoginComponent } from './features/login/login.component';
import { PrescriptionsComponent } from './features/prescriptions/prescriptions.component';

export const appRoutes: Route[] = [
  { path: 'login', component: LoginComponent },
  { path: '', component: PrescriptionsComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
