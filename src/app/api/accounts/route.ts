import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHandler';
import { getProfileId } from '@/lib/profile';
import { findOwnedAccount } from '@/lib/profileOwnership';
import { z } from 'zod';
import { idString, isoDate, moneyAmount, nullableId, parseBody, requiredText, toCents } from '@/lib/validation';

const accountName = requiredText(100);
const accountType = requiredText(50);

const createAccountSchema = z.object({
    name: accountName,
    type: accountType,
    onBudget: z.boolean().optional(),
    balance: moneyAmount.optional(),
});

const updateAccountSchema = z.object({
    id: idString,
    action: z.enum(['reconcile', 'link', 'reopen', 'update']).optional(),
    reconcileBalance: moneyAmount.optional(),
    reconcileDate: isoDate.optional(),
    linkedAccountId: nullableId.optional(),
    updates: z.object({
        name: accountName.optional(),
        type: accountType.optional(),
        onBudget: z.boolean().optional(),
        closed: z.boolean().optional(),
    }).default({}),
});

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
        const parsed = await parseBody(request, createAccountSchema);
        if (!parsed.success) return parsed.response;
        const { name, type, onBudget, balance } = parsed.data;
        const balanceCents = balance ? toCents(balance) : 0;

        const account = await prisma.account.create({
            data: {
                name,
                type,
                onBudget: onBudget ?? true,
                balance: balanceCents,
                clearedBalance: balanceCents,
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
        const profileId = await getProfileId(request);
        const parsed = await parseBody(request, updateAccountSchema);
        if (!parsed.success) return parsed.response;
        const { id, action, updates, reconcileBalance, reconcileDate, linkedAccountId } = parsed.data;

        const account = await findOwnedAccount(profileId, id);
        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        if (action === 'reconcile') {
            // Reconcile account: lock in cleared balance and mark past transactions as reconciled
            // Mark all cleared transactions before/on reconcileDate as reconciled
            const cutoffDate = reconcileDate ?? new Date();
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
                const expectedCents = toCents(reconcileBalance);
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
            if (linkedAccountId && !(await findOwnedAccount(profileId, linkedAccountId))) {
                return NextResponse.json({ error: 'Linked account not found' }, { status: 404 });
            }
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
            const { name, type, onBudget, closed } = updates;
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
        const profileId = await getProfileId(request);
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
        }

        const account = await findOwnedAccount(profileId, id);
        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
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
