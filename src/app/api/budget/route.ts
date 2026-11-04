import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHandler';
import { getProfileId } from '@/lib/profile';
import { getMonthOffset, calculateActivity, isInflowGroup, isHiddenCategoriesGroup, calculateGoalUnderFunded, getCategoryActivityMap, getCategoryAvailableMap, getMonthRange, calculateReadyToAssign } from '@/lib/budgetHelpers';
import { toLocalMonthString } from '@/lib/utils';
import { z } from 'zod';
import { idString, moneyAmount, monthKey, parseBody, toCents } from '@/lib/validation';

// GET budget for a specific month with proper envelope calculations
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || toLocalMonthString();
    const showHidden = searchParams.get('showHidden') === 'true';

    try {
        // Get all category groups with categories
        const categoryGroups = await prisma.categoryGroup.findMany({
            where: showHidden ? { profileId } : { isHidden: false, profileId },
            include: {
                categories: {
                    where: showHidden ? {} : { isHidden: false },
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        monthlyData: {
                            where: { month },
                        },
                    },
                },
            },
            orderBy: { sortOrder: 'asc' },
        });

        // Collect all category IDs for batched queries
        const allCategoryIds = categoryGroups.flatMap(g => g.categories.map(c => c.id));

        // Batch: Calculate current month activity for ALL categories in one query
        // (includes split sub-transactions — see getCategoryActivityMap)
        const { gte: currentMonthStart, lt: currentMonthEnd } = getMonthRange(month);

        const activityMap = await getCategoryActivityMap(allCategoryIds, {
            gte: currentMonthStart,
            lt: currentMonthEnd,
        });

        const availableMap = await getCategoryAvailableMap(allCategoryIds, month);

        // Batch: Calculate previous month activity for ALL categories in one query
        const previousMonth = getMonthOffset(month, -1);
        const prevActivityMap = await getCategoryActivityMap(allCategoryIds, getMonthRange(previousMonth));

        // Batch: Calculate spending trend (last 6 months) for ALL categories
        const trendMonths: string[] = [];
        for (let i = 5; i >= 0; i--) {
            trendMonths.push(getMonthOffset(month, -i));
        }
        const trendStart = new Date(`${trendMonths[0]}-01T00:00:00.000Z`);
        const [trendTransactions, trendSubTransactions] = await Promise.all([
            prisma.transaction.findMany({
                where: {
                    categoryId: { in: allCategoryIds },
                    date: { gte: trendStart, lt: currentMonthEnd },
                },
                select: { categoryId: true, amount: true, date: true },
            }),
            // Split sub-transactions carry their parent's date
            prisma.subTransaction.findMany({
                where: {
                    categoryId: { in: allCategoryIds },
                    transaction: { date: { gte: trendStart, lt: currentMonthEnd } },
                },
                select: { categoryId: true, amount: true, transaction: { select: { date: true } } },
            }),
        ]);

        // Build trend map: categoryId -> [month0abs, month1abs, ...]
        const trendMap = new Map<string, number[]>();
        for (const catId of allCategoryIds) {
            trendMap.set(catId, new Array(6).fill(0));
        }
        const trendEntries = [
            ...trendTransactions.map(t => ({ categoryId: t.categoryId, amount: t.amount, date: t.date })),
            ...trendSubTransactions.map(s => ({ categoryId: s.categoryId, amount: s.amount, date: s.transaction.date })),
        ];
        for (const t of trendEntries) {
            if (!t.categoryId) continue;
            const tMonth = t.date.toISOString().slice(0, 7);
            const monthIdx = trendMonths.indexOf(tMonth);
            if (monthIdx >= 0) {
                const arr = trendMap.get(t.categoryId);
                if (arr) arr[monthIdx] += Math.abs(t.amount);
            }
        }

        // Calculate totals
        let totalAssigned = 0;
        let totalActivity = 0;
        let totalAvailable = 0;

        // Process each group and category synchronously using batched data
        const groups = categoryGroups.map((group) => {
            const isInflow = isInflowGroup(group.name);
            const isHiddenSystemGroup = isHiddenCategoriesGroup(group.name);

            const categories = group.categories.map((cat) => {
                const budget = cat.monthlyData[0];
                const assigned = budget?.assigned || 0;

                // Use batched activity data
                const activity = activityMap.get(cat.id) || 0;

                const available = availableMap.get(cat.id) ?? 0;

                // Use batched trend data
                const spendingTrend = trendMap.get(cat.id) || [];

                // Use batched previous activity
                const previousActivity = prevActivityMap.get(cat.id) || 0;

                // Only count non-inflow, non-hidden-system categories in envelope totals
                if (!isInflow && !isHiddenSystemGroup && !group.isHidden) {
                    totalAssigned += assigned;
                    totalActivity += activity;
                    totalAvailable += available;
                }

                // Dynamically calculate goalUnderFunded from current available
                const dynamicGoalUnderFunded = calculateGoalUnderFunded(
                    cat.goalType, cat.goalTarget, cat.goalDueDate, available, month, assigned
                );

                return {
                    id: cat.id,
                    name: cat.name,
                    goalType: cat.goalType,
                    goalAmount: cat.goalTarget,
                    goalDueDate: cat.goalDueDate?.toISOString() || null,
                    goalPercentageComplete: cat.goalPercentageComplete,
                    goalUnderFunded: dynamicGoalUnderFunded,
                    goalOverallFunded: cat.goalOverallFunded,
                    goalOverallLeft: cat.goalOverallLeft,
                    assigned,
                    activity,
                    available,
                    isInflow,
                    spendingTrend,
                    previousActivity,
                };
            });

            return {
                id: group.id,
                name: group.name,
                isInflow,
                isHidden: group.isHidden || isHiddenSystemGroup,
                categories,
            };
        });

        const accounts = await prisma.account.findMany({
            where: { onBudget: true, closed: false, profileId },
        });
        const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
        const readyToAssign = await calculateReadyToAssign(profileId, month);

        return NextResponse.json({
            month,
            groups,
            totals: {
                readyToAssign,
                assigned: totalAssigned,
                activity: totalActivity,
                available: totalAvailable,
                accountBalance: totalBalance,
            },
        });
    } catch (error) {
        console.error('Error fetching budget:', error);
        return NextResponse.json({ error: 'Failed to fetch budget' }, { status: 500 });
    }
}

const assignBudgetSchema = z.object({
    categoryId: idString,
    month: monthKey,
    amount: moneyAmount,
});

// POST - Assign money to a category
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const parsed = await parseBody(request, assignBudgetSchema);
        if (!parsed.success) return parsed.response;
        const { categoryId, month, amount } = parsed.data;

        // SEC-5: Verify the category belongs to the active profile.
        // 404 (not 403) to avoid leaking the existence of cross-profile IDs.
        const ownedCategory = await prisma.category.findFirst({
            where: { id: categoryId, group: { profileId } },
            select: { id: true },
        });
        if (!ownedCategory) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }

        const amountCents = toCents(amount);
        const activity = await calculateActivity(categoryId, month);
        const [existingBudget, currentAvailableMap] = await Promise.all([
            prisma.monthlyBudget.findUnique({
                where: { month_categoryId: { month, categoryId } },
                select: { assigned: true },
            }),
            getCategoryAvailableMap([categoryId], month),
        ]);
        const assignmentDelta = amountCents - (existingBudget?.assigned ?? 0);
        const available = (currentAvailableMap.get(categoryId) ?? 0) + assignmentDelta;

        // A stored future month uses the preceding snapshot as its rollover anchor.
        // Carry this edit forward so a stale intermediate row cannot resurrect the
        // old assignment several months later.
        const budget = await prisma.$transaction(async (tx) => {
            const updatedBudget = await tx.monthlyBudget.upsert({
                where: {
                    month_categoryId: { month, categoryId },
                },
                create: {
                    month,
                    categoryId,
                    assigned: amountCents,
                    activity,
                    available,
                },
                update: {
                    assigned: amountCents,
                    activity,
                    available,
                },
            });

            if (assignmentDelta !== 0) {
                await tx.monthlyBudget.updateMany({
                    where: { categoryId, month: { gt: month } },
                    data: { available: { increment: assignmentDelta } },
                });
            }

            return updatedBudget;
        });

        // RTA is now always calculated from account balances - envelope totals
        // No need to update settings.toBeBudgeted; the change in available
        // naturally reduces RTA on next fetch

        return NextResponse.json({
            ...budget,
            activity,
            available,
        });
    } catch (error) {
        console.error('Error assigning budget:', error);
        return NextResponse.json({ error: 'Failed to assign budget' }, { status: 500 });
    }
}

// PUT - Recalculate all budget data from transactions (useful after import)
// PERF-5 fix: Uses pre-filter + createMany instead of sequential upserts
export const PUT = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);

    // Get all categories for the active profile
    const categories = await prisma.category.findMany({
        where: { group: { profileId } },
        select: { id: true },
    });

    // Get all unique months from transactions
    const transactions = await prisma.transaction.findMany({
        where: { categoryId: { not: null }, account: { profileId } },
        select: { date: true },
    });

    const months = new Set<string>();
    transactions.forEach((t) => {
        const m = t.date.toISOString().slice(0, 7);
        months.add(m);
    });

    // Build all records upfront instead of sequential upserts
    const records = categories.flatMap((cat) =>
        Array.from(months).map((m) => ({
            month: m,
            categoryId: cat.id,
            assigned: 0,
            activity: 0,
            available: 0,
        }))
    );

    // Find which category×month combos already exist to avoid duplicates
    const existingRecords = await prisma.monthlyBudget.findMany({
        where: {
            categoryId: { in: categories.map(c => c.id) },
            month: { in: Array.from(months) },
        },
        select: { month: true, categoryId: true },
    });
    const existingKeys = new Set(existingRecords.map(r => `${r.month}|${r.categoryId}`));

    // Filter to only new records
    const newRecords = records.filter(r => !existingKeys.has(`${r.month}|${r.categoryId}`));

    let created = 0;
    if (newRecords.length > 0) {
        const result = await prisma.monthlyBudget.createMany({
            data: newRecords,
        });
        created = result.count;
    }

    const totalProcessed = categories.length * months.size;
    return NextResponse.json({
        success: true,
        message: `Processed ${categories.length} categories across ${months.size} months`,
        records: totalProcessed,
        created,
    });
}, 'Recalculate budget');
