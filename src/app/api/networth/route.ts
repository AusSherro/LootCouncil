import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { getExchangeRate } from '@/lib/exchangeRate';

const HOME_CURRENCY = 'AUD';

interface AssetWithLots {
    id: string;
    quantity: number;
    currentPrice: number;
    currency: string | null;
    isManual: boolean;
    createdAt: Date;
    lots: Array<{
        purchaseDate: Date;
        units: number;
        unitPrice: number;
        soldUnits: number;
        soldDate: Date | null;
    }>;
}

// Calculate asset value at a given date using lot history for accurate holdings
function calculateAssetValueAtDate(
    assets: AssetWithLots[],
    asAtDate: Date,
    rates: { [key: string]: number }
): number {
    let totalValue = 0;

    for (const asset of assets) {
        let quantity: number;

        if (asset.lots.length > 0) {
            // Use lot data to determine historical quantity held at this date
            quantity = 0;
            for (const lot of asset.lots) {
                if (lot.purchaseDate <= asAtDate) {
                    // Lot was purchased by this date — add its units
                    let held = lot.units;
                    // If sold by this date, subtract sold units
                    if (lot.soldDate && lot.soldDate <= asAtDate) {
                        held -= lot.soldUnits;
                    }
                    quantity += Math.max(0, held);
                }
            }
        } else if (asset.isManual) {
            // Manual assets without lots: include from createdAt
            quantity = asset.createdAt <= asAtDate ? asset.quantity : 0;
        } else {
            // Non-manual assets without lots: include from createdAt
            quantity = asset.createdAt <= asAtDate ? asset.quantity : 0;
        }

        if (quantity > 0) {
            const nativeValue = Math.round(quantity * asset.currentPrice);
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
    const excludeAssetClassParam = searchParams.get('excludeAssetClass') || '';

    const excludeAccountIds = excludeAccountsParam ? excludeAccountsParam.split(',') : [];
    const excludeAssetIds = excludeAssetsParam ? excludeAssetsParam.split(',') : [];
    const excludeAssetClasses = excludeAssetClassParam ? excludeAssetClassParam.split(',') : [];

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

        // Determine each account's effective start date: earliest transaction or createdAt
        const accountStartMap = new Map<string, Date>();
        for (const account of accounts) {
            accountStartMap.set(account.id, account.createdAt);
        }
        for (const txn of transactions) {
            const current = accountStartMap.get(txn.accountId);
            if (current && txn.date < current) {
                accountStartMap.set(txn.accountId, txn.date);
            }
        }

        // Get all assets with lots (not excluded)
        const allAssets: AssetWithLots[] = await prisma.asset.findMany({
            where: {
                profileId,
                id: { notIn: excludeAssetIds },
                ...(excludeAssetClasses.length > 0 ? { assetClass: { notIn: excludeAssetClasses } } : {}),
            },
            include: {
                lots: {
                    select: {
                        purchaseDate: true,
                        units: true,
                        unitPrice: true,
                        soldUnits: true,
                        soldDate: true,
                    },
                },
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
            // All time: find earliest transaction, account start, or asset lot purchase
            const earliestTx = transactions.length > 0 ? transactions[0].date : now;
            const earliestAccountStart = accountStartMap.size > 0
                ? [...accountStartMap.values()].reduce((min, d) => d < min ? d : min)
                : now;
            const earliestLot = allAssets.flatMap(a => a.lots.map(l => l.purchaseDate));
            const earliestAsset = allAssets.length > 0
                ? allAssets.reduce((min, a) => a.createdAt < min ? a.createdAt : min, allAssets[0].createdAt)
                : now;
            const candidates = [earliestTx, earliestAccountStart, earliestAsset, ...earliestLot];
            startDate.setTime(Math.min(...candidates.map(d => d.getTime())));
        }
        startDate.setDate(1); // Start of month

        // Calculate running balance at each month-end, per account
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

        // Pre-sort month keys for efficient lookups
        const sortedMonthKeys = [...monthlyBalances.keys()].sort();

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
            // Use earliest transaction date to determine when an account "existed"
            let balance = 0;
            for (const accountId of accountIds) {
                const accountStart = accountStartMap.get(accountId);
                if (accountStart && accountStart <= monthEnd) {
                    // Find the last known balance for this account up to this month
                    let lastBalance = 0;
                    for (const key of sortedMonthKeys) {
                        if (key > monthKey) break;
                        const accountBalances = monthlyBalances.get(key)!;
                        if (accountBalances.has(accountId)) {
                            lastBalance = accountBalances.get(accountId)!;
                        }
                    }
                    balance += lastBalance;
                }
            }

            // Calculate asset value using lot-aware historical quantities
            const assetValue = calculateAssetValueAtDate(allAssets, monthEnd, rates);

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
        const currentAssetValue = calculateAssetValueAtDate(allAssets, now, rates);

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
