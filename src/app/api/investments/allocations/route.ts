import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';

// GET allocation targets with current allocations
export async function GET(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        // Get all assets to calculate current allocations
        const assets = await prisma.asset.findMany({
            where: { profileId },
            include: { lots: true },
        });

        // Calculate current value by asset class, excluding Super
        const currentByClass: Record<string, number> = {};
        let totalValue = 0;

        for (const asset of assets) {
            // Exclude Super from allocation calculations (it's a long-term locked asset)
            if (asset.assetClass === 'super') continue;
            
            // Use lots if available, otherwise use asset.quantity (for Binance/external syncs)
            const lotsUnits = asset.lots.reduce((sum, lot) => sum + (lot.units - lot.soldUnits), 0);
            const totalUnits = lotsUnits > 0 ? lotsUnits : asset.quantity;
            const value = asset.isManual ? asset.currentPrice : Math.round(totalUnits * asset.currentPrice);
            
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

// POST/PUT update allocation targets
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { targets } = body;

        if (!Array.isArray(targets)) {
            return NextResponse.json({ error: 'targets array is required' }, { status: 400 });
        }

        // Validate total doesn't exceed 100%
        const totalTarget = targets.reduce((sum, t) => sum + (t.targetPct || 0), 0);
        if (totalTarget > 1.001) { // Allow tiny floating point tolerance
            return NextResponse.json({ 
                error: `Target allocations sum to ${(totalTarget * 100).toFixed(1)}%, must be <= 100%` 
            }, { status: 400 });
        }

        // Upsert each target
        for (const target of targets) {
            if (!target.assetClass) continue;

            await prisma.allocationTarget.upsert({
                where: { assetClass: target.assetClass },
                create: {
                    assetClass: target.assetClass,
                    targetPct: target.targetPct || 0,
                    priority: target.priority || 0,
                },
                update: {
                    targetPct: target.targetPct || 0,
                    priority: target.priority || 0,
                },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to update allocations:', error);
        return NextResponse.json({ error: 'Failed to update allocations' }, { status: 500 });
    }
}
