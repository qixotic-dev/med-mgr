# med-mgr

Personal medication tracker: pharmacy/prescriber reorder logistics and
reorder scheduling for a fixed list of medications, with Google Calendar
reminders, plus an AI-generated Interaction Report flagging possible drug
interactions and caveats. Single-user, Google Sign-In gated, Angular +
Firebase (Auth + Firestore) for the app itself, with one Cloud Function
calling an LLM to generate the Interaction Report — the only backend logic
in the app.

## Language

**Medication**:
The drug itself: name, dose, category, and how often it needs reordering
(`intervalDays`). Not a dose-taken record — that's `day-mgr`'s concept of
the same word, a different app, deliberately not reconciled here.
_Avoid_: Drug (fine as plain English, but use "Medication" as the model
term), Order (that's Prescription)

**Prescription**:
The reorder logistics for one Medication: which pharmacy, which prescriber,
how to place the order, and when it was last ordered / is next due.
Exactly one Prescription per Medication today.
_Avoid_: Order, RefillOrder, Rx (informal only)

**Reorder status**:
Derived, not stored: Not scheduled / In N days / Due in N days (≤7) /
Overdue, computed from a Prescription's `nextOrderDate` vs. today.

**Patient**:
Health/demographic context about the app's single user — birthdate, sex,
allergies, conditions, weight — used only to inform the Interaction
Report. No role in the reorder workflow.
_Avoid_: User (that's the Google Sign-In identity, a different concept),
Profile (fine as plain English, but use "Patient" as the model term)

**Interaction Report**:
The AI-generated, point-in-time assessment of the current Medication list
and Patient: a set of Findings. Regenerated whenever a Medication or the
Patient changes; only the current snapshot is kept, no history.
_Avoid_: Report (ambiguous on its own — use "Interaction Report")

**Finding**:
One item in an Interaction Report, with a Severity. Four kinds: a
drug-drug interaction (between two Medications), a drug-condition warning
or drug-allergy alert (a Medication against one of the Patient's
conditions/allergies), or a caveat (a note about one Medication alone).
_Avoid_: Interaction (too narrow — three of the four Finding kinds aren't
drug-drug interactions)

**Severity**:
How significant a Finding is: minor / moderate / major.

## Notes for future changes

- `docs/adr/0001-firestore-over-drive-for-persistence.md` records why
  persistence moved from the user's own Google Drive JSON file (the old
  Electron app) to an app-owned Firestore project. Checked against the same
  ADR criteria `day-mgr` uses (hard to reverse / surprising / real
  trade-off) — unlike `day-mgr`'s own architecture choices, this one clears
  that bar: it moves data ownership off the user's own Drive account, a
  genuine trade-off discussed explicitly rather than a cheap-to-reverse
  default. Future architecture decisions here should be checked against the
  same bar before deciding whether they need an ADR too.
- `docs/adr/0002-cloud-functions-for-llm-key.md` records why the
  Interaction Report needed the app's first backend at all — an LLM API
  key can't safely live in a public static bundle. Clears the same ADR bar
  as 0001.
