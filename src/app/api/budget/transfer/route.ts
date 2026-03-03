import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';

function getMonthOffset(monthStr: string, offset: number): string {
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1 + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function calculateActivity(categoryId: string, month: string): Promise<number> {
    const startDate = new Date(`${month}-01T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const result = await prisma.transaction.aggregate({
        where: {
            categoryId,
            date: { gte: startDate, lt: endDate },
        },
        _sum: { amount: true },
    });
    return result._sum.amount || 0;
}

async function getPreviousMonthAvailable(categoryId: string, month: string): Promise<number> {
    const prevMonth = getMonthOffset(month, -1);
    const prevBudget = await prisma.monthlyBudget.findUnique({
        where: { month_categoryId: { month: prevMonth, categoryId } },
    });
    return prevBudget?.available ?? 0;
}

// POST - Transfer funds between budget categories (or to/from Ready to Assign)
export async function POST(request: NextRequest) {
    const profileId = await getProfileId(request);
    try {
        const body = await request.json();
        const { fromCategoryId, toCategoryId, amount, month } = body;

        if (!amount || !month) {
            return NextResponse.json(
                { error: 'Missing required fields: amount, month' },
                { status: 400 }
            );
        }

        if (!fromCategoryId && !toCategoryId) {
            return NextResponse.json(
                { error: 'At least one of fromCategoryId or toCategoryId must be specified' },
                { status: 400 }
            );
        }

        if (fromCategoryId && toCategoryId && fromCategoryId === toCategoryId) {
            return NextResponse.json(
                { error: 'Cannot transfer to the same category' },
                { status: 400 }
            );
        }

        const amountCents = Math.round(amount * 100);
        if (amountCents <= 0) {
            return NextResponse.json(
                { error: 'Transfer amount must be positive' },
                { status: 400 }
            );
        }

        // Case 1: Category → Ready to Assign (reduce category assignment)
        if (fromCategoryId && !toCategoryId) {
            const category = await prisma.category.findUnique({ where: { id: fromCategoryId } });
            if (!category) {
                return NextResponse.json({ error: 'Category not found' }, { status: 404 });
            }

            const budget = await prisma.monthlyBudget.findUnique({
                where: { month_categoryId: { month, categoryId: fromCategoryId } },
            });

            const oldAssigned = budget?.assigned ?? 0;
            const newAssigned = oldAssigned - amountCents;
            const activity = await calculateActivity(fromCategoryId, month);
            const rollover = await getPreviousMonthAvailable(fromCategoryId, month);
            const available = rollover + newAssigned + activity;

            await prisma.monthlyBudget.upsert({
                where: { month_categoryId: { month, categoryId: fromCategoryId } },
                create: { month, categoryId: fromCategoryId, assigned: newAssigned, activity, available },
                update: { assigned: newAssigned, activity, available },
            });

            // Update Ready to Assign: unassigning money adds it back to RTA
            const settings = await prisma.settings.findFirst({ where: { profileId } });
            if (settings?.toBeBudgeted !== undefined) {
                await prisma.settings.update({
                    where: { id: settings.id },
                    data: { toBeBudgeted: settings.toBeBudgeted + amountCents },
                });
            }

            return NextResponse.json({
                success: true,
                from: { categoryId: fromCategoryId, assigned: newAssigned, available },
                to: { readyToAssign: true },
                transferred: amountCents,
            });
        }

        // Case 2: Ready to Assign → Category (increase category assignment)
        if (!fromCategoryId && toCategoryId) {
            const category = await prisma.category.findUnique({ where: { id: toCategoryId } });
            if (!category) {
                return NextResponse.json({ error: 'Category not found' }, { status: 404 });
            }

            const budget = await prisma.monthlyBudget.findUnique({
                where: { month_categoryId: { month, categoryId: toCategoryId } },
            });

            const oldAssigned = budget?.assigned ?? 0;
            const newAssigned = oldAssigned + amountCents;
            const activity = await calculateActivity(toCategoryId, month);
            const rollover = await getPreviousMonthAvailable(toCategoryId, month);
            const available = rollover + newAssigned + activity;

            await prisma.monthlyBudget.upsert({
                where: { month_categoryId: { month, categoryId: toCategoryId } },
                create: { month, categoryId: toCategoryId, assigned: newAssigned, activity, available },
                update: { assigned: newAssigned, activity, available },
            });

            // Update Ready to Assign: assigning money reduces RTA
            const settings = await prisma.settings.findFirst({ where: { profileId } });
            if (settings?.toBeBudgeted !== undefined) {
                await prisma.settings.update({
                    where: { id: settings.id },
                    data: { toBeBudgeted: settings.toBeBudgeted - amountCents },
                });
            }

            return NextResponse.json({
                success: true,
                from: { readyToAssign: true },
                to: { categoryId: toCategoryId, assigned: newAssigned, available },
                transferred: amountCents,
            });
        }

        // Case 3: Category → Category (original behavior)
        // Verify both categories exist
        const [fromCategory, toCategory] = await Promise.all([
            prisma.category.findUnique({ where: { id: fromCategoryId } }),
            prisma.category.findUnique({ where: { id: toCategoryId } }),
        ]);

        if (!fromCategory || !toCategory) {
            return NextResponse.json(
                { error: 'One or both categories not found' },
                { status: 404 }
            );
        }

        // Get current assignments
        const [fromBudget, toBudget] = await Promise.all([
            prisma.monthlyBudget.findUnique({
                where: { month_categoryId: { month, categoryId: fromCategoryId } },
            }),
            prisma.monthlyBudget.findUnique({
                where: { month_categoryId: { month, categoryId: toCategoryId } },
            }),
        ]);

        const fromAssigned = fromBudget?.assigned ?? 0;
        const toAssigned = toBudget?.assigned ?? 0;

        const newFromAssigned = fromAssigned - amountCents;
        const newToAssigned = toAssigned + amountCents;

        // Calculate activity and rollover for both categories
        const [fromActivity, toActivity, fromRollover, toRollover] = await Promise.all([
            calculateActivity(fromCategoryId, month),
            calculateActivity(toCategoryId, month),
            getPreviousMonthAvailable(fromCategoryId, month),
            getPreviousMonthAvailable(toCategoryId, month),
        ]);

        const fromAvailable = fromRollover + newFromAssigned + fromActivity;
        const toAvailable = toRollover + newToAssigned + toActivity;

        // Atomically update both categories in a transaction
        await prisma.$transaction([
            prisma.monthlyBudget.upsert({
                where: { month_categoryId: { month, categoryId: fromCategoryId } },
                create: {
                    month,
                    categoryId: fromCategoryId,
                    assigned: newFromAssigned,
                    activity: fromActivity,
                    available: fromAvailable,
                },
                update: {
                    assigned: newFromAssigned,
                    activity: fromActivity,
                    available: fromAvailable,
                },
            }),
            prisma.monthlyBudget.upsert({
                where: { month_categoryId: { month, categoryId: toCategoryId } },
                create: {
                    month,
                    categoryId: toCategoryId,
                    assigned: newToAssigned,
                    activity: toActivity,
                    available: toAvailable,
                },
                update: {
                    assigned: newToAssigned,
                    activity: toActivity,
                    available: toAvailable,
                },
            }),
        ]);

        return NextResponse.json({
            success: true,
            from: { categoryId: fromCategoryId, assigned: newFromAssigned, available: fromAvailable },
            to: { categoryId: toCategoryId, assigned: newToAssigned, available: toAvailable },
            transferred: amountCents,
        });
    } catch (error) {
        console.error('Error transferring budget funds:', error);
        return NextResponse.json({ error: 'Failed to transfer funds' }, { status: 500 });
    }
}
