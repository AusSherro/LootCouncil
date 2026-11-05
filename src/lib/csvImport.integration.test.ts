/**
 * Integration tests for the CSV import money path.
 *
 * CSV import creates transactions and mutates account balances in bulk, so a
 * regression here corrupts every downstream number. These cover format
 * detection, AU date parsing, debit/credit columns, duplicate suppression,
 * balance arithmetic, and profile scoping.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from './prisma';
import { POST as importCsv } from '@/app/api/import/csv/route';

let profileId: string;
let otherProfileId: string;
let accountId: string;
let foreignAccountId: string;

function csvRequest(csv: string, fields: Record<string, string>, targetProfileId: string) {
    const formData = new FormData();
    formData.append('file', new File([csv], 'statement.csv', { type: 'text/csv' }));
    for (const [key, value] of Object.entries(fields)) {
        formData.append(key, value);
    }
    return new NextRequest(`http://localhost/api/import/csv?profileId=${targetProfileId}`, {
        method: 'POST',
        body: formData,
    });
}

async function accountState(id: string) {
    const account = await prisma.account.findUniqueOrThrow({ where: { id } });
    return { balance: account.balance, clearedBalance: account.clearedBalance };
}

beforeAll(async () => {
    const [profile, otherProfile] = await Promise.all([
        prisma.profile.create({ data: { name: 'CSV Import Profile' } }),
        prisma.profile.create({ data: { name: 'CSV Import Other' } }),
    ]);
    profileId = profile.id;
    otherProfileId = otherProfile.id;

    const [account, foreign] = await Promise.all([
        prisma.account.create({ data: { name: 'Import Target', type: 'checking', profileId } }),
        prisma.account.create({ data: { name: 'Foreign Target', type: 'checking', profileId: otherProfileId } }),
    ]);
    accountId = account.id;
    foreignAccountId = foreign.id;
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('CSV import', () => {
    const simpleCsv = [
        'Date,Amount,Description,Reference',
        '05/09/2026,-45.20,Corner Cafe,card purchase',
        '06/09/2026,1200.00,Salary,payroll',
    ].join('\n');

    it('previews without writing anything', async () => {
        const response = await importCsv(csvRequest(simpleCsv, { action: 'preview' }, profileId));
        expect(response.status).toBe(200);

        const preview = await response.json();
        expect(preview.totalRows).toBe(2);
        expect(preview.headers).toContain('Amount');
        expect(preview.parsedTransactions).toHaveLength(2);

        // A preview must never touch the ledger.
        await expect(prisma.transaction.count({ where: { accountId } })).resolves.toBe(0);
        await expect(accountState(accountId)).resolves.toEqual({ balance: 0, clearedBalance: 0 });
    });

    it('imports rows, parses AU dates, and updates balances', async () => {
        const response = await importCsv(
            csvRequest(simpleCsv, { action: 'import', accountId }, profileId)
        );
        expect(response.status).toBe(200);

        const result = await response.json();
        expect(result.imported).toBe(2);
        expect(result.duplicates).toBe(0);

        const transactions = await prisma.transaction.findMany({
            where: { accountId },
            orderBy: { amount: 'asc' },
        });
        expect(transactions).toHaveLength(2);
        expect(transactions[0].amount).toBe(-4520);
        expect(transactions[1].amount).toBe(120000);

        // DD/MM/YYYY must not be read as MM/DD/YYYY.
        const cafe = transactions.find(t => t.payee === 'Corner Cafe');
        expect(cafe?.date.getUTCMonth()).toBe(8); // September
        expect(cafe?.date.getUTCDate()).toBe(5);

        // Imported rows are cleared but unapproved, pending review.
        expect(transactions.every(t => t.cleared)).toBe(true);
        expect(transactions.every(t => !t.approved)).toBe(true);

        // Balance must equal the sum of imported amounts.
        await expect(accountState(accountId)).resolves.toEqual({
            balance: 115480,
            clearedBalance: 115480,
        });
    });

    it('suppresses duplicates on re-import and leaves balances untouched', async () => {
        const before = await accountState(accountId);

        const response = await importCsv(
            csvRequest(simpleCsv, { action: 'import', accountId }, profileId)
        );
        expect(response.status).toBe(200);

        const result = await response.json();
        expect(result.imported).toBe(0);
        expect(result.duplicates).toBe(2);

        await expect(prisma.transaction.count({ where: { accountId } })).resolves.toBe(2);
        await expect(accountState(accountId)).resolves.toEqual(before);
    });

    it('stores the first of the month as UTC midnight, not the previous month', async () => {
        // Regression: `new Date(y, m, d)` yields LOCAL midnight, which in
        // Australia/Sydney (the target timezone) stores 01/10/2026 as
        // 2026-09-30T14:00Z — silently budgeting it to September.
        const boundaryCsv = [
            'Date,Amount,Description',
            '01/10/2026,-10.00,First Of Month',
        ].join('\n');

        const response = await importCsv(
            csvRequest(boundaryCsv, { action: 'import', accountId }, profileId)
        );
        expect(response.status).toBe(200);

        const tx = await prisma.transaction.findFirstOrThrow({
            where: { accountId, payee: 'First Of Month' },
        });
        expect(tx.date.toISOString()).toBe('2026-10-01T00:00:00.000Z');
        // Budget bucketing slices the UTC month off the ISO string.
        expect(tx.date.toISOString().slice(0, 7)).toBe('2026-10');
    });

    it('handles separate debit and credit columns', async () => {
        const debitCreditCsv = [
            'Date,Narrative,Debit ($),Credit ($)',
            '10/09/2026,Utilities,88.10,',
            '11/09/2026,Refund,,25.00',
        ].join('\n');

        const response = await importCsv(
            csvRequest(debitCreditCsv, { action: 'import', accountId }, profileId)
        );
        expect(response.status).toBe(200);
        expect((await response.json()).imported).toBe(2);

        const utilities = await prisma.transaction.findFirstOrThrow({
            where: { accountId, payee: 'Utilities' },
        });
        const refund = await prisma.transaction.findFirstOrThrow({
            where: { accountId, payee: 'Refund' },
        });
        // Debits are outflows, credits are inflows.
        expect(utilities.amount).toBe(-8810);
        expect(refund.amount).toBe(2500);
    });

    it('keeps the account balance equal to the sum of its transactions', async () => {
        const aggregate = await prisma.transaction.aggregate({
            where: { accountId },
            _sum: { amount: true },
        });
        const { balance } = await accountState(accountId);
        expect(balance).toBe(aggregate._sum.amount);
    });

    it('applies transaction rules and still catches re-imports of renamed payees', async () => {
        const group = await prisma.categoryGroup.create({ data: { name: 'CSV Rules', profileId } });
        const category = await prisma.category.create({ data: { name: 'Groceries', groupId: group.id } });
        const rulesAccount = await prisma.account.create({
            data: { name: 'Rules Target', type: 'checking', profileId },
        });
        await prisma.transactionRule.create({
            data: {
                name: 'Woolies',
                matchField: 'payee',
                matchType: 'contains',
                matchValue: 'WOOLWORTHS',
                categoryId: category.id,
                payeeRename: 'Woolworths',
                profileId,
            },
        });
        const rulesCsv = [
            'Date,Amount,Description',
            '12/09/2026,-62.40,WOOLWORTHS 1234 SYDNEY',
            '13/09/2026,-15.00,Bus Fare',
        ].join('\n');

        const response = await importCsv(
            csvRequest(rulesCsv, { action: 'import', accountId: rulesAccount.id }, profileId)
        );
        const result = await response.json();
        expect(result.imported).toBe(2);
        expect(result.categorized).toBe(1);

        const groceries = await prisma.transaction.findFirstOrThrow({
            where: { accountId: rulesAccount.id, amount: -6240 },
        });
        expect(groceries.payee).toBe('Woolworths');
        expect(groceries.categoryId).toBe(category.id);
        const fare = await prisma.transaction.findFirstOrThrow({
            where: { accountId: rulesAccount.id, amount: -1500 },
        });
        expect(fare.categoryId).toBeNull();

        // The category's available balance must reflect the imported spend.
        const budget = await prisma.monthlyBudget.findUniqueOrThrow({
            where: { month_categoryId: { categoryId: category.id, month: '2026-09' } },
        });
        expect(budget.available).toBe(-6240);

        // The stored payee is the rename, but the same file must still be a duplicate.
        const again = await (await importCsv(
            csvRequest(rulesCsv, { action: 'import', accountId: rulesAccount.id }, profileId)
        )).json();
        expect(again.imported).toBe(0);
        expect(again.duplicates).toBe(2);
    });

    it('rejects an import into another profile\'s account', async () => {
        const response = await importCsv(
            csvRequest(simpleCsv, { action: 'import', accountId: foreignAccountId }, profileId)
        );
        expect(response.status).toBe(404);
        await expect(
            prisma.transaction.count({ where: { accountId: foreignAccountId } })
        ).resolves.toBe(0);
    });

    it('rejects an import with no account and an empty file', async () => {
        const noAccount = await importCsv(csvRequest(simpleCsv, { action: 'import' }, profileId));
        expect(noAccount.status).toBe(400);

        const empty = await importCsv(csvRequest('', { action: 'preview' }, profileId));
        expect(empty.status).toBe(400);
    });
});
