import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { z } from 'zod';
import { parseBody, requiredText } from '@/lib/validation';
import { getExchangeRate } from '@/lib/exchangeRate';

const HOME_CURRENCY = 'AUD';

// GET allocation targets with current allocations
export async function GET(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        // Get all assets to calculate current allocations
        const assets = await prisma.asset.findMany({
            where: { profileId },
            include: { lots: true },
        });

        // Convert every asset to the home currency before comparing them. Summing
        // raw native-currency values would make USD holdings look smaller than they
        // are, skewing both the allocation percentages and the rebalancing deltas.
        const currencies = [...new Set(assets.map(a => a.currency || 'USD'))];
        const rates: Record<string, number> = { [HOME_CURRENCY]: 1 };
        for (const currency of currencies) {
            if (currency !== HOME_CURRENCY) {
                rates[currency] = await getExchangeRate(currency, HOME_CURRENCY);
            }
        }

        // Calculate current value by asset class, excluding Super
        const currentByClass: Record<string, number> = {};
        let totalValue = 0;

        for (const asset of assets) {
            // Exclude Super from allocation calculations (it's a long-term locked asset)
            if (asset.assetClass === 'super') continue;
            
            // Use lots if available, otherwise use asset.quantity (for Binance/external syncs)
            const lotsUnits = asset.lots.reduce((sum, lot) => sum + (lot.units - lot.soldUnits), 0);
            const totalUnits = lotsUnits > 0 ? lotsUnits : asset.quantity;
            const nativeValue = asset.isManual ? asset.currentPrice : Math.round(totalUnits * asset.currentPrice);
            const rate = rates[asset.currency || 'USD'] || 1;
            const value = Math.round(nativeValue * rate);
            
            if (!currentByClass[asset.assetClass]) {
                currentByClass[asset.assetClass] = 0;
            }
            currentByClass[asset.assetClass] += value;
            totalValue += value;
        }

        // Get targets
        const targets = await prisma.allocationTarget.findMany({
            where: { profileId },
            orderBy: { priority: 'desc' },
        });

        // Combine current allocations with targets
        const allAssetClasses = new Set([
            ...Object.keys(currentByClass),
            ...targets.map(t => t.assetClass),
        ]);

        const allocations = Array.from(allAssetClasses).map(assetClass => {
            const target = targets.find(t => t.assetClass === assetClass);
            const currentValue = currentByClass[assetClass] || 0;
            const currentPct = totalValue > 0 ? currentValue / totalValue : 0;
            const targetPct = target?.targetPct || 0;
            const deltaPct = currentPct - targetPct;
            
            // Calculate amount to reach target
            const targetValue = totalValue * targetPct;
            const deltaValue = currentValue - targetValue;

            return {
                assetClass,
                currentValue,
                currentPct,
                targetPct,
                deltaPct,
                deltaValue: Math.round(deltaValue),
                priority: target?.priority || 0,
                id: target?.id,
            };
        });

        // Sort by delta (most underweight first for "invest next" recommendation)
        allocations.sort((a, b) => a.deltaPct - b.deltaPct);

        // Find what to invest in next (most underweight with target > 0)
        const investNext = allocations.find(a => a.targetPct > 0 && a.deltaPct < 0);

        return NextResponse.json({
            allocations,
            totalValue,
            investNext: investNext?.assetClass || null,
            investNextAmount: investNext ? Math.abs(investNext.deltaValue) : 0,
        });
    } catch (error) {
        console.error('Failed to fetch allocations:', error);
        return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 });
    }
}

const allocationTargetsSchema = z.object({
    targets: z.array(z.object({
        assetClass: requiredText(30),
        targetPct: z.number().finite().min(0).max(1).nullish(),
        priority: z.number().int().min(0).max(1000).nullish(),
    })).max(50),
});

// POST/PUT update allocation targets
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const parsed = await parseBody(request, allocationTargetsSchema);
        if (!parsed.success) return parsed.response;
        const { targets } = parsed.data;

        // Validate total doesn't exceed 100%
        const totalTarget = targets.reduce((sum, t) => sum + (t.targetPct || 0), 0);
        if (totalTarget > 1.001) { // Allow tiny floating point tolerance
            return NextResponse.json({ 
                error: `Target allocations sum to ${(totalTarget * 100).toFixed(1)}%, must be <= 100%` 
            }, { status: 400 });
        }

        // Upsert each target scoped to the active profile
        await prisma.$transaction(async (tx) => {
            for (const target of targets) {
                if (!target.assetClass) continue;

                const existing = await tx.allocationTarget.findFirst({
                    where: { profileId, assetClass: target.assetClass },
                });

                if (existing) {
                    await tx.allocationTarget.update({
                        where: { id: existing.id },
                        data: {
                            targetPct: target.targetPct || 0,
                            priority: target.priority || 0,
                        },
                    });
                } else {
                    // Also check if an orphaned profileId: null row exists for this assetClass
                    const orphaned = await tx.allocationTarget.findFirst({
                        where: { profileId: null, assetClass: target.assetClass },
                    });
                    if (orphaned) {
                        await tx.allocationTarget.update({
                            where: { id: orphaned.id },
                            data: {
                                profileId,
                                targetPct: target.targetPct || 0,
                                priority: target.priority || 0,
                            },
                        });
                    } else {
                        await tx.allocationTarget.create({
                            data: {
                                assetClass: target.assetClass,
                                targetPct: target.targetPct || 0,
                                priority: target.priority || 0,
                                profileId,
                            },
                        });
                    }
                }
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to update allocations:', error);
        return NextResponse.json({ error: 'Failed to update allocations' }, { status: 500 });
    }
}
