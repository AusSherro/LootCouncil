import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { monthKey, parseBody } from '@/lib/validation';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';

import { getCategoryActivityMap, getCategoryAvailableMap, getMonthRange } from '@/lib/budgetHelpers';

// POST - Copy budget from one month to another
const copyBudgetSchema = z.object({
    sourceMonth: monthKey,
    targetMonth: monthKey,
});

export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const parsed = await parseBody(request, copyBudgetSchema);
        if (!parsed.success) return parsed.response;
        const { sourceMonth, targetMonth } = parsed.data;

        // Get source month's budgets for the active profile only
        const sourceBudgets = await prisma.monthlyBudget.findMany({
            where: { month: sourceMonth, category: { group: { profileId } } },
        });

        if (sourceBudgets.length === 0) {
            return NextResponse.json({ 
                error: 'No budgets found in source month',
                copied: 0 
            }, { status: 400 });
        }

        const categoryIds = sourceBudgets.map(b => b.categoryId);
        const [existingBudgets, activityMap, currentAvailableMap] = await Promise.all([
            prisma.monthlyBudget.findMany({
                where: { month: targetMonth, categoryId: { in: categoryIds } },
                select: { categoryId: true, assigned: true },
            }),
            getCategoryActivityMap(categoryIds, getMonthRange(targetMonth)),
            getCategoryAvailableMap(categoryIds, targetMonth),
        ]);
        const existingMap = new Map(existingBudgets.map(b => [b.categoryId, b.assigned]));

        // Upsert each budget to target month with properly computed available and
        // cascade assignment deltas forward to subsequent months. Wrapped in a
        // single database transaction so a failure cannot leave partial state.
        await prisma.$transaction(async (tx) => {
            for (const budget of sourceBudgets) {
                const activity = activityMap.get(budget.categoryId) ?? 0;
                const existingAssigned = existingMap.get(budget.categoryId) ?? 0;
                const assignmentDelta = budget.assigned - existingAssigned;
                const available = (currentAvailableMap.get(budget.categoryId) ?? 0) + assignmentDelta;

                await tx.monthlyBudget.upsert({
                    where: {
                        month_categoryId: {
                            categoryId: budget.categoryId,
                            month: targetMonth,
                        },
                    },
                    update: {
                        assigned: budget.assigned,
                        activity,
                        available,
                    },
                    create: {
                        categoryId: budget.categoryId,
                        month: targetMonth,
                        assigned: budget.assigned,
                        activity,
                        available,
                    },
                });

                if (assignmentDelta !== 0) {
                    await tx.monthlyBudget.updateMany({
                        where: { categoryId: budget.categoryId, month: { gt: targetMonth } },
                        data: { available: { increment: assignmentDelta } },
                    });
                }
            }
        });
        const copied = sourceBudgets.length;

        return NextResponse.json({
            success: true,
            copied,
            message: `Copied ${copied} budget assignments from ${sourceMonth} to ${targetMonth}`,
        });
    } catch (error) {
        console.error('Copy budget error:', error);
        return NextResponse.json({ error: 'Failed to copy budget' }, { status: 500 });
    }
}
