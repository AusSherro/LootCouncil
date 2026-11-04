/**
 * Integration tests for the money paths that move real balances around:
 * transfers, reconciliation, and cleared-state toggling.
 *
 * These exercise the route handlers against a real SQLite database so that
 * balance arithmetic, atomicity, and profile scoping are all covered.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from './prisma';
import { POST as createTransfer, DELETE as deleteTransfer } from '@/app/api/transfers/route';
import { GET as getReconcileStatus, POST as reconcile, PATCH as toggleCleared } from '@/app/api/reconcile/route';
import { POST as createTransaction } from '@/app/api/transactions/route';

let profileId: string;
let otherProfileId: string;
let chequingId: string;
let savingsId: string;
let foreignAccountId: string;

async function accountBalances(id: string) {
    const account = await prisma.account.findUniqueOrThrow({ where: { id } });
    return { balance: account.balance, clearedBalance: account.clearedBalance };
}

function jsonRequest(url: string, method: string, body?: unknown) {
    return new NextRequest(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

beforeAll(async () => {
    const [profile, otherProfile] = await Promise.all([
        prisma.profile.create({ data: { name: 'Money Path Profile' } }),
        prisma.profile.create({ data: { name: 'Money Path Other' } }),
    ]);
    profileId = profile.id;
    otherProfileId = otherProfile.id;

    const [chequing, savings, foreign] = await Promise.all([
        prisma.account.create({ data: { name: 'Chequing', type: 'checking', profileId } }),
        prisma.account.create({ data: { name: 'Savings', type: 'savings', profileId } }),
        prisma.account.create({ data: { name: 'Foreign', type: 'checking', profileId: otherProfileId } }),
    ]);
    chequingId = chequing.id;
    savingsId = savings.id;
    foreignAccountId = foreign.id;
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('transfers', () => {
    let transferId: string;

    it('moves money between accounts and leaves net worth unchanged', async () => {
        const response = await createTransfer(
            jsonRequest(`http://localhost/api/transfers?profileId=${profileId}`, 'POST', {
                sourceAccountId: chequingId,
                destinationAccountId: savingsId,
                amount: 250.5,
                date: '2026-09-10',
                memo: 'To savings',
            })
        );
        expect(response.status).toBe(201);
        transferId = (await response.json()).transfer.id;

        const [source, dest] = await Promise.all([
            accountBalances(chequingId),
            accountBalances(savingsId),
        ]);
        expect(source.balance).toBe(-25050);
        expect(source.clearedBalance).toBe(-25050);
        expect(dest.balance).toBe(25050);
        expect(dest.clearedBalance).toBe(25050);
        // The two legs must cancel out exactly — a transfer creates no net worth.
        expect(source.balance + dest.balance).toBe(0);
    });

    it('creates two linked, uncategorised transaction legs', async () => {
        const legs = await prisma.transaction.findMany({
            where: { transferId },
            orderBy: { amount: 'asc' },
        });
        expect(legs).toHaveLength(2);
        expect(legs[0].amount).toBe(-25050);
        expect(legs[1].amount).toBe(25050);
        // Transfers must stay uncategorised or they would pollute budget activity.
        expect(legs.every(leg => leg.categoryId === null)).toBe(true);
        expect(legs.every(leg => leg.cleared)).toBe(true);
    });

    it('rejects a transfer to the same account', async () => {
        const response = await createTransfer(
            jsonRequest(`http://localhost/api/transfers?profileId=${profileId}`, 'POST', {
                sourceAccountId: chequingId,
                destinationAccountId: chequingId,
                amount: 10,
            })
        );
        expect(response.status).toBe(400);
    });

    it('rejects non-positive and non-numeric amounts', async () => {
        for (const amount of [0, -5, 'abc']) {
            const response = await createTransfer(
                jsonRequest(`http://localhost/api/transfers?profileId=${profileId}`, 'POST', {
                    sourceAccountId: chequingId,
                    destinationAccountId: savingsId,
                    amount,
                })
            );
            expect(response.status).toBe(400);
        }
    });

    it('rejects an account belonging to another profile', async () => {
        const response = await createTransfer(
            jsonRequest(`http://localhost/api/transfers?profileId=${profileId}`, 'POST', {
                sourceAccountId: chequingId,
                destinationAccountId: foreignAccountId,
                amount: 10,
            })
        );
        expect(response.status).toBe(404);
    });

    it('fully reverses balances and legs when deleted', async () => {
        const response = await deleteTransfer(
            new NextRequest(`http://localhost/api/transfers?profileId=${profileId}&id=${transferId}`, {
                method: 'DELETE',
            })
        );
        expect(response.status).toBe(200);

        const [source, dest] = await Promise.all([
            accountBalances(chequingId),
            accountBalances(savingsId),
        ]);
        expect(source).toEqual({ balance: 0, clearedBalance: 0 });
        expect(dest).toEqual({ balance: 0, clearedBalance: 0 });
        await expect(prisma.transaction.count({ where: { transferId } })).resolves.toBe(0);
    });
});

describe('reconciliation', () => {
    let clearedTxId: string;

    beforeAll(async () => {
        // A cleared transaction the bank also knows about.
        const response = await createTransaction(
            jsonRequest(`http://localhost/api/transactions?profileId=${profileId}`, 'POST', {
                date: '2026-09-05',
                amount: -40,
                payee: 'Grocer',
                accountId: chequingId,
                cleared: true,
            })
        );
        expect(response.status).toBe(201);
        clearedTxId = (await response.json()).id;
    });

    it('tracks clearedBalance when a transaction is created cleared', async () => {
        const { balance, clearedBalance } = await accountBalances(chequingId);
        expect(balance).toBe(-4000);
        expect(clearedBalance).toBe(-4000);
    });

    it('reports cleared and reconciled balances separately', async () => {
        const response = await getReconcileStatus(
            jsonRequest(`http://localhost/api/reconcile?profileId=${profileId}&accountId=${chequingId}`, 'GET')
        );
        expect(response.status).toBe(200);
        const status = await response.json();
        expect(status.calculatedClearedBalance).toBe(-4000);
        expect(status.calculatedReconciledBalance).toBe(0);
    });

    it('adjusts clearedBalance when toggling cleared off and back on', async () => {
        const uncleared = await toggleCleared(
            jsonRequest(`http://localhost/api/reconcile?profileId=${profileId}`, 'PATCH', {
                transactionId: clearedTxId,
                cleared: false,
            })
        );
        expect(uncleared.status).toBe(200);
        await expect(accountBalances(chequingId)).resolves.toEqual({
            balance: -4000,
            clearedBalance: 0,
        });

        const recleared = await toggleCleared(
            jsonRequest(`http://localhost/api/reconcile?profileId=${profileId}`, 'PATCH', {
                transactionId: clearedTxId,
                cleared: true,
            })
        );
        expect(recleared.status).toBe(200);
        await expect(accountBalances(chequingId)).resolves.toEqual({
            balance: -4000,
            clearedBalance: -4000,
        });
    });

    it('is idempotent when toggling to the state it is already in', async () => {
        await toggleCleared(
            jsonRequest(`http://localhost/api/reconcile?profileId=${profileId}`, 'PATCH', {
                transactionId: clearedTxId,
                cleared: true,
            })
        );
        // clearedBalance must not drift on a no-op toggle.
        await expect(accountBalances(chequingId)).resolves.toEqual({
            balance: -4000,
            clearedBalance: -4000,
        });
    });

    it('refuses to toggle a transaction in another profile', async () => {
        const response = await toggleCleared(
            jsonRequest(`http://localhost/api/reconcile?profileId=${otherProfileId}`, 'PATCH', {
                transactionId: clearedTxId,
                cleared: false,
            })
        );
        expect(response.status).toBe(404);
    });

    it('creates a bridging adjustment when the statement disagrees', async () => {
        // Bank says -$35.00; our cleared transactions sum to -$40.00.
        const response = await reconcile(
            jsonRequest(`http://localhost/api/reconcile?profileId=${profileId}`, 'POST', {
                accountId: chequingId,
                action: 'complete',
                statementBalance: -3500,
            })
        );
        expect(response.status).toBe(200);
        expect((await response.json()).adjustment).toBe(500);

        const adjustment = await prisma.transaction.findFirstOrThrow({
            where: { accountId: chequingId, payee: 'Reconciliation Adjustment' },
        });
        expect(adjustment.amount).toBe(500);
        expect(adjustment.cleared).toBe(true);
        expect(adjustment.isReconciled).toBe(true);

        // After reconciling, clearedBalance must equal the statement exactly.
        const { balance, clearedBalance } = await accountBalances(chequingId);
        expect(clearedBalance).toBe(-3500);
        expect(balance).toBe(-3500);
    });

    it('creates no adjustment when the statement already agrees', async () => {
        const before = await prisma.transaction.count({
            where: { accountId: chequingId, payee: 'Reconciliation Adjustment' },
        });

        const response = await reconcile(
            jsonRequest(`http://localhost/api/reconcile?profileId=${profileId}`, 'POST', {
                accountId: chequingId,
                action: 'complete',
                statementBalance: -3500,
            })
        );
        expect(response.status).toBe(200);
        expect((await response.json()).adjustment).toBe(0);

        await expect(
            prisma.transaction.count({
                where: { accountId: chequingId, payee: 'Reconciliation Adjustment' },
            })
        ).resolves.toBe(before);
    });

    it('refuses to reconcile an account in another profile', async () => {
        const response = await reconcile(
            jsonRequest(`http://localhost/api/reconcile?profileId=${otherProfileId}`, 'POST', {
                accountId: chequingId,
                action: 'complete',
                statementBalance: 0,
            })
        );
        expect(response.status).toBe(404);
    });
});
