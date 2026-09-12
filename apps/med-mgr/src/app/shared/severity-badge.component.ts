import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core'
import type { Severity } from '../models/interaction-report.model'

const LABELS: Record<Severity, string> = {
  minor: 'Minor',
  moderate: 'Moderate',
  major: 'Major',
}

/**
 * Read-only severity pill for a Finding (see CONTEXT.md). Same shape/CSS
 * approach as StatusBadgeComponent (a `.status-badge` span whose class picks
 * the color), but that one's `status()` is hardwired to reorder-date math —
 * not reusable here, so this is its own small component keyed by Severity.
 */
@Component({
  selector: 'app-severity-badge',
  standalone: true,
  templateUrl: './severity-badge.component.html',
  styleUrl: './severity-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeverityBadgeComponent {
  readonly severity = input.required<Severity>()

  protected readonly label = computed(() => LABELS[this.severity()])
}
