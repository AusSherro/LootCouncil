'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSettings } from '@/components/SettingsProvider';
import { 
    TrendingUp, 
    Target, 
    ArrowRight, 
    Coins, 
    Calendar,
    ChevronRight,
    ArrowUpRight,
    ArrowDownRight,
    Bell,
    Clock,
    ScrollText,
    AlertCircle,
    RefreshCw,
} from 'lucide-react';
import ScheduledTransactions from '@/components/ScheduledTransactions';
import { SkeletonDashboard } from '@/components/Skeleton';
import { formatCurrency } from '@/lib/utils';
import { fetchJsonCached, clearCachedJson } from '@/lib/clientCache';
import AnimatedNumber from '@/components/AnimatedNumber';

interface DashboardData {
    netWorth: number;
    netWorthChange: number;
    netWorthChangeAmount: number;
    readyToAssign: number;
    accountsTotal: number;
    assetsTotal: number;
    transactionsThisMonth: number;
    ageOfMoney: number;
    recentTransactions: Array<{
        id: string;
        payee: string;
        amount: number;
        date: string;
    }>;
}

interface NetWorthResponse {
    accountBalance?: number;
    assetValue?: number;
    currentNetWorth?: number;
    history?: Array<{ month: string; netWorth: number; accountBalance: number; assetValue: number }>;
}

interface BudgetResponse {
    totals?: {
        readyToAssign?: number;
    };
}

interface TransactionsResponse {
    total?: number;
    transactions?: DashboardData['recentTransactions'];
}

interface AgeOfMoneyResponse {
    ageOfMoney?: number;
}

function formatDashboardCurrency(cents: number, currencyCode: string): string {
    return formatCurrency(cents, currencyCode, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

export default function HomePage() {
    const router = useRouter();
    const { settings } = useSettings();
    const currency = settings?.currency || 'AUD';
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [greeting, setGreeting] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 6) setGreeting('Burning the midnight oil');
        else if (hour < 12) setGreeting('Good morning');
        else if (hour < 17) setGreeting('Good afternoon');
        else if (hour < 21) setGreeting('Good evening');
        else setGreeting('Winding down');

        async function fetchDashboard() {
            setError(null);
            setLoading(true);
            try {
                const [networthRes, budgetRes, transactionsRes, aomRes] = await Promise.allSettled([
                    fetchJsonCached<NetWorthResponse>('/api/networth?months=2', 30_000),
                    fetchJsonCached<BudgetResponse>('/api/budget', 30_000),
                    fetchJsonCached<TransactionsResponse>('/api/transactions?limit=5', 15_000),
                    fetchJsonCached<AgeOfMoneyResponse>('/api/age-of-money', 30_000),
                ]);

                // Check if any critical fetches failed
                if (
                    networthRes.status === 'rejected' &&
                    budgetRes.status === 'rejected' &&
                    transactionsRes.status === 'rejected' &&
                    aomRes.status === 'rejected'
                ) {
                    throw new Error('All dashboard data sources failed to load');
                }

                const networth =
                    networthRes.status === 'fulfilled'
                        ? networthRes.value
                        : { accountBalance: 0, assetValue: 0, currentNetWorth: 0 };
                const budget =
                    budgetRes.status === 'fulfilled'
                        ? budgetRes.value
                        : { totals: { readyToAssign: 0 } };
                const transactions =
                    transactionsRes.status === 'fulfilled'
                        ? transactionsRes.value
                        : { total: 0, transactions: [] };
                const aom =
                    aomRes.status === 'fulfilled'
                        ? aomRes.value
                        : { ageOfMoney: 0 };

                const accountsTotal = networth.accountBalance || 0;
                const assetsTotal = networth.assetValue || 0;
                const currentNetWorth = networth.currentNetWorth || 0;

                // Net-worth delta vs end of last month.
                // history[].netWorth is in dollars; currentNetWorth is in cents.
                const history = networth.history || [];
                const priorEntry = history.length >= 2 ? history[history.length - 2] : null;
                const priorNetWorthCents = priorEntry ? Math.round(priorEntry.netWorth * 100) : 0;
                const netWorthChangeAmount = priorEntry ? currentNetWorth - priorNetWorthCents : 0;
                const netWorthChange = priorEntry && priorNetWorthCents !== 0
                    ? Math.round((netWorthChangeAmount / Math.abs(priorNetWorthCents)) * 1000) / 10
                    : 0;

                setData({
                    netWorth: currentNetWorth,
                    netWorthChange,
                    netWorthChangeAmount,
                    readyToAssign: budget.totals?.readyToAssign || 0,
                    accountsTotal,
                    assetsTotal,
                    transactionsThisMonth: transactions.total || 0,
                    ageOfMoney: aom.ageOfMoney || 0,
                    recentTransactions: (transactions.transactions || []).slice(0, 5),
                });
            } catch (err) {
                console.error('Failed to fetch dashboard:', err);
                setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
            } finally {
                setLoading(false);
            }
        }

        fetchDashboard();
    }, [refreshKey]);

    // Retry handler
    function handleRetry() {
        clearCachedJson('/api/networth?months=2');
        clearCachedJson('/api/budget');
        clearCachedJson('/api/transactions?limit=5');
        clearCachedJson('/api/age-of-money');
        setError(null);
        setLoading(true);
        setData(null);
        setRefreshKey(prev => prev + 1);
    }

    if (loading) {
        return <SkeletonDashboard />;
    }

    if (error) {
        return (
            <div className="min-h-screen p-4 lg:p-8 flex items-center justify-center">
                <div className="card max-w-md w-full text-center p-8 animate-scale-in">
                    <div className="w-16 h-16 rounded-full bg-danger/20 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-danger" />
                    </div>
                    <h2 className="text-xl font-semibold text-foreground mb-2">Dashboard Unavailable</h2>
                    <p className="text-neutral text-sm mb-6">{error}</p>
                    <button
                        onClick={handleRetry}
                        className="btn btn-primary inline-flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 lg:p-8">
            {/* Header */}
            <div className="mb-6 lg:mb-8 animate-slide-up">
                <p className="text-neutral text-sm mb-1">{greeting}</p>
                <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-stagger">
                {/* Net Worth Card - Featured */}
                <div className="lg:col-span-2 card-hero">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-primary" />
                        </div>
                        <span className="text-neutral text-sm">Total Net Worth</span>
                    </div>
                    <div className="flex items-end gap-3 mb-1">
                        <p className="text-2xl font-semibold text-foreground">
                            <AnimatedNumber
                                value={data?.netWorth || 0}
                                formatFn={(v) => formatDashboardCurrency(Math.round(v), currency)}
                            />
                        </p>
                        {data?.netWorthChange !== 0 && (
                            <div
                                className={`flex items-center gap-1 px-2 py-0.5 rounded text-sm font-medium ${
                                    (data?.netWorthChange || 0) >= 0
                                        ? 'bg-success/10 text-success'
                                        : 'bg-danger/10 text-danger'
                                }`}
                                title={`${(data?.netWorthChangeAmount || 0) >= 0 ? '+' : '−'}${formatDashboardCurrency(Math.abs(data?.netWorthChangeAmount || 0), currency)} vs last month`}
                            >
                                {(data?.netWorthChange || 0) >= 0 ? (
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                ) : (
                                    <ArrowDownRight className="w-3.5 h-3.5" />
                                )}
                                {Math.abs(data?.netWorthChange || 0).toFixed(1)}%
                            </div>
                        )}
                    </div>
                    {data && data.netWorthChangeAmount !== 0 && (
                        <p className="text-xs text-neutral mb-4">
                            {data.netWorthChangeAmount >= 0 ? '+' : '−'}
                            {formatDashboardCurrency(Math.abs(data.netWorthChangeAmount), currency)}
                            {' '}vs last month
                        </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="card-inset">
                            <p className="text-xs text-neutral mb-1">Cash & Accounts</p>
                            <p className="text-base font-medium text-foreground">
                                <AnimatedNumber
                                    value={data?.accountsTotal || 0}
                                    formatFn={(v) => formatDashboardCurrency(Math.round(v), currency)}
                                />
                            </p>
                        </div>
                        <div className="card-inset">
                            <p className="text-xs text-neutral mb-1">Investments</p>
                            <p className="text-base font-medium text-foreground">
                                <AnimatedNumber
                                    value={data?.assetsTotal || 0}
                                    formatFn={(v) => formatDashboardCurrency(Math.round(v), currency)}
                                />
                            </p>
                        </div>
                    </div>
                </div>

                {/* Ready to Assign */}
                <div className="card">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
                            <Target className="w-5 h-5 text-success" />
                        </div>
                        <span className="text-neutral text-sm">Ready to Assign</span>
                    </div>
                    <p className={`text-xl font-semibold ${
                        (data?.readyToAssign || 0) >= 0 ? 'text-success' : 'text-danger'
                    }`}>
                        <AnimatedNumber
                            value={data?.readyToAssign || 0}
                            formatFn={(v) => formatDashboardCurrency(Math.round(v), currency)}
                        />
                    </p>
                    <Link href="/budget" className="flex items-center gap-1 text-sm text-neutral hover:text-primary mt-2 transition-colors">
                        Go to Budget
                        <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>

                {/* Age of Money */}
                <div className="card">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-info/10 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-info" />
                        </div>
                        <span className="text-neutral text-sm">Age of Money</span>
                    </div>
                    <p className="text-xl font-semibold text-foreground">
                        {data?.ageOfMoney || 0} <span className="text-base font-normal text-neutral">days</span>
                    </p>
                    <p className="text-sm text-neutral mt-1">
                        {(data?.ageOfMoney || 0) >= 90 ? 'Three months ahead — rock solid'
                            : (data?.ageOfMoney || 0) >= 60 ? 'Two months ahead — great buffer'
                            : (data?.ageOfMoney || 0) >= 30 ? 'A month ahead — well done'
                            : (data?.ageOfMoney || 0) >= 14 ? 'Getting there, keep going'
                            : 'Keep budgeting'}
                    </p>
                </div>
            </div>

            {/* Secondary Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8 animate-stagger">
                {/* Transactions This Month */}
                <div className="card">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-info/10 flex items-center justify-center">
                            <ScrollText className="w-5 h-5 text-info" />
                        </div>
                        <span className="text-neutral text-sm">Transactions This Month</span>
                    </div>
                    <p className="text-xl font-semibold text-foreground">
                        {data?.transactionsThisMonth || 0}
                    </p>
                    <Link href="/transactions" className="flex items-center gap-1 text-sm text-neutral hover:text-primary mt-2 transition-colors">
                        View transactions
                        <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>

                {/* Upcoming Bills */}
                <div className="card lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-medium text-foreground flex items-center gap-2">
                            <Bell className="w-4 h-4 text-warning" />
                            Upcoming Bills
                        </h3>
                    </div>
                    <ScheduledTransactions 
                        compact={true} 
                        limit={3} 
                        onViewAll={() => router.push('/transactions?tab=scheduled')} 
                    />
                </div>
            </div>

            {/* Recent Activity */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-foreground flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-neutral" />
                        Recent Transactions
                    </h3>
                    <Link href="/transactions" className="text-sm text-neutral hover:text-primary transition-colors flex items-center gap-1">
                        View all
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
                {data?.recentTransactions && data.recentTransactions.length > 0 ? (
                    <div className="space-y-2">
                        {data.recentTransactions.map((t) => (
                            <div 
                                key={t.id} 
                                className="flex items-center justify-between p-3 rounded-lg bg-background-tertiary/30 hover:bg-background-tertiary/50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${t.amount >= 0 ? 'bg-success' : 'bg-neutral'}`} />
                                    <div>
                                        <p className="text-sm font-medium text-foreground">{t.payee || '\u2014'}</p>
                                        <p className="text-xs text-neutral">
                                            {new Date(t.date).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
                                        </p>
                                    </div>
                                </div>
                                <span className={`text-sm font-medium ${t.amount >= 0 ? 'text-success' : 'text-foreground'}`}>
                                    {t.amount >= 0 ? '+' : ''}{formatCurrency(t.amount, currency, { useAbsolute: true, minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <Coins className="w-10 h-10 text-neutral mx-auto mb-2 opacity-60" />
                        <p className="text-foreground font-medium text-sm mb-1">Your ledger awaits</p>
                        <p className="text-neutral text-xs mb-3">Import your data to see recent activity here</p>
                        <Link href="/settings" className="btn btn-primary btn-sm mt-1">
                            Import from YNAB
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
