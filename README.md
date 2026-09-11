# med-mgr

Personal prescription reorder tracker: pharmacy/prescriber logistics and
reorder scheduling for a fixed list of medications, with Google Calendar
reminders. Single-user, Google Sign-In gated, Angular + Firebase (Auth +
Firestore), no custom backend.

See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary and the
architectural decisions taken so far.

## Development

```bash
pnpm install
pnpm run dev                    # Firebase emulators + dev server together (requires Java)
npx nx serve med-mgr   # local dev server only
npx nx test med-mgr    # unit tests (Jest)
npx nx e2e med-mgr-e2e # e2e tests (Playwright)
```

## Data

`MedicationService` can now create and update medications, but a fresh
emulator instance or a new production project still starts with an empty
`medications` collection -- seed the initial list once so the sidebar has
data to show:

```bash
node tools/migrate-to-firestore.mjs                                    # against pnpm run dev's emulator, or the real project (see the script's header comment for credentials)
node tools/migrate-to-firestore.mjs --drive-json <path-to-old-export>   # also seeds prescriptions from the old Electron app's Drive export
```

## Deployment

```bash
pnpm run deploy:gh-pages     # build and publish the app to GitHub Pages
pnpm run deploy:firebase     # publish firestore.rules and firestore.indexes.json
```

`deploy:firebase` targets the `prod` project alias in `.firebaserc` and must be
run whenever the rules or indexes change — the app's queries need the indexes.
Both deploy commands now fail fast until `.firebaserc` points `projects.prod` to
the real Firebase project ID and
`apps/med-mgr/src/environments/environment.prod.ts` no longer has
`'TODO'` Firebase values.
