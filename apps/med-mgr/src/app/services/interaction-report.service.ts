import { Injectable, inject } from '@angular/core'
import { Firestore, doc, docData } from '@angular/fire/firestore'
import { Functions, httpsCallable } from '@angular/fire/functions'
import { Observable } from 'rxjs'
import type { InteractionReport } from '../models/interaction-report.model'

const COLLECTION = 'interactionReports'
const DOC_ID = 'current'
const REGENERATE_FUNCTION = 'regenerateInteractionReportOnDemand'

/**
 * The current AI-generated Interaction Report (see CONTEXT.md). Read-only
 * from the client — only the interaction-report Cloud Function writes it
 * (see firestore.rules), regenerating it whenever a Medication or the
 * Patient profile changes.
 */
@Injectable({ providedIn: 'root' })
export class InteractionReportService {
  private readonly firestore = inject(Firestore)
  private readonly functions = inject(Functions)

  /** The current report, or undefined until the first one has been generated. */
  readonly report$: Observable<InteractionReport | undefined> = docData(
    doc(this.firestore, COLLECTION, DOC_ID),
  ) as Observable<InteractionReport | undefined>

  async regenerateOnDemand(): Promise<void> {
    await httpsCallable(this.functions, REGENERATE_FUNCTION)({})
  }
}
