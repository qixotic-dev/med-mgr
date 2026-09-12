import { Injectable, inject } from '@angular/core'
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore'
import { Observable } from 'rxjs'
import type { Patient } from '../models/patient.model'

const COLLECTION = 'patients'
const DOC_ID = 'me'

/**
 * The single-user Patient profile (see CONTEXT.md) — one document, since
 * this app has exactly one user. Read by the Interactions page and by the
 * interaction-report Cloud Function to inform the AI-generated report.
 */
@Injectable({ providedIn: 'root' })
export class PatientService {
  private readonly firestore = inject(Firestore)

  /** The Patient profile, or undefined until it's been saved once. */
  readonly patient$: Observable<Patient | undefined> = docData(
    doc(this.firestore, COLLECTION, DOC_ID),
  ) as Observable<Patient | undefined>

  /** Creates or overwrites the Patient profile — the editor always saves the whole form at once. */
  async save(data: Patient): Promise<void> {
    await setDoc(doc(this.firestore, COLLECTION, DOC_ID), data)
  }
}
