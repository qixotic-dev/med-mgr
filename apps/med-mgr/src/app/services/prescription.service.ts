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

export const PRESCRIPTIONS_COLLECTION = 'prescriptions'

interface PrescriptionDoc {
  pharmacyName: string
  pharmacyPhone: string
  pharmacyAddress: string
  prescriberName: string
  prescriberPhone: string
  howToOrder: string
  lastOrderDate: DateKey | null
  nextOrderDate: DateKey | null
  calendarEventId: string | null
  scheduleNotes: string
  updatedAt: Timestamp | null
}

function toPrescription(
  medicationId: string,
  data: PrescriptionDoc,
): Prescription {
  return {
    // Defaults for fields a doc doesn't have -- either a pre-existing prod
    // doc that predates calendarEventId, or one saveSchedule() created
    // holding only nextOrderDate/calendarEventId (see its doc comment).
    ...emptyPrescription(medicationId),
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
    collectionData(collection(this.firestore, PRESCRIPTIONS_COLLECTION), {
      idField: 'medicationId',
    }) as Observable<(PrescriptionDoc & { medicationId: string })[]>
  ).pipe(map((docs) => docs.map((d) => toPrescription(d.medicationId, d))))

  byMedicationId$(medicationId: string): Observable<Prescription> {
    return (
      docData(
        doc(this.firestore, PRESCRIPTIONS_COLLECTION, medicationId),
      ) as Observable<PrescriptionDoc | undefined>
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
      doc(this.firestore, PRESCRIPTIONS_COLLECTION, medicationId),
      { ...changes, updatedAt: Timestamp.now() },
      { merge: true },
    )
  }

  /** Persists just `nextOrderDate` and its Calendar event id, independent of
   * `save()` -- called immediately after a Calendar write
   * (PrescriptionsComponent.pickNextOrderDate()/clearSchedule()), which must
   * not wait for the user to click Save, and must not flush whatever
   * possibly-unsaved pharmacy/prescriber fields are sitting in the draft.
   * Merges rather than requiring the doc to already exist -- a schedule
   * picked before any other field was ever saved creates a doc holding only
   * these fields; toPrescription() backfills the rest on read. */
  async saveSchedule(
    medicationId: string,
    nextOrderDate: DateKey | null,
    calendarEventId: string | null,
  ): Promise<void> {
    await setDoc(
      doc(this.firestore, PRESCRIPTIONS_COLLECTION, medicationId),
      { nextOrderDate, calendarEventId, updatedAt: Timestamp.now() },
      { merge: true },
    )
  }
}
