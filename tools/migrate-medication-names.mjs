// One-time migration: renames the `medications` collection's `name` field
// to `commonName` in place (same document IDs, no re-slugifying).
// `clinicalName`/`purpose`/`instructions`/`infoStatus` are left unset on
// existing docs -- backfill them afterward via the app's "Regenerate"
// button. Run once, then this script can be deleted.
//
// Usage:
//   node tools/migrate-medication-names.mjs [--project <id>]
//
// Credentials -- firebase-admin's Application Default Credentials:
//   - Local Emulator Suite (dry run): start it with `pnpm run emulators`,
//     then in another terminal set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
//     before running this script -- no real credentials needed. With
//     FIRESTORE_EMULATOR_HOST set, --project defaults to the "default"
//     alias in .firebaserc, not "prod".
//   - The real project: Firebase console -> Project settings -> Service
//     accounts -> Generate new private key, then set
//     GOOGLE_APPLICATION_CREDENTIALS to the downloaded file's path.
//     --project defaults to the "prod" alias in .firebaserc.
//
// Cost note: if the new onMedicationWritten trigger is already deployed
// when this runs, each migrated doc's write is NOT an info-only change (see
// generate-medication-info.ts's MEDICATION_INFO_FIELDS), so it fires one
// full Interaction Report regen per doc. To avoid that, disable/undeploy
// the trigger first, run this script, then redeploy -- otherwise it's a
// one-time, bounded cost proportional to the medication count.

import { readFile } from 'node:fs/promises'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

function parseArgs(argv) {
  const args = { project: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') args.project = argv[++i]
  }
  return args
}

async function resolveProjectId(explicitProject, usingEmulator) {
  if (explicitProject) return explicitProject
  const firebaserc = JSON.parse(await readFile('.firebaserc', 'utf8'))
  if (usingEmulator) {
    const defaultProjectId = firebaserc.projects?.default
    if (!defaultProjectId) {
      throw new Error(
        'No --project given and .firebaserc has no "default" project ID for the emulator.',
      )
    }
    return defaultProjectId
  }
  const projectId = firebaserc.projects?.prod
  if (!projectId || projectId === 'REPLACE_WITH_FIREBASE_PROJECT_ID') {
    throw new Error(
      'No --project given and .firebaserc has no real "prod" project ID yet.',
    )
  }
  return projectId
}

async function main() {
  const { project } = parseArgs(process.argv.slice(2))
  const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST
  const projectId = await resolveProjectId(project, usingEmulator)

  initializeApp(
    usingEmulator
      ? { projectId }
      : { credential: applicationDefault(), projectId },
  )
  const db = getFirestore()

  // Reads before writing (unlike migrate-to-firestore.mjs's batched .set()
  // of brand-new docs) -- a plain sequential loop, not batched, since this
  // is a small personal collection and each write depends on that doc's own
  // read.
  const snapshot = await db.collection('medications').get()
  let migrated = 0
  for (const doc of snapshot.docs) {
    const data = doc.data()
    if (typeof data.name !== 'string') {
      continue // already migrated, or a doc with no legacy `name` field
    }
    await doc.ref.update({
      commonName: data.name,
      name: FieldValue.delete(),
    })
    migrated++
  }
  console.log(
    `Migrated ${migrated} of ${snapshot.size} medication docs in "${projectId}".`,
  )
}

await main()
