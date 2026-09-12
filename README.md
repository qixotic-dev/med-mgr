# med-mgr

Personal medication tracker: pharmacy/prescriber reorder logistics and
reorder scheduling for a fixed list of medications, with Google Calendar
reminders, plus an AI-generated Interaction Report flagging possible drug
interactions and caveats. Single-user, Google Sign-In gated, Angular +
Firebase (Auth + Firestore) for the app itself, with one Cloud Function
calling an LLM to generate the Interaction Report.

See [`CONTEXT.md`](CONTEXT.md) for the domain glossary and the
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

### Interaction Report Cloud Function (`functions/`)

One-time setup against the `prod` project (see
`docs/adr/0002-cloud-functions-for-llm-key.md` for why this exists):

```bash
# 1. Upgrade the Firebase project to the pay-as-you-go Blaze plan in the
#    Firebase console — required for a Cloud Function to make outbound
#    network calls (the free Spark plan can't call the Claude API).
# 2. Provision the API key as a Secret Manager secret (prompts for the value):
firebase functions:secrets:set ANTHROPIC_API_KEY --project prod
```

Deploying the function is manual for now, separate from the GitHub Actions
workflow that deploys the Angular app on merge to main:

```bash
cd functions && npm install && npm run build && cd ..
firebase deploy --only functions --project prod
```
