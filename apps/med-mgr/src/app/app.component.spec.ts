import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, provideRouter, Router } from '@angular/router'
import { BehaviorSubject } from 'rxjs'
import { AuthService, SessionState } from './core/auth.service'
import { AppComponent } from './app.component'

@Component({ selector: 'app-route-stub', standalone: true, template: '' })
class RouteStubComponent {}

describe('AppComponent', () => {
  let session$: BehaviorSubject<SessionState>
  let navigateByUrlSpy: jest.SpyInstance

  beforeEach(async () => {
    session$ = new BehaviorSubject<SessionState>({
      status: 'authorized',
      user: {
        uid: 'owner-uid',
        email: 'qixoticsoftware@gmail.com',
        emailVerified: true,
      },
    })

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([
          { path: '', component: RouteStubComponent },
          { path: 'medications', component: RouteStubComponent },
        ]),
        { provide: AuthService, useValue: { session$ } },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents()

    navigateByUrlSpy = jest
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true)
  })

  it('creates the shell and renders a router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy()
  })

  it('redirects to /login when the session stops being authorized', async () => {
    const fixture = TestBed.createComponent(AppComponent)
    fixture.detectChanges()

    session$.next({ status: 'signed-out' })
    await fixture.whenStable()

    expect(navigateByUrlSpy).toHaveBeenCalledWith('/login')
  })

  it('renders both tabs with Prescriptions active on the root route', () => {
    const fixture = TestBed.createComponent(AppComponent)
    fixture.detectChanges()

    const tabs: NodeListOf<HTMLAnchorElement> =
      fixture.nativeElement.querySelectorAll('.tab')
    expect(tabs.length).toBe(2)
    expect(tabs[0].textContent?.trim()).toBe('Prescriptions')
    expect(tabs[1].textContent?.trim()).toBe('Medications')
    expect(tabs[0].classList.contains('active')).toBe(true)
    expect(tabs[1].classList.contains('active')).toBe(false)
  })

  it('marks the Medications tab active after navigating to /medications', async () => {
    const fixture = TestBed.createComponent(AppComponent)
    fixture.detectChanges()

    // navigateByUrl is mocked (see beforeEach) to assert the sign-out
    // redirect without a real router config; restore it here so this
    // navigation actually resolves and fires NavigationEnd.
    navigateByUrlSpy.mockRestore()
    await TestBed.inject(Router).navigateByUrl('/medications')
    fixture.detectChanges()

    const tabs: NodeListOf<HTMLAnchorElement> =
      fixture.nativeElement.querySelectorAll('.tab')
    expect(tabs[0].classList.contains('active')).toBe(false)
    expect(tabs[1].classList.contains('active')).toBe(true)
  })

  it('toggles the theme when the theme button is clicked', async () => {
    const fixture = TestBed.createComponent(AppComponent)
    fixture.detectChanges()

    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('.theme-toggle')
    const initialLabel = button.getAttribute('aria-label')

    button.click()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(button.getAttribute('aria-label')).not.toBe(initialLabel)
  })
})
