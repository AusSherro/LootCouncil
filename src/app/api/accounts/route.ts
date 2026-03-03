import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHandler';
import { getProfileId } from '@/lib/profile';

// GET all accounts
export const GET = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);

    const accounts = await prisma.account.findMany({
        where: { profileId },
        orderBy: [
            { onBudget: 'desc' },
            { name: 'asc' },
        ],
    });

    // Manually add linked account info
    const accountMap = new Map(accounts.map(a => [a.id, a]));
    const accountsWithLinks = accounts.map(account => {
        const linkedAccount = account.linkedAccountId
            ? accountMap.get(account.linkedAccountId)
            : null;
        return {
            ...account,
            linkedAccount: linkedAccount
                ? { id: linkedAccount.id, name: linkedAccount.name }
                : null,
        };
    });

    return NextResponse.json({ accounts: accountsWithLinks });
}, 'Fetch accounts');

// POST create new account
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const body = await request.json();
        const { name, type, onBudget, balance } = body;

        if (!name || !type) {
            return NextResponse.json(
                { error: 'Missing required fields: name, type' },
                { status: 400 }
            );
        }

        const account = await prisma.account.create({
            data: {
                name,
                type,
                onBudget: onBudget ?? true,
                balance: balance ? Math.round(balance * 100) : 0,
                clearedBalance: balance ? Math.round(balance * 100) : 0,
                profileId,
            },
        });

        return NextResponse.json(account, { status: 201 });
    } catch (error) {
        console.error('Error creating account:', error);
        return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }
}

// PATCH - Update account or reconcile
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, action, updates, reconcileBalance, reconcileDate } = body;

        if (!id) {
            return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
        }

        if (action === 'reconcile') {
            // Reconcile account: lock in cleared balance and mark past transactions as reconciled
            const account = await prisma.account.findUnique({ where: { id } });
            if (!account) {
                return NextResponse.json({ error: 'Account not found' }, { status: 404 });
            }

            // Mark all cleared transactions before/on reconcileDate as reconciled
            const cutoffDate = reconcileDate ? new Date(reconcileDate) : new Date();
            await prisma.transaction.updateMany({
                where: {
                    accountId: id,
                    cleared: true,
                    isReconciled: false,
                    date: { lte: cutoffDate },
                },
                data: { isReconciled: true },
            });

            // Calculate the cleared balance from reconciled transactions
            const reconciledSum = await prisma.transaction.aggregate({
                where: {
                    accountId: id,
                    isReconciled: true,
                },
                _sum: { amount: true },
            });

            // Update account's cleared balance
            const newClearedBalance = reconciledSum._sum.amount || 0;
            const updated = await prisma.account.update({
                where: { id },
                data: { 
                    clearedBalance: newClearedBalance,
                    lastReconciled: cutoffDate,
                },
            });

            // If user provided expected balance, check for discrepancy
            let adjustmentNeeded = 0;
            if (reconcileBalance !== undefined) {
                const expectedCents = Math.round(reconcileBalance * 100);
                adjustmentNeeded = expectedCents - newClearedBalance;
            }

            return NextResponse.json({ 
                account: updated,
                clearedBalance: newClearedBalance / 100,
                adjustmentNeeded: adjustmentNeeded / 100,
                transactionsReconciled: await prisma.transaction.count({
                    where: { accountId: id, isReconciled: true }
                }),
            });
        } else if (action === 'link') {
            // Link credit card to payment account
            const { linkedAccountId } = body;
            const updated = await prisma.account.update({
                where: { id },
                data: { linkedAccountId: linkedAccountId || null },
            });
            return NextResponse.json({ account: updated });
        } else if (action === 'reopen') {
            const updated = await prisma.account.update({
                where: { id },
                data: { closed: false },
            });
            return NextResponse.json({ account: updated });
        } else {
            // Regular update — whitelist allowed fields only
            const { name, type, onBudget, closed } = updates ?? {};
            const safeUpdates: Record<string, unknown> = {};
            if (name !== undefined) safeUpdates.name = name;
            if (type !== undefined) safeUpdates.type = type;
            if (onBudget !== undefined) safeUpdates.onBudget = onBudget;
            if (closed !== undefined) safeUpdates.closed = closed;

            const updated = await prisma.account.update({
                where: { id },
                data: safeUpdates,
            });
            return NextResponse.json({ account: updated });
        }
    } catch (error) {
        console.error('Error updating account:', error);
        return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
    }
}

// DELETE - Close/delete an account
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
        }

        // Check for transactions
        const txCount = await prisma.transaction.count({ where: { accountId: id } });
        if (txCount > 0) {
            // Soft delete - mark as closed/hidden
            await prisma.account.update({
                where: { id },
                data: { closed: true },
            });
            return NextResponse.json({ success: true, message: 'Account closed (has transactions)' });
        } else {
            // Hard delete if no transactions
            await prisma.account.delete({ where: { id } });
            return NextResponse.json({ success: true, message: 'Account deleted' });
        }
    } catch (error) {
        console.error('Error deleting account:', error);
        return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }
}
