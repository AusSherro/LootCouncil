/**
 * Pure date arithmetic for recurring scheduled transactions.
 *
 * Lives outside the route handler so it can be unit tested directly — the
 * month-end and daylight-saving edge cases below are exactly the kind that
 * regress silently.
 *
 * Every calculation uses UTC mutators on purpose. Due dates are stored as UTC
 * midnight, and the local-time mutators (`setDate`/`setMonth`) shift the stored
 * date by a day whenever a step crosses a daylight-saving boundary. Sydney
 * switches twice a year, so a monthly schedule would drift under local mutators.
 */

export interface RecurringSchedule {
    frequency: string;
    nextDueDate: Date;
    dayOfMonth?: number | null;
    dayOfWeek?: number | null;
}

/** Last day of the month that `year`/`monthIndex` refer to, in UTC. */
function lastDayOfUTCMonth(year: number, monthIndex: number): number {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Advance `date` by whole months in UTC, clamping the day to the target month.
 *
 * Without clamping, `setMonth` overflows: 31 Jan + 1 month becomes "31 Feb",
 * which JavaScript rolls forward to 3 March — so a bill due on the 31st skips
 * February entirely and then drifts further every month after that.
 */
function addUTCMonths(date: Date, months: number, dayOfMonth?: number | null): void {
    const desiredDay = dayOfMonth ?? date.getUTCDate();
    const targetMonthIndex = date.getUTCMonth() + months;
    const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
    const normalisedMonth = ((targetMonthIndex % 12) + 12) % 12;

    // Set the day to 1 first so the month change can never overflow on its own.
    date.setUTCDate(1);
    date.setUTCFullYear(targetYear, normalisedMonth);
    date.setUTCDate(Math.min(desiredDay, lastDayOfUTCMonth(targetYear, normalisedMonth)));
}

/** Calculate the next due date for a recurring schedule. */
export function calculateNextDueDate(scheduled: RecurringSchedule): Date {
    const next = new Date(scheduled.nextDueDate);

    switch (scheduled.frequency) {
        case 'daily':
            next.setUTCDate(next.getUTCDate() + 1);
            break;
        case 'weekly':
            next.setUTCDate(next.getUTCDate() + 7);
            break;
        case 'biweekly':
            next.setUTCDate(next.getUTCDate() + 14);
            break;
        case 'monthly':
            addUTCMonths(next, 1, scheduled.dayOfMonth);
            break;
        case 'yearly':
            addUTCMonths(next, 12, scheduled.dayOfMonth);
            break;
        default:
            addUTCMonths(next, 1, scheduled.dayOfMonth); // Default to monthly
    }

    return next;
}
