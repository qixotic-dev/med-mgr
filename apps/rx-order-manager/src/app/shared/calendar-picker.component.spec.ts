import { buildMonthGrid } from './calendar-picker.component';

describe('buildMonthGrid', () => {
  it('leads with a null per weekday before the 1st (Sept 2026 starts on a Tuesday)', () => {
    const grid = buildMonthGrid('2026-09-01');
    expect(grid.slice(0, 2)).toEqual([null, null]);
    expect(grid[2]).toBe('2026-09-01');
  });

  it('includes every day of the month', () => {
    const grid = buildMonthGrid('2026-09-01');
    const days = grid.filter((cell) => cell !== null);
    expect(days).toHaveLength(30);
    expect(days[days.length - 1]).toBe('2026-09-30');
  });

  it('has no leading nulls when the 1st falls on a Sunday (Feb 2026)', () => {
    const grid = buildMonthGrid('2026-02-01');
    expect(grid[0]).toBe('2026-02-01');
    expect(grid.filter((cell) => cell !== null)).toHaveLength(28);
  });
});
