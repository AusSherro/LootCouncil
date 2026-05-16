'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ArrowDownRight, Calendar, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Mover {
    categoryId: string | null;
    categoryName: string;
    currentTotal: number;
    previousTotal: number;
    delta: number;
    deltaPercent: number;
}

interface TopMoversResponse {
    current: { month: string; total: number };
    previous: { month: string; total: number };
    topIncreases: Mover[];
    topDecreases: Mover[];
    allMovers: Mover[];
}

interface Props {
    currency: string;
    excludeCategoryNames: Set<string>;
}

function formatMonthKey(key: string): string {
    const [year, month] = key.split('-').map(Number);
    if (!year || !month) return key;
    return new Date(year, month - 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

/**
 * Top Movers — surfaces the categories whose spending changed most between
 * two periods. Compare current month vs last month (default) or vs same month
 * last year. Useful for catching subscription creep, seasonal spikes, and
 * lifestyle inflation.
 */
export default function TopMoversTab({ currency, excludeCategoryNames }: Props) {
    const router = useRouter();
    const [compareWith, setCompareWith] = useState<'last-month' | 'last-year'>('last-month');
    const [selectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [data, setData] = useState<TopMoversResponse | null>(null);
    const [loading, setLoading] = useState(true);

    const excludeQueryParam = useMemo(
        () => Array.from(excludeCategoryNames).join(','),
        [excludeCategoryNames]
    );

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                type: 'top-movers',
                month: selectedMonth,
                compareWith,
            });
            if (excludeQueryParam) params.set('excludeCategories', excludeQueryParam);
            const res = await fetch(`/api/reports/advanced?${params.toString()}`);
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error('Failed to fetch top movers:', err);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [selectedMonth, compareWith, excludeQueryParam]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    function navigateToCategory(mover: Mover, period: 'current' | 'previous') {
        if (!mover.categoryId) return;
        const target = period === 'current' ? data?.current.month : data?.previous.month;
        if (!target) return;
        const [year, month] = target.split('-').map(Number);
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59);
        router.push(
            `/transactions?categoryId=${encodeURIComponent(mover.categoryId)}` +
            `&startDate=${encodeURIComponent(start.toISOString())}` +
            `&endDate=${encodeURIComponent(end.toISOString())}`
        );
    }

    const totalDelta = data ? data.current.total - data.previous.total : 0;
    const totalDeltaPercent = data && data.previous.total > 0
        ? ((data.current.total - data.previous.total) / data.previous.total) * 100
        : 0;

    return (
        <div className="space-y-6">
            {/* Header + comparison toggle */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-gold" />
                    <h2 className="text-lg font-semibold text-foreground">Top Movers</h2>
                </div>
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-neutral" />
                    <span className="text-sm text-neutral">{formatMonthKey(selectedMonth)} vs</span>
                    <div className="bg-background-secondary border border-border rounded-lg p-1 flex gap-1">
                        <button
                            onClick={() => setCompareWith('last-month')}
                            className={`px-3 py-1 text-sm rounded ${
                                compareWith === 'last-month' ? 'bg-gold/20 text-gold' : 'text-neutral hover:text-foreground'
                            }`}
                        >
                            Last Month
                        </button>
                        <button
                            onClick={() => setCompareWith('last-year')}
                            className={`px-3 py-1 text-sm rounded ${
                                compareWith === 'last-year' ? 'bg-gold/20 text-gold' : 'text-neutral hover:text-foreground'
                            }`}
                        >
                            Same Month Last Year
                        </button>
                    </div>
                </div>
            </div>

            {/* Overall delta summary */}
            {data && !loading && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="card">
                        <p className="text-sm text-neutral mb-1">{formatMonthKey(data.current.month)}</p>
                        <p className="text-2xl font-bold text-foreground">
                            {formatCurrency(Math.round(data.current.total * 100), currency)}
                        </p>
                    </div>
                    <div className="card">
                        <p className="text-sm text-neutral mb-1">{formatMonthKey(data.previous.month)}</p>
                        <p className="text-2xl font-bold text-neutral">
                            {formatCurrency(Math.round(data.previous.total * 100), currency)}
                        </p>
                    </div>
                    <div className="card">
                        <p className="text-sm text-neutral mb-1">Change</p>
                        <p className={`text-2xl font-bold ${totalDelta >= 0 ? 'text-danger' : 'text-success'}`}>
                            {totalDelta >= 0 ? '+' : '−'}{formatCurrency(Math.round(Math.abs(totalDelta) * 100), currency)}
                            {data.previous.total > 0 && (
                                <span className="text-sm font-normal text-neutral ml-2">
                                    ({totalDeltaPercent >= 0 ? '+' : ''}{totalDeltaPercent.toFixed(1)}%)
                                </span>
                            )}
                        </p>
                    </div>
                </div>
            )}

            {loading && (
                <div className="card h-80 flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-2 border-gold border-t-transparent rounded-full" />
                </div>
            )}

            {!loading && data && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Increases */}
                    <div className="card">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-danger/10 flex items-center justify-center">
                                <ArrowUpRight className="w-4 h-4 text-danger" />
                            </div>
                            <h3 className="text-base font-semibold text-foreground">Spending Increases</h3>
                        </div>
                        {data.topIncreases.length === 0 ? (
                            <p className="text-neutral text-sm py-6 text-center">
                                No significant increases vs {formatMonthKey(data.previous.month)}.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {data.topIncreases.map((m) => (
                                    <button
                                        key={m.categoryId || m.categoryName}
                                        onClick={() => navigateToCategory(m, 'current')}
                                        disabled={!m.categoryId}
                                        className={`w-full text-left p-3 rounded-lg border border-transparent transition-colors ${
                                            m.categoryId ? 'hover:bg-background-tertiary hover:border-border cursor-pointer' : 'cursor-default'
                                        }`}
                                        title={m.categoryId ? 'View these transactions' : undefined}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium text-foreground">{m.categoryName}</span>
                                            <span className="text-danger font-semibold text-sm">
                                                +{formatCurrency(Math.round(m.delta * 100), currency)}
                                                <span className="text-neutral font-normal ml-1">
                                                    ({m.deltaPercent >= 0 ? '+' : ''}{m.deltaPercent.toFixed(0)}%)
                                                </span>
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-neutral">
                                            <span>was {formatCurrency(Math.round(m.previousTotal * 100), currency)}</span>
                                            <ArrowUpRight className="w-3 h-3" />
                                            <span>now {formatCurrency(Math.round(m.currentTotal * 100), currency)}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Decreases */}
                    <div className="card">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                                <ArrowDownRight className="w-4 h-4 text-success" />
                            </div>
                            <h3 className="text-base font-semibold text-foreground">Spending Decreases</h3>
                        </div>
                        {data.topDecreases.length === 0 ? (
                            <p className="text-neutral text-sm py-6 text-center">
                                No significant decreases vs {formatMonthKey(data.previous.month)}.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {data.topDecreases.map((m) => (
                                    <button
                                        key={m.categoryId || m.categoryName}
                                        onClick={() => navigateToCategory(m, 'current')}
                                        disabled={!m.categoryId}
                                        className={`w-full text-left p-3 rounded-lg border border-transparent transition-colors ${
                                            m.categoryId ? 'hover:bg-background-tertiary hover:border-border cursor-pointer' : 'cursor-default'
                                        }`}
                                        title={m.categoryId ? 'View these transactions' : undefined}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium text-foreground">{m.categoryName}</span>
                                            <span className="text-success font-semibold text-sm">
                                                −{formatCurrency(Math.round(Math.abs(m.delta) * 100), currency)}
                                                <span className="text-neutral font-normal ml-1">
                                                    ({m.deltaPercent.toFixed(0)}%)
                                                </span>
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-neutral">
                                            <span>was {formatCurrency(Math.round(m.previousTotal * 100), currency)}</span>
                                            <ArrowDownRight className="w-3 h-3" />
                                            <span>now {formatCurrency(Math.round(m.currentTotal * 100), currency)}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* All movers (sortable, optional) */}
            {!loading && data && data.allMovers.length > 0 && (
                <div className="card">
                    <h3 className="text-lg font-semibold text-foreground mb-4">All Significant Movers</h3>
                    <p className="text-xs text-neutral mb-3">
                        Categories with at least $5 change. Click a row to drill in.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left py-2 px-3 text-neutral font-medium">Category</th>
                                    <th className="text-right py-2 px-3 text-neutral font-medium">Previous</th>
                                    <th className="text-right py-2 px-3 text-neutral font-medium">Current</th>
                                    <th className="text-right py-2 px-3 text-neutral font-medium">Change</th>
                                    <th className="text-right py-2 px-3 text-neutral font-medium">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.allMovers.map((m) => (
                                    <tr
                                        key={m.categoryId || m.categoryName}
                                        className={`border-b border-border ${m.categoryId ? 'cursor-pointer hover:bg-background-tertiary' : ''}`}
                                        onClick={() => m.categoryId && navigateToCategory(m, 'current')}
                                    >
                                        <td className="py-2 px-3 text-foreground">{m.categoryName}</td>
                                        <td className="py-2 px-3 text-right text-neutral">
                                            {formatCurrency(Math.round(m.previousTotal * 100), currency)}
                                        </td>
                                        <td className="py-2 px-3 text-right text-foreground">
                                            {formatCurrency(Math.round(m.currentTotal * 100), currency)}
                                        </td>
                                        <td className={`py-2 px-3 text-right font-medium ${m.delta >= 0 ? 'text-danger' : 'text-success'}`}>
                                            {m.delta >= 0 ? '+' : '−'}
                                            {formatCurrency(Math.round(Math.abs(m.delta) * 100), currency)}
                                        </td>
                                        <td className={`py-2 px-3 text-right text-xs ${m.delta >= 0 ? 'text-danger' : 'text-success'}`}>
                                            {m.deltaPercent >= 0 ? '+' : ''}{m.deltaPercent.toFixed(0)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
