import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import 'dotenv/config';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader (dynamic import,
 * bypassing the pirates CJS-compile path), and Nx's native TS strip loads
 * `.mts` directly. Playwright's configLoader auto-discovers
 * `playwright.config.mts` via its extension list
 * (.ts/.js/.mts/.mjs/.cts/.cjs).
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  /* Boot the Firebase emulators (Auth + Firestore) and the dev server
     before starting the tests — the app always talks to the emulators in
     the (non-production) `environment.ts` config, never the real project. */
  webServer: [
    {
      command: 'npx firebase-tools emulators:start --only auth,firestore',
      url: 'http://127.0.0.1:9099',
      reuseExistingServer: !process.env.CI,
      cwd: workspaceRoot,
      timeout: 60_000,
    },
    {
      // The explicit --port makes the target port match the url above.
      // It's also load-bearing for a subtler reason: @nx/playwright infers
      // an Nx-level continuous task dependency from a bare `nx run
      // <project>:<target>` (or `nx <target> <project>`) command, which
      // then conflicts with the Firebase-emulator entry above (not
      // Nx-inferrable, since it isn't an nx command) and trips Nx's
      // "non-parallel task depends on a continuous task" validation.
      // Any extra argument on the command line defeats that pattern match,
      // leaving Playwright in sole charge of both servers' lifecycle, as
      // intended.
      command: 'npx nx run rx-order-manager:serve --port=4200',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env.CI,
      cwd: workspaceRoot,
    },
  ],
  // A personal single-user app doesn't warrant cross-browser e2e coverage —
  // Chromium only, kept fast and to a single required browser download.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
