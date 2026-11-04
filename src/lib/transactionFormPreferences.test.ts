import { describe, expect, it } from 'vitest';
import { getLastTransactionAccountKey, resolveTransactionAccountId } from './transactionFormPreferences';

const accounts = [{ id: 'everyday' }, { id: 'savings' }];

describe('transaction form account preference', () => {
    it('uses the first valid preferred account', () => {
        expect(resolveTransactionAccountId(accounts, 'savings', 'everyday')).toBe('savings');
    });

    it('ignores stale account IDs and falls back to the first open account', () => {
        expect(resolveTransactionAccountId(accounts, 'closed-account')).toBe('everyday');
    });

    it('returns an empty value when no accounts are available', () => {
        expect(resolveTransactionAccountId([], 'savings')).toBe('');
    });

    it('names the preference by profile', () => {
        expect(getLastTransactionAccountKey('joint')).toBe('loot-council-last-transaction-account-joint');
    });
});