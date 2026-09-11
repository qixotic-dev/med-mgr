import { TestBed } from '@angular/core/testing'
import { Router, UrlTree } from '@angular/router'
import { of } from 'rxjs'
import { authGuard } from './auth.guard'
import { AuthService, SessionState } from './auth.service'

describe('authGuard', () => {
  function setup(session: SessionState) {
    const loginUrlTree = {} as UrlTree
    const router = { parseUrl: jest.fn().mockReturnValue(loginUrlTree) }
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { session$: of(session) } },
        { provide: Router, useValue: router },
      ],
    })
    return { router, loginUrlTree }
  }

  function runGuard() {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    )
  }

  it('allows an authorized user through', (done) => {
    setup({
      status: 'authorized',
      user: { uid: '1', email: 'owner@example.com', emailVerified: true },
    })
    const result = runGuard()
    ;(result as ReturnType<typeof of>).subscribe((value: unknown) => {
      expect(value).toBe(true)
      done()
    })
  })

  it('redirects a signed-out visitor to /login', (done) => {
    const { router, loginUrlTree } = setup({ status: 'signed-out' })
    const result = runGuard()
    ;(result as ReturnType<typeof of>).subscribe((value: unknown) => {
      expect(router.parseUrl).toHaveBeenCalledWith('/login')
      expect(value).toBe(loginUrlTree)
      done()
    })
  })

  it('redirects an unauthorized (non-owner) visitor to /login', (done) => {
    const { router, loginUrlTree } = setup({
      status: 'unauthorized',
      email: 'other@example.com',
    })
    const result = runGuard()
    ;(result as ReturnType<typeof of>).subscribe((value: unknown) => {
      expect(router.parseUrl).toHaveBeenCalledWith('/login')
      expect(value).toBe(loginUrlTree)
      done()
    })
  })
})
