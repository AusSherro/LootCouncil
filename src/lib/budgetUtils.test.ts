import { describe, expect, it } from 'vitest';
import { getMonthOffset, isHiddenCategoriesGroup, isInflowGroup } from './budgetUtils';

describe('getMonthOffset', () => {
    it('crosses backward over a year boundary', () => {
        expect(getMonthOffset('2026-01', -1)).toBe('2025-12');
    });

    it('crosses forward over a year boundary', () => {
        expect(getMonthOffset('2026-12', 1)).toBe('2027-01');
    });

    it('supports offsets longer than one year', () => {
        expect(getMonthOffset('2026-07', 18)).toBe('2028-01');
    });
});

describe('budget group classification', () => {
    it('recognizes inflow names case-insensitively', () => {
        expect(isInflowGroup('INFLOW')).toBe(true);
    });

    it('recognizes Ready to Assign system groups', () => {
        expect(isInflowGroup('Ready to Assign Categories')).toBe(true);
    });

    it('does not classify normal spending groups as inflow', () => {
        expect(isInflowGroup('Living Expenses')).toBe(false);
    });

    it('recognizes only the hidden categories system group', () => {
        expect(isHiddenCategoriesGroup('Hidden Categories')).toBe(true);
        expect(isHiddenCategoriesGroup('Hidden Savings')).toBe(false);
    });
});