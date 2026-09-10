import { reorderStatus, reorderStatusLabel } from './reorder-status';

describe('reorderStatus', () => {
  const today = '2026-09-10';

  it('is not-scheduled when no next order date is set', () => {
    expect(reorderStatus(null, today)).toBe('not-scheduled');
  });

  it('is overdue when the next order date is in the past', () => {
    expect(reorderStatus('2026-09-09', today)).toBe('overdue');
  });

  it('is due-soon on the day itself (0 days out)', () => {
    expect(reorderStatus('2026-09-10', today)).toBe('due-soon');
  });

  it('is due-soon at the 7-day boundary (inclusive)', () => {
    expect(reorderStatus('2026-09-17', today)).toBe('due-soon');
  });

  it('is scheduled just past the 7-day boundary', () => {
    expect(reorderStatus('2026-09-18', today)).toBe('scheduled');
  });
});

describe('reorderStatusLabel', () => {
  const today = '2026-09-10';

  it('reads "Not scheduled" with no next order date', () => {
    expect(reorderStatusLabel(null, today)).toBe('Not scheduled');
  });

  it('reads "Overdue" for a past date', () => {
    expect(reorderStatusLabel('2026-09-09', today)).toBe('Overdue');
  });

  it('reads "Due in 0 days" the day it is due', () => {
    expect(reorderStatusLabel('2026-09-10', today)).toBe('Due in 0 days');
  });

  it('singularizes "Due in 1 day"', () => {
    expect(reorderStatusLabel('2026-09-11', today)).toBe('Due in 1 day');
  });

  it('reads "In N days" once past the due-soon window', () => {
    expect(reorderStatusLabel('2026-10-22', today)).toBe('In 42 days');
  });
});
