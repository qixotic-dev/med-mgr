import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core'
import type { DateKey, DateRange } from '../util/date-key'
import {
  addDays,
  addMonths,
  endOfMonth,
  fromDateKey,
  monthKey,
  startOfMonth,
} from '../util/date-key'

/**
 * Calendar-icon-triggered month-grid date picker, replacing a native
 * `<input type="date">` so the popup can be styled to match the app.
 * Ported from day-mgr's CalendarPickerComponent; that version also colors
 * days by completion status via a `dayStatuses` input (fetched by the
 * caller in response to `visibleMonthChanged`) — med-mgr doesn't need
 * per-day coloring, so that input and the day-status classes are omitted.
 */
@Component({
  selector: 'app-calendar-picker',
  standalone: true,
  templateUrl: './calendar-picker.component.html',
  styleUrl: './calendar-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPickerComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>)

  readonly selected = input.required<DateKey>()
  readonly minDate = input.required<DateKey>()
  readonly maxDate = input.required<DateKey>()
  /** When true, the toggle button can't open the popover at all -- for a
   * caller that needs to block picking a date for a reason the picker
   * itself has no way to know about (e.g. PrescriptionsComponent disabling
   * it while a Calendar write for *any* medication is in flight, see
   * TODO.md #12). Defaults to false so existing usages are unaffected. */
  readonly disabled = input(false)

  readonly dateSelected = output<DateKey>()
  readonly visibleMonthChanged = output<DateRange>()

  readonly weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  readonly isOpen = signal(false)
  /** The month currently shown in the grid — always the 1st of a month.
   * Set for real by `toggle()`; the initial value is never rendered since
   * the grid only shows while `isOpen()`. */
  private readonly viewMonth = signal<DateKey>('')

  readonly grid = computed(() => buildMonthGrid(this.viewMonth()))

  readonly monthLabel = computed(() =>
    fromDateKey(this.viewMonth()).toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    }),
  )

  readonly isPrevMonthDisabled = computed(
    () => monthKey(this.viewMonth()) <= monthKey(this.minDate()),
  )

  readonly isNextMonthDisabled = computed(
    () => monthKey(this.viewMonth()) >= monthKey(this.maxDate()),
  )

  toggle(): void {
    if (this.disabled()) {
      return
    }
    if (this.isOpen()) {
      this.close()
      return
    }
    this.viewMonth.set(startOfMonth(this.selected()))
    this.isOpen.set(true)
    this.emitVisibleMonth()
  }

  close(): void {
    this.isOpen.set(false)
  }

  prevMonth(): void {
    if (this.isPrevMonthDisabled()) {
      return
    }
    this.viewMonth.set(addMonths(this.viewMonth(), -1))
    this.emitVisibleMonth()
  }

  nextMonth(): void {
    if (this.isNextMonthDisabled()) {
      return
    }
    this.viewMonth.set(addMonths(this.viewMonth(), 1))
    this.emitVisibleMonth()
  }

  isDisabled(date: DateKey): boolean {
    return date < this.minDate() || date > this.maxDate()
  }

  selectDay(date: DateKey): void {
    if (this.isDisabled(date)) {
      return
    }
    this.dateSelected.emit(date)
    this.close()
  }

  dayNumber(date: DateKey): number {
    return Number(date.slice(8, 10))
  }

  private emitVisibleMonth(): void {
    const monthStart = startOfMonth(this.viewMonth())
    const monthEnd = endOfMonth(this.viewMonth())
    const start = monthStart > this.minDate() ? monthStart : this.minDate()
    const end = monthEnd < this.maxDate() ? monthEnd : this.maxDate()
    this.visibleMonthChanged.emit({ start, end })
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (
      this.isOpen() &&
      !this.elementRef.nativeElement.contains(event.target as Node)
    ) {
      this.close()
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close()
  }
}

/**
 * A flat month grid: leading `null` placeholders so the 1st lands in its
 * correct weekday column, followed by every DateKey in that month.
 */
export function buildMonthGrid(monthStart: DateKey): (DateKey | null)[] {
  const leading = fromDateKey(monthStart).getDay()
  const end = endOfMonth(monthStart)
  const days: DateKey[] = []
  for (let date = monthStart; date <= end; date = addDays(date, 1)) {
    days.push(date)
  }
  return [...(Array(leading).fill(null) as null[]), ...days]
}
