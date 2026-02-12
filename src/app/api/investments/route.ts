import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const HOME_CURRENCY = 'AUD';

// Helper to get exchange rate (from cache or fetch)
async function getExchangeRate(from: string, to: string): Promise<number> {
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

// GET all assets with calculated values
export async function GET() {
    try {
        const assets = await prisma.asset.findMany({
            include: {
                lots: {
                    orderBy: { purchaseDate: 'asc' },
                },
            },
            orderBy: [
                { assetClass: 'asc' },
                { symbol: 'asc' },
            ],
        });

        // Get exchange rates for all currencies
        const currencies = [...new Set(assets.map(a => a.currency || 'USD'))];
        const rates: Record<string, number> = { [HOME_CURRENCY]: 1 };
        for (const currency of currencies) {
            if (currency !== HOME_CURRENCY) {
                rates[currency] = await getExchangeRate(currency, HOME_CURRENCY);
            }
        }

        // Calculate totals and returns for each asset
        const now = new Date();
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const assetsWithCalculations = assets.map(asset => {
            // Calculate lot-level details
            const lotsWithDetails = asset.lots.map(lot => {
                const remainingUnits = lot.units - lot.soldUnits;
                const remainingCost = lot.units > 0 ? (remainingUnits / lot.units) * lot.totalCost : 0;
                const currentValue = Math.round(remainingUnits * asset.currentPrice);
                const unrealizedGain = currentValue - remainingCost;
                const isEligibleForDiscount = lot.purchaseDate <= oneYearAgo;
                const holdingDays = Math.floor((now.getTime() - lot.purchaseDate.getTime()) / (1000 * 60 * 60 * 24));

                return {
                    ...lot,
                    remainingUnits,
                    remainingCost: Math.round(remainingCost),
                    currentValue,
                    unrealizedGain: Math.round(unrealizedGain),
                    isEligibleForDiscount,
                    holdingDays,
                };
            });

            // Use lots if available, otherwise use the asset's direct quantity (for Binance/external syncs)
            const lotsUnits = lotsWithDetails.reduce((sum, lot) => sum + lot.remainingUnits, 0);
            const totalUnits = lotsUnits > 0 ? lotsUnits : asset.quantity;
            
            const lotsCostBasis = lotsWithDetails.reduce((sum, lot) => sum + lot.remainingCost, 0);
            const totalCostBasis = lotsCostBasis > 0 ? lotsCostBasis : asset.costBasis;
            
            // For manual assets, use stored values; for others calculate from units * price
            const currentValue = asset.isManual 
                ? asset.currentPrice 
                : Math.round(totalUnits * asset.currentPrice);
            
            const totalReturn = currentValue - totalCostBasis;
            const totalReturnPct = totalCostBasis > 0 ? (totalReturn / totalCostBasis) : 0;
            
            // Dividend income
            const annualDividendIncome = asset.isManual
                ? asset.annualDividend
                : Math.round(totalUnits * (asset.currentPrice * asset.dividendYield));
            
            console.log(`Dividend calc for ${asset.symbol}: units=${totalUnits}, price=${asset.currentPrice}, yield=${asset.dividendYield}, annual=${annualDividendIncome}`);

            // Calculate AUD-converted values for portfolio totals
            const rate = rates[asset.currency || 'USD'] || 1;
            const currentValueAUD = Math.round(currentValue * rate);
            const totalCostBasisAUD = Math.round(totalCostBasis * rate);
            const totalReturnAUD = currentValueAUD - totalCostBasisAUD;

            return {
                ...asset,
                lots: lotsWithDetails,
                totalUnits,
                totalCostBasis: Math.round(totalCostBasis),
                currentValue,
                totalReturn,
                totalReturnPct,
                annualDividendIncome,
                // AUD-converted values for summary
                currentValueAUD,
                totalCostBasisAUD,
                totalReturnAUD,
            };
        });

        // Calculate portfolio totals in AUD (converted)
        const totalValueAUD = assetsWithCalculations.reduce((sum, a) => sum + a.currentValueAUD, 0);
        const totalCostBasisAUD = assetsWithCalculations.reduce((sum, a) => sum + a.totalCostBasisAUD, 0);
        const totalReturnAUD = totalValueAUD - totalCostBasisAUD;
        const totalReturnPctAUD = totalCostBasisAUD > 0 ? (totalReturnAUD / totalCostBasisAUD) : 0;
        const totalDividends = assetsWithCalculations.reduce((sum, a) => sum + a.annualDividendIncome, 0);

        // Also keep native currency totals for reference
        const totalValue = assetsWithCalculations.reduce((sum, a) => sum + a.currentValue, 0);
        const totalCostBasis = assetsWithCalculations.reduce((sum, a) => sum + a.totalCostBasis, 0);

        // Group by asset class
        const byAssetClass = assetsWithCalculations.reduce((acc, asset) => {
            if (!acc[asset.assetClass]) {
                acc[asset.assetClass] = { value: 0, costBasis: 0, assets: [] };
            }
            acc[asset.assetClass].value += asset.currentValue;
            acc[asset.assetClass].costBasis += asset.totalCostBasis;
            acc[asset.assetClass].assets.push(asset);
            return acc;
        }, {} as Record<string, { value: number; costBasis: number; assets: typeof assetsWithCalculations }>);

        // Calculate allocation percentages
        const allocations = Object.entries(byAssetClass).map(([assetClass, data]) => ({
            assetClass,
            value: data.value,
            costBasis: data.costBasis,
            currentPct: totalValue > 0 ? data.value / totalValue : 0,
            gain: data.value - data.costBasis,
            gainPct: data.costBasis > 0 ? (data.value - data.costBasis) / data.costBasis : 0,
        }));

        return NextResponse.json({
            assets: assetsWithCalculations,
            summary: {
                // AUD-converted values for top bar
                totalValue: totalValueAUD,
                totalCostBasis: totalCostBasisAUD,
                totalReturn: totalReturnAUD,
                totalReturnPct: totalReturnPctAUD,
                totalDividends,
                // Native currency totals for reference
                totalValueNative: totalValue,
                totalCostBasisNative: totalCostBasis,
            },
            allocations,
            rates, // Include exchange rates used
        });
    } catch (error) {
        console.error('Failed to fetch investments:', error);
        return NextResponse.json({ error: 'Failed to fetch investments' }, { status: 500 });
    }
}

// POST create new asset
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { symbol, name, assetClass, currency, isManual, currentPrice, dividendYield, stakingYield } = body;

        if (!symbol || !name || !assetClass) {
            return NextResponse.json({ error: 'Symbol, name, and asset class are required' }, { status: 400 });
        }

        // For manual assets, set costBasis = currentPrice so initial entry shows 0% return
        const asset = await prisma.asset.create({
            data: {
                symbol: symbol.toUpperCase(),
                name,
                assetClass,
                currency: currency || 'AUD',
                isManual: isManual || false,
                currentPrice: currentPrice || 0,
                costBasis: isManual ? (currentPrice || 0) : 0,  // Manual assets start with no gain/loss
                quantity: isManual ? 1 : 0,  // Manual assets have 1 "unit" representing the whole value
                dividendYield: dividendYield || 0,
                stakingYield: stakingYield || 0,
            },
        });

        return NextResponse.json(asset);
    } catch (error) {
        console.error('Failed to create asset:', error);
        return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 });
    }
}
