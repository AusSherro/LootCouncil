import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { findOwnedPayee } from '@/lib/profileOwnership';

// GET - Search payees for autocomplete
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const parsedLimit = Number.parseInt(searchParams.get('limit') || '10', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 10;

    try {
        let payees;
        
        if (query) {
            payees = await prisma.payee.findMany({
                where: {
                    profileId,
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
                where: { payee: { not: null }, account: { profileId } },
                orderBy: { date: 'desc' },
                select: { payee: true },
                take: 100,
            });

            const recentPayeeNames = [...new Set(recentTransactions.map(t => t.payee).filter(Boolean))];
            
            // Get payee records for these names
            payees = await prisma.payee.findMany({
                where: {
                    profileId,
                    name: { in: recentPayeeNames as string[] },
                },
                take: limit,
            });

            // If we have fewer than limit, add more payees alphabetically
            if (payees.length < limit) {
                const morePayees = await prisma.payee.findMany({
                    where: {
                        profileId,
                        id: { notIn: payees.map(p => p.id) },
                    },
                    orderBy: { name: 'asc' },
                    take: limit - payees.length,
                });
                payees = [...payees, ...morePayees];
            }
        }

        // Attach the most recently used categoryId for each payee
        const payeeNames = payees.map((p: { name: string }) => p.name);
        const lastCategories = payeeNames.length > 0
            ? await prisma.transaction.findMany({
                where: {
                    payee: { in: payeeNames },
                    categoryId: { not: null },
                    account: { profileId },
                },
                orderBy: { date: 'desc' },
                select: { payee: true, categoryId: true },
            })
            : [];

        const payeeCategoryMap = new Map<string, string>();
        for (const t of lastCategories) {
            if (t.payee && t.categoryId && !payeeCategoryMap.has(t.payee)) {
                payeeCategoryMap.set(t.payee, t.categoryId);
            }
        }

        const enrichedPayees = payees.map((p: { id: string; name: string }) => ({
            ...p,
            lastCategoryId: payeeCategoryMap.get(p.name) || null,
        }));

        return NextResponse.json({ payees: enrichedPayees });
    } catch (error) {
        console.error('Error fetching payees:', error);
        return NextResponse.json({ error: 'Failed to fetch payees' }, { status: 500 });
    }
}

// POST - Create a new payee
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const body = await request.json();
        const { name } = body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: 'Payee name is required' }, { status: 400 });
        }

        const trimmedName = name.trim();

        // Check this profile first, then adopt a legacy unassigned payee.
        const existing = await prisma.payee.findFirst({
            where: { name: trimmedName, profileId },
        });

        if (existing) {
            return NextResponse.json({ payee: existing });
        }

        const orphaned = await prisma.payee.findFirst({
            where: { name: trimmedName, profileId: null },
        });
        if (orphaned) {
            const updated = await prisma.payee.update({
                where: { id: orphaned.id },
                data: { profileId },
            });
            return NextResponse.json({ payee: updated });
        }

        // Create new payee with profileId
        const payee = await prisma.payee.create({
            data: { name: trimmedName, profileId },
        });

        return NextResponse.json({ payee }, { status: 201 });
    } catch (error) {
        console.error('Error creating payee:', error);
        return NextResponse.json({ error: 'Failed to create payee' }, { status: 500 });
    }
}

// DELETE - Delete a payee
export async function DELETE(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Payee ID required' }, { status: 400 });
    }

    try {
        if (!(await findOwnedPayee(profileId, id))) {
            return NextResponse.json({ error: 'Payee not found' }, { status: 404 });
        }
        await prisma.payee.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting payee:', error);
        return NextResponse.json({ error: 'Failed to delete payee' }, { status: 500 });
    }
}
