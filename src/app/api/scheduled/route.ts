import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - List all scheduled transactions + upcoming bills
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const upcomingDays = parseInt(searchParams.get('upcomingDays') || '30');

    try {
        const scheduled = await prisma.scheduledTransaction.findMany({
            where: { isActive: true },
            orderBy: { nextDueDate: 'asc' },
        });

        // Get upcoming bills (within the next N days)
        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() + upcomingDays);

        const upcoming = scheduled
            .filter(s => s.nextDueDate <= cutoff)
            .map(s => ({
                ...s,
                daysUntilDue: Math.ceil((s.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
                isOverdue: s.nextDueDate < now,
            }));

        // Fetch account and category names for display
        const accountIds = [...new Set(scheduled.map(s => s.accountId))];
        const categoryIds = [...new Set(scheduled.filter(s => s.categoryId).map(s => s.categoryId!))];

        const [accounts, categories] = await Promise.all([
            prisma.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true } }),
            prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } }),
        ]);

        const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.name]));
        const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

        const enriched = scheduled.map(s => ({
            ...s,
            accountName: accountMap[s.accountId] || 'Unknown',
            categoryName: s.categoryId ? categoryMap[s.categoryId] : null,
        }));

        return NextResponse.json({ 
            scheduled: enriched, 
            upcoming: upcoming.map(u => ({
                ...u,
                accountName: accountMap[u.accountId] || 'Unknown',
                categoryName: u.categoryId ? categoryMap[u.categoryId] : null,
            })),
        });
    } catch (error) {
        console.error('Error fetching scheduled transactions:', error);
        return NextResponse.json({ error: 'Failed to fetch scheduled transactions' }, { status: 500 });
    }
}

// POST - Create a new scheduled transaction
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            name,
            amount,
            payee,
            memo,
            accountId,
            categoryId,
            frequency,
            nextDueDate,
            dayOfMonth,
            dayOfWeek,
            endDate,
            autoCreate,
            reminderDays,
        } = body;

        if (!name || amount === undefined || !accountId || !frequency || !nextDueDate) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const scheduled = await prisma.scheduledTransaction.create({
            data: {
                name,
                amount: Math.round(amount * 100), // Convert to cents
                payee: payee || null,
                memo: memo || null,
                accountId,
                categoryId: categoryId || null,
                frequency,
                nextDueDate: new Date(nextDueDate),
                dayOfMonth: dayOfMonth || null,
                dayOfWeek: dayOfWeek !== undefined ? dayOfWeek : null,
                endDate: endDate ? new Date(endDate) : null,
                autoCreate: autoCreate || false,
                reminderDays: reminderDays ?? 3,
            },
        });

        return NextResponse.json({ scheduled });
    } catch (error) {
        console.error('Error creating scheduled transaction:', error);
        return NextResponse.json({ error: 'Failed to create scheduled transaction' }, { status: 500 });
    }
}

// PUT - Process due scheduled transactions (create actual transactions)
export async function PUT() {
    try {
        const now = new Date();
        
        // Find all scheduled transactions that are due and have autoCreate enabled
        const due = await prisma.scheduledTransaction.findMany({
            where: {
                isActive: true,
                autoCreate: true,
                nextDueDate: { lte: now },
            },
        });

        let created = 0;

        for (const scheduled of due) {
            // Create the actual transaction
            await prisma.transaction.create({
                data: {
                    date: scheduled.nextDueDate,
                    amount: scheduled.amount,
                    payee: scheduled.payee || scheduled.name,
                    memo: scheduled.memo || `Scheduled: ${scheduled.name}`,
                    accountId: scheduled.accountId,
                    categoryId: scheduled.categoryId,
                    cleared: false,
                    approved: true,
                },
            });

            // Update account balance
            await prisma.account.update({
                where: { id: scheduled.accountId },
                data: { balance: { increment: scheduled.amount } },
            });

            // Update category monthly budget if applicable
            if (scheduled.categoryId) {
                const monthKey = `${scheduled.nextDueDate.getFullYear()}-${String(scheduled.nextDueDate.getMonth() + 1).padStart(2, '0')}`;
                await prisma.monthlyBudget.upsert({
                    where: { month_categoryId: { month: monthKey, categoryId: scheduled.categoryId } },
                    create: {
                        month: monthKey,
                        categoryId: scheduled.categoryId,
                        activity: scheduled.amount,
                    },
                    update: {
                        activity: { increment: scheduled.amount },
                    },
                });
            }

            // Calculate next due date
            const nextDate = calculateNextDueDate(scheduled);

            // Update the scheduled transaction
            await prisma.scheduledTransaction.update({
                where: { id: scheduled.id },
                data: {
                    lastCreated: now,
                    nextDueDate: nextDate,
                    // Deactivate if past end date
                    isActive: scheduled.endDate ? nextDate <= scheduled.endDate : true,
                },
            });

            created++;
        }

        return NextResponse.json({ processed: created });
    } catch (error) {
        console.error('Error processing scheduled transactions:', error);
        return NextResponse.json({ error: 'Failed to process scheduled transactions' }, { status: 500 });
    }
}

// PATCH - Update a scheduled transaction
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing scheduled transaction ID' }, { status: 400 });
        }

        // Convert amount to cents if provided
        if (updates.amount !== undefined) {
            updates.amount = Math.round(updates.amount * 100);
        }

        // Convert dates if provided
        if (updates.nextDueDate) {
            updates.nextDueDate = new Date(updates.nextDueDate);
        }
        if (updates.endDate) {
            updates.endDate = new Date(updates.endDate);
        }

        const scheduled = await prisma.scheduledTransaction.update({
            where: { id },
            data: updates,
        });

        return NextResponse.json({ scheduled });
    } catch (error) {
        console.error('Error updating scheduled transaction:', error);
        return NextResponse.json({ error: 'Failed to update scheduled transaction' }, { status: 500 });
    }
}

// DELETE - Remove a scheduled transaction
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    try {
        await prisma.scheduledTransaction.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting scheduled transaction:', error);
        return NextResponse.json({ error: 'Failed to delete scheduled transaction' }, { status: 500 });
    }
}

// Helper: Calculate the next due date based on frequency
function calculateNextDueDate(scheduled: {
    frequency: string;
    nextDueDate: Date;
    dayOfMonth?: number | null;
    dayOfWeek?: number | null;
}): Date {
    const current = new Date(scheduled.nextDueDate);
    const next = new Date(current);

    switch (scheduled.frequency) {
        case 'daily':
            next.setDate(next.getDate() + 1);
            break;
        case 'weekly':
            next.setDate(next.getDate() + 7);
            break;
        case 'biweekly':
            next.setDate(next.getDate() + 14);
            break;
        case 'monthly':
            next.setMonth(next.getMonth() + 1);
            // Handle day of month
            if (scheduled.dayOfMonth) {
                const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                next.setDate(Math.min(scheduled.dayOfMonth, lastDay));
            }
            break;
        case 'yearly':
            next.setFullYear(next.getFullYear() + 1);
            break;
        default:
            next.setMonth(next.getMonth() + 1); // Default to monthly
    }

    return next;
}
