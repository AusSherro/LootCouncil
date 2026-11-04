import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { findOwnedCategory } from '@/lib/profileOwnership';
import { getMonthOffset, getMonthRange, getCategoryActivityMap, getCategoryAvailableMap, calculateGoalUnderFunded } from '@/lib/budgetHelpers';

// Quick budget actions: last month, average, underfunded
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const { action, categoryId, month } = await request.json();

        if (!action || !categoryId || !month) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // This route both reads and WRITES MonthlyBudget for the given category, so
        // the category must be proven to belong to the active profile first.
        if (!(await findOwnedCategory(profileId, categoryId))) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }

        let targetAmount = 0;

        if (action === 'lastMonth') {
            // Get last month's budget
            const lastMonthStr = getMonthOffset(month, -1);

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
            // Get average of last 3 months spending (as positive), including split sub-transactions
            const { gte: threeMonthsAgo } = getMonthRange(getMonthOffset(month, -3));
            const { gte: startOfMonth } = getMonthRange(month);

            const [transactions, subTransactions] = await Promise.all([
                prisma.transaction.findMany({
                    where: {
                        account: { profileId },
                        categoryId,
                        date: {
                            gte: threeMonthsAgo,
                            lt: startOfMonth,
                        },
                        amount: { lt: 0 }, // Spending only
                    },
                    select: { amount: true },
                }),
                prisma.subTransaction.findMany({
                    where: {
                        categoryId,
                        amount: { lt: 0 },
                        transaction: {
                            account: { profileId },
                            date: {
                                gte: threeMonthsAgo,
                                lt: startOfMonth,
                            },
                        },
                    },
                    select: { amount: true },
                }),
            ]);

            const allSpending = [...transactions, ...subTransactions];
            if (allSpending.length > 0) {
                const totalSpent = allSpending.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                targetAmount = Math.round(totalSpent / 3);
            }
        } else if (action === 'underfunded') {
            // Get goal underfunded amount
            const category = await prisma.category.findFirst({
                where: { id: categoryId, group: { profileId } },
                select: {
                    goalType: true,
                    goalTarget: true,
                    goalDueDate: true,
                    goalUnderFunded: true,
                },
            });

            if (!category?.goalType || (!category.goalTarget && !category.goalUnderFunded)) {
                return NextResponse.json({ error: 'No goal set for category' }, { status: 400 });
            }

            const [currentBudget, availableMap] = await Promise.all([
                prisma.monthlyBudget.findUnique({
                    where: {
                        month_categoryId: {
                            categoryId,
                            month,
                        },
                    },
                    select: { assigned: true },
                }),
                getCategoryAvailableMap([categoryId], month),
            ]);

            const currentlyAssigned = currentBudget?.assigned ?? 0;
            const available = availableMap.get(categoryId) ?? 0;

            // Support both standard YNAB codes ('TB' | 'TBD' | 'MF' | 'NEED' | 'DEBT')
            // and legacy string aliases ('target' | 'monthly' | 'spending')
            const normalizedGoalType =
                category.goalType === 'target' ? (category.goalDueDate ? 'TBD' : 'TB') :
                category.goalType === 'monthly' ? 'MF' :
                category.goalType === 'spending' ? 'NEED' :
                category.goalType;

            let underfunded = calculateGoalUnderFunded(
                normalizedGoalType,
                category.goalTarget,
                category.goalDueDate,
                available,
                month,
                currentlyAssigned,
            );
            if (normalizedGoalType === 'DEBT' && underfunded === 0 && category.goalUnderFunded && category.goalUnderFunded > 0) {
                underfunded = category.goalUnderFunded;
            }

            // Add to current assignment, not replace
            targetAmount = currentlyAssigned + underfunded;
        } else if (action === 'clear') {
            targetAmount = 0;
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        // Upsert the monthly budget with properly computed available and propagate deltas forward
        const [existingBudget, currentAvailableMap] = await Promise.all([
            prisma.monthlyBudget.findUnique({
                where: { month_categoryId: { month, categoryId } },
                select: { assigned: true },
            }),
            getCategoryAvailableMap([categoryId], month),
        ]);
        const assignmentDelta = targetAmount - (existingBudget?.assigned ?? 0);
        const available = (currentAvailableMap.get(categoryId) ?? 0) + assignmentDelta;
        const activityMap = await getCategoryActivityMap([categoryId], getMonthRange(month));
        const activity = activityMap.get(categoryId) ?? 0;

        await prisma.$transaction(async (tx) => {
            await tx.monthlyBudget.upsert({
                where: {
                    month_categoryId: {
                        categoryId,
                        month,
                    },
                },
                update: { assigned: targetAmount, activity, available },
                create: {
                    categoryId,
                    month,
                    assigned: targetAmount,
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
