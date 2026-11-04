/**
 * Integration tests for budget invariants that are easy to break silently:
 * split-parent categorisation guards, template `available` recomputation,
 * quick-action profile scoping, and recurring-schedule date arithmetic.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from './prisma';
import { getCategoryActivityMap, getMonthRange } from './budgetHelpers';
import { POST as createSplits } from '@/app/api/splits/route';
import { DELETE as deleteTransaction, PATCH as patchTransaction } from '@/app/api/transactions/[id]/route';
import { POST as createTransaction } from '@/app/api/transactions/route';
import { POST as bulkEdit } from '@/app/api/transactions/bulk/route';
import { GET as getBudget, POST as assignBudget } from '@/app/api/budget/route';
import { POST as copyBudget } from '@/app/api/budget/copy/route';
import { POST as quickAction } from '@/app/api/budget/quick-actions/route';
import { POST as templateAction } from '@/app/api/templates/route';
import { POST as transferBudget } from '@/app/api/budget/transfer/route';

const MONTH = '2026-11';
const PREV_MONTH = '2026-10';

let profileId: string;
let otherProfileId: string;
let accountId: string;
let groupId: string;
let groceriesId: string;
let fuelId: string;
let foreignCategoryId: string;
let splitTxId: string;

function jsonRequest(url: string, method: string, body?: unknown) {
    return new NextRequest(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

beforeAll(async () => {
    const [profile, otherProfile] = await Promise.all([
        prisma.profile.create({ data: { name: 'Invariants Profile' } }),
        prisma.profile.create({ data: { name: 'Invariants Other' } }),
    ]);
    profileId = profile.id;
    otherProfileId = otherProfile.id;

    const account = await prisma.account.create({
        data: { name: 'Invariants Account', type: 'checking', profileId },
    });
    accountId = account.id;

    const [group, foreignGroup] = await Promise.all([
        prisma.categoryGroup.create({ data: { name: 'Living', profileId } }),
        prisma.categoryGroup.create({ data: { name: 'Foreign Living', profileId: otherProfileId } }),
    ]);
    groupId = group.id;
    const [groceries, fuel, foreignCategory] = await Promise.all([
        prisma.category.create({ data: { name: 'Groceries INV', groupId: group.id } }),
        prisma.category.create({ data: { name: 'Fuel INV', groupId: group.id } }),
        prisma.category.create({ data: { name: 'Foreign Cat', groupId: foreignGroup.id } }),
    ]);
    groceriesId = groceries.id;
    fuelId = fuel.id;
    foreignCategoryId = foreignCategory.id;

    const splitParent = await prisma.transaction.create({
        data: {
            date: new Date(`${MONTH}-12T00:00:00.000Z`),
            amount: -8000,
            accountId,
            payee: 'Warehouse',
        },
    });
    splitTxId = splitParent.id;

    const response = await createSplits(
        jsonRequest(`http://localhost/api/splits?profileId=${profileId}`, 'POST', {
            transactionId: splitTxId,
            splits: [
                { categoryId: groceriesId, amount: -5000 },
                { categoryId: fuelId, amount: -3000 },
            ],
        })
    );
    expect(response.status).toBe(200);
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('split parents cannot be categorised', () => {
    it('rejects a single PATCH that sets a category on a split parent', async () => {
        const response = await patchTransaction(
            jsonRequest(`http://localhost/api/transactions/${splitTxId}?profileId=${profileId}`, 'PATCH', {
                categoryId: groceriesId,
            }),
            { params: Promise.resolve({ id: splitTxId }) }
        );
        expect(response.status).toBe(400);

        const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: splitTxId } });
        expect(tx.categoryId).toBeNull();
    });

    it('rejects a bulk edit that would categorise a split parent', async () => {
        const response = await bulkEdit(
            jsonRequest(`http://localhost/api/transactions/bulk?profileId=${profileId}`, 'POST', {
                transactionIds: [splitTxId],
                updates: { categoryId: groceriesId },
            })
        );
        expect(response.status).toBe(400);

        const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: splitTxId } });
        expect(tx.categoryId).toBeNull();
    });

    it('keeps activity counted exactly once', async () => {
        // If the guards failed, the parent's -8000 would be counted alongside the
        // -5000/-3000 split lines, doubling the total.
        const activity = await getCategoryActivityMap([groceriesId, fuelId], getMonthRange(MONTH));
        expect(activity.get(groceriesId)).toBe(-5000);
        expect(activity.get(fuelId)).toBe(-3000);
        expect([...activity.values()].reduce((sum, a) => sum + a, 0)).toBe(-8000);
    });

    it('still allows clearing the category (null) on a split parent', async () => {
        const response = await patchTransaction(
            jsonRequest(`http://localhost/api/transactions/${splitTxId}?profileId=${profileId}`, 'PATCH', {
                categoryId: null,
            }),
            { params: Promise.resolve({ id: splitTxId }) }
        );
        expect(response.status).toBe(200);
    });

    it('rejects a non-numeric amount and an invalid date', async () => {
        const badAmount = await patchTransaction(
            jsonRequest(`http://localhost/api/transactions/${splitTxId}?profileId=${profileId}`, 'PATCH', {
                amount: 'not-a-number',
            }),
            { params: Promise.resolve({ id: splitTxId }) }
        );
        expect(badAmount.status).toBe(400);

        const badDate = await patchTransaction(
            jsonRequest(`http://localhost/api/transactions/${splitTxId}?profileId=${profileId}`, 'PATCH', {
                date: 'never',
            }),
            { params: Promise.resolve({ id: splitTxId }) }
        );
        expect(badDate.status).toBe(400);
    });
});

describe('quick actions profile scoping', () => {
    it('refuses to write to a category in another profile', async () => {
        const response = await quickAction(
            jsonRequest(`http://localhost/api/budget/quick-actions?profileId=${profileId}`, 'POST', {
                action: 'clear',
                categoryId: foreignCategoryId,
                month: MONTH,
            })
        );
        expect(response.status).toBe(404);

        // Nothing may be written for the foreign category.
        await expect(
            prisma.monthlyBudget.count({ where: { categoryId: foreignCategoryId, month: MONTH } })
        ).resolves.toBe(0);
    });

    it('applies a quick action to an owned category', async () => {
        const response = await quickAction(
            jsonRequest(`http://localhost/api/budget/quick-actions?profileId=${profileId}`, 'POST', {
                action: 'clear',
                categoryId: fuelId,
                month: MONTH,
            })
        );
        expect(response.status).toBe(200);
        expect((await response.json()).newAmount).toBe(0);
    });
});

describe('template apply recomputes available', () => {
    it('includes prior-month rollover and current activity, not just assigned', async () => {
        // Groceries ends the previous month with $20 left over.
        await prisma.monthlyBudget.create({
            data: { month: PREV_MONTH, categoryId: groceriesId, assigned: 2000, available: 2000 },
        });

        const template = await prisma.budgetTemplate.create({
            data: {
                name: 'Standard Month',
                profileId,
                items: { create: [{ categoryId: groceriesId, amount: 10000 }] },
            },
        });

        const response = await templateAction(
            jsonRequest(`http://localhost/api/templates?profileId=${profileId}`, 'POST', {
                action: 'apply',
                templateId: template.id,
                month: MONTH,
            })
        );
        expect(response.status).toBe(200);

        const budget = await prisma.monthlyBudget.findUniqueOrThrow({
            where: { month_categoryId: { month: MONTH, categoryId: groceriesId } },
        });
        expect(budget.assigned).toBe(10000);
        // rollover 2000 + assigned 10000 + activity -5000 (the split line) = 7000.
        // The old code wrote `available: 10000`, corrupting next month's rollover.
        expect(budget.activity).toBe(-5000);
        expect(budget.available).toBe(7000);
    });
});

describe('budget availability across skipped months', () => {
    it('includes activity from months without MonthlyBudget rows', async () => {
        const category = await prisma.category.create({
            data: { name: 'Skipped Rollover INV', groupId },
        });

        await prisma.monthlyBudget.create({
            data: {
                month: '2026-07',
                categoryId: category.id,
                assigned: 10000,
                available: 8000,
            },
        });
        await prisma.transaction.createMany({
            data: [
                {
                    date: new Date('2026-07-15T00:00:00.000Z'),
                    amount: -2000,
                    accountId,
                    categoryId: category.id,
                },
                {
                    date: new Date('2026-08-15T00:00:00.000Z'),
                    amount: -3000,
                    accountId,
                    categoryId: category.id,
                },
                {
                    date: new Date('2026-09-15T00:00:00.000Z'),
                    amount: -1000,
                    accountId,
                    categoryId: category.id,
                },
            ],
        });

        const response = await getBudget(
            jsonRequest(`http://localhost/api/budget?profileId=${profileId}&month=2026-10`, 'GET')
        );
        expect(response.status).toBe(200);

        const body = await response.json();
        const result = body.groups
            .flatMap((group: { categories: { id: string; available: number }[] }) => group.categories)
            .find((item: { id: string }) => item.id === category.id);
        expect(result?.available).toBe(4000);
    });

    it('preserves imported balance resets and carries later activity forward', async () => {
        const category = await prisma.category.create({
            data: {
                name: 'Imported Reset INV',
                groupId,
                ynabId: 'imported-reset-invariant',
            },
        });
        await prisma.transaction.create({
            data: {
                date: new Date('2026-06-15T00:00:00.000Z'),
                amount: -50000,
                accountId,
                categoryId: category.id,
            },
        });
        await prisma.monthlyBudget.createMany({
            data: [
                {
                    month: '2026-07',
                    categoryId: category.id,
                    available: 5000,
                },
                {
                    month: '2026-08',
                    categoryId: category.id,
                    assigned: 10000,
                    available: 15000,
                },
            ],
        });
        const createResponse = await createTransaction(
            jsonRequest(`http://localhost/api/transactions?profileId=${profileId}`, 'POST', {
                date: '2026-08-15T00:00:00.000Z',
                amount: -30,
                accountId,
                categoryId: category.id,
                applyRules: false,
            })
        );
        expect(createResponse.status).toBe(201);
        const createdTransaction = await createResponse.json();

        const response = await getBudget(
            jsonRequest(`http://localhost/api/budget?profileId=${profileId}&month=2026-08`, 'GET')
        );
        expect(response.status).toBe(200);

        const body = await response.json();
        const result = body.groups
            .flatMap((group: { categories: { id: string; available: number }[] }) => group.categories)
            .find((item: { id: string }) => item.id === category.id);
        expect(result?.available).toBe(12000);

        const storedBudget = await prisma.monthlyBudget.findUniqueOrThrow({
            where: { month_categoryId: { month: '2026-08', categoryId: category.id } },
        });
        expect(storedBudget.available).toBe(12000);

        const nextMonthResponse = await getBudget(
            jsonRequest(`http://localhost/api/budget?profileId=${profileId}&month=2026-09`, 'GET')
        );
        expect(nextMonthResponse.status).toBe(200);

        const nextMonthBody = await nextMonthResponse.json();
        const nextMonthResult = nextMonthBody.groups
            .flatMap((group: { categories: { id: string; available: number }[] }) => group.categories)
            .find((item: { id: string }) => item.id === category.id);
        expect(nextMonthResult?.available).toBe(12000);

        const patchResponse = await patchTransaction(
            jsonRequest(`http://localhost/api/transactions/${createdTransaction.id}?profileId=${profileId}`, 'PATCH', {
                amount: -40,
            }),
            { params: Promise.resolve({ id: createdTransaction.id }) }
        );
        expect(patchResponse.status).toBe(200);

        const editedMonthResponse = await getBudget(
            jsonRequest(`http://localhost/api/budget?profileId=${profileId}&month=2026-09`, 'GET')
        );
        const editedMonthBody = await editedMonthResponse.json();
        const editedMonthResult = editedMonthBody.groups
            .flatMap((group: { categories: { id: string; available: number }[] }) => group.categories)
            .find((item: { id: string }) => item.id === category.id);
        expect(editedMonthResult?.available).toBe(11000);

        const deleteResponse = await deleteTransaction(
            jsonRequest(`http://localhost/api/transactions/${createdTransaction.id}?profileId=${profileId}`, 'DELETE'),
            { params: Promise.resolve({ id: createdTransaction.id }) }
        );
        expect(deleteResponse.status).toBe(200);

        const restoredMonthResponse = await getBudget(
            jsonRequest(`http://localhost/api/budget?profileId=${profileId}&month=2026-09`, 'GET')
        );
        const restoredMonthBody = await restoredMonthResponse.json();
        const restoredMonthResult = restoredMonthBody.groups
            .flatMap((group: { categories: { id: string; available: number }[] }) => group.categories)
            .find((item: { id: string }) => item.id === category.id);
        expect(restoredMonthResult?.available).toBe(15000);
    });

    it('carries an edited imported assignment through later stored months', async () => {
        const category = await prisma.category.create({
            data: {
                name: 'Imported Edited Rollover INV',
                groupId,
                ynabId: 'imported-edited-rollover-invariant',
            },
        });
        await prisma.monthlyBudget.createMany({
            data: [
                { month: '2026-06', categoryId: category.id, available: 0 },
                { month: '2026-07', categoryId: category.id, assigned: 300000, available: 300000 },
                { month: '2026-08', categoryId: category.id, assigned: 500000, available: 800000 },
            ],
        });

        const assignResponse = await assignBudget(
            jsonRequest(`http://localhost/api/budget?profileId=${profileId}`, 'POST', {
                categoryId: category.id,
                month: '2026-07',
                amount: 0,
            })
        );
        expect(assignResponse.status).toBe(200);

        const response = await getBudget(
            jsonRequest(`http://localhost/api/budget?profileId=${profileId}&month=2026-09`, 'GET')
        );
        expect(response.status).toBe(200);

        const body = await response.json();
        const result = body.groups
            .flatMap((group: { categories: { id: string; available: number }[] }) => group.categories)
            .find((item: { id: string }) => item.id === category.id);
        expect(result?.available).toBe(500000);
    });

    it('copyBudget preserves rollover available and cascades forward', async () => {
        const category = await prisma.category.create({
            data: {
                name: 'Copy Rollover INV',
                groupId,
                ynabId: 'copy-rollover-invariant',
            },
        });
        await prisma.monthlyBudget.create({
            data: { month: '2026-06', categoryId: category.id, assigned: 20000, available: 20000 },
        });

        const copyResponse = await copyBudget(
            jsonRequest(`http://localhost/api/budget/copy?profileId=${profileId}`, 'POST', {
                sourceMonth: '2026-06',
                targetMonth: '2026-07',
            })
        );
        expect(copyResponse.status).toBe(200);

        const targetBudget = await prisma.monthlyBudget.findUnique({
            where: { month_categoryId: { month: '2026-07', categoryId: category.id } },
        });
        expect(targetBudget?.assigned).toBe(20000);
        expect(targetBudget?.available).toBe(40000);
    });

    it('transfer to Ready to Assign cascades reduction to future months and updates RTA', async () => {
        const category = await prisma.category.create({
            data: {
                name: 'Transfer Rollover INV',
                groupId,
                ynabId: 'transfer-rollover-invariant',
            },
        });
        await prisma.monthlyBudget.createMany({
            data: [
                { month: '2026-06', categoryId: category.id, assigned: 50000, available: 50000 },
                { month: '2026-07', categoryId: category.id, assigned: 10000, available: 60000 },
            ],
        });

        // Get budget before transfer
        const beforeResponse = await getBudget(
            jsonRequest(`http://localhost/api/budget?profileId=${profileId}&month=2026-06`, 'GET')
        );
        const beforeBody = await beforeResponse.json();
        const rtaBefore = beforeBody.totals.readyToAssign;

        // Transfer 200.00 (20000 cents) from category to Ready to Assign in 2026-06
        const transferResponse = await transferBudget(
            jsonRequest(`http://localhost/api/budget/transfer?profileId=${profileId}`, 'POST', {
                fromCategoryId: category.id,
                toCategoryId: null,
                amount: 200,
                month: '2026-06',
            })
        );
        expect(transferResponse.status).toBe(200);

        // Future month 2026-07 available must be decremented by 20000 (from 60000 to 40000)
        const futureBudget = await prisma.monthlyBudget.findUnique({
            where: { month_categoryId: { month: '2026-07', categoryId: category.id } },
        });
        expect(futureBudget?.available).toBe(40000);

        // Fetch budget again - ready to assign should have increased by 20000 cents
        const afterResponse = await getBudget(
            jsonRequest(`http://localhost/api/budget?profileId=${profileId}&month=2026-06`, 'GET')
        );
        const afterBody = await afterResponse.json();
        expect(afterBody.totals.readyToAssign).toBe(rtaBefore + 20000);
    });
});

