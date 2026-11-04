import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from './prisma';
import { POST as createInvestment } from '@/app/api/investments/route';
import { POST as addInvestmentLot } from '@/app/api/investments/lots/route';
import { GET as getAllocations, POST as saveAllocations } from '@/app/api/investments/allocations/route';
import { GET as previewAutoAssign, POST as runAutoAssign } from '@/app/api/budget/auto-assign/route';
import { POST as runQuickAction } from '@/app/api/budget/quick-actions/route';
import { GET as getFire, POST as saveFire } from '@/app/api/fire/route';
import { GET as getAdvancedReport } from '@/app/api/reports/advanced/route';
import { POST as createTransfer } from '@/app/api/transfers/route';
import { POST as createTransaction, PUT as updateTransaction, DELETE as deleteTransaction } from '@/app/api/transactions/route';
import { POST as createSplits } from '@/app/api/splits/route';
import { DELETE as deleteCategory } from '@/app/api/categories/route';
import { GET as exportBackup } from '@/app/api/export/route';
import { POST as importBackup } from '@/app/api/import/backup/route';

let profileAId: string;
let profileBId: string;
let accountA1Id: string;
let accountA2Id: string;
let groupAId: string;
let catRentId: string;
let catDiningId: string;

function jsonRequest(url: string, method: string, body?: unknown) {
    return new NextRequest(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

beforeAll(async () => {
    const [profileA, profileB] = await Promise.all([
        prisma.profile.create({ data: { name: 'Pass4 Profile A' } }),
        prisma.profile.create({ data: { name: 'Pass4 Profile B' } }),
    ]);
    profileAId = profileA.id;
    profileBId = profileB.id;

    const [acct1, acct2] = await Promise.all([
        prisma.account.create({
            data: { name: 'Everyday A', type: 'checking', balance: 500000, clearedBalance: 500000, profileId: profileAId },
        }),
        prisma.account.create({
            data: { name: 'Savings A', type: 'savings', balance: 100000, clearedBalance: 100000, profileId: profileAId },
        }),
    ]);
    accountA1Id = acct1.id;
    accountA2Id = acct2.id;

    const groupA = await prisma.categoryGroup.create({
        data: { name: 'Living A', profileId: profileAId },
    });
    groupAId = groupA.id;

    const [catRent, catDining] = await Promise.all([
        prisma.category.create({
            data: {
                name: 'Rent',
                groupId: groupAId,
                goalType: 'NEED',
                goalTarget: 100000, // $1,000.00
            },
        }),
        prisma.category.create({
            data: {
                name: 'Dining',
                groupId: groupAId,
                goalType: 'MF',
                goalTarget: 30000, // $300.00
            },
        }),
    ]);
    catRentId = catRent.id;
    catDiningId = catDining.id;

    // Also create a category with a huge goal in Profile B to verify auto-assign isolation
    const groupB = await prisma.categoryGroup.create({
        data: { name: 'Living B', profileId: profileBId },
    });
    await prisma.category.create({
        data: {
            name: 'Foreign Goal',
            groupId: groupB.id,
            goalType: 'MF',
            goalTarget: 999900,
        },
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('Pass 4 Audit Fixes', () => {
    it('POST /api/investments and POST /api/investments/lots persist profileId and POST /api/investments/allocations isolates targets per profile', async () => {
        const createRes = await createInvestment(
            jsonRequest(`http://localhost/api/investments?profileId=${profileAId}`, 'POST', {
                symbol: 'VAS.AX',
                name: 'Vanguard Australian Shares',
                assetClass: 'etf',
                currency: 'AUD',
                quantity: 10,
                costBasis: 900,
                currentPrice: 95,
            })
        );
        expect(createRes.status).toBe(200);
        const createdAsset = await createRes.json();
        expect(createdAsset.profileId).toBe(profileAId);

        const lotRes = await addInvestmentLot(
            jsonRequest(`http://localhost/api/investments/lots?profileId=${profileAId}`, 'POST', {
                assetId: createdAsset.id,
                purchaseDate: '2026-01-15',
                units: 5,
                unitPrice: 96,
            })
        );
        expect(lotRes.status).toBe(200);

        // Save allocation targets in both profiles for the same assetClass ('etf')
        const allocARes = await saveAllocations(
            jsonRequest(`http://localhost/api/investments/allocations?profileId=${profileAId}`, 'POST', {
                targets: [{ assetClass: 'etf', targetPct: 0.7 }],
            })
        );
        expect(allocARes.status).toBe(200);

        const allocBRes = await saveAllocations(
            jsonRequest(`http://localhost/api/investments/allocations?profileId=${profileBId}`, 'POST', {
                targets: [{ assetClass: 'etf', targetPct: 0.25 }],
            })
        );
        expect(allocBRes.status).toBe(200);

        const [getARes, getBRes] = await Promise.all([
            getAllocations(new NextRequest(`http://localhost/api/investments/allocations?profileId=${profileAId}`)),
            getAllocations(new NextRequest(`http://localhost/api/investments/allocations?profileId=${profileBId}`)),
        ]);
        const dataA = await getARes.json();
        const dataB = await getBRes.json();
        expect(dataA.allocations.find((a: { assetClass: string }) => a.assetClass === 'etf')?.targetPct).toBe(0.7);
        expect(dataB.allocations.find((a: { assetClass: string }) => a.assetClass === 'etf')?.targetPct).toBe(0.25);
    });

    it('auto-assign and quick-actions respect profile isolation, prior rollover, and goalType codes', async () => {
        // Seed prior month (2026-04) with $400 rollover in Rent
        await prisma.monthlyBudget.create({
            data: {
                month: '2026-04',
                categoryId: catRentId,
                assigned: 40000,
                activity: 0,
                available: 40000,
            },
        });

        // Preview auto-assign for 2026-05 in Profile A:
        // Rent needs $1,000 target minus $400 available = $600 (60000 cents).
        // Dining needs $300 MF = 30000 cents.
        // Profile B's Foreign Goal must NOT appear.
        const previewRes = await previewAutoAssign(
            new NextRequest(`http://localhost/api/budget/auto-assign?profileId=${profileAId}&month=2026-05`)
        );
        expect(previewRes.status).toBe(200);
        const preview = await previewRes.json();
        expect(preview.categories.map((c: { categoryName: string }) => c.categoryName).sort()).toEqual(['Dining', 'Rent']);
        const rentPreview = preview.categories.find((c: { categoryId: string }) => c.categoryId === catRentId);
        expect(rentPreview.needed).toBe(60000);

        // Quick-action 'underfunded' on Rent for 2026-05 should assign 60000 cents and result in available = 100000
        const qaRes = await runQuickAction(
            jsonRequest(`http://localhost/api/budget/quick-actions?profileId=${profileAId}`, 'POST', {
                categoryId: catRentId,
                month: '2026-05',
                action: 'underfunded',
            })
        );
        expect(qaRes.status).toBe(200);
        const qaBody = await qaRes.json();
        expect(qaBody.newAmount).toBe(60000);

        // Auto-assign the rest of 2026-05 (Dining = 30000)
        const autoRes = await runAutoAssign(
            jsonRequest(`http://localhost/api/budget/auto-assign?profileId=${profileAId}`, 'POST', {
                month: '2026-05',
                mode: 'underfunded',
            })
        );
        expect(autoRes.status).toBe(200);
        const diningBudget = await prisma.monthlyBudget.findUniqueOrThrow({
            where: { month_categoryId: { month: '2026-05', categoryId: catDiningId } },
        });
        expect(diningBudget.assigned).toBe(30000);
        expect(diningBudget.available).toBe(30000);
    });

    it('PUT /api/transactions preserves clearedBalance when moving a cleared transaction across accounts', async () => {
        const before1 = await prisma.account.findUniqueOrThrow({ where: { id: accountA1Id } });
        const before2 = await prisma.account.findUniqueOrThrow({ where: { id: accountA2Id } });

        const createRes = await createTransaction(
            jsonRequest(`http://localhost/api/transactions?profileId=${profileAId}`, 'POST', {
                date: '2026-05-10',
                amount: -50,
                payee: 'Supermarket',
                accountId: accountA1Id,
                categoryId: catDiningId,
                cleared: true,
            })
        );
        expect(createRes.status).toBe(201);
        const tx = await createRes.json();

        // Move transaction from accountA1 to accountA2 without passing `cleared` in payload
        const updateRes = await updateTransaction(
            jsonRequest(`http://localhost/api/transactions?profileId=${profileAId}&id=${tx.id}`, 'PUT', {
                accountId: accountA2Id,
            })
        );
        expect(updateRes.status).toBe(200);

        const after1 = await prisma.account.findUniqueOrThrow({ where: { id: accountA1Id } });
        const after2 = await prisma.account.findUniqueOrThrow({ where: { id: accountA2Id } });

        // Account 1 should be back to its pre-tx balance and clearedBalance
        expect(after1.balance).toBe(before1.balance);
        expect(after1.clearedBalance).toBe(before1.clearedBalance);

        // Account 2 should have both balance and clearedBalance reduced by 5000 cents
        expect(after2.balance).toBe(before2.balance - 5000);
        expect(after2.clearedBalance).toBe(before2.clearedBalance - 5000);
    });

    it('DELETE /api/transactions on one transfer leg reverses both accounts and deletes the Transfer record', async () => {
        const before1 = await prisma.account.findUniqueOrThrow({ where: { id: accountA1Id } });
        const before2 = await prisma.account.findUniqueOrThrow({ where: { id: accountA2Id } });

        const transferRes = await createTransfer(
            jsonRequest(`http://localhost/api/transfers?profileId=${profileAId}`, 'POST', {
                sourceAccountId: accountA1Id,
                destinationAccountId: accountA2Id,
                amount: 120,
                date: '2026-05-12',
            })
        );
        expect(transferRes.status).toBe(201);
        const transferBody = await transferRes.json();
        const sourceTxId = transferBody.transfer.sourceTransactionId;
        const transferId = transferBody.transfer.id;

        // Delete only the source transaction via DELETE /api/transactions
        const delRes = await deleteTransaction(
            new NextRequest(`http://localhost/api/transactions?profileId=${profileAId}&id=${sourceTxId}`, {
                method: 'DELETE',
            })
        );
        expect(delRes.status).toBe(200);

        const after1 = await prisma.account.findUniqueOrThrow({ where: { id: accountA1Id } });
        const after2 = await prisma.account.findUniqueOrThrow({ where: { id: accountA2Id } });
        expect(after1.balance).toBe(before1.balance);
        expect(after1.clearedBalance).toBe(before1.clearedBalance);
        expect(after2.balance).toBe(before2.balance);
        expect(after2.clearedBalance).toBe(before2.clearedBalance);

        const remainingTransfer = await prisma.transfer.findUnique({ where: { id: transferId } });
        expect(remainingTransfer).toBeNull();
    });

    it('split transactions are included in advanced reports and block category deletion', async () => {
        const createRes = await createTransaction(
            jsonRequest(`http://localhost/api/transactions?profileId=${profileAId}`, 'POST', {
                date: '2026-05-15',
                amount: -100,
                payee: 'MegaStore',
                accountId: accountA1Id,
                cleared: true,
            })
        );
        expect(createRes.status).toBe(201);
        const parentTx = await createRes.json();

        const splitRes = await createSplits(
            jsonRequest(`http://localhost/api/splits?profileId=${profileAId}`, 'POST', {
                transactionId: parentTx.id,
                splits: [
                    { categoryId: catRentId, amount: -6000, memo: 'Household' },
                    { categoryId: catDiningId, amount: -4000, memo: 'Snacks' },
                ],
            })
        );
        expect(splitRes.status).toBe(200);

        // Attempting to delete catRentId should fail because it has SubTransaction rows
        const delCatRes = await deleteCategory(
            new NextRequest(`http://localhost/api/categories?profileId=${profileAId}&type=category&id=${catRentId}`, {
                method: 'DELETE',
            })
        );
        expect(delCatRes.status).toBe(400);

        // Advanced report 'spending-by-payee' excluding Rent should include MegaStore ($40.00)
        const payeeReportRes = await getAdvancedReport(
            new NextRequest(
                `http://localhost/api/reports/advanced?profileId=${profileAId}&type=spending-by-payee&startDate=2026-05-01&endDate=2026-05-31&excludeCategories=Rent`
            )
        );
        expect(payeeReportRes.status).toBe(200);
        const payeeReport = await payeeReportRes.json();
        const megastoreRow = payeeReport.data.find((d: { payee: string }) => d.payee === 'MegaStore');
        expect(megastoreRow).toBeDefined();
        expect(megastoreRow.total).toBe(40);
    });

    it('FIRE route isolates expenses by profile and values lot-less assets when lots are absent', async () => {
        const saveRes = await saveFire(
            jsonRequest(`http://localhost/api/fire?profileId=${profileBId}`, 'POST', {
                currentAge: 35,
                targetRetirementAge: 50,
                id: 'malicious-custom-id',
            })
        );
        expect(saveRes.status).toBe(200);
        const savedSettings = await saveRes.json();
        expect(savedSettings.id).not.toBe('malicious-custom-id');

        const getRes = await getFire(
            new NextRequest(`http://localhost/api/fire?profileId=${profileBId}`)
        );
        expect(getRes.status).toBe(200);
        const fireData = await getRes.json();
        // Profile B has zero transactions, so annualExpenses should be 0 (not leaking Profile A's spending)
        expect(fireData.settings.annualExpenses).toBe(0);
    });

    it('GET /api/export and POST /api/import/backup round-trip all profile data into another profile without PK collisions', async () => {
        const exportRes = await exportBackup(
            new NextRequest(`http://localhost/api/export?profileId=${profileAId}`)
        );
        expect(exportRes.status).toBe(200);
        const backupJson = JSON.parse(await exportRes.text());
        expect(backupJson.exportVersion).toBe('1.0');
        expect(backupJson.data.subTransactions.length).toBeGreaterThanOrEqual(2);
        expect(backupJson.data.assetLots.length).toBeGreaterThanOrEqual(1);
        expect(backupJson.data.allocationTargets.length).toBeGreaterThanOrEqual(1);

        // Restore Profile A's backup into Profile B (while Profile A still exists in the same DB!)
        const restoreRes = await importBackup(
            jsonRequest(`http://localhost/api/import/backup?profileId=${profileBId}`, 'POST', backupJson)
        );
        expect(restoreRes.status).toBe(200);
        const restoreBody = await restoreRes.json();
        expect(restoreBody.success).toBe(true);

        const [restoredSubs, restoredLots, restoredTargets] = await Promise.all([
            prisma.subTransaction.count({ where: { transaction: { account: { profileId: profileBId } } } }),
            prisma.assetLot.count({ where: { asset: { profileId: profileBId } } }),
            prisma.allocationTarget.count({ where: { profileId: profileBId } }),
        ]);
        expect(restoredSubs).toBe(backupJson.data.subTransactions.length);
        expect(restoredLots).toBe(backupJson.data.assetLots.length);
        expect(restoredTargets).toBe(backupJson.data.allocationTargets.length);
    });
});
