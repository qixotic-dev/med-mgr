# rx-order-manager

Personal prescription reorder tracker: pharmacy/prescriber logistics and
reorder scheduling for a fixed list of medications, with Google Calendar
reminders. Single-user, Google Sign-In gated, Angular + Firebase (Auth +
Firestore), no custom backend.

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
