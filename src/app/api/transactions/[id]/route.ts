import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
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
        
        const updateData: Record<string, unknown> = {};
        
        if (body.categoryId !== undefined) {
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
            updateData.amount = Math.round(body.amount * 100);
        }
        if (body.cleared !== undefined) {
            updateData.cleared = body.cleared;
        }
        if (body.date !== undefined) {
            updateData.date = new Date(body.date);
        }

        // Get existing transaction to calculate balance adjustments
        const existing = await findOwnedTransaction(profileId, id);

        if (!existing) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
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

        await prisma.$transaction(async (tx) => {
            await tx.transaction.delete({
                where: { id, account: { profileId } },
            });

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
