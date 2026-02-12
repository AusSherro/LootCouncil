import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const reportType = searchParams.get('type') || 'income-expense';
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const months = parseInt(searchParams.get('months') || '12');

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
            // Monthly income vs expense trends
            const transactions = await prisma.transaction.findMany({
                where: {
                    ...(dateFilter && { date: dateFilter }),
                },
                select: {
                    date: true,
                    amount: true,
                },
                orderBy: { date: 'asc' },
            });

            // Group by month
            const monthlyData = new Map<string, { income: number; expense: number }>();

            for (const t of transactions) {
                const month = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
                const existing = monthlyData.get(month) || { income: 0, expense: 0 };

                if (t.amount > 0) {
                    existing.income += t.amount;
                } else {
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
            // Spending grouped by payee
            const transactions = await prisma.transaction.findMany({
                where: {
                    ...(dateFilter && { date: dateFilter }),
                    amount: { lt: 0 },
                },
                select: {
                    payee: true,
                    amount: true,
                },
            });

            const payeeData = new Map<string, { total: number; count: number }>();

            for (const t of transactions) {
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
                    ...(dateFilter && { date: dateFilter }),
                    amount: { lt: 0 }, // Only expenses
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
                const month = t.date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
                const catName = t.category?.name || 'Uncategorized';
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

            // Get all monthly budgets
            const monthlyBudgets = await prisma.monthlyBudget.findMany({
                where: {
                    month: { in: monthsToCheck },
                },
                include: {
                    category: {
                        select: { id: true, name: true, group: { select: { name: true } } },
                    },
                },
            });

            // Get actual spending per category per month
            const transactions = await prisma.transaction.findMany({
                where: {
                    ...(dateFilter && { date: dateFilter }),
                    amount: { lt: 0 },
                    categoryId: { not: null },
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

        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    } catch (error) {
        console.error('Report error:', error);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}
