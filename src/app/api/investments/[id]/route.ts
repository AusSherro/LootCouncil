import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET single asset
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const asset = await prisma.asset.findUnique({
            where: { id },
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

// PATCH update asset
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await request.json();

        const asset = await prisma.asset.update({
            where: { id },
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
        const { id } = await params;
        await prisma.asset.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete asset:', error);
        return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
    }
}
