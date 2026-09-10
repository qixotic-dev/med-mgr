import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { DateKey } from '../util/date-key';
import { reorderStatus, reorderStatusLabel } from '../util/reorder-status';

/**
 * Read-only status pill for a Prescription's reorder urgency (see
 * util/reorder-status.ts). Adapted, not literally ported, from day-mgr's
 * StatusBadgeComponent: that one is a toggleable taken/not-taken *button*
 * with a boolean state; this has no click action, and its label carries a
 * live day count ("Due in 3 days") rather than a fixed word per state.
 */
@Component({
  selector: 'app-status-badge',
  standalone: true,
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly nextOrderDate = input.required<DateKey | null>();

  readonly status = computed(() => reorderStatus(this.nextOrderDate()));
  readonly label = computed(() => reorderStatusLabel(this.nextOrderDate()));
}
