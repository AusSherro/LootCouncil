import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody, requiredText } from '@/lib/validation';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';

// GET - Get all unique payees with transaction counts and totals
export async function GET(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const transactions = await prisma.transaction.findMany({
            where: {
                payee: { not: null },
                account: { profileId },
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
// Not trimmed: it has to equal the stored payee exactly to match.
const existingPayee = z.string().min(1, 'is required').max(200, 'must be at most 200 characters');

const payeeActionSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('merge'), fromPayee: existingPayee, toPayee: requiredText(200) }),
    z.object({ action: z.literal('rename'), fromPayee: existingPayee, newName: requiredText(200) }),
], { error: 'action must be merge or rename' });

export async function POST(request: NextRequest) {
    try {
        const parsed = await parseBody(request, payeeActionSchema);
        if (!parsed.success) return parsed.response;
        const body = parsed.data;

        if (body.action === 'merge') {
            const { fromPayee, toPayee } = body;

            const profileId = await getProfileId(request);
            const result = await prisma.transaction.updateMany({
                where: { payee: fromPayee, account: { profileId } },
                data: { payee: toPayee },
            });

            return NextResponse.json({
                success: true,
                merged: result.count,
                message: `Merged ${result.count} transactions from "${fromPayee}" to "${toPayee}"`,
            });
        } else if (body.action === 'rename') {
            const { fromPayee, newName } = body;

            const profileId = await getProfileId(request);
            const result = await prisma.transaction.updateMany({
                where: { payee: fromPayee, account: { profileId } },
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
