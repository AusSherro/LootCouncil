import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';

/**
 * Age of Money (AOM) - YNAB's signature financial health metric
 * 
 * Calculation: Average age of money spent in the last 10 outflow transactions
 * - Tracks how long money sits before being spent
 * - Higher = healthier (money sits longer, you're ahead of bills)
 * - Target: 30+ days means you're spending last month's income
 */
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    try {
        // Get all on-budget accounts
        const accounts = await prisma.account.findMany({
            where: { onBudget: true, closed: false, profileId },
            select: { id: true },
        });
        const accountIds = accounts.map(a => a.id);

        if (accountIds.length === 0) {
            return NextResponse.json({ 
                ageOfMoney: 0, 
                status: 'no_accounts',
                message: 'Add on-budget accounts to calculate Age of Money',
            });
        }

        // Get ALL outflow transactions sorted by date (oldest first)
        // Exclude transfers - only count actual spending
        const allOutflows = await prisma.transaction.findMany({
            where: {
                accountId: { in: accountIds },
                amount: { lt: 0 }, // Outflows only
                transferId: null, // NOT a transfer - true spending only
            },
            orderBy: { date: 'asc' },
            select: { date: true, amount: true },
        });

        if (allOutflows.length === 0) {
            return NextResponse.json({ 
                ageOfMoney: 0, 
                status: 'no_outflows',
                message: 'Record some expenses to calculate Age of Money',
            });
        }

        // Get all inflow transactions (income) sorted by date
        // IMPORTANT: Exclude transfers (they have transferId) - only count true income
        const allInflows = await prisma.transaction.findMany({
            where: {
                accountId: { in: accountIds },
                amount: { gt: 0 }, // Inflows only
                transferId: null, // NOT a transfer - true income only
            },
            orderBy: { date: 'asc' },
            select: { date: true, amount: true },
        });

        if (allInflows.length === 0) {
            return NextResponse.json({ 
                ageOfMoney: 0, 
                status: 'no_inflows',
                message: 'Record some income to calculate Age of Money',
            });
        }

        // Calculate age using FIFO method
        // Build a queue of income "buckets" with dates and remaining amounts
        const incomeQueue: { date: Date; remaining: number }[] = allInflows.map(i => ({
            date: new Date(i.date),
            remaining: i.amount,
        }));

        // Process ALL outflows to properly deplete income queue
        // Only track age for the last 10 outflows
        const numToTrack = Math.min(10, allOutflows.length);
        const startTrackingIndex = allOutflows.length - numToTrack;
        
        let totalAge = 0;
        let totalSpent = 0;

        for (let i = 0; i < allOutflows.length; i++) {
            const outflow = allOutflows[i];
            const outflowDate = new Date(outflow.date);
            let amountToAssign = Math.abs(outflow.amount);
            const shouldTrack = i >= startTrackingIndex;
            
            // Consume from oldest income first (FIFO)
            while (amountToAssign > 0 && incomeQueue.length > 0) {
                const oldestIncome = incomeQueue[0];
                
                if (oldestIncome.remaining <= 0) {
                    incomeQueue.shift();
                    continue;
                }

                const consume = Math.min(amountToAssign, oldestIncome.remaining);
                
                // Only calculate age for the last 10 outflows
                if (shouldTrack) {
                    const ageInDays = Math.max(0, Math.floor(
                        (outflowDate.getTime() - oldestIncome.date.getTime()) / (1000 * 60 * 60 * 24)
                    ));
                    totalAge += ageInDays * consume;
                    totalSpent += consume;
                }

                oldestIncome.remaining -= consume;
                amountToAssign -= consume;

                if (oldestIncome.remaining <= 0) {
                    incomeQueue.shift();
                }
            }
        }

        const ageOfMoney = totalSpent > 0 ? Math.round(totalAge / totalSpent) : 0;

        // Determine status based on age
        let status: 'critical' | 'warning' | 'good' | 'excellent';
        let message: string;

        if (ageOfMoney < 7) {
            status = 'critical';
            message = 'Living paycheck to paycheck. Focus on building a buffer.';
        } else if (ageOfMoney < 14) {
            status = 'warning';
            message = 'Getting ahead! Keep building your financial buffer.';
        } else if (ageOfMoney < 30) {
            status = 'good';
            message = 'Great progress! You\'re spending 2+ week old money.';
        } else {
            status = 'excellent';
            message = 'Financial freedom! You\'re spending last month\'s income.';
        }

        // Calculate trend (compare to 30 days ago)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const olderOutflows = allOutflows.filter(o => new Date(o.date) < thirtyDaysAgo);

        // Simple trend calculation (positive = improving)
        const trend = olderOutflows.length >= 5 ? 
            (ageOfMoney > 14 ? 'improving' : 'stable') : 
            'insufficient_data';

        return NextResponse.json({
            ageOfMoney,
            status,
            message,
            trend,
            analyzedTransactions: numToTrack,
        });
    } catch (error) {
        console.error('Error calculating Age of Money:', error);
        return NextResponse.json({ error: 'Failed to calculate Age of Money' }, { status: 500 });
    }
}
