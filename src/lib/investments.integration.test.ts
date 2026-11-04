import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from './prisma';
import { GET as getInvestments } from '@/app/api/investments/route';

let profileId: string;

beforeAll(async () => {
    const profile = await prisma.profile.create({
        data: { name: 'Investment Currency Profile' },
    });
    profileId = profile.id;

    await prisma.exchangeRate.upsert({
        where: {
            fromCurrency_toCurrency: { fromCurrency: 'USD', toCurrency: 'AUD' },
        },
        create: {
            fromCurrency: 'USD',
            toCurrency: 'AUD',
            rate: 1.42,
            lastUpdated: new Date(),
        },
        update: {
            rate: 1.42,
            lastUpdated: new Date(),
        },
    });

    await prisma.asset.createMany({
        data: [
            {
                symbol: 'USD-ASSET',
                name: 'USD Asset',
                assetClass: 'stock',
                currency: 'USD',
                quantity: 2,
                costBasis: 15000,
                currentPrice: 10000,
                dividendYield: 0.05,
                profileId,
            },
            {
                symbol: 'AUD-ASSET',
                name: 'AUD Asset',
                assetClass: 'stock',
                currency: 'AUD',
                quantity: 1,
                costBasis: 5000,
                currentPrice: 5000,
                isManual: true,
                annualDividend: 600,
                profileId,
            },
        ],
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('investment currency conversion', () => {
    it('converts every USD portfolio aggregate to AUD', async () => {
        const response = await getInvestments(
            new NextRequest(`http://localhost/api/investments?profileId=${profileId}`)
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.rates.USD).toBe(1.42);

        const usdAsset = body.assets.find((asset: { symbol: string }) => asset.symbol === 'USD-ASSET');
        expect(usdAsset).toMatchObject({
            currentValue: 20000,
            currentValueAUD: 28400,
            totalCostBasisAUD: 21300,
            totalReturnAUD: 7100,
            annualDividendIncome: 1000,
            annualDividendIncomeAUD: 1420,
        });

        expect(body.summary).toMatchObject({
            totalValue: 33400,
            totalCostBasis: 26300,
            totalReturn: 7100,
            totalDividends: 2020,
        });
        expect(body.allocations).toEqual([
            expect.objectContaining({
                assetClass: 'stock',
                value: 33400,
                costBasis: 26300,
                currentPct: 1,
                gain: 7100,
            }),
        ]);
    });
});