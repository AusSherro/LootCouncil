import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Quick budget actions: last month, average, underfunded
export async function POST(request: NextRequest) {
    try {
        const { action, categoryId, month } = await request.json();

        if (!action || !categoryId || !month) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const [year, monthNum] = month.split('-').map(Number);
        let targetAmount = 0;

        if (action === 'lastMonth') {
            // Get last month's budget
            const lastMonth = new Date(year, monthNum - 2, 1);
            const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

            const lastBudget = await prisma.monthlyBudget.findUnique({
                where: {
                    month_categoryId: {
                        categoryId,
                        month: lastMonthStr,
                    },
                },
            });

            targetAmount = lastBudget?.assigned ?? 0;
        } else if (action === 'average') {
            // Get average of last 3 months spending (as positive)
            const threeMonthsAgo = new Date(year, monthNum - 4, 1);
            const startOfMonth = new Date(year, monthNum - 1, 1);

            const transactions = await prisma.transaction.findMany({
                where: {
                    categoryId,
                    date: {
                        gte: threeMonthsAgo,
                        lt: startOfMonth,
                    },
                    amount: { lt: 0 }, // Spending only
                },
                select: { amount: true },
            });

            if (transactions.length > 0) {
                const totalSpent = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                targetAmount = Math.round(totalSpent / 3);
            }
        } else if (action === 'underfunded') {
            // Get goal underfunded amount
            const category = await prisma.category.findUnique({
                where: { id: categoryId },
                select: {
                    goalType: true,
                    goalTarget: true,
                    goalDueDate: true,
                },
            });

            if (!category?.goalType || !category.goalTarget) {
                return NextResponse.json({ error: 'No goal set for category' }, { status: 400 });
            }

            // Get current month's budget
            const currentBudget = await prisma.monthlyBudget.findUnique({
                where: {
                    month_categoryId: {
                        categoryId,
                        month,
                    },
                },
            });

            const currentlyAssigned = currentBudget?.assigned ?? 0;

            // Get available (assigned - spent)
            const startOfCurrentMonth = new Date(year, monthNum - 1, 1);
            const endOfCurrentMonth = new Date(year, monthNum, 0, 23, 59, 59);

            const transactions = await prisma.transaction.findMany({
                where: {
                    categoryId,
                    date: {
                        gte: startOfCurrentMonth,
                        lte: endOfCurrentMonth,
                    },
                },
                select: { amount: true },
            });

            const activity = transactions.reduce((sum, t) => sum + t.amount, 0);
            const available = currentlyAssigned + activity;

            if (category.goalType === 'target') {
                // Target by date - calculate monthly contribution needed
                if (category.goalDueDate) {
                    const dueDate = new Date(category.goalDueDate);
                    const thisMonth = new Date(year, monthNum - 1, 1);
                    const monthsRemaining = Math.max(1,
                        (dueDate.getFullYear() - thisMonth.getFullYear()) * 12 +
                        (dueDate.getMonth() - thisMonth.getMonth()) + 1
                    );
                    const needed = Math.max(0, category.goalTarget - available);
                    targetAmount = Math.ceil(needed / monthsRemaining);
                } else {
                    targetAmount = Math.max(0, category.goalTarget - available);
                }
            } else if (category.goalType === 'monthly') {
                // Monthly contribution goal
                targetAmount = Math.max(0, category.goalTarget - currentlyAssigned);
            } else if (category.goalType === 'spending') {
                // Spending goal - fund to goal amount
                targetAmount = Math.max(0, category.goalTarget - available);
            }

            // Add to current assignment, not replace
            targetAmount = currentlyAssigned + targetAmount;
        } else if (action === 'clear') {
            targetAmount = 0;
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        // Upsert the monthly budget
        await prisma.monthlyBudget.upsert({
            where: {
                month_categoryId: {
                    categoryId,
                    month,
                },
            },
            update: { assigned: targetAmount },
            create: {
                categoryId,
                month,
                assigned: targetAmount,
            },
        });

        return NextResponse.json({
            success: true,
            newAmount: targetAmount,
        });
    } catch (error) {
        console.error('Quick action error:', error);
        return NextResponse.json(
            { error: 'Failed to perform quick action' },
            { status: 500 }
        );
    }
}
