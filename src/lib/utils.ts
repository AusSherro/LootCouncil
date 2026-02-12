// Currency and number formatting utilities for Loot Council

export interface FormatCurrencyOptions {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    useAbsolute?: boolean;
    showSign?: boolean;
}

/**
 * Format cents to display currency (e.g., 12345 -> "$123.45")
 */
export function formatCurrency(
    cents: number,
    currency = 'AUD',
    options: FormatCurrencyOptions = {}
): string {
    const {
        minimumFractionDigits = 2,
        maximumFractionDigits = 2,
        useAbsolute = false,
        showSign = false,
    } = options;
    const amount = (useAbsolute ? Math.abs(cents) : cents) / 100;
    const formatted = new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency,
        minimumFractionDigits,
        maximumFractionDigits,
    }).format(amount);

    if (showSign) {
        if (cents > 0) return `+${formatted}`;
        if (cents < 0 && useAbsolute) return `-${formatted}`;
    }

    return formatted;
}

/**
 * Format a number with commas (e.g., 1234567 -> "1,234,567")
 */
export function formatNumber(num: number): string {
    return new Intl.NumberFormat('en-AU').format(num);
}

/**
 * Parse a currency string to cents (e.g., "$123.45" -> 12345)
 */
export function parseCurrency(value: string): number {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const amount = parseFloat(cleaned);
    if (isNaN(amount)) return 0;
    return Math.round(amount * 100);
}

/**
 * Get the current month in YYYY-MM format
 */
export function getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Format a date for display
 */
export function formatDate(date: Date | string, format = 'short'): string {
    const d = typeof date === 'string' ? new Date(date) : date;

    if (format === 'short') {
        return d.toLocaleDateString('en-AU', {
            day: '2-digit',
            month: 'short',
        });
    }

    return d.toLocaleDateString('en-AU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Generate a month string offset from the current month
 */
export function getMonthOffset(offset: number): string {
    const now = new Date();
    now.setMonth(now.getMonth() + offset);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get display name for a month (e.g., "2024-01" -> "January 2024")
 */
export function formatMonth(monthStr: string): string {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

/**
 * Calculate percentage
 */
export function toPercent(value: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
}
