import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET all lots for an asset
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const assetId = searchParams.get('assetId');

        const lots = await prisma.assetLot.findMany({
            where: assetId ? { assetId } : undefined,
            include: {
                asset: {
                    select: { symbol: true, name: true, currentPrice: true },
                },
            },
            orderBy: { purchaseDate: 'desc' },
        });

        // Calculate CGT eligibility and unrealized gains
        const now = new Date();
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const lotsWithCgt = lots.map(lot => {
            const remainingUnits = lot.units - lot.soldUnits;
            const remainingCost = (remainingUnits / lot.units) * lot.totalCost;
            const currentValue = remainingUnits * lot.asset.currentPrice;
            const unrealizedGain = currentValue - remainingCost;
            const isEligibleForDiscount = lot.purchaseDate <= oneYearAgo;
            const holdingDays = Math.floor((now.getTime() - lot.purchaseDate.getTime()) / (1000 * 60 * 60 * 24));

            return {
                ...lot,
                remainingUnits,
                remainingCost: Math.round(remainingCost),
                currentValue: Math.round(currentValue),
                unrealizedGain: Math.round(unrealizedGain),
                unrealizedGainPct: remainingCost > 0 ? unrealizedGain / remainingCost : 0,
                isEligibleForDiscount,
                holdingDays,
            };
        });

        return NextResponse.json(lotsWithCgt);
    } catch (error) {
        console.error('Failed to fetch lots:', error);
        return NextResponse.json({ error: 'Failed to fetch lots' }, { status: 500 });
    }
}

// POST create new lot (purchase)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { assetId, purchaseDate, units, unitPrice, brokerage } = body;

        if (!assetId || !purchaseDate || !units || !unitPrice) {
            return NextResponse.json({ 
                error: 'assetId, purchaseDate, units, and unitPrice are required' 
            }, { status: 400 });
        }

        // unitPrice and brokerage are already in cents from the client
        const parsedUnits = parseFloat(units);
        const parsedUnitPrice = Math.round(parseFloat(unitPrice));
        const parsedBrokerage = Math.round(parseFloat(brokerage) || 0);
        const totalCost = Math.round(parsedUnits * parsedUnitPrice) + parsedBrokerage;

        const lot = await prisma.assetLot.create({
            data: {
                assetId,
                purchaseDate: new Date(purchaseDate),
                units: parsedUnits,
                unitPrice: parsedUnitPrice,
                totalCost,
                brokerage: parsedBrokerage,
            },
        });

        // Update asset quantity and cost basis
        await updateAssetTotals(assetId);

        return NextResponse.json(lot);
    } catch (error) {
        console.error('Failed to create lot:', error);
        return NextResponse.json({ error: 'Failed to create lot' }, { status: 500 });
    }
}

// Helper to update asset totals from lots
async function updateAssetTotals(assetId: string) {
    const lots = await prisma.assetLot.findMany({
        where: { assetId },
    });

    const totalUnits = lots.reduce((sum, lot) => sum + (lot.units - lot.soldUnits), 0);
    const totalCostBasis = lots.reduce((sum, lot) => {
        const remainingUnits = lot.units - lot.soldUnits;
        return sum + (remainingUnits / lot.units) * lot.totalCost;
    }, 0);

    await prisma.asset.update({
        where: { id: assetId },
        data: {
            quantity: totalUnits,
            costBasis: Math.round(totalCostBasis),
        },
    });
}
