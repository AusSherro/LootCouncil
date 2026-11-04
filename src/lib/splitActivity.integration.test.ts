import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from './prisma';
import { calculateActivity, getCategoryActivityMap, getMonthRange } from './budgetHelpers';
import { POST as createSplits, DELETE as deleteSplits } from '@/app/api/splits/route';

const MONTH = '2026-09';
const TX_DATE = new Date('2026-09-15T00:00:00.000Z');

let profileId: string;
let accountId: string;
let groceriesId: string;
let householdId: string;
let plainCategoryId: string;
let splitTransactionId: string;

beforeAll(async () => {
    const profile = await prisma.profile.create({ data: { name: 'Split Activity Profile' } });
    profileId = profile.id;

    const account = await prisma.account.create({
        data: { name: 'Split Checking', type: 'checking', profileId },
    });
    accountId = account.id;

    const group = await prisma.categoryGroup.create({
        data: { name: 'Everyday', profileId },
    });
    const [groceries, household, plain] = await Promise.all([
        prisma.category.create({ data: { name: 'Groceries', groupId: group.id } }),
        prisma.category.create({ data: { name: 'Household', groupId: group.id } }),
        prisma.category.create({ data: { name: 'Fuel', groupId: group.id } }),
    ]);
    groceriesId = groceries.id;
    householdId = household.id;
    plainCategoryId = plain.id;

    // A plain (unsplit) categorised transaction — the control case.
    await prisma.transaction.create({
        data: { date: TX_DATE, amount: -2500, accountId, categoryId: plainCategoryId },
    });

    // The transaction we will split.
    const splitParent = await prisma.transaction.create({
        data: { date: TX_DATE, amount: -10000, accountId, payee: 'Supermarket' },
    });
    splitTransactionId = splitParent.id;
});

afterAll(async () => {
    await prisma.$disconnect();
});

function splitRequest(splits: { categoryId: string; amount: number }[]) {
    return new NextRequest(`http://localhost/api/splits?profileId=${profileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: splitTransactionId, splits }),
    });
}

describe('split transaction activity', () => {
    it('counts plain transaction activity', async () => {
        await expect(calculateActivity(plainCategoryId, MONTH)).resolves.toBe(-2500);
    });

    it('attributes split amounts to their categories', async () => {
        const response = await createSplits(
            splitRequest([
                { categoryId: groceriesId, amount: -6000 },
                { categoryId: householdId, amount: -4000 },
            ])
        );
        expect(response.status).toBe(200);

        // The split parent no longer carries a category...
        const parent = await prisma.transaction.findUniqueOrThrow({ where: { id: splitTransactionId } });
        expect(parent.categoryId).toBeNull();
        expect(parent.isSplit).toBe(true);

        // ...so activity must come from the split lines, not the parent row.
        await expect(calculateActivity(groceriesId, MONTH)).resolves.toBe(-6000);
        await expect(calculateActivity(householdId, MONTH)).resolves.toBe(-4000);
    });

    it('includes split lines in the batched activity map', async () => {
        const activity = await getCategoryActivityMap(
            [groceriesId, householdId, plainCategoryId],
            getMonthRange(MONTH)
        );

        expect(activity.get(groceriesId)).toBe(-6000);
        expect(activity.get(householdId)).toBe(-4000);
        expect(activity.get(plainCategoryId)).toBe(-2500);

        // Total spending must equal the sum of the underlying transactions.
        const total = [...activity.values()].reduce((sum, amount) => sum + amount, 0);
        expect(total).toBe(-12500);
    });

    it('excludes split activity from other months', async () => {
        const activity = await getCategoryActivityMap([groceriesId], getMonthRange('2026-08'));
        expect(activity.get(groceriesId)).toBeUndefined();
    });

    it('does not double-count when a transaction is re-split', async () => {
        const response = await createSplits(
            splitRequest([
                { categoryId: groceriesId, amount: -9000 },
                { categoryId: householdId, amount: -1000 },
            ])
        );
        expect(response.status).toBe(200);

        await expect(calculateActivity(groceriesId, MONTH)).resolves.toBe(-9000);
        await expect(calculateActivity(householdId, MONTH)).resolves.toBe(-1000);

        // Stored MonthlyBudget.activity must also be reversed, not accumulated.
        const [groceriesBudget, householdBudget] = await Promise.all([
            prisma.monthlyBudget.findUnique({
                where: { month_categoryId: { month: MONTH, categoryId: groceriesId } },
            }),
            prisma.monthlyBudget.findUnique({
                where: { month_categoryId: { month: MONTH, categoryId: householdId } },
            }),
        ]);
        expect(groceriesBudget?.activity).toBe(-9000);
        expect(householdBudget?.activity).toBe(-1000);
    });

    it('drops split activity when the split is removed', async () => {
        const response = await deleteSplits(
            new NextRequest(
                `http://localhost/api/splits?profileId=${profileId}&transactionId=${splitTransactionId}`,
                { method: 'DELETE' }
            )
        );
        expect(response.status).toBe(200);

        await expect(calculateActivity(groceriesId, MONTH)).resolves.toBe(0);
        await expect(calculateActivity(householdId, MONTH)).resolves.toBe(0);
    });
});
