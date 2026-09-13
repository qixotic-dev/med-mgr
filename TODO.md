# TODO — Medications / Interactions UI follow-ups

Working list for the items below. Pick one, open a new session, implement,
check it off. Each entry has enough pointers to start cold. Terms
(Medication, Finding, Interaction Report, Caveat, Patient) are defined in
`CONTEXT.md`.

- [ ] **1. Have the LLM fill in `clinicalName` too, not just `purpose`/`instructions`**
  - Today `clinicalName` is a free-text field the user types
    (`medications.component.html:48-55`) and is fed *into* the generator as
    an optional input (`MedicationInfoInput` in
    `functions/src/generate-medication-info.ts`). `purpose`/`instructions`
    are already LLM outputs (`MedicationInfoSchema`).
  - Change: make `clinicalName` an output of `generateMedicationInfo` too
    (add to `MedicationInfoSchema`, derived from `commonName`/`dose` only).
  - Touch points once `clinicalName` becomes generated, not typed:
    - `MEDICATION_INFO_FIELDS` in `generate-medication-info.ts` (add
      `'clinicalName'` — it's the ignore-list `index.ts`'s
      `onMedicationWritten` trigger uses to detect "info-only" writes).
    - `readMedicationGenerationState`/`regenerateMedicationInfo`'s
      stale-write guard currently compares `clinicalName` as an *input*
      that shouldn't change mid-generation — re-check that logic once it's
      an output instead.
    - `medications.component.html`'s clinical-name `<input>` → make it
      read-only/generated like the purpose/instructions textareas
      (disabled while `pending`, editable after).
    - `buildReportInputFingerprint` in `interactions.component.ts` already
      includes `clinicalName` in the Interaction Report fingerprint —
      confirm that's still correct once it's generated instead of typed.
    - Existing specs: `generate-medication-info.spec.ts`,
      `medications.component.spec.ts`.

- [x] **2. Medication page: drop drug-drug/condition/allergy findings, keep only Caveats**
  - `MedicationsComponent.medicationFindingGroups`
    (`medications.component.ts:170-180`) currently shows every Finding type
    that mentions the selected medication. Filter to `type === 'caveat'`
    only — the other three types (drug-drug pairs, condition/allergy
    warnings) don't read sensibly scoped to one medication in isolation.
  - Note: `CONTEXT.md`'s "Notes for future changes" already flags a
    *separate*, larger fast-follow — dropping the `caveat` Finding kind
    entirely because it's redundant with Purpose/Instructions. That's a
    bigger change (touches the Cloud Function's schema/prompt) and is
    explicitly called out as its own task with its own ADR — don't conflate
    it with this item.

- [x] **3. Interactions page: "medication list has changed — regenerating…" message never clears**
  - **Not a code bug — a stale deploy.** Diagnosed by comparing symptoms:
    `interactionReports/current` had no `inputFingerprint` field, but its
    `updatedAt` *did* advance on every medication edit — meaning the
    Cloud Function was running, just an older deployed version from
    before `inputFingerprint` existed. `isReportStale` correctly treats a
    fingerprint-less report as permanently stale whenever any medication
    exists (`interactions.component.ts`'s `isReportStale`), so the banner
    could never clear no matter how many times that stale function ran.
  - Per `README.md`, deploying Cloud Functions is a manual step separate
    from the GitHub Actions workflow (which only deploys the Angular app
    on merge to `main`) — it had been skipped since `inputFingerprint` was
    added. Fixed by running `firebase deploy --only functions --project prod`.
    Confirmed resolved: reloading the Interactions page let the existing
    legacy-backfill effect (`InteractionsComponent`'s on-demand-regenerate
    effect for a missing-fingerprint report) call the now-current function,
    and the banner cleared with no code change needed.
  - Takeaway for next time: after merging a `functions/` change, remember
    to also run the manual functions deploy — nothing currently reminds or
    enforces this.

- [x] **4. Align finding rows instead of letting badge width push text out of line**
  - `.finding` in both `interactions.component.scss:85-95` and the
    equivalent in `medications.component.scss` lays out badge + text with
    `display: flex; gap: 0.75rem` — different badge label lengths
    (minor/moderate/major) shift where `.finding-body` starts on each row.
    Give the badge a fixed column width (e.g. CSS grid with a fixed first
    column, or a `min-width` on `app-severity-badge`) so `.finding-detail`
    lines up vertically across all findings. Apply the same fix in both
    stylesheets (or share the rule if there's already a common place for
    it).

- [ ] **5. [Needs a product decision] Scope the Interactions page to one selected Medication**
  - Right now Interactions shows the whole report for every medication at
    once. Before building this: confirm with the user whether "select one
    medication, see its findings" replaces the current all-at-once view, or
    supplements it (e.g. an optional filter). This changes the page's
    information model, so don't start on faith — the user said "maybe."
  - If confirmed: reuse the grouping/filtering pattern already written for
    the Medication page's `medicationFindingGroups`
    (`medications.component.ts:166-180`), but scoped by selection instead
    of hardcoded to `'caveat'` (see #2) — likely all Finding types are
    relevant once you're looking at one medication's full picture,
    including its drug-drug pairs with others.

- [ ] **6. Selected Medication persists across tabs (depends on #5)**
  - Only relevant if #5 is confirmed. Today `selectedId` is a local
    `signal` owned by `MedicationsComponent`
    (`medications.component.ts:158`); Interactions has no notion of
    selection at all. Extract selection into a shared, injectable service
    (mirrors how `MedicationService`/`PatientService` are already shared)
    so Medications and Interactions read/write the same selected id, and
    either page can change it.

- [ ] **7. Fixed header row showing the selected medication's common name (depends on #5/#6)**
  - Once selection is shared (#6), add a persistent header — likely a
    sticky row under the tab bar in `app.component.html`, or a shared
    component — displaying the selected medication's `commonName` so it
    stays visible while scrolling or switching between Medications and
    Interactions.

- [ ] **8. Put each page's action buttons in a single row, disabled until valid**
  - Medications page (`medications.component.html:107-159`): Regenerate
    lives inside `.medication-info` (its own row), separate from
    Save/Delete at the bottom. Move all three into one row. Disabled
    states already mostly exist (`canSave()`, `isRegenerating() ||
    infoStatus === 'pending'`) — just need Delete's state checked too (it's
    currently always enabled whenever rendered).
  - Interactions page (`interactions.component.html:2-46`): the patient
    profile form's Save button has no `[disabled]` binding at all — add
    validity/dirty-state gating consistent with the other pages.
  - Prescriptions page: not yet inspected — check
    `prescriptions.component.html` for the same single-row/disabled-until-valid
    treatment so all three pages are consistent.
