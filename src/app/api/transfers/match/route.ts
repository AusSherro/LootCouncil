import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Find potential transfer matches
export async function GET(request: NextRequest) {
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
            const transaction = await prisma.transaction.findUnique({
                where: { id: transactionId },
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
        const body = await request.json();
        const { outflowId, inflowId } = body;

        if (!outflowId || !inflowId) {
            return NextResponse.json({ error: 'Missing outflowId or inflowId' }, { status: 400 });
        }

        // Get both transactions
        const [outflow, inflow] = await Promise.all([
            prisma.transaction.findUnique({ where: { id: outflowId } }),
            prisma.transaction.findUnique({ where: { id: inflowId } }),
        ]);

        if (!outflow || !inflow) {
            return NextResponse.json({ error: 'Transaction(s) not found' }, { status: 404 });
        }

        // Validate they're opposite amounts
        if (outflow.amount + inflow.amount !== 0) {
            return NextResponse.json({ 
                error: 'Transactions must have opposite amounts',
                outflowAmount: outflow.amount,
                inflowAmount: inflow.amount,
            }, { status: 400 });
        }

        // Generate a transfer ID
        const transferId = `transfer_${Date.now()}`;

        // Update both transactions
        await prisma.transaction.updateMany({
            where: { id: { in: [outflowId, inflowId] } },
            data: { transferId },
        });

        // Create a Transfer record for tracking
        await prisma.transfer.create({
            data: {
                amount: Math.abs(outflow.amount),
                date: outflow.date,
                memo: outflow.memo || inflow.memo || null,
                sourceAccountId: outflow.accountId,
                destinationAccountId: inflow.accountId,
                sourceTransactionId: outflowId,
                destTransactionId: inflowId,
            },
        });

        return NextResponse.json({ 
            success: true, 
            transferId,
        });
    } catch (error) {
        console.error('Error linking transfer:', error);
        return NextResponse.json({ error: 'Failed to link transfer' }, { status: 500 });
    }
}

// DELETE - Unlink a transfer
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const transferId = searchParams.get('transferId');

    if (!transferId) {
        return NextResponse.json({ error: 'Missing transferId' }, { status: 400 });
    }

    try {
        // Remove transferId from both transactions
        await prisma.transaction.updateMany({
            where: { transferId },
            data: { transferId: null },
        });

        // Delete the Transfer record
        await prisma.transfer.deleteMany({
            where: {
                OR: [
                    { sourceTransactionId: { not: null } },
                    { destTransactionId: { not: null } },
                ],
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error unlinking transfer:', error);
        return NextResponse.json({ error: 'Failed to unlink transfer' }, { status: 500 });
    }
}
