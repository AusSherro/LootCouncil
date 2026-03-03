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


