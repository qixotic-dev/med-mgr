import { Injectable, inject } from '@angular/core'
import {
  Firestore,
  Timestamp,
  collection,
  collectionData,
  doc,
  docData,
  setDoc,
} from '@angular/fire/firestore'
import { Observable, map } from 'rxjs'
import type { DateKey } from '../util/date-key'
import type { Prescription } from '../models/prescription.model'
import { emptyPrescription } from '../models/prescription.model'

const COLLECTION = 'prescriptions'

interface PrescriptionDoc {
  pharmacyName: string
  pharmacyPhone: string
  pharmacyAddress: string
  prescriberName: string
  prescriberPhone: string
  howToOrder: string
  lastOrderDate: DateKey | null
  nextOrderDate: DateKey | null
  scheduleNotes: string
  updatedAt: Timestamp | null
}

function toPrescription(
  medicationId: string,
  data: PrescriptionDoc,
): Prescription {
  return {
    medicationId,
    ...data,
    updatedAt: data.updatedAt ? data.updatedAt.toDate() : null,
  }
}

/**
 * The reorder logistics for one Medication (see CONTEXT.md). Doc ID = the
 * owning Medication's `id` slug, not a separate autoId — created lazily on
 * first save, mirroring day-mgr's DayService: a Medication with no
 * Prescription doc yet reads back as `emptyPrescription`, not pre-created.
 */
@Injectable({ providedIn: 'root' })
export class PrescriptionService {
  private readonly firestore = inject(Firestore)

  /** Every Prescription — what the sidebar's reorder-status badges are computed from. */
  readonly all$: Observable<Prescription[]> = (
    collectionData(collection(this.firestore, COLLECTION), {
      idField: 'medicationId',
    }) as Observable<(PrescriptionDoc & { medicationId: string })[]>
  ).pipe(map((docs) => docs.map((d) => toPrescription(d.medicationId, d))))

  byMedicationId$(medicationId: string): Observable<Prescription> {
    return (
      docData(doc(this.firestore, COLLECTION, medicationId)) as Observable<
        PrescriptionDoc | undefined
      >
    ).pipe(
      map((data) =>
        data
          ? toPrescription(medicationId, data)
          : emptyPrescription(medicationId),
      ),
    )
  }

  async save(
    medicationId: string,
    changes: Omit<Prescription, 'medicationId' | 'updatedAt'>,
  ): Promise<void> {
    await setDoc(
      doc(this.firestore, COLLECTION, medicationId),
      { ...changes, updatedAt: Timestamp.now() },
      { merge: true },
    )
  }
}
