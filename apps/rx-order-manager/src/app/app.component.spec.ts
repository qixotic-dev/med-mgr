import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService, SessionState } from './core/auth.service';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let session$: BehaviorSubject<SessionState>;
  let navigateByUrlSpy: jest.SpyInstance;

  beforeEach(async () => {
    session$ = new BehaviorSubject<SessionState>({
      status: 'authorized',
      user: {
        uid: 'owner-uid',
        email: 'qixoticsoftware@gmail.com',
        emailVerified: true,
      },
    });

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { session$ } },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();

    navigateByUrlSpy = jest
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);
  });

  it('creates the shell and renders a router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });

  it('redirects to /login when the session stops being authorized', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    session$.next({ status: 'signed-out' });
    await fixture.whenStable();

    expect(navigateByUrlSpy).toHaveBeenCalledWith('/login');
  });

  it('toggles the theme when the theme button is clicked', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('.theme-toggle');
    const initialLabel = button.getAttribute('aria-label');

    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(button.getAttribute('aria-label')).not.toBe(initialLabel);
  });
});
