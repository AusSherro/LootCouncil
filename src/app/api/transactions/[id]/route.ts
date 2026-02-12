import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// PATCH - Update a specific transaction
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        
        const updateData: Record<string, unknown> = {};
        
        if (body.categoryId !== undefined) {
            updateData.categoryId = body.categoryId || null;
        }
        if (body.payee !== undefined) {
            updateData.payee = body.payee;
        }
        if (body.memo !== undefined) {
            updateData.memo = body.memo;
        }
        if (body.amount !== undefined) {
            updateData.amount = Math.round(body.amount * 100);
        }
        if (body.cleared !== undefined) {
            updateData.cleared = body.cleared;
        }
        if (body.date !== undefined) {
            updateData.date = new Date(body.date);
        }

        const transaction = await prisma.transaction.update({
            where: { id },
            data: updateData,
            include: {
                account: { select: { id: true, name: true } },
                category: { select: { id: true, name: true } },
            },
        });

        return NextResponse.json({ transaction });
    } catch (error) {
        console.error('Error updating transaction:', error);
        return NextResponse.json(
            { error: 'Failed to update transaction' },
            { status: 500 }
        );
    }
}

// DELETE - Delete a specific transaction
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        
        await prisma.transaction.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting transaction:', error);
        return NextResponse.json(
            { error: 'Failed to delete transaction' },
            { status: 500 }
        );
    }
}
