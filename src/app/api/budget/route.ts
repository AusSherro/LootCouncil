import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHandler';
import { getProfileId } from '@/lib/profile';
import { getMonthOffset, calculateActivity, calculateReadyToAssign, isInflowGroup, isHiddenCategoriesGroup } from '@/lib/budgetHelpers';

// GET budget for a specific month with proper envelope calculations
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
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

        // Batch: Fetch most-recent-prior-month MonthlyBudget for fallback available values (CRIT-1 Tier 2)
        const priorMonthlyBudgets = await prisma.monthlyBudget.findMany({
            where: {
                categoryId: { in: allCategoryIds },
                month: { lt: month },
            },
            distinct: ['categoryId'],
            orderBy: { month: 'desc' },
            select: { categoryId: true, available: true, month: true },
        });
        // Build fallback map: keep only the most recent record per categoryId
        const fallbackAvailableMap = new Map<string, number>();
        for (const mb of priorMonthlyBudgets) {
            if (!fallbackAvailableMap.has(mb.categoryId)) {
                fallbackAvailableMap.set(mb.categoryId, mb.available);
            }
        }

        // Batch: Calculate current month activity for ALL categories in one query
        const currentMonthStart = new Date(`${month}-01T00:00:00.000Z`);
        const currentMonthEnd = new Date(currentMonthStart);
        currentMonthEnd.setMonth(currentMonthEnd.getMonth() + 1);

        const activityAgg = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: {
                categoryId: { in: allCategoryIds },
                date: { gte: currentMonthStart, lt: currentMonthEnd },
            },
            _sum: { amount: true },
        });
        const activityMap = new Map(activityAgg.map(a => [a.categoryId!, a._sum.amount || 0]));

        // Batch: Calculate previous month activity for ALL categories in one query
        const previousMonth = getMonthOffset(month, -1);
        const prevMonthStart = new Date(`${previousMonth}-01T00:00:00.000Z`);
        const prevMonthEnd = new Date(prevMonthStart);
        prevMonthEnd.setMonth(prevMonthEnd.getMonth() + 1);

        const prevActivityAgg = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: {
                categoryId: { in: allCategoryIds },
                date: { gte: prevMonthStart, lt: prevMonthEnd },
            },
            _sum: { amount: true },
        });
        const prevActivityMap = new Map(prevActivityAgg.map(a => [a.categoryId!, a._sum.amount || 0]));

        // Batch: Calculate spending trend (last 6 months) for ALL categories
        const trendMonths: string[] = [];
        for (let i = 5; i >= 0; i--) {
            trendMonths.push(getMonthOffset(month, -i));
        }
        const trendStart = new Date(`${trendMonths[0]}-01T00:00:00.000Z`);
        const trendTransactions = await prisma.transaction.findMany({
            where: {
                categoryId: { in: allCategoryIds },
                date: { gte: trendStart, lt: currentMonthEnd },
            },
            select: { categoryId: true, amount: true, date: true },
        });

        // Build trend map: categoryId -> [month0abs, month1abs, ...]
        const trendMap = new Map<string, number[]>();
        for (const catId of allCategoryIds) {
            trendMap.set(catId, new Array(6).fill(0));
        }
        for (const t of trendTransactions) {
            if (!t.categoryId) continue;
            const tMonth = t.date.toISOString().slice(0, 7);
            const monthIdx = trendMonths.indexOf(tMonth);
            if (monthIdx >= 0) {
                const arr = trendMap.get(t.categoryId)!;
                arr[monthIdx] += Math.abs(t.amount);
            }
        }

        // Calculate totals
        let totalAssigned = 0;
        let totalActivity = 0;
        let totalAvailable = 0;
        let totalInflow = 0;

        // Track categories needing Tier 3 (full history) calculation
        const tier3CategoryIds: string[] = [];

        // Pass 1: Process each group and category synchronously using batched data
        const groups = categoryGroups.map((group) => {
            const isInflow = isInflowGroup(group.name);
            const isHiddenSystemGroup = isHiddenCategoriesGroup(group.name);

            const categories = group.categories.map((cat) => {
                const budget = cat.monthlyData[0];
                const assigned = budget?.assigned || 0;

                // Use batched activity data
                const activity = activityMap.get(cat.id) || 0;

                // Batched available calculation (CRIT-1 fix — no per-category DB queries)
                // Always compute dynamically: rollover + assigned + activity
                // (stored budget.available is stale if transactions changed since last assign)
                let available: number;
                if (budget || fallbackAvailableMap.has(cat.id)) {
                    // Tier 1/2: rollover from prior month + this month's assigned + activity
                    const rollover = fallbackAvailableMap.get(cat.id) ?? 0;
                    available = rollover + assigned + activity;
                } else {
                    // Tier 3: No MonthlyBudget history — mark for batch calculation
                    tier3CategoryIds.push(cat.id);
                    available = 0; // Placeholder — filled in Pass 2
                }

                // Use batched trend data
                const spendingTrend = trendMap.get(cat.id) || [];

                // Use batched previous activity
                const previousActivity = prevActivityMap.get(cat.id) || 0;

                // Only count non-inflow, non-hidden-system categories in envelope totals
                if (!isInflow && !isHiddenSystemGroup && !group.isHidden) {
                    totalAssigned += assigned;
                    totalActivity += activity;
                    totalAvailable += available;
                } else if (isInflow) {
                    // Track inflow (positive activity in inflow categories = income)
                    totalInflow += available;
                }

                return {
                    id: cat.id,
                    name: cat.name,
                    goalType: cat.goalType,
                    goalAmount: cat.goalTarget,
                    goalDueDate: cat.goalDueDate?.toISOString() || null,
                    goalPercentageComplete: cat.goalPercentageComplete,
                    goalUnderFunded: cat.goalUnderFunded,
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

        // Pass 2: Tier 3 batch calculation for categories with zero MonthlyBudget history
        if (tier3CategoryIds.length > 0) {
            const tier3EndDate = new Date(`${month}-01T00:00:00.000Z`);
            tier3EndDate.setMonth(tier3EndDate.getMonth() + 1);

            // Tier 3 categories have zero MonthlyBudget rows (both Tier 1 and 2 missed),
            // so available = sum of all transaction activity only (no assigned budgets exist)
            const tier3Transactions = await prisma.transaction.groupBy({
                by: ['categoryId'],
                where: { categoryId: { in: tier3CategoryIds }, date: { lt: tier3EndDate } },
                _sum: { amount: true },
            });

            const tier3Map = new Map<string, number>();
            for (const t of tier3Transactions) {
                tier3Map.set(t.categoryId!, t._sum.amount || 0);
            }

            // Patch Tier 3 values into groups and adjust totals
            for (const group of groups) {
                for (const cat of group.categories) {
                    if (tier3Map.has(cat.id)) {
                        const realAvailable = tier3Map.get(cat.id)!;
                        cat.available = realAvailable;
                        // Adjust totals (placeholder was 0, so just add the real value)
                        if (!cat.isInflow && !group.isHidden) {
                            totalAvailable += realAvailable;
                        } else if (cat.isInflow) {
                            totalInflow += realAvailable;
                        }
                    }
                }
            }
        }

        // Always calculate RTA from account balances - envelope totals (YNAB-style)
        // This ensures uncategorized transactions and reconciliation adjustments
        // naturally reduce RTA, and RTA can go negative when overspent
        const accounts = await prisma.account.findMany({
            where: { onBudget: true, closed: false, profileId },
        });
        const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
        const readyToAssign = totalBalance - totalAvailable;

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

// Calculate previous month's available balance (rollover)
async function getPreviousMonthAvailable(categoryId: string, month: string): Promise<number> {
    const prevMonth = getMonthOffset(month, -1);
    const prevBudget = await prisma.monthlyBudget.findUnique({
        where: { month_categoryId: { month: prevMonth, categoryId } },
    });
    return prevBudget?.available ?? 0;
}

// POST - Assign money to a category
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const body = await request.json();
        const { categoryId, month, amount } = body;

        if (!categoryId || !month || amount === undefined) {
            return NextResponse.json(
                { error: 'Missing required fields: categoryId, month, amount' },
                { status: 400 }
            );
        }

        const amountCents = Math.round(amount * 100);

        // Fetch old assigned value BEFORE upserting to correctly calculate difference
        const oldBudget = await prisma.monthlyBudget.findUnique({
            where: { month_categoryId: { month, categoryId } },
        });
        const oldAssigned = oldBudget?.assigned ?? 0;

        // Calculate what the available should be:
        // Rollover from previous month + assigned this month + activity this month
        const rollover = await getPreviousMonthAvailable(categoryId, month);
        const activity = await calculateActivity(categoryId, month);
        const available = rollover + amountCents + activity;

        // Upsert the monthly budget with calculated available
        const budget = await prisma.monthlyBudget.upsert({
            where: {
                month_categoryId: { month, categoryId },
            },
            create: {
                month,
                categoryId,
                assigned: amountCents,
                activity: activity,
                available: available,
            },
            update: {
                assigned: amountCents,
                activity: activity,
                available: available,
            },
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
export const PUT = withErrorHandler(async () => {
    // Get all categories
    const categories = await prisma.category.findMany({
        select: { id: true },
    });

    // Get all unique months from transactions
    const transactions = await prisma.transaction.findMany({
        where: { categoryId: { not: null } },
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
