import prisma from '@/lib/prisma';

/** Get exchange rate with 1-hour cache. Falls back to cached rate or 1 on failure. */
export async function getExchangeRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;

    try {
        // Check cache first
        const cached = await prisma.exchangeRate.findUnique({
            where: {
                fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to },
            },
        });

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (cached && cached.lastUpdated > oneHourAgo) {
            return cached.rate;
        }

        // Fetch fresh rate
        const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
        if (!res.ok) {
            return cached?.rate || 1;
        }

        const data = await res.json();
        const rate = data.rates?.[to] || 1;

        // Cache the rate
        await prisma.exchangeRate.upsert({
            where: {
                fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to },
            },
            create: {
                fromCurrency: from,
                toCurrency: to,
                rate,
                lastUpdated: new Date(),
            },
            update: {
                rate,
                lastUpdated: new Date(),
            },
        });

        return rate;
    } catch (error) {
        console.error('getExchangeRate error:', error);
        return 1;
    }
}
