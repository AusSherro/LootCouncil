'use client';

import { useState, useEffect, useCallback } from 'react';
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

interface IncomeExpenseData {
    month: string;
    income: number;
    expense: number;
    net: number;
    startDate: string;
    endDate: string;
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

function getMonthRange(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59);
    return { start, end };
}

/**
 * Income vs Expense — bar chart of monthly income/expense totals over a
 * configurable range, plus summary cards (avg income/expense/savings) and a
 * monthly breakdown table. Honors the global category exclusion set.
 */
export default function IncomeExpenseTab({ currency, excludeCategoryNames }: Props) {
    const router = useRouter();
    const [incomeExpenseMonths, setIncomeExpenseMonths] = useState(12);
    const [showRangeDropdown, setShowRangeDropdown] = useState(false);
    const [data, setData] = useState<IncomeExpenseData[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const now = new Date();
            let monthsToFetch = incomeExpenseMonths;

            // For "All Time", fetch all transactions and calculate range
            if (monthsToFetch === 0) {
                const allRes = await fetch('/api/transactions?limit=10000');
                const allData = await allRes.json();
                const transactions = allData.transactions || [];

                if (transactions.length > 0) {
                    const dates = transactions.map((t: { date: string }) => new Date(t.date));
                    const oldest = new Date(Math.min(...dates.map((d: Date) => d.getTime())));
                    const diffMonths = (now.getFullYear() - oldest.getFullYear()) * 12 + (now.getMonth() - oldest.getMonth()) + 1;
                    monthsToFetch = Math.max(diffMonths, 12);
                } else {
                    monthsToFetch = 12;
                }
            }

            const months: IncomeExpenseData[] = [];

            for (let i = monthsToFetch - 1; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const { start, end } = getMonthRange(date);

                const res = await fetch(
                    `/api/transactions?limit=2000&startDate=${start.toISOString()}&endDate=${end.toISOString()}`
                );
                const json = await res.json();
                const transactions = json.transactions || [];

                let income = 0;
                let expense = 0;

                for (const t of transactions) {
                    // Transfers between your own accounts aren't real income or expense.
                    if (t.transferId) continue;
                    // Reconciliation adjustments aren't real money flow either — they're
                    // bookkeeping plugs created when matching the bank statement.
                    if (typeof t.payee === 'string' && t.payee.includes('Reconciliation Adjustment')) continue;
                    if (t.amount > 0) {
                        // Income always counts — even if uncategorized — otherwise
                        // paychecks the user hasn't categorised get hidden.
                        income += t.amount;
                    } else {
                        // Apply the global category exclusion only to expenses.
                        const catName = t.category?.name || 'Uncategorized';
                        if (excludeCategoryNames.has(catName)) continue;
                        expense += Math.abs(t.amount);
                    }
                }

                const monthLabel = monthsToFetch > 12
                    ? date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
                    : date.toLocaleDateString('en-AU', { month: 'short' });

                months.push({
                    month: monthLabel,
                    income: income / 100,
                    expense: expense / 100,
                    net: (income - expense) / 100,
                    startDate: start.toISOString(),
                    endDate: end.toISOString(),
                });
            }

            setData(months);
        } catch (err) {
            console.error('Failed to fetch income/expense data:', err);
        } finally {
            setLoading(false);
        }
    }, [incomeExpenseMonths, excludeCategoryNames]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const avgIncome = data.length > 0
        ? data.reduce((sum, d) => sum + d.income, 0) / data.length
        : 0;
    const avgExpense = data.length > 0
        ? data.reduce((sum, d) => sum + d.expense, 0) / data.length
        : 0;
    const avgNet = avgIncome - avgExpense;

    return (
        <div className="space-y-6">
            {/* Date Range Selector */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Income vs Expense</h2>
                <div className="relative">
                    <button
                        onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                        className="btn btn-ghost flex items-center gap-2"
                    >
                        <Calendar className="w-4 h-4" />
                        {DATE_RANGE_PRESETS.find(p => p.months === incomeExpenseMonths)?.label || 'Custom'}
                    </button>
                    {showRangeDropdown && (
                        <div className="absolute right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
                            {DATE_RANGE_PRESETS.map((preset) => (
                                <button
                                    key={preset.months}
                                    onClick={() => {
                                        setIncomeExpenseMonths(preset.months);
                                        setShowRangeDropdown(false);
                                    }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-background-tertiary ${
                                        incomeExpenseMonths === preset.months ? 'text-gold' : 'text-foreground'
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
                    <p className="text-sm text-neutral mb-1">Avg Monthly Income</p>
                    <p className="text-2xl font-bold text-success">${avgIncome.toFixed(0)}</p>
                </div>
                <div className="card">
                    <p className="text-sm text-neutral mb-1">Avg Monthly Expense</p>
                    <p className="text-2xl font-bold text-danger">${avgExpense.toFixed(0)}</p>
                </div>
                <div className="card">
                    <p className="text-sm text-neutral mb-1">Avg Monthly Savings</p>
                    <p className={`text-2xl font-bold ${avgNet >= 0 ? 'text-success' : 'text-danger'}`}>
                        ${Math.abs(avgNet).toFixed(0)}
                        <span className="text-sm font-normal text-neutral ml-1">
                            ({avgIncome > 0 ? ((avgNet / avgIncome) * 100).toFixed(0) : 0}% rate)
                        </span>
                    </p>
                </div>
            </div>

            {/* Chart */}
            <div className="card">
                <h2 className="text-lg font-semibold text-foreground mb-4">
                    {DATE_RANGE_PRESETS.find(p => p.months === incomeExpenseMonths)?.label || 'Custom Range'}
                </h2>
                {loading ? (
                    <div className="h-80 flex items-center justify-center">
                        <div className="animate-spin w-8 h-8 border-2 border-gold border-t-transparent rounded-full" />
                    </div>
                ) : data.length === 0 ? (
                    <div className="h-80 flex flex-col items-center justify-center">
                        <BarChart3 className="w-12 h-12 text-neutral mb-4" />
                        <p className="text-neutral">No transaction data available</p>
                    </div>
                ) : (
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                            <BarChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                                <XAxis dataKey="month" stroke="var(--neutral)" fontSize={11} tickLine={false} />
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
                                <Bar dataKey="income" name="Income" fill="var(--success)" radius={[4, 4, 0, 0]} animationDuration={750} cursor="pointer"
                                    onClick={(d) => {
                                        const bar = d as { startDate?: string; endDate?: string };
                                        if (!bar.startDate || !bar.endDate) return;
                                        router.push(`/transactions?startDate=${encodeURIComponent(bar.startDate)}&endDate=${encodeURIComponent(bar.endDate)}`);
                                    }} />
                                <Bar dataKey="expense" name="Expense" fill="var(--danger)" radius={[4, 4, 0, 0]} animationDuration={750} cursor="pointer"
                                    onClick={(d) => {
                                        const bar = d as { startDate?: string; endDate?: string };
                                        if (!bar.startDate || !bar.endDate) return;
                                        router.push(`/transactions?startDate=${encodeURIComponent(bar.startDate)}&endDate=${encodeURIComponent(bar.endDate)}`);
                                    }} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Monthly Breakdown Table */}
            <div className="card">
                <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Details</h3>
                <p className="text-xs text-neutral mb-3">Click any row to inspect that month&apos;s transactions. Transfers between your own accounts are excluded.</p>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="text-left py-2 px-3 text-neutral font-medium">Month</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium" title="Sum of positive transactions (paychecks, refunds, deposits, etc.). Excludes transfers between your own accounts.">Income</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium" title="Sum of negative transactions (purchases, bills, etc.). Excludes transfers between your own accounts.">Expense</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium" title="Income − Expense for the month. Positive = surplus, negative = deficit. Not the same as 'amount moved to savings account'.">Net</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.slice().reverse().map((row) => (
                                <tr
                                    key={row.month}
                                    className="border-b border-border hover:bg-background-tertiary cursor-pointer"
                                    onClick={() => router.push(`/transactions?startDate=${encodeURIComponent(row.startDate)}&endDate=${encodeURIComponent(row.endDate)}`)}
                                    title="View transactions for this month"
                                >
                                    <td className="py-2 px-3 text-foreground">{row.month}</td>
                                    <td className="py-2 px-3 text-right text-success">${row.income.toFixed(2)}</td>
                                    <td className="py-2 px-3 text-right text-danger">${row.expense.toFixed(2)}</td>
                                    <td className={`py-2 px-3 text-right font-medium ${row.net >= 0 ? 'text-success' : 'text-danger'}`}>
                                        ${row.net.toFixed(2)}
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
