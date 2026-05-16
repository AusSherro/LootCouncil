import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';

export async function GET(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const { searchParams } = new URL(request.url);
        const reportType = searchParams.get('type') || 'income-expense';
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const months = parseInt(searchParams.get('months') || '12');
        // Comma-separated category names to drop from aggregation (e.g. 'Uncategorized,Transfers').
        const excludeCategoriesParam = searchParams.get('excludeCategories') || '';
        const excludeCategorySet = new Set(
            excludeCategoriesParam
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
        );
        const isExcluded = (name: string | null | undefined) =>
            excludeCategorySet.has(name?.trim() || 'Uncategorized');

        // Calculate date range - months=0 means "all time"
        let start: Date | undefined;
        let end: Date = new Date();

        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
        } else if (months > 0) {
            start = new Date();
            start.setMonth(start.getMonth() - months);
        }
        // If months === 0, start remains undefined (all time)

        // Build date filter - omit if "all time"
        const dateFilter = start ? { gte: start, lte: end } : undefined;

        if (reportType === 'income-expense') {
            // Monthly income vs expense trends.
            // Excludes transfer transactions and reconciliation adjustments —
            // neither is real income or spending.
            const transactions = await prisma.transaction.findMany({
                where: {
                    account: { profileId },
                    ...(dateFilter && { date: dateFilter }),
                    transferId: null,
                    NOT: { payee: { contains: 'Reconciliation Adjustment' } },
                },
                select: {
                    date: true,
                    amount: true,
                    category: { select: { name: true } },
                },
                orderBy: { date: 'asc' },
            });

            // Group by month
            const monthlyData = new Map<string, { income: number; expense: number }>();

            for (const t of transactions) {
                const month = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
                const existing = monthlyData.get(month) || { income: 0, expense: 0 };

                if (t.amount > 0) {
                    // Income always counts (we don't exclude positive amounts by category —
                    // doing so hides paychecks that landed in 'Uncategorized').
                    existing.income += t.amount;
                } else {
                    // Apply category exclusion to expenses only.
                    if (isExcluded(t.category?.name)) continue;
                    existing.expense += Math.abs(t.amount);
                }

                monthlyData.set(month, existing);
            }

            const data = Array.from(monthlyData.entries()).map(([month, values]) => ({
                month,
                income: values.income,
                expense: values.expense,
                net: values.income - values.expense,
            }));

            return NextResponse.json({ report: 'income-expense', data });
        }

        if (reportType === 'spending-by-payee') {
            // Spending grouped by payee. Skip transfers and reconciliation
            // adjustments — they'd otherwise dominate the chart.
            const transactions = await prisma.transaction.findMany({
                where: {
                    account: { profileId },
                    ...(dateFilter && { date: dateFilter }),
                    amount: { lt: 0 },
                    transferId: null,
                    NOT: { payee: { contains: 'Reconciliation Adjustment' } },
                },
                select: {
                    payee: true,
                    amount: true,
                    category: { select: { name: true } },
                },
            });

            const payeeData = new Map<string, { total: number; count: number }>();

            for (const t of transactions) {
                if (isExcluded(t.category?.name)) continue;
                // Handle null, undefined, or empty string payees
                const payeeName = t.payee?.trim() || 'Unknown';
                const existing = payeeData.get(payeeName) || { total: 0, count: 0 };
                existing.total += Math.abs(t.amount) / 100; // Convert cents to dollars
                existing.count += 1;
                payeeData.set(payeeName, existing);
            }

            const data = Array.from(payeeData.entries())
                .map(([payee, { total, count }]) => ({ payee, total, count }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 30); // Top 30 payees

            return NextResponse.json({ report: 'spending-by-payee', data });
        }

        if (reportType === 'category-trends') {
            // Category spending over time
            const categoryId = searchParams.get('categoryId');

            const transactions = await prisma.transaction.findMany({
                where: {
                    account: { profileId },
                    ...(dateFilter && { date: dateFilter }),
                    amount: { lt: 0 }, // Only expenses
                    transferId: null,
                    NOT: { payee: { contains: 'Reconciliation Adjustment' } },
                    ...(categoryId && { categoryId }),
                },
                select: {
                    date: true,
                    amount: true,
                    category: { select: { id: true, name: true } },
                },
                orderBy: { date: 'asc' },
            });

            // Group by month and category
            const monthCategoryData = new Map<string, Map<string, number>>();
            const allCategories = new Set<string>();

            for (const t of transactions) {
                const catName = t.category?.name || 'Uncategorized';
                if (excludeCategorySet.has(catName)) continue;
                const month = t.date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
                allCategories.add(catName);

                if (!monthCategoryData.has(month)) {
                    monthCategoryData.set(month, new Map());
                }

                const monthData = monthCategoryData.get(month)!;
                const existing = monthData.get(catName) || 0;
                monthData.set(catName, existing + Math.abs(t.amount) / 100); // Convert cents to dollars
            }

            // Convert to flat array with category names as keys
            const data = Array.from(monthCategoryData.entries()).map(([month, categories]) => {
                const entry: Record<string, string | number> = { month };
                for (const [catName, amount] of categories.entries()) {
                    entry[catName] = amount;
                }
                return entry;
            });

            // Get top 8 categories by total spend
            const categoryTotals = new Map<string, number>();
            for (const [, categories] of monthCategoryData.entries()) {
                for (const [catName, amount] of categories.entries()) {
                    categoryTotals.set(catName, (categoryTotals.get(catName) || 0) + amount);
                }
            }
            const topCategories = Array.from(categoryTotals.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([name]) => name);

            return NextResponse.json({ report: 'category-trends', data, categories: topCategories });
        }

        if (reportType === 'budget-vs-actual') {
            // Compare budgeted amounts vs actual spending per category
            // Get all months in the date range
            const monthsToCheck: string[] = [];
            const checkDate = start ? new Date(start) : new Date();
            if (!start) {
                checkDate.setMonth(checkDate.getMonth() - (months || 12));
            }
            
            while (checkDate <= end) {
                monthsToCheck.push(`${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}`);
                checkDate.setMonth(checkDate.getMonth() + 1);
            }

            // Get all monthly budgets for the active profile
            const monthlyBudgets = await prisma.monthlyBudget.findMany({
                where: {
                    month: { in: monthsToCheck },
                    category: { group: { profileId } },
                    ...(excludeCategorySet.size > 0 && {
                        category: { group: { profileId }, name: { notIn: Array.from(excludeCategorySet) } },
                    }),
                },
                include: {
                    category: {
                        select: { id: true, name: true, group: { select: { name: true } } },
                    },
                },
            });

            // Get actual spending per category per month (skipping transfers —
            // they have categoryId=null already, but keep the filter explicit —
            // and reconciliation adjustments).
            const transactions = await prisma.transaction.findMany({
                where: {
                    account: { profileId },
                    ...(dateFilter && { date: dateFilter }),
                    amount: { lt: 0 },
                    categoryId: { not: null },
                    transferId: null,
                    NOT: { payee: { contains: 'Reconciliation Adjustment' } },
                    ...(excludeCategorySet.size > 0 && {
                        category: { name: { notIn: Array.from(excludeCategorySet) } },
                    }),
                },
                select: {
                    date: true,
                    amount: true,
                    categoryId: true,
                    category: { select: { name: true } },
                },
            });

            // Build monthly actual spending by category
            const actualSpending = new Map<string, Map<string, number>>();
            for (const t of transactions) {
                const month = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
                const catId = t.categoryId!;
                
                if (!actualSpending.has(month)) {
                    actualSpending.set(month, new Map());
                }
                const monthData = actualSpending.get(month)!;
                monthData.set(catId, (monthData.get(catId) || 0) + Math.abs(t.amount));
            }

            // Aggregate by category across all months
            const categoryData = new Map<string, { 
                categoryId: string;
                categoryName: string;
                groupName: string;
                totalBudgeted: number;
                totalActual: number;
                months: { month: string; budgeted: number; actual: number }[];
            }>();

            for (const budget of monthlyBudgets) {
                if (!budget.category) continue;
                
                const catId = budget.category.id;
                const actual = actualSpending.get(budget.month)?.get(catId) || 0;
                
                if (!categoryData.has(catId)) {
                    categoryData.set(catId, {
                        categoryId: catId,
                        categoryName: budget.category.name,
                        groupName: budget.category.group?.name || 'Uncategorized',
                        totalBudgeted: 0,
                        totalActual: 0,
                        months: [],
                    });
                }
                
                const cat = categoryData.get(catId)!;
                cat.totalBudgeted += budget.assigned;
                cat.totalActual += actual;
                cat.months.push({
                    month: budget.month,
                    budgeted: budget.assigned / 100,
                    actual: actual / 100,
                });
            }

            // Convert to sorted array with variance
            const data = Array.from(categoryData.values())
                .map(cat => ({
                    ...cat,
                    totalBudgeted: cat.totalBudgeted / 100,
                    totalActual: cat.totalActual / 100,
                    variance: (cat.totalBudgeted - cat.totalActual) / 100,
                    variancePercent: cat.totalBudgeted > 0 
                        ? ((cat.totalBudgeted - cat.totalActual) / cat.totalBudgeted) * 100 
                        : 0,
                }))
                .filter(cat => cat.totalBudgeted > 0 || cat.totalActual > 0)
                .sort((a, b) => b.totalActual - a.totalActual);

            // Also create monthly summary
            const monthlySummary = monthsToCheck.map(month => {
                let budgeted = 0;
                let actual = 0;
                
                for (const budget of monthlyBudgets) {
                    if (budget.month === month) {
                        budgeted += budget.assigned;
                    }
                }
                
                const monthActual = actualSpending.get(month);
                if (monthActual) {
                    for (const amount of monthActual.values()) {
                        actual += amount;
                    }
                }
                
                return {
                    month,
                    budgeted: budgeted / 100,
                    actual: actual / 100,
                    variance: (budgeted - actual) / 100,
                };
            });

            return NextResponse.json({ 
                report: 'budget-vs-actual', 
                data,
                monthlySummary,
                totals: {
                    budgeted: data.reduce((sum, c) => sum + c.totalBudgeted, 0),
                    actual: data.reduce((sum, c) => sum + c.totalActual, 0),
                    variance: data.reduce((sum, c) => sum + c.variance, 0),
                }
            });
        }

        if (reportType === 'net-worth-trend') {
            // Net worth over time based on account balances
            // This is an approximation based on transaction history
            const accounts = await prisma.account.findMany({
                where: { profileId },
                select: { id: true, name: true, type: true, balance: true },
            });

            // For "all time", get oldest transaction date
            let effectiveStart = start;
            if (!effectiveStart) {
                const oldest = await prisma.transaction.findFirst({
                    orderBy: { date: 'asc' },
                    select: { date: true },
                });
                effectiveStart = oldest?.date || new Date();
            }

            const transactions = await prisma.transaction.findMany({
                where: {
                    account: { profileId },
                    ...(dateFilter && { date: dateFilter }),
                },
                select: {
                    date: true,
                    amount: true,
                    accountId: true,
                },
                orderBy: { date: 'desc' },
            });

            // Calculate balance at each month end by working backwards
            const monthlyBalances = new Map<string, number>();
            const accountBalances = new Map(accounts.map(a => [a.id, a.balance]));

            // Group transactions by month (reverse order)
            const months: string[] = [];
            const currentDate = new Date(end);
            while (currentDate >= effectiveStart) {
                months.push(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`);
                currentDate.setMonth(currentDate.getMonth() - 1);
            }

            for (const month of months) {
                // Current total
                const total = Array.from(accountBalances.values()).reduce((sum, b) => sum + b, 0);
                monthlyBalances.set(month, total);

                // Subtract this month's transactions to get previous month's balance
                const monthStart = new Date(month + '-01');
                const nextMonth = new Date(monthStart);
                nextMonth.setMonth(nextMonth.getMonth() + 1);

                for (const t of transactions) {
                    if (t.date >= monthStart && t.date < nextMonth) {
                        const current = accountBalances.get(t.accountId) || 0;
                        accountBalances.set(t.accountId, current - t.amount);
                    }
                }
            }

            const data = Array.from(monthlyBalances.entries())
                .map(([month, balance]) => ({ month, balance }))
                .reverse();

            return NextResponse.json({ report: 'net-worth-trend', data });
        }

        if (reportType === 'top-movers') {
            // Compare current period spending per category vs a previous period.
            // Surfaces the categories that changed most (subscription creep,
            // seasonal spikes, lifestyle inflation).
            const monthParam = searchParams.get('month'); // 'YYYY-MM' — defaults to current
            const compareWith = searchParams.get('compareWith') || 'last-month'; // 'last-month' | 'last-year'

            const now = new Date();
            const [curYear, curMonth] = monthParam
                ? monthParam.split('-').map(Number)
                : [now.getFullYear(), now.getMonth() + 1];

            const currentStart = new Date(curYear, curMonth - 1, 1);
            const currentEnd = new Date(curYear, curMonth, 0, 23, 59, 59);

            let previousStart: Date;
            let previousEnd: Date;
            if (compareWith === 'last-year') {
                previousStart = new Date(curYear - 1, curMonth - 1, 1);
                previousEnd = new Date(curYear - 1, curMonth, 0, 23, 59, 59);
            } else {
                previousStart = new Date(curYear, curMonth - 2, 1);
                previousEnd = new Date(curYear, curMonth - 1, 0, 23, 59, 59);
            }

            // Fetch both periods in parallel (excluding transfers and
            // reconciliation adjustments — neither is real spending).
            const [currentTxns, previousTxns] = await Promise.all([
                prisma.transaction.findMany({
                    where: {
                        account: { profileId },
                        date: { gte: currentStart, lte: currentEnd },
                        amount: { lt: 0 },
                        transferId: null,
                        NOT: { payee: { contains: 'Reconciliation Adjustment' } },
                    },
                    select: {
                        amount: true,
                        categoryId: true,
                        category: { select: { id: true, name: true } },
                    },
                }),
                prisma.transaction.findMany({
                    where: {
                        account: { profileId },
                        date: { gte: previousStart, lte: previousEnd },
                        amount: { lt: 0 },
                        transferId: null,
                        NOT: { payee: { contains: 'Reconciliation Adjustment' } },
                    },
                    select: {
                        amount: true,
                        categoryId: true,
                        category: { select: { id: true, name: true } },
                    },
                }),
            ]);

            // Group both by category, applying the global exclude filter.
            const groupByCategory = (txns: typeof currentTxns) => {
                const map = new Map<string, { categoryId: string | null; categoryName: string; total: number }>();
                for (const t of txns) {
                    const name = t.category?.name || 'Uncategorized';
                    if (excludeCategorySet.has(name)) continue;
                    const key = t.category?.id || `__uncat__`;
                    const existing = map.get(key) || {
                        categoryId: t.category?.id || null,
                        categoryName: name,
                        total: 0,
                    };
                    existing.total += Math.abs(t.amount);
                    map.set(key, existing);
                }
                return map;
            };

            const currentMap = groupByCategory(currentTxns);
            const previousMap = groupByCategory(previousTxns);

            // Build the union of category keys.
            const allKeys = new Set([...currentMap.keys(), ...previousMap.keys()]);
            const movers = Array.from(allKeys).map(key => {
                const cur = currentMap.get(key);
                const prev = previousMap.get(key);
                const currentTotal = (cur?.total || 0) / 100;
                const previousTotal = (prev?.total || 0) / 100;
                const delta = currentTotal - previousTotal;
                const deltaPercent = previousTotal > 0
                    ? (delta / previousTotal) * 100
                    : (currentTotal > 0 ? 100 : 0);
                return {
                    categoryId: cur?.categoryId || prev?.categoryId || null,
                    categoryName: cur?.categoryName || prev?.categoryName || 'Uncategorized',
                    currentTotal,
                    previousTotal,
                    delta,
                    deltaPercent,
                };
            });

            // Drop micro-noise (< $5 absolute change) so the lists are meaningful.
            const significant = movers.filter(m => Math.abs(m.delta) >= 5);

            const topIncreases = significant
                .filter(m => m.delta > 0)
                .sort((a, b) => b.delta - a.delta)
                .slice(0, 5);

            const topDecreases = significant
                .filter(m => m.delta < 0)
                .sort((a, b) => a.delta - b.delta)
                .slice(0, 5);

            const totalCurrent = movers.reduce((sum, m) => sum + m.currentTotal, 0);
            const totalPrevious = movers.reduce((sum, m) => sum + m.previousTotal, 0);

            return NextResponse.json({
                report: 'top-movers',
                compareWith,
                current: {
                    month: `${curYear}-${String(curMonth).padStart(2, '0')}`,
                    total: totalCurrent,
                },
                previous: {
                    month: `${previousStart.getFullYear()}-${String(previousStart.getMonth() + 1).padStart(2, '0')}`,
                    total: totalPrevious,
                },
                topIncreases,
                topDecreases,
                allMovers: significant.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
            });
        }

        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    } catch (error) {
        console.error('Report error:', error);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}
