import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from './prisma';
import {
    findOwnedAccount,
    findOwnedCategory,
    ownsAllCategories,
} from './profileOwnership';
import { POST as createTransaction } from '@/app/api/transactions/route';
import { PUT as processScheduledTransactions } from '@/app/api/scheduled/route';
import { GET as getSplits, POST as createSplits } from '@/app/api/splits/route';

let profileAId: string;
let profileBId: string;
let accountAId: string;
let accountBId: string;
let categoryAId: string;
let categoryBId: string;

beforeAll(async () => {
    const [profileA, profileB] = await Promise.all([
        prisma.profile.create({ data: { name: 'Profile A' } }),
        prisma.profile.create({ data: { name: 'Profile B' } }),
    ]);
    profileAId = profileA.id;
    profileBId = profileB.id;

    const [accountA, accountB] = await Promise.all([
        prisma.account.create({ data: { name: 'Account A', type: 'checking', profileId: profileAId } }),
        prisma.account.create({ data: { name: 'Account B', type: 'checking', profileId: profileBId } }),
    ]);
    accountAId = accountA.id;
    accountBId = accountB.id;

    const [groupA, groupB] = await Promise.all([
        prisma.categoryGroup.create({ data: { name: 'Group A', profileId: profileAId } }),
        prisma.categoryGroup.create({ data: { name: 'Group B', profileId: profileBId } }),
    ]);
    const [categoryA, categoryB] = await Promise.all([
        prisma.category.create({ data: { name: 'Coffee A', groupId: groupA.id } }),
        prisma.category.create({ data: { name: 'Coffee B', groupId: groupB.id } }),
    ]);
    categoryAId = categoryA.id;
    categoryBId = categoryB.id;
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('profile ownership', () => {
    it('rejects account and category IDs from another profile', async () => {
        await expect(findOwnedAccount(profileAId, accountBId)).resolves.toBeNull();
        await expect(findOwnedCategory(profileAId, categoryBId)).resolves.toBeNull();
        await expect(ownsAllCategories(profileAId, [categoryAId, categoryBId])).resolves.toBe(false);
    });

    it('allows the same payee name in separate profiles', async () => {
        await prisma.payee.createMany({
            data: [
                { name: 'Shared Merchant', profileId: profileAId },
                { name: 'Shared Merchant', profileId: profileBId },
            ],
        });

        await expect(prisma.payee.count({ where: { name: 'Shared Merchant' } })).resolves.toBe(2);
    });

    it('applies only the active profile rules and rejects foreign accounts', async () => {
        await prisma.transactionRule.createMany({
            data: [
                {
                    name: 'Profile A coffee',
                    matchField: 'payee',
                    matchType: 'contains',
                    matchValue: 'coffee',
                    categoryId: categoryAId,
                    priority: 1,
                    profileId: profileAId,
                },
                {
                    name: 'Profile B coffee',
                    matchField: 'payee',
                    matchType: 'contains',
                    matchValue: 'coffee',
                    categoryId: categoryBId,
                    priority: 100,
                    profileId: profileBId,
                },
            ],
        });

        const request = new NextRequest(`http://localhost/api/transactions?profileId=${profileAId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: '2026-07-11',
                amount: -5,
                accountId: accountAId,
                payee: 'Coffee Shop',
            }),
        });
        const response = await createTransaction(request);
        const transaction = await response.json();
        expect(response.status).toBe(201);
        expect(transaction.categoryId).toBe(categoryAId);

        const foreignAccountRequest = new NextRequest(`http://localhost/api/transactions?profileId=${profileAId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: '2026-07-11',
                amount: -5,
                accountId: accountBId,
                payee: 'Coffee Shop',
            }),
        });
        const foreignResponse = await createTransaction(foreignAccountRequest);
        expect(foreignResponse.status).toBe(404);
    });

    it('processes due schedules only for the requested profile', async () => {
        const dueDate = new Date('2026-07-01T00:00:00.000Z');
        await prisma.scheduledTransaction.createMany({
            data: [
                {
                    name: 'Profile A scheduled',
                    amount: -1200,
                    accountId: accountAId,
                    categoryId: categoryAId,
                    frequency: 'monthly',
                    nextDueDate: dueDate,
                    autoCreate: true,
                    profileId: profileAId,
                },
                {
                    name: 'Profile B scheduled',
                    amount: -3400,
                    accountId: accountBId,
                    categoryId: categoryBId,
                    frequency: 'monthly',
                    nextDueDate: dueDate,
                    autoCreate: true,
                    profileId: profileBId,
                },
            ],
        });

        const response = await processScheduledTransactions(
            new NextRequest(`http://localhost/api/scheduled?profileId=${profileAId}`, { method: 'PUT' })
        );
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.processed).toBe(1);
        await expect(prisma.transaction.count({ where: { accountId: accountAId, payee: 'Profile A scheduled' } })).resolves.toBe(1);
        await expect(prisma.transaction.count({ where: { accountId: accountBId, payee: 'Profile B scheduled' } })).resolves.toBe(0);

        const [accountA, accountB] = await Promise.all([
            prisma.account.findUniqueOrThrow({ where: { id: accountAId } }),
            prisma.account.findUniqueOrThrow({ where: { id: accountBId } }),
        ]);
        expect(accountA.balance).toBe(-1700);
        expect(accountB.balance).toBe(0);
    });

    it('rejects cross-profile split reads and category IDs', async () => {
        const transaction = await prisma.transaction.create({
            data: {
                date: new Date('2026-07-11'),
                amount: -1000,
                accountId: accountAId,
            },
        });

        const foreignRead = await getSplits(
            new NextRequest(`http://localhost/api/splits?profileId=${profileBId}&transactionId=${transaction.id}`)
        );
        expect(foreignRead.status).toBe(404);

        const foreignCategoryWrite = await createSplits(
            new NextRequest(`http://localhost/api/splits?profileId=${profileAId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionId: transaction.id,
                    splits: [
                        { categoryId: categoryAId, amount: -500 },
                        { categoryId: categoryBId, amount: -500 },
                    ],
                }),
            })
        );
        expect(foreignCategoryWrite.status).toBe(404);
    });
});