import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import {
    findOwnedAccount,
    findOwnedCategory,
    findOwnedScheduledTransaction,
} from '@/lib/profileOwnership';

const VALID_FREQUENCIES = new Set(['daily', 'weekly', 'biweekly', 'monthly', 'yearly']);

function isValidDate(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && !Number.isNaN(new Date(value).getTime());
}

// GET - List all scheduled transactions + upcoming bills
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const upcomingDays = parseInt(searchParams.get('upcomingDays') || '30');

    try {
        const scheduled = await prisma.scheduledTransaction.findMany({
            where: { isActive: true, profileId },
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
        const profileId = await getProfileId(request);
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

        if (typeof name !== 'string' || name.trim().length > 100) {
            return NextResponse.json({ error: 'Name must be between 1 and 100 characters' }, { status: 400 });
        }
        if (typeof amount !== 'number' || !Number.isFinite(amount) || Math.abs(amount) > 999999999) {
            return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
        }
        if (!VALID_FREQUENCIES.has(frequency)) {
            return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
        }
        if (!isValidDate(nextDueDate) || (endDate && !isValidDate(endDate))) {
            return NextResponse.json({ error: 'Invalid scheduled date' }, { status: 400 });
        }
        if (!(await findOwnedAccount(profileId, accountId))) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }
        if (categoryId && !(await findOwnedCategory(profileId, categoryId))) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }

        const scheduled = await prisma.scheduledTransaction.create({
            data: {
                name: name.trim(),
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
                profileId,
            },
        });

        return NextResponse.json({ scheduled });
    } catch (error) {
        console.error('Error creating scheduled transaction:', error);
        return NextResponse.json({ error: 'Failed to create scheduled transaction' }, { status: 500 });
    }
}

// PUT - Process due scheduled transactions (create actual transactions)
export async function PUT(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const now = new Date();
        
        // Find all scheduled transactions that are due and have autoCreate enabled
        const due = await prisma.scheduledTransaction.findMany({
            where: {
                isActive: true,
                autoCreate: true,
                nextDueDate: { lte: now },
                profileId,
            },
        });

        let created = 0;

        for (const scheduled of due) {
            const processed = await prisma.$transaction(async tx => {
                // Recheck inside the write transaction so concurrent requests cannot create twice.
                const current = await tx.scheduledTransaction.findFirst({
                    where: {
                        id: scheduled.id,
                        profileId,
                        isActive: true,
                        autoCreate: true,
                        nextDueDate: { equals: scheduled.nextDueDate, lte: now },
                    },
                });
                if (!current) return false;

                const account = await tx.account.findFirst({
                    where: { id: current.accountId, profileId },
                });
                if (!account) return false;

                const category = current.categoryId
                    ? await tx.category.findFirst({
                        where: { id: current.categoryId, group: { profileId } },
                    })
                    : null;

                await tx.transaction.create({
                    data: {
                        date: current.nextDueDate,
                        amount: current.amount,
                        payee: current.payee || current.name,
                        memo: current.memo || `Scheduled: ${current.name}`,
                        accountId: current.accountId,
                        categoryId: category?.id ?? null,
                        cleared: false,
                        approved: true,
                    },
                });

                await tx.account.update({
                    where: { id: current.accountId },
                    data: { balance: { increment: current.amount } },
                });

                if (category) {
                    const monthKey = current.nextDueDate.toISOString().slice(0, 7);
                    await tx.monthlyBudget.upsert({
                        where: { month_categoryId: { month: monthKey, categoryId: category.id } },
                        create: {
                            month: monthKey,
                            categoryId: category.id,
                            activity: current.amount,
                        },
                        update: {
                            activity: { increment: current.amount },
                        },
                    });
                }

                const nextDate = calculateNextDueDate(current);
                await tx.scheduledTransaction.update({
                    where: { id: current.id },
                    data: {
                        lastCreated: now,
                        nextDueDate: nextDate,
                        isActive: current.endDate ? nextDate <= current.endDate : true,
                    },
                });

                return true;
            });

            if (processed) created++;
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
        const profileId = await getProfileId(request);
        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing scheduled transaction ID' }, { status: 400 });
        }
        if (!(await findOwnedScheduledTransaction(profileId, id))) {
            return NextResponse.json({ error: 'Scheduled transaction not found' }, { status: 404 });
        }

        const updates: Record<string, unknown> = {};
        const stringFields = ['name', 'payee', 'memo'] as const;
        for (const field of stringFields) {
            if (body[field] !== undefined) updates[field] = body[field] || null;
        }

        if (body.name !== undefined) {
            if (typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.trim().length > 100) {
                return NextResponse.json({ error: 'Name must be between 1 and 100 characters' }, { status: 400 });
            }
            updates.name = body.name.trim();
        }

        // Convert amount to cents if provided
        if (body.amount !== undefined) {
            if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || Math.abs(body.amount) > 999999999) {
                return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
            }
            updates.amount = Math.round(body.amount * 100);
        }

        if (body.nextDueDate !== undefined) {
            if (!isValidDate(body.nextDueDate)) {
                return NextResponse.json({ error: 'Invalid next due date' }, { status: 400 });
            }
            updates.nextDueDate = new Date(body.nextDueDate);
        }
        if (body.endDate !== undefined) {
            if (body.endDate && !isValidDate(body.endDate)) {
                return NextResponse.json({ error: 'Invalid end date' }, { status: 400 });
            }
            updates.endDate = body.endDate ? new Date(body.endDate) : null;
        }

        if (body.frequency !== undefined) {
            if (!VALID_FREQUENCIES.has(body.frequency)) {
                return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
            }
            updates.frequency = body.frequency;
        }

        if (body.accountId !== undefined) {
            if (!(await findOwnedAccount(profileId, body.accountId))) {
                return NextResponse.json({ error: 'Account not found' }, { status: 404 });
            }
            updates.accountId = body.accountId;
        }

        if (body.categoryId !== undefined) {
            if (body.categoryId && !(await findOwnedCategory(profileId, body.categoryId))) {
                return NextResponse.json({ error: 'Category not found' }, { status: 404 });
            }
            updates.categoryId = body.categoryId || null;
        }

        for (const field of ['dayOfMonth', 'dayOfWeek', 'reminderDays'] as const) {
            if (body[field] !== undefined) updates[field] = body[field] ?? null;
        }
        for (const field of ['autoCreate', 'isActive'] as const) {
            if (body[field] !== undefined) updates[field] = Boolean(body[field]);
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
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    try {
        if (!(await findOwnedScheduledTransaction(profileId, id))) {
            return NextResponse.json({ error: 'Scheduled transaction not found' }, { status: 404 });
        }
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
