import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Helper: Get the month string for a given offset from a base month
function getMonthOffset(monthStr: string, offset: number): string {
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1 + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Calculate activity from transactions for a category in a given month
async function calculateActivity(categoryId: string, month: string): Promise<number> {
    const startDate = new Date(`${month}-01T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const result = await prisma.transaction.aggregate({
        where: {
            categoryId,
            date: {
                gte: startDate,
                lt: endDate,
            },
        },
        _sum: { amount: true },
    });

    return result._sum.amount || 0;
}

/** @deprecated No longer called by GET handler. GET uses batched in-memory calculation.
 * Kept for reference — POST handler uses getPreviousMonthAvailable() instead. */
async function calculateAvailable(categoryId: string, upToMonth: string): Promise<number> {
    // First check if we have YNAB-imported available value for this month
    const monthlyBudget = await prisma.monthlyBudget.findUnique({
        where: {
            month_categoryId: { month: upToMonth, categoryId },
        },
    });
    
    // If we have a stored record from YNAB import, use its available value (even if 0)
    if (monthlyBudget) {
        return monthlyBudget.available;
    }

    // If no record for this month, check for most recent month's data
    const mostRecent = await prisma.monthlyBudget.findFirst({
        where: {
            categoryId,
            month: { lte: upToMonth },
        },
        orderBy: { month: 'desc' },
    });

    if (mostRecent) {
        return mostRecent.available;
    }

    // No YNAB data exists - calculate from scratch (for manually created categories)
    const budgets = await prisma.monthlyBudget.findMany({
        where: {
            categoryId,
            month: { lte: upToMonth },
        },
        orderBy: { month: 'asc' },
    });

    // Get all transactions for this category up to end of the month
    const endDate = new Date(`${upToMonth}-01T00:00:00.000Z`);
    endDate.setMonth(endDate.getMonth() + 1);

    const transactions = await prisma.transaction.findMany({
        where: {
            categoryId,
            date: { lt: endDate },
        },
        select: { amount: true },
    });

    // Total activity (all transactions for this category ever, up to this month)
    const totalActivity = transactions.reduce((sum, t) => sum + t.amount, 0);

    // Total assigned (all budgets for this category ever, up to this month)
    const totalAssigned = budgets.reduce((sum, b) => sum + b.assigned, 0);

    // Available = Total Assigned + Total Activity (activity is typically negative for spending)
    return totalAssigned + totalActivity;
}

// Check if a category group is an "Inflow" type (should be excluded from envelope calculations)
function isInflowGroup(groupName: string): boolean {
    const lowerName = groupName.toLowerCase();
    return lowerName === 'inflow' || lowerName.includes('ready to assign');
}

// Check if a category group is the YNAB "Hidden Categories" system group
function isHiddenCategoriesGroup(groupName: string): boolean {
    const lowerName = groupName.toLowerCase();
    return lowerName === 'hidden categories';
}

// GET budget for a specific month with proper envelope calculations
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const showHidden = searchParams.get('showHidden') === 'true';

    try {
        // Get all category groups with categories
        const categoryGroups = await prisma.categoryGroup.findMany({
            where: showHidden ? {} : { isHidden: false },
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
                let available: number;
                if (budget) {
                    // Tier 1: Current month record (already loaded via include)
                    available = budget.available;
                } else if (fallbackAvailableMap.has(cat.id)) {
                    // Tier 2: Most recent prior month fallback
                    available = fallbackAvailableMap.get(cat.id)!;
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

        // Calculate Ready to Assign
        // If we have a stored value from YNAB API sync, use it (most accurate)
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        let readyToAssign: number;
        
        if (settings && settings.toBeBudgeted !== undefined && settings.toBeBudgeted !== 0) {
            // Use YNAB's authoritative value
            readyToAssign = settings.toBeBudgeted;
        } else {
            // Fallback: Calculate from account balances - envelope totals
            const accounts = await prisma.account.findMany({
                where: { onBudget: true, closed: false },
            });
            const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
            readyToAssign = totalBalance - totalAvailable;
        }

        // Get account balance for display even if using YNAB ready to assign
        const accountsForDisplay = await prisma.account.findMany({
            where: { onBudget: true, closed: false },
        });
        const totalBalance = accountsForDisplay.reduce((sum, acc) => sum + acc.balance, 0);

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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: 'Failed to fetch budget', details: errorMessage }, { status: 500 });
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

        // Update Ready to Assign in settings
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        if (settings?.toBeBudgeted) {
            const difference = amountCents - oldAssigned;
            
            // Only update if there's an actual change
            if (difference !== 0) {
                await prisma.settings.update({
                    where: { id: 'default' },
                    data: { toBeBudgeted: Math.max(0, settings.toBeBudgeted - difference) },
                });
            }
        }

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
export async function PUT() {
    try {
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
    } catch (error) {
        console.error('Error recalculating budget:', error);
        return NextResponse.json({ error: 'Failed to recalculate budget' }, { status: 500 });
    }
}
