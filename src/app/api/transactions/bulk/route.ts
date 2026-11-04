import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { applyCategoryActivityDelta } from '@/lib/budgetHelpers';
import { findOwnedCategory } from '@/lib/profileOwnership';

// POST - Bulk edit transactions
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const { transactionIds, updates } = await request.json();

        if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
            return NextResponse.json({ error: 'No transactions selected' }, { status: 400 });
        }

        // Build update data
        const updateData: Record<string, unknown> = {};

        if (updates.categoryId !== undefined) {
            if (updates.categoryId && !(await findOwnedCategory(profileId, updates.categoryId))) {
                return NextResponse.json({ error: 'Category not found' }, { status: 404 });
            }
            // Split parents must keep `categoryId = null` — see the same guard in
            // transactions/[id] PATCH. Categorising one double-counts its amount.
            if (updates.categoryId) {
                const splitCount = await prisma.transaction.count({
                    where: { id: { in: transactionIds }, account: { profileId }, isSplit: true },
                });
                if (splitCount > 0) {
                    return NextResponse.json(
                        { error: 'Selection contains split transactions, which cannot be categorised.' },
                        { status: 400 }
                    );
                }
            }
            updateData.categoryId = updates.categoryId || null;
        }

        if (updates.payee !== undefined) {
            updateData.payee = updates.payee || null;
        }

        if (updates.cleared !== undefined) {
            updateData.cleared = updates.cleared;
        }

        if (updates.approved !== undefined) {
            updateData.approved = updates.approved;
        }

        if (updates.memo !== undefined) {
            updateData.memo = updates.memo || null;
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const categoryTransactions = updates.categoryId !== undefined
                ? await tx.transaction.findMany({
                    where: { id: { in: transactionIds }, account: { profileId } },
                    select: { categoryId: true, amount: true, date: true },
                })
                : [];

            // If cleared status is being changed, calculate balance adjustments per account
            if (updates.cleared !== undefined) {
                const transactions = await tx.transaction.findMany({
                    where: { id: { in: transactionIds }, account: { profileId } },
                    select: { id: true, amount: true, cleared: true, accountId: true },
                });

                // Group balance adjustments by account
                const accountAdjustments = new Map<string, number>();
                for (const txn of transactions) {
                    if (txn.cleared !== updates.cleared) {
                        const delta = updates.cleared ? txn.amount : -txn.amount;
                        accountAdjustments.set(
                            txn.accountId,
                            (accountAdjustments.get(txn.accountId) || 0) + delta
                        );
                    }
                }

                // Apply balance updates per account
                for (const [accountId, clearedDelta] of accountAdjustments) {
                    if (clearedDelta !== 0) {
                        await tx.account.update({
                            where: { id: accountId },
                            data: { clearedBalance: { increment: clearedDelta } },
                        });
                    }
                }
            }

            const updated = await tx.transaction.updateMany({
                where: { id: { in: transactionIds }, account: { profileId } },
                data: updateData,
            });

            if (updates.categoryId !== undefined) {
                for (const transaction of categoryTransactions) {
                    const month = transaction.date.toISOString().slice(0, 7);
                    if (transaction.categoryId) {
                        await applyCategoryActivityDelta(
                            tx,
                            transaction.categoryId,
                            month,
                            -transaction.amount,
                        );
                    }
                    if (updates.categoryId) {
                        await applyCategoryActivityDelta(
                            tx,
                            updates.categoryId,
                            month,
                            transaction.amount,
                        );
                    }
                }
            }

            return updated;
        });

        return NextResponse.json({
            success: true,
            updated: result.count,
            message: `Updated ${result.count} transactions`,
        });
    } catch (error) {
        console.error('Bulk edit error:', error);
        return NextResponse.json({ error: 'Failed to bulk edit' }, { status: 500 });
    }
}

// DELETE - Bulk delete transactions
export async function DELETE(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const { transactionIds } = await request.json();

        if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
            return NextResponse.json({ error: 'No transactions selected' }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Get selected transactions
            const selectedTransactions = await tx.transaction.findMany({
                where: { id: { in: transactionIds }, account: { profileId } },
                select: {
                    id: true,
                    amount: true,
                    cleared: true,
                    accountId: true,
                    categoryId: true,
                    date: true,
                    transferId: true,
                    subTransactions: { select: { categoryId: true, amount: true } },
                },
            });

            // Expand to include any sibling transfer legs so transfers are deleted whole
            const transferIds = [
                ...new Set(
                    selectedTransactions
                        .map(t => t.transferId)
                        .filter((id): id is string => Boolean(id))
                ),
            ];
            const siblingLegs = transferIds.length > 0
                ? await tx.transaction.findMany({
                    where: {
                        transferId: { in: transferIds },
                        id: { notIn: selectedTransactions.map(t => t.id) },
                        account: { profileId },
                    },
                    select: {
                        id: true,
                        amount: true,
                        cleared: true,
                        accountId: true,
                        categoryId: true,
                        date: true,
                        transferId: true,
                        subTransactions: { select: { categoryId: true, amount: true } },
                    },
                })
                : [];

            const transactions = [...selectedTransactions, ...siblingLegs];
            const allIdsToDelete = transactions.map(t => t.id);

            // Group balance reversals by account
            const accountAdjustments = new Map<string, { balance: number; clearedBalance: number }>();
            for (const txn of transactions) {
                const existing = accountAdjustments.get(txn.accountId) || { balance: 0, clearedBalance: 0 };
                existing.balance -= txn.amount;
                if (txn.cleared) {
                    existing.clearedBalance -= txn.amount;
                }
                accountAdjustments.set(txn.accountId, existing);
            }

            // Apply balance reversals per account
            for (const [accountId, adj] of accountAdjustments) {
                await tx.account.update({
                    where: { id: accountId },
                    data: {
                        balance: { increment: adj.balance },
                        clearedBalance: adj.clearedBalance !== 0 ? { increment: adj.clearedBalance } : undefined,
                    },
                });
            }

            if (transferIds.length > 0) {
                await tx.transfer.deleteMany({
                    where: { id: { in: transferIds }, profileId },
                });
            }

            const deleted = await tx.transaction.deleteMany({
                where: { id: { in: allIdsToDelete }, account: { profileId } },
            });

            for (const transaction of transactions) {
                const month = transaction.date.toISOString().slice(0, 7);
                if (transaction.categoryId) {
                    await applyCategoryActivityDelta(
                        tx,
                        transaction.categoryId,
                        month,
                        -transaction.amount,
                    );
                }
                for (const split of transaction.subTransactions) {
                    if (split.categoryId) {
                        await applyCategoryActivityDelta(tx, split.categoryId, month, -split.amount);
                    }
                }
            }

            return deleted;
        });

        return NextResponse.json({
            success: true,
            deleted: result.count,
            message: `Deleted ${result.count} transactions`,
        });
    } catch (error) {
        console.error('Bulk delete error:', error);
        return NextResponse.json({ error: 'Failed to bulk delete' }, { status: 500 });
    }
}
