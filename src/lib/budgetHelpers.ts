import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

// Re-export pure functions from client-safe module
export { getMonthOffset, isInflowGroup, isHiddenCategoriesGroup } from '@/lib/budgetUtils';
import { getMonthOffset } from '@/lib/budgetUtils';
import { toLocalMonthString } from '@/lib/utils';

/**
 * Calculate Ready to Assign (YNAB-style).
 * Always computed from: total on-budget account balance - total envelope available
 * at the latest known budget/transaction horizon. This includes future assignments
 * and rollover from prior months without reconstructing imported YNAB balances from
 * incomplete history.
 */
export async function calculateReadyToAssign(profileId: string, month?: string): Promise<number> {
    // Total balance across all open on-budget accounts
    const accounts = await prisma.account.findMany({
        where: { onBudget: true, closed: false, profileId },
    });
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

    // Collect ALL categories in budget groups (including individually hidden ones)
    // Exclude only system groups (inflow, Hidden Categories) and user-hidden groups
    const envelopeCats = await prisma.category.findMany({
        where: {
            group: {
                profileId,
                isHidden: false,
                NOT: {
                    name: { in: ['Inflow: Ready to Assign', 'Internal Master Category', 'Hidden Categories'] },
                },
            },
        },
        select: { id: true },
    });
    const envelopeCatIds = envelopeCats.map(c => c.id);
    if (envelopeCatIds.length === 0) return totalBalance;

    const [latestBudget, latestTransaction] = await Promise.all([
        prisma.monthlyBudget.findFirst({
            where: { categoryId: { in: envelopeCatIds } },
            orderBy: { month: 'desc' },
            select: { month: true },
        }),
        prisma.transaction.findFirst({
            where: { account: { profileId } },
            orderBy: { date: 'desc' },
            select: { date: true },
        }),
    ]);
    const currentMonth = toLocalMonthString();
    const transactionMonth = latestTransaction?.date.toISOString().slice(0, 7);
    const rtaMonth = [currentMonth, month, latestBudget?.month, transactionMonth]
        .filter((candidate): candidate is string => Boolean(candidate))
        .sort()
        .at(-1)!;
    const envelopeAvailableMap = await getCategoryAvailableMap(envelopeCatIds, rtaMonth);
    const envelopeTotal = [...envelopeAvailableMap.values()].reduce((sum, available) => sum + available, 0);

    return totalBalance - envelopeTotal;
}

/**
 * Sum category activity across BOTH plain transactions and split sub-transactions.
 *
 * When a transaction is split, its own `categoryId` is set to null and the money
 * lives in `SubTransaction` rows. Aggregating on `transaction.categoryId` alone
 * therefore silently drops all split spending from the budget. Every activity
 * calculation must go through this helper.
 *
 * @param categoryIds Categories to include. Pass `null` to include every category.
 * @param range Optional half-open date window `[gte, lt)` applied to the parent
 *              transaction date. Omit for "all history".
 * @returns Map of categoryId -> summed amount in cents.
 */
export async function getCategoryActivityMap(
    categoryIds: string[] | null,
    range?: { gte?: Date; lt?: Date },
): Promise<Map<string, number>> {
    const categoryFilter = categoryIds ? { in: categoryIds } : { not: null };
    const dateFilter = range && (range.gte || range.lt) ? range : undefined;

    const [transactionAgg, subTransactionAgg] = await Promise.all([
        prisma.transaction.groupBy({
            by: ['categoryId'],
            where: {
                categoryId: categoryFilter,
                ...(dateFilter ? { date: dateFilter } : {}),
            },
            _sum: { amount: true },
        }),
        prisma.subTransaction.groupBy({
            by: ['categoryId'],
            where: {
                categoryId: categoryFilter,
                ...(dateFilter ? { transaction: { date: dateFilter } } : {}),
            },
            _sum: { amount: true },
        }),
    ]);

    const activityMap = new Map<string, number>();
    for (const row of [...transactionAgg, ...subTransactionAgg]) {
        if (!row.categoryId) continue;
        activityMap.set(row.categoryId, (activityMap.get(row.categoryId) ?? 0) + (row._sum.amount || 0));
    }
    return activityMap;
}

/**
 * Calculate envelope balances through `month` without mutating stored snapshots.
 * Local categories can be derived from complete assignment and activity history.
 * YNAB categories instead roll forward from their latest prior imported balance,
 * preserving YNAB resets and other history that cannot be reconstructed locally.
 */
export async function getCategoryAvailableMap(
    categoryIds: string[],
    month: string,
): Promise<Map<string, number>> {
    const uniqueCategoryIds = [...new Set(categoryIds)];
    const availableMap = new Map<string, number>();
    if (uniqueCategoryIds.length === 0) return availableMap;

    const categories = await prisma.category.findMany({
        where: { id: { in: uniqueCategoryIds } },
        select: { id: true, ynabId: true },
    });
    const localCategoryIds = categories.filter(category => !category.ynabId).map(category => category.id);
    const importedCategoryIds = categories.filter(category => category.ynabId).map(category => category.id);
    const monthEnd = getMonthRange(month).lt;

    if (localCategoryIds.length > 0) {
        const [assignedRows, activityMap] = await Promise.all([
            prisma.monthlyBudget.groupBy({
                by: ['categoryId'],
                where: {
                    categoryId: { in: localCategoryIds },
                    month: { lte: month },
                },
                _sum: { assigned: true },
            }),
            getCategoryActivityMap(localCategoryIds, { lt: monthEnd }),
        ]);
        const assignedMap = new Map(
            assignedRows.map(row => [row.categoryId, row._sum.assigned || 0])
        );
        for (const categoryId of localCategoryIds) {
            availableMap.set(
                categoryId,
                (assignedMap.get(categoryId) ?? 0) + (activityMap.get(categoryId) ?? 0)
            );
        }
    }

    if (importedCategoryIds.length > 0) {
        const [priorBudgets, currentBudgets] = await Promise.all([
            prisma.monthlyBudget.findMany({
                where: {
                    categoryId: { in: importedCategoryIds },
                    month: { lt: month },
                },
                distinct: ['categoryId'],
                orderBy: { month: 'desc' },
                select: { categoryId: true, month: true, available: true },
            }),
            prisma.monthlyBudget.findMany({
                where: {
                    categoryId: { in: importedCategoryIds },
                    month,
                },
                select: { categoryId: true, available: true },
            }),
        ]);
        const priorBudgetMap = new Map(priorBudgets.map(budget => [budget.categoryId, budget]));
        const currentBudgetMap = new Map(currentBudgets.map(budget => [budget.categoryId, budget.available]));
        const categoriesByAnchorMonth = new Map<string, string[]>();
        const categoriesWithoutAnchor: string[] = [];

        for (const categoryId of importedCategoryIds) {
            const priorBudget = priorBudgetMap.get(categoryId);
            if (priorBudget) {
                const anchoredCategories = categoriesByAnchorMonth.get(priorBudget.month) ?? [];
                anchoredCategories.push(categoryId);
                categoriesByAnchorMonth.set(priorBudget.month, anchoredCategories);
            } else if (currentBudgetMap.has(categoryId)) {
                availableMap.set(categoryId, currentBudgetMap.get(categoryId)!);
            } else {
                categoriesWithoutAnchor.push(categoryId);
            }
        }

        await Promise.all([...categoriesByAnchorMonth].map(async ([anchorMonth, anchoredCategoryIds]) => {
            const activityStart = getMonthRange(getMonthOffset(anchorMonth, 1)).gte;
            const [assignedRows, activityMap] = await Promise.all([
                prisma.monthlyBudget.groupBy({
                    by: ['categoryId'],
                    where: {
                        categoryId: { in: anchoredCategoryIds },
                        month: { gt: anchorMonth, lte: month },
                    },
                    _sum: { assigned: true },
                }),
                getCategoryActivityMap(anchoredCategoryIds, { gte: activityStart, lt: monthEnd }),
            ]);
            const assignedMap = new Map(
                assignedRows.map(row => [row.categoryId, row._sum.assigned || 0])
            );

            for (const categoryId of anchoredCategoryIds) {
                const priorBudget = priorBudgetMap.get(categoryId)!;
                availableMap.set(
                    categoryId,
                    priorBudget.available
                        + (assignedMap.get(categoryId) ?? 0)
                        + (activityMap.get(categoryId) ?? 0)
                );
            }
        }));

        if (categoriesWithoutAnchor.length > 0) {
            const activityMap = await getCategoryActivityMap(categoriesWithoutAnchor, { lt: monthEnd });
            for (const categoryId of categoriesWithoutAnchor) {
                availableMap.set(categoryId, activityMap.get(categoryId) ?? 0);
            }
        }
    }

    return availableMap;
}

/** Half-open `[start, end)` UTC bounds for a `YYYY-MM` month string. */
export function getMonthRange(month: string): { gte: Date; lt: Date } {
    const gte = new Date(`${month}-01T00:00:00.000Z`);
    const lt = new Date(gte);
    lt.setUTCMonth(lt.getUTCMonth() + 1);
    return { gte, lt };
}

/** Keep imported availability snapshots aligned with a transaction activity change. */
export async function applyCategoryActivityDelta(
    tx: Prisma.TransactionClient,
    categoryId: string,
    month: string,
    delta: number,
): Promise<void> {
    if (delta === 0) return;

    const currentBudget = await tx.monthlyBudget.findUnique({
        where: { month_categoryId: { categoryId, month } },
        select: { id: true },
    });
    if (currentBudget) {
        await tx.monthlyBudget.update({
            where: { id: currentBudget.id },
            data: { available: { increment: delta } },
        });
    } else {
        const previousBudget = await tx.monthlyBudget.findFirst({
            where: { categoryId, month: { lt: month } },
            orderBy: { month: 'desc' },
            select: { available: true },
        });
        await tx.monthlyBudget.create({
            data: {
                categoryId,
                month,
                available: (previousBudget?.available ?? 0) + delta,
            },
        });
    }
    await tx.monthlyBudget.updateMany({
        where: { categoryId, month: { gt: month } },
        data: { available: { increment: delta } },
    });
}

/** Calculate activity (transactions + split sub-transactions) for a category in a given month */
export async function calculateActivity(categoryId: string, month: string): Promise<number> {
    const activityMap = await getCategoryActivityMap([categoryId], getMonthRange(month));
    return activityMap.get(categoryId) ?? 0;
}

/**
 * Dynamically calculate how much a category is underfunded based on
 * its goal type, target, and current available balance.
 * Returns amount in cents, or 0 if fully funded / no goal.
 */
export function calculateGoalUnderFunded(
    goalType: string | null,
    goalTarget: number | null,
    goalDueDate: Date | null,
    available: number,
    currentMonth: string,
    assigned: number = 0,
): number {
    if (!goalType || !goalTarget) return 0;

    switch (goalType) {
        case 'TB': // Target Balance
            return Math.max(0, goalTarget - available);

        case 'TBD': { // Target by Date
            if (!goalDueDate) {
                return Math.max(0, goalTarget - available);
            }
            const [currentYear, currentMonthNum] = currentMonth.split('-').map(Number);
            const dueYear = goalDueDate.getFullYear();
            const dueMonth = goalDueDate.getMonth() + 1;
            const monthsRemaining = (dueYear - currentYear) * 12 + (dueMonth - currentMonthNum);
            if (monthsRemaining <= 0) {
                return Math.max(0, goalTarget - available);
            }
            const amountNeeded = Math.max(0, goalTarget - available);
            return Math.ceil(amountNeeded / monthsRemaining);
        }

        case 'MF': // Monthly Funding – check assigned this month, not available
            return Math.max(0, goalTarget - assigned);

        case 'NEED': // Needed for Spending
            return Math.max(0, goalTarget - available);

        case 'DEBT': // Debt payoff
            return Math.max(0, goalTarget - assigned);

        default:
            return 0;
    }
}
