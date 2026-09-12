# 0002: Cloud Functions to hold the LLM API key

## Status

Accepted

## Context

The Interaction Report feature needs to call an LLM (Claude) with the
current medication list and Patient profile to identify possible drug
interactions and caveats. med-mgr has never had a backend: it's a static
Angular SPA deployed to GitHub Pages, talking to Firestore/Firebase Auth
directly from the browser. The only "API key" in the app today is
Firebase's public web config, which is deliberately not secret — access is
enforced by `firestore.rules`, not by hiding that config (see
`firestore.rules`'s own comment).

An LLM API key is a genuine secret. Calling the LLM directly from the
browser with that key embedded would ship it inside the public JS bundle —
anyone could read it from dev tools or the network tab and run up charges
on the account. Alternatives considered:

- **Call the LLM directly from the browser**, accepting the exposed key.
  Rejected outright — this is the exact failure mode a real secret can't
  tolerate, not a reversible trade-off.
- **A separate serverless proxy** (e.g. a Cloudflare Worker) to hold the
  key, keeping the Firebase project on its free Spark plan. Rejected: it
  introduces a second cloud provider to deploy and manage, for no benefit
  over using the Firebase project this app already has.
- **Firebase Cloud Functions** (2nd gen), triggered by Firestore writes to
  the `medications` and `patients` collections, holding the key in Firebase
  Secret Manager. Chosen: stays inside the existing Firebase project and
  reuses its existing deploy/emulator tooling, at the cost of requiring the
  project to move off the free Spark plan (Cloud Functions' outbound
  network calls require the pay-as-you-go Blaze plan).

## Decision

Add a Cloud Functions app (`functions/`) to the Firebase project. Firestore
triggers on `medications` and `patients` writes call Claude server-side,
using a key held in Firebase Secret Manager, and write the result to a
Firestore collection the app reads normally. This requires moving the
Firebase project from the free Spark plan to the pay-as-you-go Blaze plan.

## Consequences

- med-mgr gains its first backend/server-side logic, and its first Firebase
  billing plan change — a real, deliberate trade-off, not a
  cheap-to-reverse default, which is why this gets an ADR (see
  `CONTEXT.md`).
- The Blaze plan is pay-as-you-go; for a single-user app firing an LLM call
  only when the medication list or Patient profile changes, expected cost
  is minimal, but it's a real account change (a card on file) rather than
  a purely code-level one.
- `functions/` is deployed manually (`firebase deploy --only functions`)
  for now, separately from the GitHub Actions workflow that deploys the
  static Angular app to GitHub Pages on merge to main — that workflow is
  unchanged. Automating the function's deploy is a separable follow-up.
- The interaction-report Cloud Function is the only code in the app that
  can write to the `interactionReports` collection — `firestore.rules`
  denies client writes to it outright, since the Admin SDK bypasses those
  rules entirely and a client-writable copy would defeat the point of
  keeping generation server-side.
