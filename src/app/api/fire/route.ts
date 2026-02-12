import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET FIRE calculations and settings
export async function GET() {
    try {
        // Get or create FIRE settings
        let settings = await prisma.fireSettings.findUnique({
            where: { id: 'default' },
        });

        if (!settings) {
            settings = await prisma.fireSettings.create({
                data: { id: 'default' },
            });
        }

        // Get total investment value (excluding super)
        const assets = await prisma.asset.findMany({
            include: { lots: true },
        });

        let totalInvestments = 0;
        let superBalance = 0;

        for (const asset of assets) {
            const totalUnits = asset.lots.reduce((sum, lot) => sum + (lot.units - lot.soldUnits), 0);
            const value = asset.isManual ? asset.currentPrice : Math.round(totalUnits * asset.currentPrice);
            
            if (asset.assetClass === 'super') {
                superBalance += value;
            } else {
                totalInvestments += value;
            }
        }

        // Get cash savings from accounts
        const accounts = await prisma.account.findMany({
            where: { closed: false },
        });
        const cashBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

        // Calculate FIRE numbers
        const currentAge = new Date().getFullYear() - settings.yearOfBirth;
        const yearsToRetirement = settings.retirementAge - currentAge;
        const yearsToPreservation = settings.preservationAge - currentAge;

        // Pre-Super FIRE (accessible before preservation age)
        const preSuperNetWorth = totalInvestments + cashBalance;
        
        // Total Net Worth (including super)
        const totalNetWorth = preSuperNetWorth + superBalance;

        // Calculate FIRE number based on expenses and withdrawal rate
        // FIRE Number = Annual Expenses / Withdrawal Rate
        const annualExpenses = settings.annualExpenses || await calculateAnnualExpenses();
        const fireNumber = settings.withdrawalRate > 0 
            ? Math.round(annualExpenses / settings.withdrawalRate)
            : 0;

        // Pre-Super FIRE number (what you need before preservation age)
        const yearsInEarlyRetirement = yearsToPreservation;
        const preSuperFireNumber = yearsInEarlyRetirement > 0
            ? Math.round(annualExpenses * yearsInEarlyRetirement * 1.03) // Account for inflation
            : 0;

        // Progress calculations
        const fireProgress = fireNumber > 0 ? preSuperNetWorth / fireNumber : 0;

        // Coast FIRE - how much you need now to coast to retirement
        // FV = PV * (1 + r)^n  =>  PV = FV / (1 + r)^n
        const coastFireNumber = yearsToRetirement > 0 
            ? Math.round(fireNumber / Math.pow(1 + settings.expectedReturn, yearsToRetirement))
            : fireNumber;
        const coastFireProgress = coastFireNumber > 0 ? preSuperNetWorth / coastFireNumber : 0;

        // Calculate savings needed per month to reach FIRE
        // Using Future Value of annuity formula
        const additionalNeeded = Math.max(0, fireNumber - preSuperNetWorth);
        const monthlyRate = settings.expectedReturn / 12;
        const monthsToRetirement = yearsToRetirement * 12;
        
        let monthlySavingsNeeded = 0;
        if (monthsToRetirement > 0 && monthlyRate > 0 && additionalNeeded > 0) {
            // PMT = FV * r / ((1 + r)^n - 1)
            monthlySavingsNeeded = Math.round(
                additionalNeeded * monthlyRate / (Math.pow(1 + monthlyRate, monthsToRetirement) - 1)
            );
        }

        // Calculate projected FIRE date at current savings rate
        // This would need transaction history - simplified for now

        return NextResponse.json({
            settings: {
                ...settings,
                annualExpenses: settings.annualExpenses || annualExpenses,
            },
            calculations: {
                currentAge,
                yearsToRetirement,
                yearsToPreservation,
                
                // Balances
                preSuperNetWorth,
                superBalance,
                totalNetWorth,
                cashBalance,
                investmentsBalance: totalInvestments,
                
                // FIRE Numbers
                fireNumber,
                preSuperFireNumber,
                coastFireNumber,
                
                // Progress (0-1)
                fireProgress: Math.min(fireProgress, 1),
                coastFireProgress: Math.min(coastFireProgress, 1),
                
                // What to do
                additionalNeeded,
                monthlySavingsNeeded,
                
                // Milestones
                isCoastFire: preSuperNetWorth >= coastFireNumber,
                isFire: preSuperNetWorth >= fireNumber,
            },
        });
    } catch (error) {
        console.error('Failed to calculate FIRE:', error);
        return NextResponse.json({ error: 'Failed to calculate FIRE metrics' }, { status: 500 });
    }
}

// POST update FIRE settings
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const settings = await prisma.fireSettings.upsert({
            where: { id: 'default' },
            update: {
                ...(body.yearOfBirth !== undefined && { yearOfBirth: body.yearOfBirth }),
                ...(body.retirementAge !== undefined && { retirementAge: body.retirementAge }),
                ...(body.preservationAge !== undefined && { preservationAge: body.preservationAge }),
                ...(body.annualExpenses !== undefined && { annualExpenses: body.annualExpenses }),
                ...(body.withdrawalRate !== undefined && { withdrawalRate: body.withdrawalRate }),
                ...(body.inflationRate !== undefined && { inflationRate: body.inflationRate }),
                ...(body.expectedReturn !== undefined && { expectedReturn: body.expectedReturn }),
                ...(body.annualSuperContrib !== undefined && { annualSuperContrib: body.annualSuperContrib }),
                ...(body.employerContribRate !== undefined && { employerContribRate: body.employerContribRate }),
            },
            create: {
                id: 'default',
                ...body,
            },
        });

        return NextResponse.json(settings);
    } catch (error) {
        console.error('Failed to update FIRE settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}

// Helper to estimate annual expenses from transaction history
async function calculateAnnualExpenses(): Promise<number> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const transactions = await prisma.transaction.findMany({
        where: {
            date: { gte: oneYearAgo },
            amount: { lt: 0 }, // Expenses only
        },
        select: { amount: true },
    });

    const totalExpenses = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return totalExpenses;
}
