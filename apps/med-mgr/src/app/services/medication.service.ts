import { Injectable, inject } from '@angular/core'
import {
  Firestore,
  collection,
  collectionData,
  doc,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore'
import { Observable } from 'rxjs'
import type { Medication } from '../models/medication.model'
import { PRESCRIPTIONS_COLLECTION } from './prescription.service'

const COLLECTION = 'medications'

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

  /** Every medication, grouped/sorted for the category-tree sidebar. */
  readonly all$: Observable<Medication[]> = collectionData(
    query(
      collection(this.firestore, COLLECTION),
      orderBy('category'),
      orderBy('name'),
    ),
    { idField: 'id' },
  ) as Observable<Medication[]>

  /**
   * Creates a medication under the given id. `id` isn't part of `data`: it
   * lives in the document path, and `all$` reads it back via
   * `idField: 'id'`, so it must never also be written into the document
   * body. Overwrites silently if `id` already exists — acceptable in this
   * single-user, single-writer app, so there's no existence check.
   */
  async create(id: string, data: Omit<Medication, 'id'>): Promise<void> {
    await setDoc(doc(this.firestore, COLLECTION, id), data)
  }

  /** Updates one or more fields of an existing medication. Throws if `id` doesn't exist. */
  async update(
    id: string,
    changes: Partial<Omit<Medication, 'id'>>,
  ): Promise<void> {
    await updateDoc(doc(this.firestore, COLLECTION, id), changes)
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
