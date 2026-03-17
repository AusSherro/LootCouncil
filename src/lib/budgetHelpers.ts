import prisma from '@/lib/prisma';

// Re-export pure functions from client-safe module
export { getMonthOffset, isInflowGroup, isHiddenCategoriesGroup } from '@/lib/budgetUtils';
import { isInflowGroup, isHiddenCategoriesGroup } from '@/lib/budgetUtils';

/**
 * Calculate Ready to Assign (YNAB-style).
 * Always computed from: total on-budget account balance - total envelope available.
 * This means uncategorized transactions naturally reduce RTA, and RTA can go negative.
 */
export async function calculateReadyToAssign(profileId: string, month: string): Promise<number> {
    // Total balance across all open on-budget accounts
    const accounts = await prisma.account.findMany({
        where: { onBudget: true, closed: false, profileId },
    });
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

    // Total available across all non-inflow, non-hidden envelopes
    const categoryGroups = await prisma.categoryGroup.findMany({
        where: { isHidden: false, profileId },
        include: {
            categories: {
                where: { isHidden: false },
                include: {
                    monthlyData: { where: { month }, take: 1 },
                },
            },
        },
    });

    let totalAvailable = 0;
    for (const group of categoryGroups) {
        if (isInflowGroup(group.name) || isHiddenCategoriesGroup(group.name)) continue;
        for (const cat of group.categories) {
            totalAvailable += cat.monthlyData[0]?.available ?? 0;
        }
    }

    return totalBalance - totalAvailable;
}

/** Calculate activity (sum of transactions) for a category in a given month */
export async function calculateActivity(categoryId: string, month: string): Promise<number> {
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
