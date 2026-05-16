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
} from 'recharts';
import { useRouter } from 'next/navigation';
import ChartTooltip from '@/components/ChartTooltip';

interface PayeeSpendingData {
    payee: string;
    total: number;
    count: number;
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
 * Spending by Payee — horizontal bar chart of the top payees by total spend
 * over a configurable trailing window, plus a sortable table that drills into
 * the underlying transactions.
 */
export default function ByPayeeTab({ currency, excludeCategoryNames }: Props) {
    const router = useRouter();
    const [months, setMonths] = useState(6);
    const [showRangeDropdown, setShowRangeDropdown] = useState(false);
    const [data, setData] = useState<PayeeSpendingData[]>([]);
    const [loading, setLoading] = useState(true);

    const excludeQueryParam = useMemo(
        () => Array.from(excludeCategoryNames).join(','),
        [excludeCategoryNames]
    );

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ type: 'spending-by-payee', months: String(months) });
            if (excludeQueryParam) params.set('excludeCategories', excludeQueryParam);
            const res = await fetch(`/api/reports/advanced?${params.toString()}`);
            const json = await res.json();
            setData(json.data || []);
        } catch (err) {
            console.error('Failed to fetch payee data:', err);
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
                <h2 className="text-lg font-semibold text-foreground">Spending by Payee</h2>
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

            {/* Chart */}
            <div className="card">
                <h3 className="text-lg font-semibold text-foreground mb-4">Top Payees by Spending</h3>
                {loading ? (
                    <div className="h-80 flex items-center justify-center">
                        <div className="animate-spin w-8 h-8 border-2 border-gold border-t-transparent rounded-full" />
                    </div>
                ) : data.length === 0 ? (
                    <div className="h-80 flex flex-col items-center justify-center">
                        <BarChart3 className="w-12 h-12 text-neutral mb-4" />
                        <p className="text-neutral">No spending data available</p>
                    </div>
                ) : (
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.slice(0, 15)} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                                <XAxis type="number" stroke="var(--neutral)" fontSize={11} tickLine={false} tickFormatter={(value) => `$${value}`} />
                                <YAxis type="category" dataKey="payee" stroke="var(--neutral)" fontSize={11} width={120} tickLine={false} />
                                <Tooltip
                                    content={
                                        <ChartTooltip
                                            currency={currency}
                                            formatValue={(value, name) => [name === 'total' ? 'Total Spent' : name, `$${typeof value === 'number' ? value.toFixed(2) : value}`].reverse().join('')}
                                        />
                                    }
                                    cursor={{ fill: 'var(--gold)', fillOpacity: 0.06 }}
                                />
                                <Bar dataKey="total" name="Total Spent" fill="var(--danger)" radius={[0, 4, 4, 0]} animationDuration={750} cursor="pointer"
                                    onClick={(d) => {
                                        const bar = d as { payee?: string };
                                        if (!bar.payee || bar.payee === 'Unknown') return;
                                        const now = new Date();
                                        const start = new Date(now.getFullYear(), now.getMonth() - months, 1);
                                        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                                        router.push(`/transactions?q=${encodeURIComponent(bar.payee)}&startDate=${encodeURIComponent(start.toISOString())}&endDate=${encodeURIComponent(end.toISOString())}`);
                                    }} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Payee List */}
            <div className="card">
                <h3 className="text-lg font-semibold text-foreground mb-4">All Payees</h3>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="text-left py-2 px-3 text-neutral font-medium">Payee</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium">Transactions</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium">Total Spent</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row) => {
                                const now = new Date();
                                const start = new Date(now.getFullYear(), now.getMonth() - months, 1);
                                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                                const drilldown = `/transactions?q=${encodeURIComponent(row.payee)}&startDate=${encodeURIComponent(start.toISOString())}&endDate=${encodeURIComponent(end.toISOString())}`;
                                return (
                                    <tr
                                        key={row.payee}
                                        className="border-b border-border hover:bg-background-tertiary cursor-pointer"
                                        onClick={() => row.payee !== 'Unknown' && router.push(drilldown)}
                                        title={row.payee !== 'Unknown' ? 'View transactions for this payee' : undefined}
                                    >
                                        <td className="py-2 px-3 text-foreground">{row.payee}</td>
                                        <td className="py-2 px-3 text-right text-neutral">{row.count}</td>
                                        <td className="py-2 px-3 text-right text-danger">${row.total.toFixed(2)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
