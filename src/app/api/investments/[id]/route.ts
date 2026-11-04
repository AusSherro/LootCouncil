import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { z } from 'zod';
import { MAX_AMOUNT_CENTS, parseBody, requiredText } from '@/lib/validation';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET single asset
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const profileId = await getProfileId(request);
        const { id } = await params;
        const asset = await prisma.asset.findUnique({
            where: { id, profileId },
            include: {
                lots: {
                    orderBy: { purchaseDate: 'asc' },
                },
            },
        });

        if (!asset) {
            return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
        }

        return NextResponse.json(asset);
    } catch (error) {
        console.error('Failed to fetch asset:', error);
        return NextResponse.json({ error: 'Failed to fetch asset' }, { status: 500 });
    }
}

const assetClass = requiredText(30);
const currency = z.string().trim().min(3).max(10);
// Asset prices are integer cents; yields are decimals (0.04 = 4%).
const priceCents = z.number().int('must be whole cents').min(0).max(MAX_AMOUNT_CENTS);
const yieldDecimal = z.number().finite().min(0).max(10);
const symbol = requiredText(30);

const updateAssetSchema = z.object({
    symbol: symbol.optional(),
    name: requiredText(100).optional(),
    assetClass: assetClass.optional(),
    currency: currency.optional(),
    currentPrice: priceCents.optional(),
    dividendYield: yieldDecimal.optional(),
    stakingYield: yieldDecimal.optional(),
    isManual: z.boolean().optional(),
});

// PATCH update asset
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const profileId = await getProfileId(request);
        const { id } = await params;
        const parsed = await parseBody(request, updateAssetSchema);
        if (!parsed.success) return parsed.response;
        const body = parsed.data;

        const asset = await prisma.asset.update({
            where: { id, profileId },
            data: {
                ...(body.symbol && { symbol: body.symbol.toUpperCase() }),
                ...(body.name && { name: body.name }),
                ...(body.assetClass && { assetClass: body.assetClass }),
                ...(body.currency && { currency: body.currency }),
                ...(body.currentPrice !== undefined && { currentPrice: body.currentPrice }),
                ...(body.dividendYield !== undefined && { dividendYield: body.dividendYield }),
                ...(body.stakingYield !== undefined && { stakingYield: body.stakingYield }),
                ...(body.isManual !== undefined && { isManual: body.isManual }),
                lastUpdated: new Date(),
            },
        });

        return NextResponse.json(asset);
    } catch (error) {
        console.error('Failed to update asset:', error);
        return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 });
    }
}

// DELETE asset
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const profileId = await getProfileId(request);
        const { id } = await params;
        await prisma.asset.delete({ where: { id, profileId } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete asset:', error);
        return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
    }
}
