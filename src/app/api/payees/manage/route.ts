import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Get all unique payees with transaction counts and totals
export async function GET() {
    try {
        const transactions = await prisma.transaction.findMany({
            where: {
                payee: { not: null },
            },
            select: {
                payee: true,
                amount: true,
            },
        });

        // Aggregate by payee
        const payeeMap = new Map<string, { count: number; total: number }>();
        
        for (const t of transactions) {
            if (!t.payee) continue;
            const existing = payeeMap.get(t.payee) || { count: 0, total: 0 };
            existing.count++;
            existing.total += t.amount;
            payeeMap.set(t.payee, existing);
        }

        const payees = Array.from(payeeMap.entries()).map(([name, stats]) => ({
            name,
            count: stats.count,
            total: stats.total,
        })).sort((a, b) => b.count - a.count);

        return NextResponse.json({ payees });
    } catch (error) {
        console.error('Payee fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch payees' }, { status: 500 });
    }
}

// POST - Merge payees (rename all transactions from one payee to another)
export async function POST(request: NextRequest) {
    try {
        const { action, fromPayee, toPayee, newName } = await request.json();

        if (action === 'merge') {
            if (!fromPayee || !toPayee) {
                return NextResponse.json({ error: 'Missing payee names' }, { status: 400 });
            }

            const result = await prisma.transaction.updateMany({
                where: { payee: fromPayee },
                data: { payee: toPayee },
            });

            return NextResponse.json({
                success: true,
                merged: result.count,
                message: `Merged ${result.count} transactions from "${fromPayee}" to "${toPayee}"`,
            });
        } else if (action === 'rename') {
            if (!fromPayee || !newName) {
                return NextResponse.json({ error: 'Missing payee names' }, { status: 400 });
            }

            const result = await prisma.transaction.updateMany({
                where: { payee: fromPayee },
                data: { payee: newName },
            });

            return NextResponse.json({
                success: true,
                renamed: result.count,
                message: `Renamed ${result.count} transactions from "${fromPayee}" to "${newName}"`,
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Payee action error:', error);
        return NextResponse.json({ error: 'Failed to process payee action' }, { status: 500 });
    }
}
