import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

/** Light/dark theme, persisted to localStorage and applied via a `data-theme`
 * attribute on `<html>` (see the matching inline script in index.html, which
 * applies the stored/system theme before Angular loads to avoid a flash of
 * the wrong theme). */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(readInitialTheme());

  constructor() {
    applyTheme(this.theme());
  }

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.theme.set(theme);
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable (private browsing, disabled cookies) —
      // the toggle still works for the session, it just won't persist.
    }
  }
}

function readInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // ignore and fall through to the system preference
  }
  return prefersDark() ? 'dark' : 'light';
}

function prefersDark(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}
