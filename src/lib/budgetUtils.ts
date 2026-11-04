/**
 * Pure budget utility functions — safe for both client and server components.
 * No database imports.
 */

/**
 * Payee assigned to the balancing transaction that `/api/reconcile` creates when
 * a statement balance disagrees with the cleared total.
 *
 * It is written in exactly one place and matched in several (reports, the
 * transactions list). Keeping it here means the writer and the readers cannot
 * drift apart — a rename on one side would otherwise silently start counting
 * adjustments as real spending.
 */
export const RECONCILIATION_ADJUSTMENT_PAYEE = 'Reconciliation Adjustment';

/** Get the month string for a given offset from a base month (e.g. offset -1 = previous month) */
export function getMonthOffset(monthStr: string, offset: number): string {
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1 + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Check if a category group is an "Inflow" type (excluded from envelope calculations) */
export function isInflowGroup(groupName: string): boolean {
    const lowerName = groupName.toLowerCase();
    return lowerName === 'inflow' || lowerName.includes('ready to assign');
}

/** Check if a category group is the YNAB "Hidden Categories" system group */
export function isHiddenCategoriesGroup(groupName: string): boolean {
    const lowerName = groupName.toLowerCase();
    return lowerName === 'hidden categories';
}
