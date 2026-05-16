// Currency and number formatting utilities for Loot Council

export interface FormatCurrencyOptions {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    useAbsolute?: boolean;
    showSign?: boolean;
}

// Module-level default currency for `formatCurrency` when no explicit currency is
// passed. Driven by SettingsProvider via `setDefaultCurrency()` so the whole app
// follows the user's home-currency setting without each call site needing the hook.
// Per-asset/foreign-currency call sites (e.g. MSFT in USD) still pass `asset.currency`
// explicitly and are unaffected.
let _defaultCurrency = 'AUD';

export function setDefaultCurrency(currency: string) {
    if (currency && typeof currency === 'string') {
        _defaultCurrency = currency;
    }
}

/**
 * Format cents to display currency (e.g., 12345 -> "$123.45").
 * Falls back to the user's home-currency setting (via `setDefaultCurrency`).
 */
export function formatCurrency(
    cents: number,
    currency: string = _defaultCurrency,
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


