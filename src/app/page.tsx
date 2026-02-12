'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
    PiggyBank, 
    ScrollText, 
    TrendingUp, 
    Target, 
    ArrowRight, 
    Coins, 
    Calendar,
    ChevronRight,
    ArrowUpRight,
    ArrowDownRight,
    Bell,
    Clock,    AlertCircle,
    RefreshCw,} from 'lucide-react';
import ScheduledTransactions from '@/components/ScheduledTransactions';
import { SkeletonDashboard } from '@/components/Skeleton';
import { formatCurrency } from '@/lib/utils';

interface DashboardData {
    netWorth: number;
    netWorthChange: number;
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

function formatDashboardCurrency(cents: number): string {
    return formatCurrency(cents, 'AUD', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

export default function HomePage() {
    const router = useRouter();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [greeting, setGreeting] = useState('');

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good morning');
        else if (hour < 17) setGreeting('Good afternoon');
        else setGreeting('Good evening');

        async function fetchDashboard() {
            setError(null);
            setLoading(true);
            try {
                const [networthRes, budgetRes, transactionsRes, aomRes] = await Promise.all([
                    fetch('/api/networth?months=1'),
                    fetch('/api/budget'),
                    fetch('/api/transactions?limit=5'),
                    fetch('/api/age-of-money'),
                ]);

                // Check if any critical fetches failed
                if (!networthRes.ok && !budgetRes.ok && !transactionsRes.ok && !aomRes.ok) {
                    throw new Error('All dashboard data sources failed to load');
                }

                const [networth, budget, transactions, aom] = await Promise.all([
                    networthRes.ok ? networthRes.json() : { accountBalance: 0, assetValue: 0, currentNetWorth: 0 },
                    budgetRes.ok ? budgetRes.json() : { totals: { readyToAssign: 0 } },
                    transactionsRes.ok ? transactionsRes.json() : { total: 0, transactions: [] },
                    aomRes.ok ? aomRes.json() : { ageOfMoney: 0 },
                ]);

                const accountsTotal = networth.accountBalance || 0;
                const assetsTotal = networth.assetValue || 0;

                setData({
                    netWorth: networth.currentNetWorth || 0,
                    netWorthChange: 0,
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
    }, []);

    // Retry handler
    function handleRetry() {
        setError(null);
        setLoading(true);
        setData(null);
        // Re-trigger the effect by forcing a re-render
        window.location.reload();
    }

    if (loading) {
        return <SkeletonDashboard />;
    }

    if (error) {
        return (
            <div className="min-h-screen p-6 lg:p-8 flex items-center justify-center">
                <div className="card max-w-md w-full text-center p-8">
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
        <div className="min-h-screen p-6 lg:p-8">
            {/* Header */}
            <div className="mb-8">
                <p className="text-neutral text-sm mb-1">{greeting}</p>
                <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* Net Worth Card - Featured */}
                <div className="lg:col-span-2 card">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-primary" />
                        </div>
                        <span className="text-neutral text-sm">Total Net Worth</span>
                    </div>
                    <div className="flex items-end gap-3 mb-4">
                        <p className="text-3xl font-bold text-foreground">
                            {formatDashboardCurrency(data?.netWorth || 0)}
                        </p>
                        {data?.netWorthChange !== 0 && (
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-sm font-medium ${
                                (data?.netWorthChange || 0) >= 0 
                                    ? 'bg-success/10 text-success' 
                                    : 'bg-danger/10 text-danger'
                            }`}>
                                {(data?.netWorthChange || 0) >= 0 ? (
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                ) : (
                                    <ArrowDownRight className="w-3.5 h-3.5" />
                                )}
                                {Math.abs(data?.netWorthChange || 0)}%
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-background-tertiary/50">
                            <p className="text-xs text-neutral mb-1">Cash & Accounts</p>
                            <p className="text-base font-medium text-foreground">{formatDashboardCurrency(data?.accountsTotal || 0)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-background-tertiary/50">
                            <p className="text-xs text-neutral mb-1">Investments</p>
                            <p className="text-base font-medium text-foreground">{formatDashboardCurrency(data?.assetsTotal || 0)}</p>
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
                    <p className={`text-2xl font-bold ${
                        (data?.readyToAssign || 0) >= 0 ? 'text-success' : 'text-danger'
                    }`}>
                        {formatDashboardCurrency(data?.readyToAssign || 0)}
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
                    <p className="text-2xl font-bold text-foreground">
                        {data?.ageOfMoney || 0} <span className="text-base font-normal text-neutral">days</span>
                    </p>
                    <p className="text-sm text-neutral mt-1">
                        {(data?.ageOfMoney || 0) >= 30 ? 'Well ahead!' : 'Keep budgeting'}
                    </p>
                </div>
            </div>

            {/* Secondary Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                {/* Transactions This Month */}
                <div className="card">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-info/10 flex items-center justify-center">
                            <ScrollText className="w-5 h-5 text-info" />
                        </div>
                        <span className="text-neutral text-sm">Transactions This Month</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
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

            {/* Quick Navigation & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Quick Navigation */}
                <div className="card">
                    <h3 className="font-medium text-foreground mb-4">Quick Access</h3>
                    <div className="space-y-2">
                        <Link href="/budget" className="flex items-center gap-3 p-3 rounded-lg hover:bg-background-tertiary/50 transition-colors">
                            <PiggyBank className="w-5 h-5 text-primary" />
                            <span className="text-sm font-medium text-foreground">Budget</span>
                            <ChevronRight className="w-4 h-4 text-neutral ml-auto" />
                        </Link>
                        <Link href="/transactions" className="flex items-center gap-3 p-3 rounded-lg hover:bg-background-tertiary/50 transition-colors">
                            <ScrollText className="w-5 h-5 text-info" />
                            <span className="text-sm font-medium text-foreground">Transactions</span>
                            <ChevronRight className="w-4 h-4 text-neutral ml-auto" />
                        </Link>
                        <Link href="/reports" className="flex items-center gap-3 p-3 rounded-lg hover:bg-background-tertiary/50 transition-colors">
                            <TrendingUp className="w-5 h-5 text-success" />
                            <span className="text-sm font-medium text-foreground">Reports</span>
                            <ChevronRight className="w-4 h-4 text-neutral ml-auto" />
                        </Link>
                        <Link href="/investments" className="flex items-center gap-3 p-3 rounded-lg hover:bg-background-tertiary/50 transition-colors">
                            <Target className="w-5 h-5 text-warning" />
                            <span className="text-sm font-medium text-foreground">Investments</span>
                            <ChevronRight className="w-4 h-4 text-neutral ml-auto" />
                        </Link>
                    </div>
                </div>

                {/* Recent Transactions */}
                <div className="card lg:col-span-2">
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
                                            <p className="text-sm font-medium text-foreground">{t.payee || 'Unknown'}</p>
                                            <p className="text-xs text-neutral">
                                                {new Date(t.date).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`text-sm font-medium ${t.amount >= 0 ? 'text-success' : 'text-foreground'}`}>
                                        {t.amount >= 0 ? '+' : ''}{formatCurrency(t.amount, 'AUD', { useAbsolute: true, minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <Coins className="w-10 h-10 text-neutral mx-auto mb-2" />
                            <p className="text-neutral text-sm">No transactions yet</p>
                            <Link href="/settings" className="btn btn-primary btn-sm mt-3">
                                Import from YNAB
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
