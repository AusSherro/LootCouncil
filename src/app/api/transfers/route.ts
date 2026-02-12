import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - List transfers
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    try {
        const transfers = await prisma.transfer.findMany({
            orderBy: { date: 'desc' },
            take: limit,
        });

        // Fetch account names for display
        const accountIds = new Set<string>();
        transfers.forEach(t => {
            accountIds.add(t.sourceAccountId);
            accountIds.add(t.destinationAccountId);
        });

        const accounts = await prisma.account.findMany({
            where: { id: { in: Array.from(accountIds) } },
            select: { id: true, name: true },
        });

        const accountMap = new Map(accounts.map(a => [a.id, a.name]));

        const enrichedTransfers = transfers.map(t => ({
            ...t,
            sourceAccountName: accountMap.get(t.sourceAccountId) || 'Unknown',
            destinationAccountName: accountMap.get(t.destinationAccountId) || 'Unknown',
            amountDollars: t.amount / 100,
        }));

        return NextResponse.json({ transfers: enrichedTransfers });
    } catch (error) {
        console.error('Error fetching transfers:', error);
        return NextResponse.json({ error: 'Failed to fetch transfers' }, { status: 500 });
    }
}

// POST - Create a transfer between accounts
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sourceAccountId, destinationAccountId, amount, date, memo } = body;

        if (!sourceAccountId || !destinationAccountId || amount === undefined) {
            return NextResponse.json(
                { error: 'sourceAccountId, destinationAccountId, and amount are required' },
                { status: 400 }
            );
        }

        if (sourceAccountId === destinationAccountId) {
            return NextResponse.json(
                { error: 'Source and destination accounts must be different' },
                { status: 400 }
            );
        }

        const amountCents = Math.round(parseFloat(amount) * 100);
        if (amountCents <= 0) {
            return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
        }

        // Verify both accounts exist
        const sourceAccount = await prisma.account.findUnique({
            where: { id: sourceAccountId },
        });
        const destAccount = await prisma.account.findUnique({
            where: { id: destinationAccountId },
        });

        if (!sourceAccount || !destAccount) {
            return NextResponse.json({ error: 'One or both accounts not found' }, { status: 404 });
        }

        const transferDate = date ? new Date(date) : new Date();

        // Use transaction for atomicity
        const result = await prisma.$transaction(async (tx) => {
            // Create the transfer record
            const transfer = await tx.transfer.create({
                data: {
                    amount: amountCents,
                    date: transferDate,
                    memo: memo || null,
                    sourceAccountId,
                    destinationAccountId,
                },
            });

            // Create the outflow transaction (from source)
            const outflowTx = await tx.transaction.create({
                data: {
                    date: transferDate,
                    amount: -amountCents,
                    payee: `Transfer to ${destAccount.name}`,
                    memo: memo || null,
                    accountId: sourceAccountId,
                    categoryId: null,
                    cleared: true,
                    approved: true,
                    transferId: transfer.id,
                },
            });

            // Create the inflow transaction (to destination)
            const inflowTx = await tx.transaction.create({
                data: {
                    date: transferDate,
                    amount: amountCents,
                    payee: `Transfer from ${sourceAccount.name}`,
                    memo: memo || null,
                    accountId: destinationAccountId,
                    categoryId: null,
                    cleared: true,
                    approved: true,
                    transferId: transfer.id,
                },
            });

            // Update the transfer with transaction IDs
            await tx.transfer.update({
                where: { id: transfer.id },
                data: {
                    sourceTransactionId: outflowTx.id,
                    destTransactionId: inflowTx.id,
                },
            });

            // Update account balances
            await tx.account.update({
                where: { id: sourceAccountId },
                data: {
                    balance: { decrement: amountCents },
                    clearedBalance: { decrement: amountCents },
                },
            });

            await tx.account.update({
                where: { id: destinationAccountId },
                data: {
                    balance: { increment: amountCents },
                    clearedBalance: { increment: amountCents },
                },
            });

            return transfer;
        });

        return NextResponse.json({
            transfer: {
                ...result,
                sourceAccountName: sourceAccount.name,
                destinationAccountName: destAccount.name,
                amountDollars: amountCents / 100,
            },
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating transfer:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: 'Failed to create transfer', details: message }, { status: 500 });
    }
}

// DELETE - Delete a transfer and its linked transactions
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Transfer ID required' }, { status: 400 });
    }

    try {
        const transfer = await prisma.transfer.findUnique({
            where: { id },
        });

        if (!transfer) {
            return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
        }

        // Use transaction for atomicity
        await prisma.$transaction(async (tx) => {
            // Delete the linked transactions
            if (transfer.sourceTransactionId) {
                await tx.transaction.delete({ where: { id: transfer.sourceTransactionId } });
            }
            if (transfer.destTransactionId) {
                await tx.transaction.delete({ where: { id: transfer.destTransactionId } });
            }

            // Reverse the balance changes
            await tx.account.update({
                where: { id: transfer.sourceAccountId },
                data: {
                    balance: { increment: transfer.amount },
                    clearedBalance: { increment: transfer.amount },
                },
            });

            await tx.account.update({
                where: { id: transfer.destinationAccountId },
                data: {
                    balance: { decrement: transfer.amount },
                    clearedBalance: { decrement: transfer.amount },
                },
            });

            // Delete the transfer
            await tx.transfer.delete({ where: { id } });
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting transfer:', error);
        return NextResponse.json({ error: 'Failed to delete transfer' }, { status: 500 });
    }
}
