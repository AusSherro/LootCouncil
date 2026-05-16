import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { getMonthOffset, isInflowGroup, isHiddenCategoriesGroup } from '@/lib/budgetHelpers';

interface MonthProjection {
    month: string;
    label: string;
    income: number;       // cents
    expenses: number;     // cents (positive = outflow)
    scheduled: number;    // cents (positive = outflow from scheduled txns)
    additionalExpense: number; // cents, only on target month
    balance: number;      // running balance in cents
    isTarget: boolean;
    isCurrent: boolean;
}

function formatMonthLabel(monthStr: string): string {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

function monthsBetween(from: string, to: string): number {
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    return (ty - fy) * 12 + (tm - fm);
}

// GET - Generate a budget forecast from current month to target month
export async function GET(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const { searchParams } = new URL(request.url);
        const currentMonth = searchParams.get('currentMonth') || new Date().toISOString().slice(0, 7);
        const targetMonth = searchParams.get('targetMonth');
        const additionalAmount = parseInt(searchParams.get('additionalAmount') || '0'); // cents
        const additionalDescription = searchParams.get('additionalDescription') || '';
        const additionalTargetMonth = searchParams.get('additionalTargetMonth') || targetMonth; // which month the expense hits
        const userMonthlyIncome = parseInt(searchParams.get('monthlyIncome') || '0'); // cents, 0 = auto-detect

        if (!targetMonth) {
            return NextResponse.json({ error: 'targetMonth required (YYYY-MM format)' }, { status: 400 });
        }

        // Extend forecast to cover the expense month if it's beyond the target
        const effectiveEndMonth = additionalTargetMonth && additionalTargetMonth > targetMonth
            ? additionalTargetMonth
            : targetMonth;

        const totalMonths = monthsBetween(currentMonth, effectiveEndMonth);
        if (totalMonths < 0) {
            return NextResponse.json({ error: 'Target month must be in the future' }, { status: 400 });
        }
        if (totalMonths > 24) {
            return NextResponse.json({ error: 'Forecast limited to 24 months' }, { status: 400 });
        }

        // 1. Get current on-budget account balances
        const accounts = await prisma.account.findMany({
            where: { onBudget: true, closed: false, profileId },
        });
        const totalAccountBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

        // 2. Get all category groups with goals and current month data
        const categoryGroups = await prisma.categoryGroup.findMany({
            where: { isHidden: false, profileId },
            include: {
                categories: {
                    where: { isHidden: false },
                    include: {
                        monthlyData: {
                            where: { month: currentMonth },
                            take: 1,
                        },
                    },
                },
            },
        });

        // 3. Monthly income: prefer user-provided, fallback to auto-detect
        let monthlyIncome = userMonthlyIncome;

        if (monthlyIncome === 0) {
            // Try inflow category assignments
            for (const group of categoryGroups) {
                if (isInflowGroup(group.name)) {
                    for (const cat of group.categories) {
                        monthlyIncome += Math.abs(cat.monthlyData[0]?.assigned ?? 0);
                    }
                }
            }
        }

        if (monthlyIncome === 0) {
            // Try actual inflow transaction activity this month
            const monthStart = new Date(`${currentMonth}-01T00:00:00.000Z`);
            const monthEnd = new Date(monthStart);
            monthEnd.setMonth(monthEnd.getMonth() + 1);

            for (const group of categoryGroups) {
                if (isInflowGroup(group.name)) {
                    for (const cat of group.categories) {
                        const activityResult = await prisma.transaction.aggregate({
                            where: {
                                categoryId: cat.id,
                                date: { gte: monthStart, lt: monthEnd },
                            },
                            _sum: { amount: true },
                        });
                        monthlyIncome += Math.abs(activityResult._sum.amount || 0);
                    }
                }
            }
        }

        // 4. Calculate monthly expenses from budget goals
        const expenseCategories: {
            id: string;
            name: string;
            goalType: string | null;
            goalTarget: number | null;
            goalDueDate: Date | null;
            available: number;
            assigned: number;
        }[] = [];

        for (const group of categoryGroups) {
            if (isInflowGroup(group.name) || isHiddenCategoriesGroup(group.name)) continue;
            for (const cat of group.categories) {
                expenseCategories.push({
                    id: cat.id,
                    name: cat.name,
                    goalType: cat.goalType,
                    goalTarget: cat.goalTarget,
                    goalDueDate: cat.goalDueDate,
                    available: cat.monthlyData[0]?.available ?? 0,
                    assigned: cat.monthlyData[0]?.assigned ?? 0,
                });
            }
        }

        // 5. Get scheduled transactions for future months
        const forecastEnd = new Date(`${getMonthOffset(effectiveEndMonth, 1)}-01T00:00:00.000Z`);

        const scheduledTransactions = await prisma.scheduledTransaction.findMany({
            where: {
                isActive: true,
                profileId,
                nextDueDate: { lte: forecastEnd },
            },
        });

        // Build scheduled amounts per month
        const scheduledByMonth = new Map<string, number>();
        for (const st of scheduledTransactions) {
            // Project future occurrences based on frequency
            let nextDate = new Date(st.nextDueDate);
            while (nextDate < forecastEnd) {
                const stMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
                if (stMonth >= currentMonth && stMonth <= targetMonth) {
                    // Only count outflows (negative amounts)
                    if (st.amount < 0) {
                        scheduledByMonth.set(stMonth, (scheduledByMonth.get(stMonth) || 0) + Math.abs(st.amount));
                    }
                }
                // Advance to next occurrence
                switch (st.frequency) {
                    case 'daily': nextDate.setDate(nextDate.getDate() + 1); break;
                    case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
                    case 'biweekly': nextDate.setDate(nextDate.getDate() + 14); break;
                    case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
                    case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
                    default: nextDate = forecastEnd; // unknown frequency, stop
                }
                if (st.endDate && nextDate > st.endDate) break;
            }
        }

        // 6. Build month-by-month projections
        const projections: MonthProjection[] = [];
        let runningBalance = totalAccountBalance;

        for (let i = 0; i <= totalMonths; i++) {
            const projMonth = getMonthOffset(currentMonth, i);
            const isCurrent = i === 0;
            const isTarget = projMonth === (additionalTargetMonth || targetMonth);

            // Calculate monthly goal expenses for this projected month
            let monthlyExpenses = 0;
            for (const cat of expenseCategories) {
                if (cat.goalType && cat.goalTarget) {
                    switch (cat.goalType) {
                        case 'MF': // Monthly Funding - target amount each month
                        case 'NEED': // Spending Goal - target per month
                            monthlyExpenses += cat.goalTarget;
                            break;
                        case 'TBD': { // Target by Date - spread over remaining months
                            if (cat.goalDueDate) {
                                const dueMonth = `${cat.goalDueDate.getFullYear()}-${String(cat.goalDueDate.getMonth() + 1).padStart(2, '0')}`;
                                const monthsLeft = monthsBetween(projMonth, dueMonth);
                                if (monthsLeft > 0) {
                                    const perMonth = Math.ceil(Math.max(0, cat.goalTarget - cat.available) / monthsBetween(currentMonth, dueMonth));
                                    monthlyExpenses += perMonth;
                                }
                            } else {
                                monthlyExpenses += cat.goalTarget; // No date, treat as monthly
                            }
                            break;
                        }
                        case 'TB': { // Target Balance - fund until reached
                            const stillNeeded = Math.max(0, cat.goalTarget - cat.available);
                            if (stillNeeded > 0 && totalMonths > 0) {
                                // Spread remaining over forecast period
                                const perMonth = Math.ceil(stillNeeded / (totalMonths + 1));
                                monthlyExpenses += perMonth;
                            }
                            break;
                        }
                        case 'DEBT':
                            // Use goal target as monthly payment amount
                            monthlyExpenses += cat.goalTarget;
                            break;
                    }
                } else if (!isCurrent && cat.assigned > 0) {
                    // No goal but has current assignment? Use as estimate
                    monthlyExpenses += cat.assigned;
                }
            }

            const scheduledExpenses = scheduledByMonth.get(projMonth) || 0;
            const additionalThisMonth = isTarget ? additionalAmount : 0;

            // Current month: balance is actual, not projected
            if (isCurrent) {
                runningBalance = totalAccountBalance;
            } else {
                runningBalance = runningBalance + monthlyIncome - monthlyExpenses - scheduledExpenses;
            }

            // Subtract additional expense if this is the target month
            const balanceAfterAdditional = runningBalance - additionalThisMonth;

            projections.push({
                month: projMonth,
                label: formatMonthLabel(projMonth),
                income: isCurrent ? 0 : monthlyIncome,
                expenses: monthlyExpenses,
                scheduled: scheduledExpenses,
                additionalExpense: additionalThisMonth,
                balance: isCurrent ? runningBalance : balanceAfterAdditional,
                isTarget,
                isCurrent,
            });
        }

        // 7. Calculate verdict
        const targetProjection = projections.find(p => p.month === (additionalTargetMonth || targetMonth));
        const canAfford = targetProjection ? targetProjection.balance >= 0 : false;
        const lowestBalance = Math.min(...projections.map(p => p.balance));
        const lowestMonth = projections.find(p => p.balance === lowestBalance);

        return NextResponse.json({
            canAfford,
            projectedBalanceAtTarget: targetProjection?.balance ?? 0,
            shortfall: targetProjection && targetProjection.balance < 0 ? Math.abs(targetProjection.balance) : 0,
            lowestBalance,
            lowestMonth: lowestMonth?.month ?? '',
            monthlyProjections: projections,
            additionalExpense: additionalAmount > 0 ? {
                amount: additionalAmount,
                description: additionalDescription,
                month: additionalTargetMonth || targetMonth,
            } : null,
            summary: {
                currentBalance: totalAccountBalance,
                monthlyIncome,
                monthlyExpenses: expenseCategories.reduce((sum, c) => {
                    if (c.goalType === 'MF' || c.goalType === 'NEED') return sum + (c.goalTarget || 0);
                    return sum + c.assigned;
                }, 0),
                scheduledCount: scheduledTransactions.length,
                categoriesWithGoals: expenseCategories.filter(c => c.goalType).length,
                monthsProjected: totalMonths + 1,
            },
        });
    } catch (error) {
        console.error('Forecast error:', error);
        return NextResponse.json({ error: 'Failed to generate forecast' }, { status: 500 });
    }
}
