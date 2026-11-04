import { describe, expect, it } from 'vitest';
import { calculateNextDueDate } from './scheduleDates';

function next(frequency: string, iso: string, dayOfMonth?: number | null): string {
    return calculateNextDueDate({
        frequency,
        nextDueDate: new Date(iso),
        dayOfMonth,
    }).toISOString();
}

describe('calculateNextDueDate', () => {
    it('advances simple frequencies', () => {
        expect(next('daily', '2026-03-10T00:00:00.000Z')).toBe('2026-03-11T00:00:00.000Z');
        expect(next('weekly', '2026-03-10T00:00:00.000Z')).toBe('2026-03-17T00:00:00.000Z');
        expect(next('biweekly', '2026-03-10T00:00:00.000Z')).toBe('2026-03-24T00:00:00.000Z');
        expect(next('monthly', '2026-03-10T00:00:00.000Z')).toBe('2026-04-10T00:00:00.000Z');
        expect(next('yearly', '2026-03-10T00:00:00.000Z')).toBe('2027-03-10T00:00:00.000Z');
    });

    it('clamps month-end instead of overflowing into the following month', () => {
        // Regression: `setMonth(+1)` on 31 Jan produces "31 Feb", which JavaScript
        // rolls forward to 3 March — the bill skips February entirely.
        expect(next('monthly', '2026-01-31T00:00:00.000Z')).toBe('2026-02-28T00:00:00.000Z');
        expect(next('monthly', '2026-03-31T00:00:00.000Z')).toBe('2026-04-30T00:00:00.000Z');
        expect(next('monthly', '2026-05-31T00:00:00.000Z')).toBe('2026-06-30T00:00:00.000Z');
    });

    it('clamps to 29 February in a leap year', () => {
        expect(next('monthly', '2028-01-31T00:00:00.000Z')).toBe('2028-02-29T00:00:00.000Z');
        expect(next('yearly', '2028-02-29T00:00:00.000Z')).toBe('2029-02-28T00:00:00.000Z');
    });

    it('honours an explicit dayOfMonth, clamped to the target month', () => {
        expect(next('monthly', '2026-01-15T00:00:00.000Z', 31)).toBe('2026-02-28T00:00:00.000Z');
        expect(next('monthly', '2026-04-15T00:00:00.000Z', 1)).toBe('2026-05-01T00:00:00.000Z');
    });

    it('rolls the year over correctly in December', () => {
        expect(next('monthly', '2026-12-15T00:00:00.000Z')).toBe('2027-01-15T00:00:00.000Z');
        expect(next('monthly', '2026-12-31T00:00:00.000Z')).toBe('2027-01-31T00:00:00.000Z');
    });

    it('stays on UTC midnight across daylight-saving transitions', () => {
        // Sydney switches DST in early April and early October. Local-time mutators
        // would shift these results to 23:00 the previous day.
        expect(next('monthly', '2026-09-15T00:00:00.000Z')).toBe('2026-10-15T00:00:00.000Z');
        expect(next('monthly', '2026-03-15T00:00:00.000Z')).toBe('2026-04-15T00:00:00.000Z');
        expect(next('daily', '2026-10-03T00:00:00.000Z')).toBe('2026-10-04T00:00:00.000Z');
        expect(next('weekly', '2026-03-29T00:00:00.000Z')).toBe('2026-04-05T00:00:00.000Z');
    });

    it('treats an unknown frequency as monthly', () => {
        expect(next('fortnightly-ish', '2026-01-31T00:00:00.000Z')).toBe('2026-02-28T00:00:00.000Z');
    });
});
