# 0001: Firestore over Google Drive for persistence

## Status

Accepted

## Context

The Electron app persisted all Prescription data (pharmacy/prescriber
records, order dates, notes) as one JSON file,
`richard_medication_orders.json`, in the signed-in user's own Google
Drive — the user owned the data file directly, and the app just read/wrote
it via the Drive API.

The Angular rewrite reuses `day-mgr`'s tooling and conventions, which
already use Firestore for persistence, gated by an owner-only
`firestore.rules` check. Keeping the Drive-JSON approach was considered: it
would have preserved the user's direct ownership of the data file and
avoided provisioning a new Firebase project, but it would have meant
building (or awkwardly reusing, from the old `main.js`) a bespoke
Drive-file read/write layer instead of the collection/document CRUD
`day-mgr`'s pattern already provides.

## Decision

Persist Medication and Prescription data in Firestore (two collections,
`medications` and `prescriptions`), matching `day-mgr`'s `@angular/fire`
pattern, instead of continuing to read/write a JSON file on the user's
Google Drive.

## Consequences

- Data ownership moves from the user's own Drive account to an app-owned
  Firebase project — a real, deliberate trade-off (see the plan's grilling
  interview), not a cheap-to-reverse default, which is why this gets an ADR
  while `day-mgr`'s own architecture choices don't (see `CONTEXT.md`).
- Gains `day-mgr`'s existing patterns for free: typed collection/document
  services, `firestore.rules`-enforced owner gating, and no bespoke
  Drive-file parsing/merging code to maintain.
- The one-time migration script (`tools/migrate-to-firestore.mjs`) reads
  the old Drive JSON (manually exported by the user) once and is discarded
  after use — there's no ongoing Drive dependency for Prescription data
  after migration. (The Calendar API is still used for reminders, but
  reading the Drive JSON is not.)
- Losing internet/Firebase access means losing access to reorder data
  entirely, whereas the old Drive file could in principle be opened
  directly by the user outside the app. Accepted for a single-user app.
