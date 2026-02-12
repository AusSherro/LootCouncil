import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Free exchange rate API - no key required
const EXCHANGE_API_URL = 'https://api.exchangerate-api.com/v4/latest';

// Common currencies
const CURRENCIES = ['USD', 'AUD', 'EUR', 'GBP', 'CAD', 'NZD', 'JPY', 'CHF', 'CNY', 'HKD', 'SGD'];

interface ExchangeRateResponse {
    base: string;
    rates: Record<string, number>;
    date: string;
}

// GET - Get exchange rate between two currencies
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from')?.toUpperCase() || 'USD';
    const to = searchParams.get('to')?.toUpperCase() || 'AUD';
    const amount = parseFloat(searchParams.get('amount') || '1');

    try {
        // Check for cached rate (less than 1 hour old)
        const cached = await prisma.exchangeRate.findUnique({
            where: {
                fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to },
            },
        });

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        if (cached && cached.lastUpdated > oneHourAgo) {
            return NextResponse.json({
                from,
                to,
                rate: cached.rate,
                amount,
                converted: amount * cached.rate,
                cached: true,
                lastUpdated: cached.lastUpdated,
            });
        }

        // Fetch fresh rate
        const res = await fetch(`${EXCHANGE_API_URL}/${from}`, {
            next: { revalidate: 3600 }, // Cache for 1 hour
        });

        if (!res.ok) {
            // If API fails, try to use stale cache
            if (cached) {
                return NextResponse.json({
                    from,
                    to,
                    rate: cached.rate,
                    amount,
                    converted: amount * cached.rate,
                    cached: true,
                    stale: true,
                    lastUpdated: cached.lastUpdated,
                });
            }
            return NextResponse.json({ error: 'Failed to fetch exchange rate' }, { status: 500 });
        }

        const data: ExchangeRateResponse = await res.json();
        const rate = data.rates[to];

        if (!rate) {
            return NextResponse.json({ error: `Currency ${to} not found` }, { status: 404 });
        }

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

        return NextResponse.json({
            from,
            to,
            rate,
            amount,
            converted: amount * rate,
            cached: false,
            lastUpdated: new Date(),
        });
    } catch (error) {
        console.error('Exchange rate error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch exchange rate', details: String(error) },
            { status: 500 }
        );
    }
}

// POST - Refresh all exchange rates for a base currency
export async function POST(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const allRatesFor = searchParams.get('allRatesFor')?.toUpperCase();

    // If ?allRatesFor=AUD is provided, return all cached rates TO that currency
    if (allRatesFor) {
        try {
            const rates = await prisma.exchangeRate.findMany({
                where: { toCurrency: allRatesFor },
            });

            const rateMap: Record<string, number> = {};
            for (const rate of rates) {
                rateMap[rate.fromCurrency] = rate.rate;
            }
            rateMap[allRatesFor] = 1;

            return NextResponse.json({
                toCurrency: allRatesFor,
                rates: rateMap,
                count: rates.length,
            });
        } catch (error) {
            console.error('Get rates error:', error);
            return NextResponse.json(
                { error: 'Failed to get exchange rates', details: String(error) },
                { status: 500 }
            );
        }
    }

    // Otherwise: refresh all exchange rates for a base currency
    try {
        const body = await request.json();
        const baseCurrency = body.base?.toUpperCase() || 'AUD';

        // Fetch rates from the base currency
        const res = await fetch(`${EXCHANGE_API_URL}/${baseCurrency}`);

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch exchange rates' }, { status: 500 });
        }

        const data: ExchangeRateResponse = await res.json();
        let updated = 0;

        // Store rates from common currencies TO the base currency
        for (const currency of CURRENCIES) {
            if (currency === baseCurrency) continue;

            const rateFromBase = data.rates[currency];
            if (!rateFromBase) continue;

            // Rate from other currency to base (inverse)
            const rateToBase = 1 / rateFromBase;

            await prisma.exchangeRate.upsert({
                where: {
                    fromCurrency_toCurrency: { fromCurrency: currency, toCurrency: baseCurrency },
                },
                create: {
                    fromCurrency: currency,
                    toCurrency: baseCurrency,
                    rate: rateToBase,
                    lastUpdated: new Date(),
                },
                update: {
                    rate: rateToBase,
                    lastUpdated: new Date(),
                },
            });
            updated++;
        }

        return NextResponse.json({
            success: true,
            base: baseCurrency,
            updated,
            message: `Updated ${updated} exchange rates to ${baseCurrency}`,
        });
    } catch (error) {
        console.error('Refresh exchange rates error:', error);
        return NextResponse.json(
            { error: 'Failed to refresh exchange rates', details: String(error) },
            { status: 500 }
        );
    }
}
