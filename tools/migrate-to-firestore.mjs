// One-time migration: seeds Firestore from the old Electron app's data. See
// docs/adr/0001-firestore-over-drive-for-persistence.md. Run once against
// the real project, then this script (and its --drive-json input) can be
// deleted -- nothing else writes to `medications`, and PrescriptionService
// only ever merges Prescription docs saved from the UI.
//
// Usage:
//   node tools/migrate-to-firestore.mjs [--drive-json <path>] [--project <id>]
//
// Always seeds the fixed `medications` collection (ported from the old
// app's hardcoded MEDICATIONS array in index.html). Pass --drive-json
// pointing at a manually-exported richard_medication_orders.json (Drive ->
// the file's "..." menu -> Download) to also seed `prescriptions` from it.
//
// Credentials -- firebase-admin's Application Default Credentials:
//   - Local Emulator Suite (dry run): start it with `pnpm run emulators`,
//     then in another terminal set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
//     before running this script -- no real credentials needed.
//   - The real project: Firebase console -> Project settings -> Service
//     accounts -> Generate new private key, then set
//     GOOGLE_APPLICATION_CREDENTIALS to the downloaded file's path.
//
// --project defaults to the "prod" alias in .firebaserc.

import { readFile } from 'node:fs/promises';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

// Ported verbatim from the old Electron app's hardcoded medication list --
// this app has never supported adding/editing medications through its own
// UI (see MedicationService's doc comment). intervalDays wasn't tracked by
// the old app at all; every medication is seeded with the same 30-day
// placeholder (a typical US refill cycle) -- adjust per-medication after
// seeding if a drug's real reorder cadence differs.
const MEDICATIONS = [
  {
    id: 'aspirin',
    name: 'Aspirin',
    dose: '81mg daily',
    category: 'Cardiac',
    intervalDays: 30,
  },
  {
    id: 'atorvastatin',
    name: 'Atorvastatin',
    dose: '20mg daily',
    category: 'Cardiac',
    intervalDays: 30,
  },
  {
    id: 'lisinopril',
    name: 'Lisinopril',
    dose: '10mg daily',
    category: 'Cardiac',
    intervalDays: 30,
  },
  {
    id: 'metoprolol',
    name: 'Metoprolol',
    dose: '25mg daily',
    category: 'Cardiac',
    intervalDays: 30,
  },
  {
    id: 'tamoxifen',
    name: 'Tamoxifen',
    dose: '20mg daily',
    category: 'Oncology',
    intervalDays: 30,
  },
  {
    id: 'sertraline',
    name: 'Sertraline',
    dose: '50mg daily',
    category: 'Mental',
    intervalDays: 30,
  },
  {
    id: 'escitalopram',
    name: 'Escitalopram',
    dose: '10mg daily',
    category: 'Mental',
    intervalDays: 30,
  },
  {
    id: 'alprazolam',
    name: 'Alprazolam',
    dose: '0.5mg as needed',
    category: 'Mental',
    intervalDays: 30,
  },
  {
    id: 'finasteride',
    name: 'Finasteride',
    dose: '5mg daily',
    category: 'Urologic',
    intervalDays: 30,
  },
  {
    id: 'omeprazole',
    name: 'Omeprazole',
    dose: '20mg daily',
    category: 'GI',
    intervalDays: 30,
  },
  {
    id: 'ondansetron',
    name: 'Ondansetron',
    dose: '4mg as needed',
    category: 'GI',
    intervalDays: 30,
  },
  {
    id: 'albuterol',
    name: 'Albuterol',
    dose: 'inhale as needed',
    category: 'Respiratory',
    intervalDays: 30,
  },
  {
    id: 'fluticasone',
    name: 'Fluticasone',
    dose: '110 mcg daily',
    category: 'Respiratory',
    intervalDays: 30,
  },
  {
    id: 'chlorhexidine',
    name: 'Chlorhexidine',
    dose: 'rinse daily',
    category: 'Dental',
    intervalDays: 30,
  },
  {
    id: 'calcium',
    name: 'Calcium',
    dose: '1000mg daily',
    category: 'BoneHealth',
    intervalDays: 30,
  },
  {
    id: 'vitamin-d',
    name: 'Vitamin D',
    dose: '1000 IU daily',
    category: 'BoneHealth',
    intervalDays: 30,
  },
];

function parseArgs(argv) {
  const args = { driveJsonPath: null, project: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--drive-json') args.driveJsonPath = argv[++i];
    else if (argv[i] === '--project') args.project = argv[++i];
  }
  return args;
}

async function resolveProjectId(explicitProject) {
  if (explicitProject) return explicitProject;
  const firebaserc = JSON.parse(await readFile('.firebaserc', 'utf8'));
  const projectId = firebaserc.projects?.prod;
  if (!projectId || projectId === 'REPLACE_WITH_FIREBASE_PROJECT_ID') {
    throw new Error(
      'No --project given and .firebaserc has no real "prod" project ID yet.',
    );
  }
  return projectId;
}

// Old Drive field name -> new Prescription field name (see
// PrescriptionService). lastOrderDate/nextOrderDate were already stored as
// YYYY-MM-DD strings by the old app's calendar picker, matching DateKey
// here -- no reformatting needed.
function toPrescription(order) {
  return {
    pharmacyName: order.source ?? '',
    pharmacyPhone: order.sourcePhone ?? '',
    pharmacyAddress: order.sourceAddress ?? '',
    prescriberName: order.prescriberName ?? '',
    prescriberPhone: order.prescriberPhone ?? '',
    howToOrder: order.howToOrder ?? '',
    lastOrderDate: order.lastOrderDate || null,
    nextOrderDate: order.nextOrderDate || null,
    scheduleNotes: order.scheduleNotes ?? '',
    updatedAt: order.updatedAt
      ? Timestamp.fromDate(new Date(order.updatedAt))
      : Timestamp.now(),
  };
}

async function main() {
  const { driveJsonPath, project } = parseArgs(process.argv.slice(2));
  const projectId = await resolveProjectId(project);
  const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

  initializeApp(
    usingEmulator
      ? { projectId }
      : { credential: applicationDefault(), projectId },
  );
  const db = getFirestore();

  const medicationsBatch = db.batch();
  for (const { id, ...data } of MEDICATIONS) {
    medicationsBatch.set(db.collection('medications').doc(id), data);
  }
  await medicationsBatch.commit();
  console.log(`Seeded ${MEDICATIONS.length} medications into "${projectId}".`);

  if (!driveJsonPath) {
    console.log('No --drive-json given -- skipped seeding prescriptions.');
    return;
  }

  const ordersData = JSON.parse(await readFile(driveJsonPath, 'utf8'));
  const knownIds = new Set(MEDICATIONS.map((m) => m.id));
  const prescriptionsBatch = db.batch();
  let seeded = 0;
  for (const [medicationId, order] of Object.entries(ordersData)) {
    if (!knownIds.has(medicationId)) {
      console.warn(
        `Skipping unknown medication id "${medicationId}" in ${driveJsonPath}.`,
      );
      continue;
    }
    prescriptionsBatch.set(
      db.collection('prescriptions').doc(medicationId),
      toPrescription(order),
    );
    seeded++;
  }
  await prescriptionsBatch.commit();
  console.log(`Seeded ${seeded} prescriptions from ${driveJsonPath}.`);
}

await main();
