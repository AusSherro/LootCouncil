'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, PiggyBank } from 'lucide-react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
} from 'recharts';
import ChartTooltip from '@/components/ChartTooltip';
import { formatCurrency } from '@/lib/utils';

interface SavingsRow {
    month: string;
    monthLabel: string;
    income: number;       // dollars
    expense: number;      // dollars
    net: number;          // dollars
    savingsRate: number;  // percent (can be negative)
}

interface ApiIncomeExpenseRow {
    month: string;        // 'YYYY-MM' (cents on the wire)
    income: number;       // cents
    expense: number;      // cents
    net: number;          // cents
}

const RANGE_PRESETS = [
    { label: '6 Months', months: 6 },
    { label: '1 Year', months: 12 },
    { label: '2 Years', months: 24 },
    { label: '3 Years', months: 36 },
];

const TARGET_RATE = 20; // % — visualised as a horizontal reference line.

function formatMonthKey(key: string): string {
    const [year, month] = key.split('-').map(Number);
    if (!year || !month) return key;
    return new Date(year, month - 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
}

interface Props {
    currency: string;
    excludeCategoryNames: Set<string>;
}

/**
 * Savings Rate over time. Computes (income - expense) / income per month using
 * the existing income-expense report endpoint, with the global category-exclusion
 * filter applied. Shows a line chart with a 20% target reference line plus three
 * summary cards (current month, rolling 3-month, all-time).
 */
export default function SavingsRateTab({ currency, excludeCategoryNames }: Props) {
    const router = useRouter();
    const [months, setMonths] = useState(12);
    const [showRangeDropdown, setShowRangeDropdown] = useState(false);
    const [data, setData] = useState<SavingsRow[]>([]);
    const [loading, setLoading] = useState(true);

    const excludeQueryParam = useMemo(
        () => Array.from(excludeCategoryNames).join(','),
        [excludeCategoryNames]
    );

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ type: 'income-expense', months: String(months) });
            if (excludeQueryParam) params.set('excludeCategories', excludeQueryParam);
            const res = await fetch(`/api/reports/advanced?${params.toString()}`);
            const json = await res.json();
            const rows: ApiIncomeExpenseRow[] = json.data || [];
            const transformed: SavingsRow[] = rows.map(r => {
                const income = r.income / 100;
                const expense = r.expense / 100;
                const net = (r.income - r.expense) / 100;
                const savingsRate = r.income > 0 ? (r.income - r.expense) / r.income * 100 : 0;
                return {
                    month: r.month,
                    monthLabel: formatMonthKey(r.month),
                    income,
                    expense,
                    net,
                    savingsRate: Math.round(savingsRate * 10) / 10,
                };
            });
            setData(transformed);
        } catch (err) {
            console.error('Failed to fetch savings rate data:', err);
        } finally {
            setLoading(false);
        }
    }, [months, excludeQueryParam]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const summary = useMemo(() => {
        if (data.length === 0) {
            return { current: 0, rolling3: 0, allTime: 0 };
        }
        const current = data[data.length - 1].savingsRate;
        const last3 = data.slice(-3);
        const rolling3 = last3.length > 0
            ? last3.reduce((sum, r) => sum + r.savingsRate, 0) / last3.length
            : 0;
        // Income-weighted all-time average (prevents low-income months dominating)
        const totalIncome = data.reduce((sum, r) => sum + r.income, 0);
        const totalNet = data.reduce((sum, r) => sum + r.net, 0);
        const allTime = totalIncome > 0 ? (totalNet / totalIncome) * 100 : 0;
        return {
            current: Math.round(current * 10) / 10,
            rolling3: Math.round(rolling3 * 10) / 10,
            allTime: Math.round(allTime * 10) / 10,
        };
    }, [data]);

    function rateColor(rate: number): string {
        if (rate >= TARGET_RATE) return 'text-success';
        if (rate >= 0) return 'text-warning';
        return 'text-danger';
    }

    return (
        <div className="space-y-6">
            {/* Header + range */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <PiggyBank className="w-5 h-5 text-gold" />
                    <h2 className="text-lg font-semibold text-foreground">Savings Rate Over Time</h2>
                </div>
                <div className="relative">
                    <button
                        onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                        className="btn btn-ghost flex items-center gap-2"
                    >
                        <Calendar className="w-4 h-4" />
                        {RANGE_PRESETS.find(p => p.months === months)?.label || `${months} months`}
                    </button>
                    {showRangeDropdown && (
                        <div className="absolute right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
                            {RANGE_PRESETS.map(preset => (
                                <button
                                    key={preset.months}
                                    onClick={() => { setMonths(preset.months); setShowRangeDropdown(false); }}
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

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card">
                    <p className="text-sm text-neutral mb-1">Current Month</p>
                    <p className={`text-3xl font-bold ${rateColor(summary.current)}`}>
                        {summary.current.toFixed(1)}%
                    </p>
                </div>
                <div className="card">
                    <p className="text-sm text-neutral mb-1">3-Month Rolling Avg</p>
                    <p className={`text-3xl font-bold ${rateColor(summary.rolling3)}`}>
                        {summary.rolling3.toFixed(1)}%
                    </p>
                </div>
                <div className="card">
                    <p className="text-sm text-neutral mb-1">All-Time Avg (income-weighted)</p>
                    <p className={`text-3xl font-bold ${rateColor(summary.allTime)}`}>
                        {summary.allTime.toFixed(1)}%
                    </p>
                </div>
            </div>

            {/* Chart */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-foreground">Monthly Trend</h3>
                    <p className="text-xs text-neutral">Target: {TARGET_RATE}%</p>
                </div>
                {loading ? (
                    <div className="h-80 flex items-center justify-center">
                        <div className="animate-spin w-8 h-8 border-2 border-gold border-t-transparent rounded-full" />
                    </div>
                ) : data.length === 0 ? (
                    <div className="h-80 flex flex-col items-center justify-center">
                        <PiggyBank className="w-12 h-12 text-neutral mb-4" />
                        <p className="text-neutral">Not enough income data to compute a savings rate.</p>
                    </div>
                ) : (
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                                <XAxis dataKey="monthLabel" stroke="var(--neutral)" fontSize={11} tickLine={false} />
                                <YAxis
                                    stroke="var(--neutral)"
                                    fontSize={11}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${value}%`}
                                    domain={['auto', 'auto']}
                                />
                                <Tooltip
                                    content={
                                        <ChartTooltip
                                            currency={currency}
                                            formatValue={(value, name) => {
                                                if (name === 'savingsRate') return `${typeof value === 'number' ? value.toFixed(1) : value}%`;
                                                return typeof value === 'number' ? `$${value.toFixed(2)}` : String(value);
                                            }}
                                        />
                                    }
                                    cursor={{ stroke: 'var(--gold)', strokeOpacity: 0.3 }}
                                />
                                <Legend />
                                <ReferenceLine
                                    y={TARGET_RATE}
                                    stroke="var(--success)"
                                    strokeDasharray="3 3"
                                    label={{ value: 'Target', position: 'right', fill: 'var(--success)', fontSize: 10 }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="savingsRate"
                                    name="Savings Rate"
                                    stroke="var(--gold)"
                                    strokeWidth={2.5}
                                    dot={{ fill: 'var(--gold)', r: 3 }}
                                    activeDot={{ r: 5 }}
                                    animationDuration={750}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Detail table */}
            {data.length > 0 && (
                <div className="card">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Breakdown</h3>
                    <p className="text-xs text-neutral mb-3">
                        <strong className="text-foreground">Saved</strong> = Income − Expense for the month (your surplus, <em>not</em> the amount transferred to a savings account).{' '}
                        <strong className="text-foreground">Rate</strong> = Saved ÷ Income × 100. Click a row to inspect that month&apos;s transactions.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left py-2 px-3 text-neutral font-medium">Month</th>
                                    <th className="text-right py-2 px-3 text-neutral font-medium" title="Sum of positive transactions. Excludes transfers between your own accounts.">Income</th>
                                    <th className="text-right py-2 px-3 text-neutral font-medium" title="Sum of negative transactions. Excludes transfers between your own accounts.">Expense</th>
                                    <th className="text-right py-2 px-3 text-neutral font-medium" title="Income − Expense. Positive = surplus, negative = deficit. NOT the same as 'amount moved to savings account'.">Saved</th>
                                    <th className="text-right py-2 px-3 text-neutral font-medium" title="Saved ÷ Income × 100. Standard personal-finance savings rate.">Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...data].reverse().map(row => {
                                    const [year, monthNum] = row.month.split('-').map(Number);
                                    const start = new Date(year, monthNum - 1, 1).toISOString();
                                    const end = new Date(year, monthNum, 0, 23, 59, 59).toISOString();
                                    const drilldown = `/transactions?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`;
                                    return (
                                        <tr
                                            key={row.month}
                                            className="border-b border-border hover:bg-background-tertiary cursor-pointer"
                                            onClick={() => router.push(drilldown)}
                                            title={`View ${row.monthLabel} transactions`}
                                        >
                                            <td className="py-2 px-3 text-foreground">{row.monthLabel}</td>
                                            <td className="py-2 px-3 text-right text-success">{formatCurrency(Math.round(row.income * 100), currency)}</td>
                                            <td className="py-2 px-3 text-right text-danger">{formatCurrency(Math.round(row.expense * 100), currency)}</td>
                                            <td className={`py-2 px-3 text-right font-medium ${row.net >= 0 ? 'text-success' : 'text-danger'}`}>
                                                {formatCurrency(Math.round(row.net * 100), currency)}
                                            </td>
                                            <td className={`py-2 px-3 text-right font-semibold ${rateColor(row.savingsRate)}`}>
                                                {row.savingsRate.toFixed(1)}%
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
