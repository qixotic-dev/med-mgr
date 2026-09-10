import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  orderBy,
  query,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import type { Medication } from '../models/medication.model';

const COLLECTION = 'medications';

/**
 * The fixed medication reference list (see CONTEXT.md) — read-only from the
 * app. Medications are seeded once by the migration script (Admin SDK, see
 * tools/migrate-to-firestore.mjs), not created or edited through this
 * service: the old Electron app never supported adding/editing them either
 * (a hardcoded array), and the Prescription detail form only edits
 * Prescription fields.
 */
@Injectable({ providedIn: 'root' })
export class MedicationService {
  private readonly firestore = inject(Firestore);

  /** Every medication, grouped/sorted for the category-tree sidebar. */
  readonly all$: Observable<Medication[]> = collectionData(
    query(
      collection(this.firestore, COLLECTION),
      orderBy('category'),
      orderBy('name'),
    ),
    { idField: 'id' },
  ) as Observable<Medication[]>;
}
