import { describe, expect, it } from 'vitest';
import { findMatchingRule, matchesRule } from './ruleEngine';

describe('matchesRule', () => {
    it.each([
        ['equals', 'Coffee Shop', 'coffee shop'],
        ['exact', 'Coffee Shop', 'coffee shop'],
        ['contains', 'Weekly Coffee Shop', 'coffee'],
        ['startsWith', 'Coffee Shop', 'coffee'],
        ['endsWith', 'Local Coffee', 'coffee'],
    ])('matches %s case-insensitively', (matchType, value, matchValue) => {
        expect(matchesRule(value, matchType, matchValue)).toBe(true);
    });

    it('supports safe regular expressions', () => {
        expect(matchesRule('Invoice 1234', 'regex', '^invoice \\d+$')).toBe(true);
    });

    it('rejects invalid regular expressions', () => {
        expect(matchesRule('anything', 'regex', '[')).toBe(false);
    });

    it('rejects nested-quantifier patterns', () => {
        expect(matchesRule('aaaaaaaa!', 'regex', '(a+)+$')).toBe(false);
    });

    it('rejects patterns over the length limit', () => {
        expect(matchesRule('anything', 'regex', 'a'.repeat(201))).toBe(false);
    });

    it('returns false for unsupported match types', () => {
        expect(matchesRule('Coffee', 'unknown', 'Coffee')).toBe(false);
    });
});

describe('findMatchingRule', () => {
    const rules = [
        { id: 'high', matchField: 'payee', matchType: 'contains', matchValue: 'woolworths' },
        { id: 'memo', matchField: 'memo', matchType: 'contains', matchValue: 'rent' },
        { id: 'amount', matchField: 'amount', matchType: 'equals', matchValue: '-9.99' },
        { id: 'low', matchField: 'payee', matchType: 'contains', matchValue: 'wool' },
    ];

    it('returns the first matching rule in the given (priority) order', () => {
        expect(findMatchingRule(rules, { payee: 'Woolworths Metro', amount: -40 })?.id).toBe('high');
        expect(findMatchingRule(rules, { payee: 'Wool shop', amount: -40 })?.id).toBe('low');
    });

    it('matches memo and amount fields', () => {
        expect(findMatchingRule(rules, { memo: 'November rent', amount: -2000 })?.id).toBe('memo');
        expect(findMatchingRule(rules, { payee: 'Netflix', amount: -9.99 })?.id).toBe('amount');
    });

    it('treats missing payee/memo as empty and ignores unknown fields', () => {
        expect(findMatchingRule(rules, { payee: null, memo: undefined, amount: 1 })).toBeUndefined();
        expect(findMatchingRule([{ matchField: 'account', matchType: 'contains', matchValue: '' }], { amount: 1 })).toBeUndefined();
    });
});
