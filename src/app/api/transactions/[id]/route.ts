import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { applyCategoryActivityDelta } from '@/lib/budgetHelpers';
import { findOwnedCategory, findOwnedTransaction } from '@/lib/profileOwnership';

// PATCH - Update a specific transaction
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const profileId = await getProfileId(request);
        const { id } = await params;
        const body = await request.json();

        // Get existing transaction to validate against and to calculate balance adjustments
        const existing = await findOwnedTransaction(profileId, id);

        if (!existing) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
        }

        const updateData: Record<string, unknown> = {};
        
        if (body.categoryId !== undefined) {
            // A split parent must keep `categoryId = null`; its money lives in
            // SubTransaction rows. Allowing both would double-count the amount —
            // once via the parent and once via each split line.
            if (body.categoryId && existing.isSplit) {
                return NextResponse.json(
                    { error: 'Cannot categorise a split transaction. Remove the split first.' },
                    { status: 400 }
                );
            }
            if (body.categoryId && !(await findOwnedCategory(profileId, body.categoryId))) {
                return NextResponse.json({ error: 'Category not found' }, { status: 404 });
            }
            updateData.categoryId = body.categoryId || null;
        }
        if (body.payee !== undefined) {
            updateData.payee = body.payee;
        }
        if (body.memo !== undefined) {
            updateData.memo = body.memo;
        }
        if (body.amount !== undefined) {
            const amountCents = Math.round(Number(body.amount) * 100);
            if (!Number.isFinite(amountCents)) {
                return NextResponse.json({ error: 'Amount must be a number' }, { status: 400 });
            }
            if (existing.isSplit && amountCents !== existing.amount) {
                return NextResponse.json(
                    { error: 'Cannot change the total amount of a split transaction without updating its splits.' },
                    { status: 400 }
                );
            }
            updateData.amount = amountCents;
        }
        if (body.cleared !== undefined) {
            updateData.cleared = body.cleared;
        }
        if (body.date !== undefined) {
            const parsedDate = new Date(body.date);
            if (Number.isNaN(parsedDate.getTime())) {
                return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
            }
            updateData.date = parsedDate;
        }

        const transaction = await prisma.$transaction(async (tx) => {
            const updated = await tx.transaction.update({
                where: { id, account: { profileId } },
                data: updateData,
                include: {
                    account: { select: { id: true, name: true } },
                    category: { select: { id: true, name: true } },
                },
            });

            const oldMonth = existing.date.toISOString().slice(0, 7);
            const newMonth = updated.date.toISOString().slice(0, 7);

            if (existing.isSplit && oldMonth !== newMonth) {
                const splits = await tx.subTransaction.findMany({
                    where: { transactionId: id },
                    select: { categoryId: true, amount: true },
                });
                for (const split of splits) {
                    if (split.categoryId) {
                        await applyCategoryActivityDelta(tx, split.categoryId, oldMonth, -split.amount);
                        await applyCategoryActivityDelta(tx, split.categoryId, newMonth, split.amount);
                    }
                }
            }

            if (existing.categoryId) {
                await applyCategoryActivityDelta(
                    tx,
                    existing.categoryId,
                    oldMonth,
                    -existing.amount,
                );
            }
            if (updated.categoryId) {
                await applyCategoryActivityDelta(
                    tx,
                    updated.categoryId,
                    newMonth,
                    updated.amount,
                );
            }

            // Update account balance if amount or cleared changed
            const newAmount = body.amount !== undefined ? Math.round(body.amount * 100) : existing.amount;
            const amountDiff = newAmount - existing.amount;
            const wasCleared = existing.cleared;
            const nowCleared = body.cleared !== undefined ? body.cleared : existing.cleared;

            let clearedDelta = 0;
            if (wasCleared && nowCleared) {
                clearedDelta = amountDiff;
            } else if (!wasCleared && nowCleared) {
                clearedDelta = newAmount;
            } else if (wasCleared && !nowCleared) {
                clearedDelta = -existing.amount;
            }

            if (amountDiff !== 0 || clearedDelta !== 0) {
                await tx.account.update({
                    where: { id: existing.accountId },
                    data: {
                        balance: amountDiff !== 0 ? { increment: amountDiff } : undefined,
                        clearedBalance: clearedDelta !== 0 ? { increment: clearedDelta } : undefined,
                    },
                });
            }

            return updated;
        });

        return NextResponse.json({ transaction });
    } catch (error) {
        console.error('Error updating transaction:', error);
        return NextResponse.json(
            { error: 'Failed to update transaction' },
            { status: 500 }
        );
    }
}

// DELETE - Delete a specific transaction
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const profileId = await getProfileId(request);
        const { id } = await params;

        // Get existing transaction to reverse balance
        const existing = await findOwnedTransaction(profileId, id);

        if (!existing) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
        }

        const subTransactions = existing.isSplit
            ? await prisma.subTransaction.findMany({
                where: { transactionId: id },
                select: { categoryId: true, amount: true },
            })
            : [];

        await prisma.$transaction(async (tx) => {
            if (existing.transferId) {
                const siblingLegs = await tx.transaction.findMany({
                    where: {
                        transferId: existing.transferId,
                        id: { not: id },
                        account: { profileId },
                    },
                });
                for (const sibling of siblingLegs) {
                    await tx.transaction.delete({ where: { id: sibling.id } });
                    await tx.account.update({
                        where: { id: sibling.accountId },
                        data: {
                            balance: { decrement: sibling.amount },
                            clearedBalance: sibling.cleared ? { decrement: sibling.amount } : undefined,
                        },
                    });
                }
                await tx.transfer.deleteMany({
                    where: { id: existing.transferId, profileId },
                });
            }

            await tx.transaction.delete({
                where: { id, account: { profileId } },
            });

            const month = existing.date.toISOString().slice(0, 7);
            if (existing.categoryId) {
                await applyCategoryActivityDelta(tx, existing.categoryId, month, -existing.amount);
            }
            for (const split of subTransactions) {
                if (split.categoryId) {
                    await applyCategoryActivityDelta(tx, split.categoryId, month, -split.amount);
                }
            }

            await tx.account.update({
                where: { id: existing.accountId },
                data: {
                    balance: { decrement: existing.amount },
                    clearedBalance: existing.cleared ? { decrement: existing.amount } : undefined,
                },
            });
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting transaction:', error);
        return NextResponse.json(
            { error: 'Failed to delete transaction' },
            { status: 500 }
        );
    }
}
