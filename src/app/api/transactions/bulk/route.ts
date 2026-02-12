import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST - Bulk edit transactions
export async function POST(request: NextRequest) {
    try {
        const { transactionIds, updates } = await request.json();

        if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
            return NextResponse.json({ error: 'No transactions selected' }, { status: 400 });
        }

        // Build update data
        const updateData: Record<string, unknown> = {};

        if (updates.categoryId !== undefined) {
            updateData.categoryId = updates.categoryId || null;
        }

        if (updates.payee !== undefined) {
            updateData.payee = updates.payee || null;
        }

        if (updates.cleared !== undefined) {
            updateData.cleared = updates.cleared;
        }

        if (updates.approved !== undefined) {
            updateData.approved = updates.approved;
        }

        if (updates.memo !== undefined) {
            updateData.memo = updates.memo || null;
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
        }

        const result = await prisma.transaction.updateMany({
            where: { id: { in: transactionIds } },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            updated: result.count,
            message: `Updated ${result.count} transactions`,
        });
    } catch (error) {
        console.error('Bulk edit error:', error);
        return NextResponse.json({ error: 'Failed to bulk edit' }, { status: 500 });
    }
}

// DELETE - Bulk delete transactions
export async function DELETE(request: NextRequest) {
    try {
        const { transactionIds } = await request.json();

        if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
            return NextResponse.json({ error: 'No transactions selected' }, { status: 400 });
        }

        const result = await prisma.transaction.deleteMany({
            where: { id: { in: transactionIds } },
        });

        return NextResponse.json({
            success: true,
            deleted: result.count,
            message: `Deleted ${result.count} transactions`,
        });
    } catch (error) {
        console.error('Bulk delete error:', error);
        return NextResponse.json({ error: 'Failed to bulk delete' }, { status: 500 });
    }
}
