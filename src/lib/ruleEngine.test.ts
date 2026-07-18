import { describe, expect, it } from 'vitest';
import { matchesRule } from './ruleEngine';

describe('matchesRule', () => {
    it.each([
        ['equals', 'Coffee Shop', 'coffee shop'],
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