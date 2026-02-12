import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Get reconciliation status for an account
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
        return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
    }

    try {
        const account = await prisma.account.findUnique({
            where: { id: accountId },
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

        // Calculate balances
        const clearedBalance = unreconciledCleared.reduce((sum, t) => sum + t.amount, 0) + account.clearedBalance;
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
        const body = await request.json();
        const { accountId, action, statementBalance, transactionIds } = body;

        if (!accountId) {
            return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
        }

        // Mark specific transactions as reconciled
        if (action === 'reconcile' && transactionIds?.length > 0) {
            await prisma.transaction.updateMany({
                where: { id: { in: transactionIds } },
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
            const account = await prisma.account.findUnique({ where: { id: accountId } });
            if (!account) {
                return NextResponse.json({ error: 'Account not found' }, { status: 404 });
            }

            // Get current cleared balance
            const currentCleared = await prisma.transaction.aggregate({
                where: { accountId, cleared: true, isReconciled: false },
                _sum: { amount: true },
            });

            const calculatedCleared = account.clearedBalance + (currentCleared._sum.amount || 0);
            const difference = statementBalance - calculatedCleared;

            if (difference !== 0) {
                // Create adjustment transaction
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
        const body = await request.json();
        const { transactionId, cleared } = body;

        if (!transactionId) {
            return NextResponse.json({ error: 'Missing transactionId' }, { status: 400 });
        }

        const transaction = await prisma.transaction.update({
            where: { id: transactionId },
            data: { cleared: cleared ?? undefined },
        });

        return NextResponse.json({ transaction });
    } catch (error) {
        console.error('Error updating transaction:', error);
        return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
    }
}
