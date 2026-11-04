import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { applyCategoryActivityDelta } from '@/lib/budgetHelpers';
import { ownsAllCategories } from '@/lib/profileOwnership';
import { z } from 'zod';
import { boundedText, centsAmount, idString, nullableId, parseBody } from '@/lib/validation';

// Split amounts are integer cents (the modal converts before sending), unlike
// most routes which take dollars.
const createSplitsSchema = z.object({
    transactionId: idString,
    splits: z
        .array(z.object({
            categoryId: nullableId.optional(),
            amount: centsAmount,
            memo: boundedText(500).nullish(),
        }))
        .min(2, 'Need at least 2 splits')
        .max(100, 'Too many splits'),
});

// POST - Create splits for a transaction
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const parsed = await parseBody(request, createSplitsSchema);
        if (!parsed.success) return parsed.response;
        const { transactionId, splits } = parsed.data;

        const categoryIds = splits
            .map(split => split.categoryId)
            .filter((categoryId): categoryId is string => Boolean(categoryId));
        if (!(await ownsAllCategories(profileId, categoryIds))) {
            return NextResponse.json({ error: 'One or more categories were not found' }, { status: 404 });
        }

        // Get the parent transaction (verify profile ownership)
        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId, account: { profileId } },
        });

        if (!transaction) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
        }

        // Validate split amounts sum to transaction amount
        const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
        if (splitTotal !== transaction.amount) {
            return NextResponse.json({ 
                error: `Split amounts (${splitTotal}) must equal transaction amount (${transaction.amount})` 
            }, { status: 400 });
        }

        const month = transaction.date.toISOString().slice(0, 7);

        // Use transaction for atomicity
        const result = await prisma.$transaction(async (tx) => {
            // Reverse the budget activity of any existing splits before replacing them,
            // otherwise re-splitting permanently double-counts activity.
            const existingSplits = await tx.subTransaction.findMany({
                where: { transactionId },
                select: { categoryId: true, amount: true },
            });
            for (const split of existingSplits) {
                if (!split.categoryId) continue;
                await applyCategoryActivityDelta(tx, split.categoryId, month, -split.amount);
                await tx.monthlyBudget.update({
                    where: { month_categoryId: { month, categoryId: split.categoryId } },
                    data: { activity: { decrement: split.amount } },
                });
            }
            if (transaction.categoryId) {
                await applyCategoryActivityDelta(tx, transaction.categoryId, month, -transaction.amount);
            }

            // Delete existing splits if any
            await tx.subTransaction.deleteMany({ where: { transactionId } });

            // Create new splits
            const createdSplits = await tx.subTransaction.createMany({
                data: splits.map(s => ({
                    transactionId,
                    categoryId: s.categoryId || null,
                    amount: s.amount,
                    memo: s.memo || null,
                })),
            });

            // Mark transaction as split and remove its category (since it's now split)
            await tx.transaction.update({
                where: { id: transactionId },
                data: { 
                    isSplit: true, 
                    categoryId: null,
                },
            });

            // Update category monthly budgets for each split
            for (const split of splits) {
                if (split.categoryId) {
                    await applyCategoryActivityDelta(tx, split.categoryId, month, split.amount);
                    await tx.monthlyBudget.update({
                        where: { month_categoryId: { month, categoryId: split.categoryId } },
                        data: { activity: { increment: split.amount } },
                    });
                }
            }

            return createdSplits;
        });

        return NextResponse.json({ success: true, count: result.count });
    } catch (error) {
        console.error('Error creating splits:', error);
        return NextResponse.json({ error: 'Failed to create splits' }, { status: 500 });
    }
}

// GET - Get splits for a transaction
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');

    if (!transactionId) {
        return NextResponse.json({ error: 'Missing transactionId' }, { status: 400 });
    }

    try {
        const transaction = await prisma.transaction.findFirst({
            where: { id: transactionId, account: { profileId } },
            select: { id: true },
        });
        if (!transaction) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
        }

        const splits = await prisma.subTransaction.findMany({
            where: { transactionId },
            orderBy: { createdAt: 'asc' },
        });

        // Get category names
        const categoryIds = splits.filter(s => s.categoryId).map(s => s.categoryId!);
        const categories = await prisma.category.findMany({
            where: { id: { in: categoryIds }, group: { profileId } },
            select: { id: true, name: true },
        });
        const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

        const enriched = splits.map(s => ({
            ...s,
            categoryName: s.categoryId ? categoryMap[s.categoryId] : null,
        }));

        return NextResponse.json({ splits: enriched });
    } catch (error) {
        console.error('Error fetching splits:', error);
        return NextResponse.json({ error: 'Failed to fetch splits' }, { status: 500 });
    }
}

// DELETE - Remove splits and unsplit a transaction
export async function DELETE(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');

    if (!transactionId) {
        return NextResponse.json({ error: 'Missing transactionId' }, { status: 400 });
    }

    try {
        // Get the transaction and its splits for budget adjustment
        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId, account: { profileId } },
            include: { subTransactions: true },
        });

        if (!transaction) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
        }

        const month = transaction.date.toISOString().slice(0, 7);

        // Use transaction for atomicity
        await prisma.$transaction(async (tx) => {
            // Reverse the budget activity for each split
            for (const split of transaction.subTransactions) {
                if (split.categoryId) {
                    await applyCategoryActivityDelta(tx, split.categoryId, month, -split.amount);
                    await tx.monthlyBudget.update({
                        where: { month_categoryId: { month, categoryId: split.categoryId } },
                        data: { activity: { decrement: split.amount } },
                    });
                }
            }

            // Delete all splits
            await tx.subTransaction.deleteMany({ where: { transactionId } });

            // Mark transaction as not split
            await tx.transaction.update({
                where: { id: transactionId },
                data: { isSplit: false },
            });
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error removing splits:', error);
        return NextResponse.json({ error: 'Failed to remove splits' }, { status: 500 });
    }
}
