import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { findOwnedTransaction } from '@/lib/profileOwnership';

class TransferMatchConflictError extends Error {}

// GET - Find potential transfer matches
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');
    const findUnmatched = searchParams.get('findUnmatched') === 'true';

    try {
        // Find all unmatched potential transfers
        if (findUnmatched) {
            // Get all transactions that could be transfers (no category, not already matched)
            const potentialTransfers = await prisma.transaction.findMany({
                where: {
                    transferId: null,
                    categoryId: null,
                    account: { profileId },
                },
                include: { account: true },
                orderBy: { date: 'desc' },
            });

            // Group potential matches (same amount, opposite sign, within 3 days)
            const matches: Array<{
                outflow: typeof potentialTransfers[0];
                inflow: typeof potentialTransfers[0];
                confidence: number;
            }> = [];

            for (let i = 0; i < potentialTransfers.length; i++) {
                const t1 = potentialTransfers[i];
                if (t1.amount >= 0) continue; // Only look at outflows

                for (let j = i + 1; j < potentialTransfers.length; j++) {
                    const t2 = potentialTransfers[j];
                    if (t2.amount <= 0) continue; // Only match with inflows
                    if (t2.accountId === t1.accountId) continue; // Must be different accounts

                    // Check if amounts match (opposite)
                    if (t1.amount + t2.amount !== 0) continue;

                    // Check if dates are close (within 3 days)
                    const daysDiff = Math.abs(
                        (t1.date.getTime() - t2.date.getTime()) / (1000 * 60 * 60 * 24)
                    );
                    if (daysDiff > 3) continue;

                    // Calculate confidence based on date proximity
                    const confidence = daysDiff === 0 ? 100 : daysDiff === 1 ? 90 : daysDiff === 2 ? 75 : 60;

                    matches.push({
                        outflow: t1,
                        inflow: t2,
                        confidence,
                    });
                }
            }

            // Sort by confidence
            matches.sort((a, b) => b.confidence - a.confidence);

            return NextResponse.json({ matches });
        }

        // Find matches for a specific transaction
        if (transactionId) {
            const transaction = await prisma.transaction.findFirst({
                where: { id: transactionId, account: { profileId } },
                include: { account: true },
            });

            if (!transaction) {
                return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
            }

            // Find potential matches (opposite amount, different account, within 3 days)
            const oppositeAmount = -transaction.amount;
            const startDate = new Date(transaction.date);
            startDate.setDate(startDate.getDate() - 3);
            const endDate = new Date(transaction.date);
            endDate.setDate(endDate.getDate() + 3);

            const potentialMatches = await prisma.transaction.findMany({
                where: {
                    id: { not: transactionId },
                    amount: oppositeAmount,
                    accountId: { not: transaction.accountId },
                    transferId: null,
                    date: { gte: startDate, lte: endDate },
                    account: { profileId },
                },
                include: { account: true },
            });

            return NextResponse.json({ 
                transaction,
                potentialMatches,
            });
        }

        return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    } catch (error) {
        console.error('Error finding transfer matches:', error);
        return NextResponse.json({ error: 'Failed to find matches' }, { status: 500 });
    }
}

// POST - Link two transactions as a transfer
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const body = await request.json();
        const { outflowId, inflowId } = body;

        if (!outflowId || !inflowId) {
            return NextResponse.json({ error: 'Missing outflowId or inflowId' }, { status: 400 });
        }

        // Get both transactions
        const [outflow, inflow] = await Promise.all([
            findOwnedTransaction(profileId, outflowId),
            findOwnedTransaction(profileId, inflowId),
        ]);

        if (!outflow || !inflow) {
            return NextResponse.json({ error: 'Transaction(s) not found' }, { status: 404 });
        }

        if (outflow.accountId === inflow.accountId || outflow.transferId || inflow.transferId) {
            return NextResponse.json({ error: 'Transactions must be unmatched and use different accounts' }, { status: 400 });
        }

        // Validate direction and opposite amounts
        if (outflow.amount >= 0 || inflow.amount <= 0 || outflow.amount + inflow.amount !== 0) {
            return NextResponse.json({ 
                error: 'Outflow must be negative, inflow must be positive, and amounts must be opposite',
                outflowAmount: outflow.amount,
                inflowAmount: inflow.amount,
            }, { status: 400 });
        }

        // Generate a transfer ID
        const transferId = `transfer_${randomUUID()}`;

        await prisma.$transaction(async (tx) => {
            const updated = await tx.transaction.updateMany({
                where: {
                    id: { in: [outflowId, inflowId] },
                    account: { profileId },
                    transferId: null,
                },
                data: { transferId },
            });
            if (updated.count !== 2) {
                throw new TransferMatchConflictError();
            }

            await tx.transfer.create({
                data: {
                    amount: Math.abs(outflow.amount),
                    date: outflow.date,
                    memo: outflow.memo || inflow.memo || null,
                    sourceAccountId: outflow.accountId,
                    destinationAccountId: inflow.accountId,
                    sourceTransactionId: outflowId,
                    destTransactionId: inflowId,
                    profileId,
                },
            });
        });

        return NextResponse.json({ 
            success: true, 
            transferId,
        });
    } catch (error) {
        if (error instanceof TransferMatchConflictError) {
            return NextResponse.json({ error: 'One or both transactions are already matched' }, { status: 409 });
        }
        console.error('Error linking transfer:', error);
        return NextResponse.json({ error: 'Failed to link transfer' }, { status: 500 });
    }
}

// DELETE - Unlink a transfer
export async function DELETE(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const transferId = searchParams.get('transferId');

    if (!transferId) {
        return NextResponse.json({ error: 'Missing transferId' }, { status: 400 });
    }

    try {
        const linkedTransactions = await prisma.transaction.findMany({
            where: { transferId, account: { profileId } },
            select: { id: true },
        });
        if (linkedTransactions.length === 0) {
            return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
        }

        const transactionIds = linkedTransactions.map(transaction => transaction.id);
        await prisma.$transaction([
            prisma.transaction.updateMany({
                where: { id: { in: transactionIds }, account: { profileId } },
                data: { transferId: null },
            }),
            prisma.transfer.deleteMany({
                where: {
                    profileId,
                    OR: [
                        { sourceTransactionId: { in: transactionIds } },
                        { destTransactionId: { in: transactionIds } },
                    ],
                },
            }),
        ]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error unlinking transfer:', error);
        return NextResponse.json({ error: 'Failed to unlink transfer' }, { status: 500 });
    }
}
