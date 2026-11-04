import { describe, expect, it } from 'vitest';
import { toLocalDateString, toLocalMonthString } from './utils';

describe('local date helpers', () => {
    it('uses the local calendar date, not the UTC one', () => {
        // 8am local on 1 November: in Australia this is still 31 October in UTC.
        const earlyMorning = new Date(2026, 10, 1, 8, 0, 0);
        expect(toLocalDateString(earlyMorning)).toBe('2026-11-01');
        expect(toLocalMonthString(earlyMorning)).toBe('2026-11');
    });

    it('handles late evening and zero-pads', () => {
        const lateEvening = new Date(2026, 0, 5, 23, 59, 59);
        expect(toLocalDateString(lateEvening)).toBe('2026-01-05');
        expect(toLocalMonthString(lateEvening)).toBe('2026-01');
    });
});
