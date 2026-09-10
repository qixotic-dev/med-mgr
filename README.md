# rx-order-manager

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
npx nx serve rx-order-manager   # local dev server only
npx nx test rx-order-manager    # unit tests (Jest)
npx nx e2e rx-order-manager-e2e # e2e tests (Playwright)
```

## Deployment

```bash
pnpm run deploy:gh-pages     # build and publish the app to GitHub Pages
pnpm run deploy:firebase     # publish firestore.rules and firestore.indexes.json
```

`deploy:firebase` targets the `prod` project alias in `.firebaserc` and must be
run whenever the rules or indexes change — the app's queries need the indexes.
