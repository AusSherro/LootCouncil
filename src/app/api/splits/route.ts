import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST - Create splits for a transaction
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { transactionId, splits } = body;

        if (!transactionId || !splits || !Array.isArray(splits) || splits.length < 2) {
            return NextResponse.json({ error: 'Need transactionId and at least 2 splits' }, { status: 400 });
        }

        // Get the parent transaction
        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
        });

        if (!transaction) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
        }

        // Validate split amounts sum to transaction amount
        const splitTotal = splits.reduce((sum: number, s: { amount: number }) => sum + s.amount, 0);
        if (splitTotal !== transaction.amount) {
            return NextResponse.json({ 
                error: `Split amounts (${splitTotal}) must equal transaction amount (${transaction.amount})` 
            }, { status: 400 });
        }

        const month = `${transaction.date.getFullYear()}-${String(transaction.date.getMonth() + 1).padStart(2, '0')}`;

        // Use transaction for atomicity
        const result = await prisma.$transaction(async (tx) => {
            // Delete existing splits if any
            await tx.subTransaction.deleteMany({ where: { transactionId } });

            // Create new splits
            const createdSplits = await tx.subTransaction.createMany({
                data: splits.map((s: { categoryId?: string; amount: number; memo?: string }) => ({
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
                    await tx.monthlyBudget.upsert({
                        where: { month_categoryId: { month, categoryId: split.categoryId } },
                        create: {
                            month,
                            categoryId: split.categoryId,
                            activity: split.amount,
                        },
                        update: {
                            activity: { increment: split.amount },
                        },
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
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');

    if (!transactionId) {
        return NextResponse.json({ error: 'Missing transactionId' }, { status: 400 });
    }

    try {
        const splits = await prisma.subTransaction.findMany({
            where: { transactionId },
            orderBy: { createdAt: 'asc' },
        });

        // Get category names
        const categoryIds = splits.filter(s => s.categoryId).map(s => s.categoryId!);
        const categories = await prisma.category.findMany({
            where: { id: { in: categoryIds } },
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
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');

    if (!transactionId) {
        return NextResponse.json({ error: 'Missing transactionId' }, { status: 400 });
    }

    try {
        // Get the transaction and its splits for budget adjustment
        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
            include: { subTransactions: true },
        });

        if (!transaction) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
        }

        const month = `${transaction.date.getFullYear()}-${String(transaction.date.getMonth() + 1).padStart(2, '0')}`;

        // Use transaction for atomicity
        await prisma.$transaction(async (tx) => {
            // Reverse the budget activity for each split
            for (const split of transaction.subTransactions) {
                if (split.categoryId) {
                    await tx.monthlyBudget.update({
                        where: { month_categoryId: { month, categoryId: split.categoryId } },
                        data: { activity: { decrement: split.amount } },
                    }).catch(() => {}); // Ignore if doesn't exist
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
