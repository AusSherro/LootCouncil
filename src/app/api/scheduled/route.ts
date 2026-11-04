import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import {
    findOwnedAccount,
    findOwnedCategory,
    findOwnedScheduledTransaction,
} from '@/lib/profileOwnership';
import { applyCategoryActivityDelta } from '@/lib/budgetHelpers';
import { calculateNextDueDate } from '@/lib/scheduleDates';
import { z } from 'zod';
import {
    boundedText,
    idString,
    isoDate,
    moneyAmount,
    nullableId,
    parseBody,
    requiredText,
    toCents,
} from '@/lib/validation';

const frequency = z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'yearly'], {
    error: 'must be one of daily, weekly, biweekly, monthly, yearly',
});
const dayOfMonth = z.number().int().min(1).max(31);
const dayOfWeek = z.number().int().min(0).max(6);
const reminderDays = z.number().int().min(0).max(365);
const clearableDate = z.preprocess(value => (value === '' ? null : value), isoDate.nullable());

const createScheduledSchema = z.object({
    name: requiredText(100),
    amount: moneyAmount,
    payee: boundedText(200).nullish(),
    memo: boundedText(500).nullish(),
    accountId: idString,
    categoryId: nullableId.optional(),
    frequency,
    nextDueDate: isoDate,
    dayOfMonth: dayOfMonth.nullish(),
    dayOfWeek: dayOfWeek.nullish(),
    endDate: clearableDate.optional(),
    autoCreate: z.boolean().optional(),
    reminderDays: reminderDays.nullish(),
});

const updateScheduledSchema = z.object({
    id: idString,
    name: requiredText(100).optional(),
    amount: moneyAmount.optional(),
    payee: boundedText(200).nullish(),
    memo: boundedText(500).nullish(),
    accountId: idString.optional(),
    categoryId: nullableId.optional(),
    frequency: frequency.optional(),
    nextDueDate: isoDate.optional(),
    dayOfMonth: dayOfMonth.nullish(),
    dayOfWeek: dayOfWeek.nullish(),
    endDate: clearableDate.optional(),
    autoCreate: z.boolean().optional(),
    isActive: z.boolean().optional(),
    reminderDays: reminderDays.nullish(),
});

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
        const parsed = await parseBody(request, createScheduledSchema);
        if (!parsed.success) return parsed.response;
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
        } = parsed.data;

        if (!(await findOwnedAccount(profileId, accountId))) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }
        if (categoryId && !(await findOwnedCategory(profileId, categoryId))) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }

        const scheduled = await prisma.scheduledTransaction.create({
            data: {
                name,
                amount: toCents(amount),
                payee: payee || null,
                memo: memo || null,
                accountId,
                categoryId: categoryId || null,
                frequency,
                nextDueDate,
                dayOfMonth: dayOfMonth ?? null,
                dayOfWeek: dayOfWeek ?? null,
                endDate: endDate ?? null,
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
                    await applyCategoryActivityDelta(tx, category.id, monthKey, current.amount);
                    await tx.monthlyBudget.update({
                        where: { month_categoryId: { month: monthKey, categoryId: category.id } },
                        data: { activity: { increment: current.amount } },
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
        const parsed = await parseBody(request, updateScheduledSchema);
        if (!parsed.success) return parsed.response;
        const body = parsed.data;
        const { id } = body;

        if (!(await findOwnedScheduledTransaction(profileId, id))) {
            return NextResponse.json({ error: 'Scheduled transaction not found' }, { status: 404 });
        }

        const updates: Record<string, unknown> = {};
        if (body.name !== undefined) updates.name = body.name;
        if (body.payee !== undefined) updates.payee = body.payee || null;
        if (body.memo !== undefined) updates.memo = body.memo || null;
        if (body.amount !== undefined) updates.amount = toCents(body.amount);
        if (body.nextDueDate !== undefined) updates.nextDueDate = body.nextDueDate;
        if (body.endDate !== undefined) updates.endDate = body.endDate;
        if (body.frequency !== undefined) updates.frequency = body.frequency;

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
            updates.categoryId = body.categoryId;
        }

        for (const field of ['dayOfMonth', 'dayOfWeek', 'reminderDays'] as const) {
            if (body[field] !== undefined) updates[field] = body[field] ?? null;
        }
        for (const field of ['autoCreate', 'isActive'] as const) {
            if (body[field] !== undefined) updates[field] = body[field];
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
// Implementation lives in src/lib/scheduleDates.ts so the month-end and
// daylight-saving edge cases can be unit tested directly.

