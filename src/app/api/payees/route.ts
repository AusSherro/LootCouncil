import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Search payees for autocomplete
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '10');

    try {
        let payees;
        
        if (query) {
            // Search by name (case-insensitive)
            payees = await prisma.payee.findMany({
                where: {
                    name: {
                        contains: query,
                    },
                },
                orderBy: { name: 'asc' },
                take: limit,
            });
        } else {
            // Return most recently used payees (based on transactions)
            // First get recent unique payee names from transactions
            const recentTransactions = await prisma.transaction.findMany({
                where: { payee: { not: null } },
                orderBy: { date: 'desc' },
                select: { payee: true },
                take: 100,
            });

            const recentPayeeNames = [...new Set(recentTransactions.map(t => t.payee).filter(Boolean))];
            
            // Get payee records for these names
            payees = await prisma.payee.findMany({
                where: {
                    name: { in: recentPayeeNames as string[] },
                },
                take: limit,
            });

            // If we have fewer than limit, add more payees alphabetically
            if (payees.length < limit) {
                const morePayees = await prisma.payee.findMany({
                    where: {
                        id: { notIn: payees.map(p => p.id) },
                    },
                    orderBy: { name: 'asc' },
                    take: limit - payees.length,
                });
                payees = [...payees, ...morePayees];
            }
        }

        return NextResponse.json({ payees });
    } catch (error) {
        console.error('Error fetching payees:', error);
        return NextResponse.json({ error: 'Failed to fetch payees' }, { status: 500 });
    }
}

// POST - Create a new payee
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name } = body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: 'Payee name is required' }, { status: 400 });
        }

        const trimmedName = name.trim();

        // Check if payee already exists
        const existing = await prisma.payee.findFirst({
            where: { name: trimmedName },
        });

        if (existing) {
            return NextResponse.json({ payee: existing });
        }

        // Create new payee
        const payee = await prisma.payee.create({
            data: { name: trimmedName },
        });

        return NextResponse.json({ payee }, { status: 201 });
    } catch (error) {
        console.error('Error creating payee:', error);
        return NextResponse.json({ error: 'Failed to create payee' }, { status: 500 });
    }
}

// DELETE - Delete a payee
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Payee ID required' }, { status: 400 });
    }

    try {
        await prisma.payee.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting payee:', error);
        return NextResponse.json({ error: 'Failed to delete payee' }, { status: 500 });
    }
}
