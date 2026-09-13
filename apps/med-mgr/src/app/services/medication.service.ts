import { Injectable, inject } from '@angular/core'
import {
  Firestore,
  collection,
  collectionData,
  deleteField,
  doc,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore'
import { Functions, httpsCallable } from '@angular/fire/functions'
import { Observable, shareReplay } from 'rxjs'
import type { Medication } from '../models/medication.model'
import { PRESCRIPTIONS_COLLECTION } from './prescription.service'

const COLLECTION = 'medications'
const REGENERATE_INFO_FUNCTION = 'regenerateMedicationInfoOnDemand'

/** Drops undefined-valued keys -- Firestore's setDoc/updateDoc throw on an
 * explicit `undefined` (ignoreUndefinedProperties isn't set, see
 * app.config.ts), and a Medication built from `{...existing}` commonly
 * carries one for every optional field a pre-migration/not-yet-generated
 * record never set (clinicalName, purpose, instructions, infoStatus,
 * infoError). */
function omitUndefined<T extends object>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

/** Like omitUndefined, but for updateDoc(): an explicit `undefined` means
 * "clear this field" (e.g. infoError once a hand-edit moves infoStatus off
 * 'error' -- see MedicationsComponent.save()), translated to Firestore's
 * deleteField() sentinel rather than left untouched. updateDoc (unlike the
 * non-merge setDoc create() uses) supports per-field deletion this way. */
function toUpdatePayload<T extends object>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value === undefined ? deleteField() : value,
    ]),
  ) as Partial<T>
}

/**
 * The medication reference list (see CONTEXT.md). Originally seeded once by
 * the migration script (Admin SDK, see tools/migrate-to-firestore.mjs) and
 * never edited afterward — the old Electron app didn't support adding/
 * editing medications either (a hardcoded array). `create`/`update`/`delete`
 * now support doing that through the app, using caller-supplied slug ids
 * (e.g. 'aspirin') matching the seed data's convention, not Firestore
 * auto-ids. `delete` also removes the Medication's linked Prescription
 * (exactly one per Medication today, see PrescriptionService) in the same
 * atomic batch, so it never leaves an orphaned Prescription doc behind.
 */
@Injectable({ providedIn: 'root' })
export class MedicationService {
  private readonly firestore = inject(Firestore)
  private readonly functions = inject(Functions)

  /** Every medication, grouped/sorted for the category-tree sidebar. Shared
   * (shareReplay) rather than a plain cold `collectionData` stream: it's now
   * subscribed by up to three places at once -- whichever of
   * MedicationsComponent/InteractionsComponent is routed in, plus
   * SelectedMedicationBarComponent, which is mounted for the whole
   * authenticated session (see TODO.md #7 -- flagged by Copilot review on
   * PR #18). Without sharing, each subscriber would open its own Firestore
   * listener against the same query, tripling reads/snapshot updates for no
   * reason. `refCount: true` still closes the underlying listener once
   * nothing is subscribed (e.g. fully signed out), rather than leaking it
   * for the app's lifetime. */
  readonly all$: Observable<Medication[]> = (
    collectionData(
      query(
        collection(this.firestore, COLLECTION),
        orderBy('category'),
        orderBy('commonName'),
      ),
      { idField: 'id' },
    ) as Observable<Medication[]>
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }))

  /**
   * Creates a medication under the given id. `id` isn't part of `data`: it
   * lives in the document path, and `all$` reads it back via
   * `idField: 'id'`, so it must never also be written into the document
   * body. Overwrites silently if `id` already exists — acceptable in this
   * single-user, single-writer app, so there's no existence check.
   */
  async create(id: string, data: Omit<Medication, 'id'>): Promise<void> {
    await setDoc(doc(this.firestore, COLLECTION, id), omitUndefined(data))
  }

  /** Updates one or more fields of an existing medication. An explicit
   * `undefined` value clears that field (e.g. a stale `infoError` once
   * `infoStatus` moves off `'error'`) rather than leaving it untouched --
   * see toUpdatePayload(). Throws if `id` doesn't exist. */
  async update(
    id: string,
    changes: Partial<Omit<Medication, 'id'>>,
  ): Promise<void> {
    await updateDoc(
      doc(this.firestore, COLLECTION, id),
      toUpdatePayload(changes),
    )
  }

  /** Regenerates one medication's AI-generated purpose/instructions on demand
   * — covers backfilling a pre-migration medication and refreshing stale
   * text after a name correction. */
  async regenerateInfoOnDemand(medicationId: string): Promise<void> {
    await httpsCallable(
      this.functions,
      REGENERATE_INFO_FUNCTION,
    )({ medicationId })
  }

  /**
   * Deletes a medication and its linked Prescription doc together, atomically
   * — see the class doc comment above. Reaches directly into the
   * `prescriptions` collection rather than going through PrescriptionService
   * so the two deletes can't partially fail. Deleting a Prescription that
   * was never saved (an empty-state Medication) is a Firestore no-op, so no
   * existence check is needed first.
   */
  async delete(id: string): Promise<void> {
    const batch = writeBatch(this.firestore)
    batch.delete(doc(this.firestore, COLLECTION, id))
    batch.delete(doc(this.firestore, PRESCRIPTIONS_COLLECTION, id))
    await batch.commit()
  }
}
