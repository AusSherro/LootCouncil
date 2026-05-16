'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, Calendar } from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import { useRouter } from 'next/navigation';
import ChartTooltip from '@/components/ChartTooltip';

interface BudgetVsActualData {
    categoryId: string;
    categoryName: string;
    groupName: string;
    totalBudgeted: number;
    totalActual: number;
    variance: number;
    variancePercent: number;
}

interface BudgetVsActualSummary {
    month: string;
    budgeted: number;
    actual: number;
    variance: number;
}

interface Props {
    currency: string;
    excludeCategoryNames: Set<string>;
}

const DATE_RANGE_PRESETS = [
    { label: '3 Months', months: 3 },
    { label: '6 Months', months: 6 },
    { label: '1 Year', months: 12 },
    { label: '2 Years', months: 24 },
    { label: '3 Years', months: 36 },
    { label: 'All Time', months: 0 },
];

/**
 * Budget vs Actual — compares budgeted amounts against actual spending across
 * a configurable trailing window. Renders summary cards, a monthly comparison
 * bar chart, and a per-category breakdown table that drills into transactions.
 */
export default function BudgetVsActualTab({ currency, excludeCategoryNames }: Props) {
    const router = useRouter();
    const [months, setMonths] = useState(6);
    const [showRangeDropdown, setShowRangeDropdown] = useState(false);
    const [data, setData] = useState<BudgetVsActualData[]>([]);
    const [summary, setSummary] = useState<BudgetVsActualSummary[]>([]);
    const [totals, setTotals] = useState<{ budgeted: number; actual: number; variance: number }>({ budgeted: 0, actual: 0, variance: 0 });
    const [loading, setLoading] = useState(true);

    const excludeQueryParam = useMemo(
        () => Array.from(excludeCategoryNames).join(','),
        [excludeCategoryNames]
    );

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ type: 'budget-vs-actual', months: String(months) });
            if (excludeQueryParam) params.set('excludeCategories', excludeQueryParam);
            const res = await fetch(`/api/reports/advanced?${params.toString()}`);
            const json = await res.json();
            setData(json.data || []);
            setSummary(json.monthlySummary || []);
            setTotals(json.totals || { budgeted: 0, actual: 0, variance: 0 });
        } catch (err) {
            console.error('Failed to fetch budget vs actual data:', err);
        } finally {
            setLoading(false);
        }
    }, [months, excludeQueryParam]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="space-y-6">
            {/* Date Range Selector */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Budget vs Actual</h2>
                <div className="relative">
                    <button
                        onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                        className="btn btn-ghost flex items-center gap-2"
                    >
                        <Calendar className="w-4 h-4" />
                        {DATE_RANGE_PRESETS.find(p => p.months === months)?.label || 'Custom'}
                    </button>
                    {showRangeDropdown && (
                        <div className="absolute right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
                            {DATE_RANGE_PRESETS.map((preset) => (
                                <button
                                    key={preset.months}
                                    onClick={() => {
                                        setMonths(preset.months);
                                        setShowRangeDropdown(false);
                                    }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-background-tertiary ${
                                        months === preset.months ? 'text-gold' : 'text-foreground'
                                    }`}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card">
                    <p className="text-sm text-neutral mb-1">Total Budgeted</p>
                    <p className="text-2xl font-bold text-foreground">${totals.budgeted.toFixed(0)}</p>
                </div>
                <div className="card">
                    <p className="text-sm text-neutral mb-1">Total Spent</p>
                    <p className="text-2xl font-bold text-danger">${totals.actual.toFixed(0)}</p>
                </div>
                <div className="card">
                    <p className="text-sm text-neutral mb-1">Under/Over Budget</p>
                    <p className={`text-2xl font-bold ${totals.variance >= 0 ? 'text-success' : 'text-danger'}`}>
                        {totals.variance >= 0 ? '+' : ''}{totals.variance.toFixed(0)}
                    </p>
                </div>
            </div>

            {/* Monthly Trend Chart */}
            <div className="card">
                <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Comparison</h3>
                {loading ? (
                    <div className="h-64 flex items-center justify-center">
                        <div className="animate-spin w-8 h-8 border-2 border-gold border-t-transparent rounded-full" />
                    </div>
                ) : summary.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center">
                        <BarChart3 className="w-12 h-12 text-neutral mb-4" />
                        <p className="text-neutral">No budget data available</p>
                    </div>
                ) : (
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={summary}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                                <XAxis
                                    dataKey="month"
                                    stroke="var(--neutral)"
                                    fontSize={11}
                                    tickLine={false}
                                    tickFormatter={(value) => {
                                        const [year, month] = value.split('-');
                                        return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-AU', { month: 'short' });
                                    }}
                                />
                                <YAxis
                                    stroke="var(--neutral)"
                                    fontSize={11}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                />
                                <Tooltip
                                    content={
                                        <ChartTooltip
                                            currency={currency}
                                            formatValue={(value) => `$${value.toFixed(2)}`}
                                        />
                                    }
                                    cursor={{ fill: 'var(--gold)', fillOpacity: 0.06 }}
                                />
                                <Legend />
                                <Bar dataKey="budgeted" name="Budgeted" fill="var(--info)" radius={[4, 4, 0, 0]} animationDuration={750} />
                                <Bar dataKey="actual" name="Actual" fill="var(--danger)" radius={[4, 4, 0, 0]} animationDuration={750} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Category Breakdown Table */}
            <div className="card">
                <h3 className="text-lg font-semibold text-foreground mb-4">Category Breakdown</h3>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="text-left py-2 px-3 text-neutral font-medium">Category</th>
                                <th className="text-left py-2 px-3 text-neutral font-medium">Group</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium">Budgeted</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium">Actual</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium">Variance</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium">%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.slice(0, 20).map((row) => (
                                <tr
                                    key={row.categoryId}
                                    className="border-b border-border hover:bg-background-tertiary cursor-pointer"
                                    onClick={() => {
                                        const now = new Date();
                                        const start = new Date(now.getFullYear(), now.getMonth() - months, 1);
                                        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                                        router.push(`/transactions?categoryId=${encodeURIComponent(row.categoryId)}&startDate=${encodeURIComponent(start.toISOString())}&endDate=${encodeURIComponent(end.toISOString())}`);
                                    }}
                                    title="View transactions for this category"
                                >
                                    <td className="py-2 px-3 text-foreground">{row.categoryName}</td>
                                    <td className="py-2 px-3 text-neutral text-sm">{row.groupName}</td>
                                    <td className="py-2 px-3 text-right text-foreground">${row.totalBudgeted.toFixed(2)}</td>
                                    <td className="py-2 px-3 text-right text-danger">${row.totalActual.toFixed(2)}</td>
                                    <td className={`py-2 px-3 text-right font-medium ${row.variance >= 0 ? 'text-success' : 'text-danger'}`}>
                                        {row.variance >= 0 ? '+' : ''}${row.variance.toFixed(2)}
                                    </td>
                                    <td className={`py-2 px-3 text-right text-sm ${row.variancePercent >= 0 ? 'text-success' : 'text-danger'}`}>
                                        {row.variancePercent >= 0 ? '+' : ''}{row.variancePercent.toFixed(0)}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
