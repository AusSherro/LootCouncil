import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { z } from 'zod';
import { finiteNumber, idString, isoDate, MAX_AMOUNT_CENTS, parseBody } from '@/lib/validation';

// GET all lots for an asset
export async function GET(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const { searchParams } = new URL(request.url);
        const assetId = searchParams.get('assetId');

        const lots = await prisma.assetLot.findMany({
            where: assetId ? { assetId, asset: { profileId } } : { asset: { profileId } },
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

// unitPrice and brokerage arrive in cents but may be fractional (the form
// multiplies a dollar input by 100); they are rounded below.
const centsInput = finiteNumber.refine(
    value => value >= 0 && value <= MAX_AMOUNT_CENTS,
    'must be a non-negative amount in cents',
);

const createLotSchema = z.object({
    assetId: idString,
    purchaseDate: isoDate,
    units: finiteNumber.refine(value => value > 0 && value <= 1e12, 'must be greater than 0'),
    unitPrice: centsInput.refine(value => value > 0, 'must be greater than 0'),
    brokerage: centsInput.nullish(),
});

// POST create new lot (purchase)
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const parsed = await parseBody(request, createLotSchema);
        if (!parsed.success) return parsed.response;
        const { assetId, purchaseDate, units, unitPrice, brokerage } = parsed.data;

        // Verify asset belongs to profile
        const asset = await prisma.asset.findUnique({ where: { id: assetId, profileId } });
        if (!asset) {
            return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
        }

        const parsedUnits = units;
        const parsedUnitPrice = Math.round(unitPrice);
        const parsedBrokerage = Math.round(brokerage ?? 0);
        const totalCost = Math.round(parsedUnits * parsedUnitPrice) + parsedBrokerage;

        const lot = await prisma.assetLot.create({
            data: {
                assetId,
                purchaseDate,
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
