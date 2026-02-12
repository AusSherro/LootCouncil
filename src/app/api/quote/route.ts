import { NextRequest, NextResponse } from 'next/server';

// Yahoo Finance quote endpoint (public, no API key needed)
const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface QuoteResult {
    symbol: string;
    shortName?: string;
    longName?: string;
    regularMarketPrice: number;
    regularMarketChange: number;
    regularMarketChangePercent: number;
    currency: string;
    marketState: string;
}

// GET - Fetch stock/crypto quote by symbol
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.toUpperCase();

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    try {
        // Fetch from Yahoo Finance
        const res = await fetch(
            `${YAHOO_QUOTE_URL}/${symbol}?interval=1d&range=1d`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                next: { revalidate: 60 }, // Cache for 1 minute
            }
        );

        if (!res.ok) {
            return NextResponse.json({ error: 'Symbol not found' }, { status: 404 });
        }

        const data = await res.json();
        const result = data.chart?.result?.[0];

        if (!result) {
            return NextResponse.json({ error: 'Symbol not found' }, { status: 404 });
        }

        const meta = result.meta;
        
        // Get the most recent price
        const currentPrice = meta.regularMarketPrice || meta.previousClose || 0;
        const previousClose = meta.previousClose || meta.chartPreviousClose || currentPrice;
        const change = currentPrice - previousClose;
        const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

        // Determine asset class from exchange/type
        let assetClass = 'stocks';
        const exchangeName = (meta.exchangeName || '').toLowerCase();
        const quoteType = (meta.instrumentType || '').toLowerCase();
        
        if (quoteType.includes('crypto') || symbol.includes('-USD') || exchangeName.includes('ccc')) {
            assetClass = 'crypto';
        } else if (quoteType.includes('etf') || exchangeName.includes('etf')) {
            assetClass = 'etf';
        } else if (quoteType.includes('mutual')) {
            assetClass = 'mutual_fund';
        }

        return NextResponse.json({
            symbol: meta.symbol || symbol,
            name: meta.longName || meta.shortName || symbol,
            shortName: meta.shortName,
            price: currentPrice,
            previousClose,
            change,
            changePercent,
            currency: meta.currency || 'USD',
            exchangeName: meta.exchangeName,
            assetClass,
            marketState: meta.marketState,
        });
    } catch (error) {
        console.error('Quote fetch error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch quote', details: String(error) },
            { status: 500 }
        );
    }
}

// POST - Fetch multiple quotes at once
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { symbols } = body;

        if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
            return NextResponse.json({ error: 'Symbols array required' }, { status: 400 });
        }

        const quotes: QuoteResult[] = [];
        const errors: { symbol: string; error: string }[] = [];

        // Fetch quotes in parallel (max 10 at a time)
        const chunks = [];
        for (let i = 0; i < symbols.length; i += 10) {
            chunks.push(symbols.slice(i, i + 10));
        }

        for (const chunk of chunks) {
            const results = await Promise.all(
                chunk.map(async (symbol: string) => {
                    try {
                        const res = await fetch(
                            `${YAHOO_QUOTE_URL}/${symbol.toUpperCase()}?interval=1d&range=1d`,
                            {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                },
                            }
                        );

                        if (!res.ok) {
                            return { symbol, error: 'Not found' };
                        }

                        const data = await res.json();
                        const result = data.chart?.result?.[0];

                        if (!result) {
                            return { symbol, error: 'Not found' };
                        }

                        const meta = result.meta;
                        const currentPrice = meta.regularMarketPrice || meta.previousClose || 0;
                        const previousClose = meta.previousClose || currentPrice;
                        const change = currentPrice - previousClose;
                        const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

                        return {
                            symbol: meta.symbol || symbol,
                            shortName: meta.shortName,
                            longName: meta.longName,
                            regularMarketPrice: currentPrice,
                            regularMarketChange: change,
                            regularMarketChangePercent: changePercent,
                            currency: meta.currency || 'USD',
                            marketState: meta.marketState,
                        };
                    } catch (err) {
                        return { symbol, error: String(err) };
                    }
                })
            );

            for (const result of results) {
                if ('error' in result && result.error) {
                    errors.push({ symbol: result.symbol || 'unknown', error: result.error });
                } else if (!('error' in result)) {
                    quotes.push(result as QuoteResult);
                }
            }
        }

        return NextResponse.json({ quotes, errors });
    } catch (error) {
        console.error('Bulk quote fetch error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch quotes', details: String(error) },
            { status: 500 }
        );
    }
}
