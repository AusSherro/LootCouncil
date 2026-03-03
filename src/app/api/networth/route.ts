import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';

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

interface AssetForCalc {
    id: string;
    quantity: number;
    currentPrice: number;
    currency: string | null;
    createdAt: Date;
}

// Calculate asset value for assets that existed at a given date
async function calculateAssetValueAtDate(
    assets: AssetForCalc[],
    asAtDate: Date,
    rates: { [key: string]: number }
): Promise<number> {
    let totalValue = 0;
    
    for (const asset of assets) {
        // Only include asset if it existed at this date
        if (asset.createdAt <= asAtDate) {
            const nativeValue = Math.round(asset.quantity * asset.currentPrice);
            const rate = rates[asset.currency || 'USD'] || 1;
            totalValue += Math.round(nativeValue * rate);
        }
    }
    
    return totalValue;
}

// GET net worth history - calculates running account balances by month
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get('months') || '12');
    const excludeAccountsParam = searchParams.get('excludeAccounts') || '';
    const excludeAssetsParam = searchParams.get('excludeAssets') || '';
    
    const excludeAccountIds = excludeAccountsParam ? excludeAccountsParam.split(',') : [];
    const excludeAssetIds = excludeAssetsParam ? excludeAssetsParam.split(',') : [];

    try {
        // Get all on-budget accounts (not excluded)
        const accounts = await prisma.account.findMany({
            where: { 
                profileId,
                onBudget: true,
                id: { notIn: excludeAccountIds },
            },
            select: { id: true, createdAt: true },
        });
        const accountIds = accounts.map(a => a.id);
        const accountCreatedMap = new Map(accounts.map(a => [a.id, a.createdAt]));

        // Get all transactions with dates, ordered by date
        const transactions = await prisma.transaction.findMany({
            where: {
                accountId: { in: accountIds },
            },
            select: {
                date: true,
                amount: true,
                accountId: true,
            },
            orderBy: { date: 'asc' },
        });

        // Get all assets (not excluded)
        const allAssets = await prisma.asset.findMany({
            where: {
                profileId,
                id: { notIn: excludeAssetIds },
            },
        });

        // Pre-fetch all exchange rates we'll need
        const currencies = [...new Set(allAssets.map(a => a.currency || 'USD'))];
        const rates: { [key: string]: number } = { [HOME_CURRENCY]: 1 };
        for (const currency of currencies) {
            if (currency !== HOME_CURRENCY) {
                rates[currency] = await getExchangeRate(currency, HOME_CURRENCY);
            }
        }

        // Find the date range
        const now = new Date();
        const startDate = new Date(now);
        if (months > 0) {
            startDate.setMonth(startDate.getMonth() - months);
        } else {
            // All time: find earliest transaction or account creation
            const earliestTx = transactions.length > 0 ? transactions[0].date : now;
            const earliestAccount = accounts.length > 0 
                ? accounts.reduce((min, a) => a.createdAt < min ? a.createdAt : min, accounts[0].createdAt)
                : now;
            const earliestAsset = allAssets.length > 0
                ? allAssets.reduce((min, a) => a.createdAt < min ? a.createdAt : min, allAssets[0].createdAt)
                : now;
            startDate.setTime(Math.min(earliestTx.getTime(), earliestAccount.getTime(), earliestAsset.getTime()));
        }
        startDate.setDate(1); // Start of month

        // Calculate running balance at each month-end, per account
        // Only start counting an account from when it was created
        const monthlyBalances: Map<string, Map<string, number>> = new Map(); // month -> (accountId -> balance)
        const accountRunningBalance: Map<string, number> = new Map();
        
        for (const accountId of accountIds) {
            accountRunningBalance.set(accountId, 0);
        }

        for (const txn of transactions) {
            const accountId = txn.accountId;
            const currentBalance = accountRunningBalance.get(accountId) || 0;
            const newBalance = currentBalance + txn.amount;
            accountRunningBalance.set(accountId, newBalance);

            const monthKey = `${txn.date.getFullYear()}-${String(txn.date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyBalances.has(monthKey)) {
                monthlyBalances.set(monthKey, new Map());
            }
            monthlyBalances.get(monthKey)!.set(accountId, newBalance);
        }

        // Generate the history
        const history: Array<{ month: string; netWorth: number; accountBalance: number; assetValue: number }> = [];
        const currentDate = new Date(startDate);

        while (currentDate <= now) {
            const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
            const monthLabel = months > 12 || months === 0
                ? currentDate.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
                : currentDate.toLocaleDateString('en-AU', { month: 'short' });

            // Calculate account balance at end of this month
            // Only include accounts that existed by this date
            let balance = 0;
            for (const accountId of accountIds) {
                const accountCreated = accountCreatedMap.get(accountId);
                if (accountCreated && accountCreated <= monthEnd) {
                    // Find the last known balance for this account up to this month
                    let lastBalance = 0;
                    for (const [key, accountBalances] of monthlyBalances) {
                        if (key <= monthKey && accountBalances.has(accountId)) {
                            lastBalance = accountBalances.get(accountId)!;
                        }
                    }
                    balance += lastBalance;
                }
            }

            // Calculate asset value - only include assets that existed at this date
            const assetValue = await calculateAssetValueAtDate(allAssets, monthEnd, rates);

            history.push({
                month: monthLabel,
                netWorth: (balance + assetValue) / 100,
                accountBalance: balance / 100,
                assetValue: assetValue / 100,
            });

            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        // Current totals
        const currentAccounts = await prisma.account.findMany({
            where: { 
                profileId,
                onBudget: true,
                id: { notIn: excludeAccountIds },
            },
        });
        const totalAccountBalance = currentAccounts.reduce((sum, a) => sum + a.balance, 0);
        const currentAssetValue = await calculateAssetValueAtDate(allAssets, now, rates);

        // Also return list of accounts and assets for the UI filter
        const allAccountsForFilter = await prisma.account.findMany({
            where: { onBudget: true, profileId },
            select: { id: true, name: true, type: true },
            orderBy: { name: 'asc' },
        });
        const allAssetsForFilter = await prisma.asset.findMany({
            where: { profileId },
            select: { id: true, name: true, symbol: true, assetClass: true },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({
            history,
            currentNetWorth: totalAccountBalance + currentAssetValue,
            accountBalance: totalAccountBalance,
            assetValue: currentAssetValue,
            // For filter UI
            availableAccounts: allAccountsForFilter,
            availableAssets: allAssetsForFilter,
        });
    } catch (error) {
        console.error('Error fetching net worth history:', error);
        return NextResponse.json({ error: 'Failed to fetch net worth history' }, { status: 500 });
    }
}
