import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';

// GET - Get reconciliation status for an account
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
        return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
    }

    try {
        const account = await prisma.account.findUnique({
            where: { id: accountId, profileId },
        });

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        // Get unreconciled cleared transactions
        const unreconciledCleared = await prisma.transaction.findMany({
            where: {
                accountId,
                cleared: true,
                isReconciled: false,
            },
            orderBy: { date: 'asc' },
        });

        // Get pending (uncleared) transactions
        const pending = await prisma.transaction.findMany({
            where: {
                accountId,
                cleared: false,
            },
            orderBy: { date: 'asc' },
        });

        // Calculate balances - sum all cleared transactions directly
        // to avoid double-counting issues with imported data
        const allCleared = await prisma.transaction.aggregate({
            where: { accountId, cleared: true },
            _sum: { amount: true },
        });
        const clearedBalance = allCleared._sum.amount || 0;
        const pendingBalance = pending.reduce((sum, t) => sum + t.amount, 0);

        return NextResponse.json({
            account: {
                id: account.id,
                name: account.name,
                balance: account.balance,
                clearedBalance: account.clearedBalance,
                lastReconciled: account.lastReconciled,
            },
            unreconciledCleared,
            pending,
            calculatedClearedBalance: clearedBalance,
            pendingAmount: pendingBalance,
        });
    } catch (error) {
        console.error('Error fetching reconciliation status:', error);
        return NextResponse.json({ error: 'Failed to fetch reconciliation status' }, { status: 500 });
    }
}

// POST - Start or complete reconciliation
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const body = await request.json();
        const { accountId, action, statementBalance, transactionIds } = body;

        if (!accountId) {
            return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
        }

        // Verify account belongs to this profile
        const account = await prisma.account.findUnique({ where: { id: accountId, profileId } });
        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        // Mark specific transactions as reconciled
        if (action === 'reconcile' && transactionIds?.length > 0) {
            await prisma.transaction.updateMany({
                where: { id: { in: transactionIds }, accountId },
                data: { isReconciled: true },
            });

            // Calculate new cleared balance
            const reconciledTotal = await prisma.transaction.aggregate({
                where: { accountId, isReconciled: true },
                _sum: { amount: true },
            });

            // Update account
            await prisma.account.update({
                where: { id: accountId },
                data: {
                    clearedBalance: reconciledTotal._sum.amount || 0,
                    lastReconciled: new Date(),
                },
            });

            return NextResponse.json({ 
                success: true, 
                reconciled: transactionIds.length,
            });
        }

        // Complete reconciliation with statement balance
        if (action === 'complete' && statementBalance !== undefined) {

            // Calculate what cleared transactions actually sum to.
            // This avoids the old bug where oldClearedBalance + unreconciled
            // could double-count imported transactions.
            const clearedSum = await prisma.transaction.aggregate({
                where: { accountId, cleared: true },
                _sum: { amount: true },
            });
            const actualCleared = clearedSum._sum.amount || 0;
            const difference = statementBalance - actualCleared;

            if (difference !== 0) {
                // Create adjustment transaction to bridge bank vs computed gap
                await prisma.transaction.create({
                    data: {
                        date: new Date(),
                        amount: difference,
                        payee: 'Reconciliation Adjustment',
                        memo: `Adjustment to match statement balance`,
                        accountId,
                        cleared: true,
                        isReconciled: true,
                        approved: true,
                    },
                });

                // Update account balance
                await prisma.account.update({
                    where: { id: accountId },
                    data: { balance: { increment: difference } },
                });
            }

            // Mark all cleared but not reconciled as reconciled
            await prisma.transaction.updateMany({
                where: { accountId, cleared: true, isReconciled: false },
                data: { isReconciled: true },
            });

            // Update account's cleared balance and last reconciled
            await prisma.account.update({
                where: { id: accountId },
                data: {
                    clearedBalance: statementBalance,
                    lastReconciled: new Date(),
                },
            });

            return NextResponse.json({
                success: true,
                adjustment: difference,
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Error during reconciliation:', error);
        return NextResponse.json({ error: 'Failed to reconcile' }, { status: 500 });
    }
}

// PATCH - Toggle cleared status for a transaction
export async function PATCH(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const body = await request.json();
        const { transactionId, cleared } = body;

        if (!transactionId) {
            return NextResponse.json({ error: 'Missing transactionId' }, { status: 400 });
        }

        // Get existing transaction to calculate clearedBalance adjustment
        const existing = await prisma.transaction.findFirst({
            where: { id: transactionId, account: { profileId } },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
        }

        const nowCleared = cleared ?? !existing.cleared;

        const transaction = await prisma.$transaction(async (tx) => {
            const updated = await tx.transaction.update({
                where: { id: transactionId, account: { profileId } },
                data: { cleared: nowCleared },
            });

            // Update clearedBalance: add amount if clearing, remove if unclearing
            if (existing.cleared !== nowCleared) {
                const clearedDelta = nowCleared ? existing.amount : -existing.amount;
                await tx.account.update({
                    where: { id: existing.accountId },
                    data: { clearedBalance: { increment: clearedDelta } },
                });
            }

            return updated;
        });

        return NextResponse.json({ transaction });
    } catch (error) {
        console.error('Error updating transaction:', error);
        return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
    }
}
