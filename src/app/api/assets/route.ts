import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Helper to fetch quote from Yahoo Finance
async function fetchQuote(symbol: string) {
    try {
        const res = await fetch(
            `${YAHOO_QUOTE_URL}/${symbol.toUpperCase()}?interval=1d&range=1d`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            }
        );

        if (!res.ok) return null;

        const data = await res.json();
        const result = data.chart?.result?.[0];
        if (!result) return null;

        const meta = result.meta;
        const currentPrice = meta.regularMarketPrice || meta.previousClose || 0;

        // Determine asset class
        let assetClass = 'stocks';
        const exchangeName = (meta.exchangeName || '').toLowerCase();
        const quoteType = (meta.instrumentType || '').toLowerCase();
        
        if (quoteType.includes('crypto') || symbol.includes('-USD') || exchangeName.includes('ccc')) {
            assetClass = 'crypto';
        } else if (quoteType.includes('etf') || exchangeName.includes('etf')) {
            assetClass = 'etf';
        }

        return {
            symbol: meta.symbol || symbol,
            name: meta.longName || meta.shortName || symbol,
            price: currentPrice,
            assetClass,
            currency: meta.currency || 'USD',
        };
    } catch {
        return null;
    }
}

// GET all assets
export async function GET() {
    try {
        const assets = await prisma.asset.findMany({
            orderBy: { symbol: 'asc' },
        });

        return NextResponse.json({ assets });
    } catch (error) {
        console.error('Error fetching assets:', error);
        return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
    }
}

// POST create new asset - auto-fetches name and price if not a manual asset
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { quantity, costBasis, isManual } = body;
        let { symbol, name, assetClass, currentPrice, currency } = body;

        if (!symbol && !name) {
            return NextResponse.json(
                { error: 'Symbol or name is required' },
                { status: 400 }
            );
        }

        // For manual assets, use name as symbol if no symbol provided
        if (isManual && !symbol) {
            symbol = name.toUpperCase().replace(/\s+/g, '_').slice(0, 10);
        } else if (symbol) {
            symbol = symbol.toUpperCase();
        }

        // Only auto-fetch for non-manual assets
        if (!isManual && (!name || !currentPrice)) {
            const quote = await fetchQuote(symbol);
            if (quote) {
                if (!name) name = quote.name;
                if (!currentPrice) currentPrice = quote.price;
                if (!assetClass) assetClass = quote.assetClass;
                if (!currency) currency = quote.currency;
            }
        }

        // Default asset class and currency
        if (!assetClass) assetClass = isManual ? 'other' : 'stocks';
        if (!currency) currency = 'AUD'; // Default to AUD for manual assets

        // Check if asset already exists
        const existing = await prisma.asset.findFirst({
            where: { symbol },
        });

        if (existing) {
            // For manual assets, just update the value
            if (isManual || existing.isManual) {
                const updated = await prisma.asset.update({
                    where: { id: existing.id },
                    data: {
                        currentPrice: currentPrice ? Math.round(currentPrice * 100) : existing.currentPrice,
                        costBasis: costBasis ? Math.round(costBasis * 100) : existing.costBasis,
                        lastUpdated: new Date(),
                    },
                });
                return NextResponse.json(updated);
            }
            
            // For tracked assets, add quantity
            const updated = await prisma.asset.update({
                where: { id: existing.id },
                data: {
                    quantity: (existing.quantity || 0) + (quantity ?? 0),
                    costBasis: (existing.costBasis || 0) + (costBasis ? Math.round(costBasis * 100) : 0),
                    currentPrice: currentPrice ? Math.round(currentPrice * 100) : existing.currentPrice,
                    currency,
                    lastUpdated: new Date(),
                },
            });
            return NextResponse.json(updated);
        }

        const asset = await prisma.asset.create({
            data: {
                symbol,
                name: name || symbol,
                assetClass,
                quantity: isManual ? 1 : (quantity ?? 0),
                costBasis: costBasis ? Math.round(costBasis * 100) : 0,
                currentPrice: currentPrice ? Math.round(currentPrice * 100) : 0,
                currency,
                isManual: isManual || false,
                lastUpdated: new Date(),
            },
        });

        return NextResponse.json(asset, { status: 201 });
    } catch (error) {
        console.error('Error creating asset:', error);
        return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 });
    }
}

// PUT - Refresh all tracked (non-manual) asset prices from market data
export async function PUT() {
    try {
        // Only refresh non-manual assets
        const assets = await prisma.asset.findMany({
            where: { isManual: false },
        });
        
        if (assets.length === 0) {
            return NextResponse.json({ message: 'No tracked assets to refresh', updated: 0 });
        }

        let updated = 0;
        const errors: string[] = [];

        for (const asset of assets) {
            const quote = await fetchQuote(asset.symbol);
            
            if (quote) {
                await prisma.asset.update({
                    where: { id: asset.id },
                    data: {
                        currentPrice: Math.round(quote.price * 100),
                        name: asset.name === asset.symbol ? quote.name : asset.name,
                        currency: quote.currency,
                        lastUpdated: new Date(),
                    },
                });
                updated++;
            } else {
                errors.push(asset.symbol);
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Count manual assets that were skipped
        const manualCount = await prisma.asset.count({ where: { isManual: true } });

        return NextResponse.json({
            message: `Refreshed ${updated} of ${assets.length} tracked assets`,
            updated,
            total: assets.length,
            manualSkipped: manualCount,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error('Error refreshing assets:', error);
        return NextResponse.json({ error: 'Failed to refresh assets' }, { status: 500 });
    }
}

// DELETE asset by ID (via query param)
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Missing required field: id' },
                { status: 400 }
            );
        }

        await prisma.asset.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting asset:', error);
        return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
    }
}

// PATCH - Update a manual asset's value
export async function PATCH(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const body = await request.json();
        const { currentPrice } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'Missing required field: id' },
                { status: 400 }
            );
        }

        if (typeof currentPrice !== 'number') {
            return NextResponse.json(
                { error: 'Missing or invalid currentPrice' },
                { status: 400 }
            );
        }

        const asset = await prisma.asset.update({
            where: { id },
            data: {
                currentPrice: Math.round(currentPrice * 100),
                lastUpdated: new Date(),
            },
        });

        return NextResponse.json(asset);
    } catch (error) {
        console.error('Error updating asset:', error);
        return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 });
    }
}
