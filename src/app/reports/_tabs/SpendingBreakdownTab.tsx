'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
} from 'recharts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import ChartTooltip from '@/components/ChartTooltip';

interface SpendingData {
    name: string;
    value: number;
    color: string;
    categoryId?: string;
}

interface Props {
    currency: string;
    excludeCategoryNames: Set<string>;
}

const COLORS = [
    '#d4a846', '#4ade80', '#f87171', '#60a5fa', '#a78bfa',
    '#fb923c', '#2dd4bf', '#f472b6', '#818cf8', '#fbbf24',
];

function formatReportCurrency(cents: number, currency = 'AUD'): string {
    return formatCurrency(cents, currency, { useAbsolute: true });
}

function getMonthRange(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59);
    return { start, end };
}

/**
 * Spending Breakdown — pie chart of top spending categories for the selected
 * month, plus a top-categories list. Honors the global category exclusion set
 * passed from the parent.
 */
export default function SpendingBreakdownTab({ currency, excludeCategoryNames }: Props) {
    const router = useRouter();
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const [showYearPicker, setShowYearPicker] = useState(false);
    const [spendingData, setSpendingData] = useState<SpendingData[]>([]);
    const [totalIncome, setTotalIncome] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchSpendingData = useCallback(async () => {
        setLoading(true);
        try {
            const { start, end } = getMonthRange(selectedDate);
            const res = await fetch(
                `/api/transactions?limit=1000&startDate=${start.toISOString()}&endDate=${end.toISOString()}`
            );
            const data = await res.json();
            const transactions = data.transactions || [];

            const categoryTotals = new Map<string, { name: string; value: number; categoryId?: string }>();
            let totalInc = 0;

            for (const t of transactions) {
                // Transfers between your own accounts are plumbing, not spending.
                if (t.transferId) continue;
                // Reconciliation adjustments are bookkeeping plugs, not spending.
                if (typeof t.payee === 'string' && t.payee.includes('Reconciliation Adjustment')) continue;
                if (t.amount < 0) {
                    const category = t.category?.name || 'Uncategorized';
                    const key = t.category?.id || `__uncat__${category}`;
                    const current = categoryTotals.get(key) || { name: category, value: 0, categoryId: t.category?.id };
                    current.value += Math.abs(t.amount);
                    categoryTotals.set(key, current);
                } else if (t.amount > 0) {
                    totalInc += t.amount;
                }
            }

            const sorted = Array.from(categoryTotals.values())
                .sort((a, b) => b.value - a.value)
                .slice(0, 10)
                .map((entry, i) => ({
                    name: entry.name,
                    value: entry.value,
                    color: COLORS[i % COLORS.length],
                    categoryId: entry.categoryId,
                }));

            setSpendingData(sorted);
            setTotalIncome(totalInc);
        } catch (err) {
            console.error('Failed to fetch spending data:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchSpendingData();
    }, [fetchSpendingData]);

    function changeMonth(delta: number) {
        setSelectedDate(prev => {
            const next = new Date(prev);
            next.setMonth(next.getMonth() + delta);
            return next;
        });
    }

    function changeYear(year: number) {
        setSelectedDate(prev => {
            const next = new Date(prev);
            next.setFullYear(year);
            return next;
        });
        setShowYearPicker(false);
    }

    function formatMonthYear(date: Date): string {
        return date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    }

    const availableYears = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years: number[] = [];
        for (let y = currentYear; y >= currentYear - 10; y--) {
            years.push(y);
        }
        return years;
    }, []);

    const filteredSpendingData = useMemo(() => {
        return spendingData.filter(cat => !excludeCategoryNames.has(cat.name));
    }, [spendingData, excludeCategoryNames]);

    const filteredTotalSpending = useMemo(() => {
        return filteredSpendingData.reduce((sum, cat) => sum + cat.value, 0);
    }, [filteredSpendingData]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart */}
            <div className="lg:col-span-2 card">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Spending Breakdown</h2>
                        <p className="text-sm text-neutral">{formatMonthYear(selectedDate)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => changeMonth(-1)}
                            className="p-2 hover:bg-background-tertiary rounded-lg"
                        >
                            <ChevronLeft className="w-5 h-5 text-neutral" />
                        </button>

                        {/* Year Picker */}
                        <div className="relative">
                            <button
                                onClick={() => setShowYearPicker(!showYearPicker)}
                                className="btn btn-ghost"
                            >
                                <Calendar className="w-5 h-5" />
                                {formatMonthYear(selectedDate)}
                            </button>
                            {showYearPicker && (
                                <div className="absolute right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-lg z-20 p-2 min-w-[200px]">
                                    <div className="text-xs text-neutral font-medium mb-2 px-2">Jump to Year</div>
                                    <div className="grid grid-cols-3 gap-1">
                                        {availableYears.map(year => (
                                            <button
                                                key={year}
                                                onClick={() => changeYear(year)}
                                                className={`px-2 py-1.5 text-sm rounded hover:bg-background-tertiary ${
                                                    selectedDate.getFullYear() === year ? 'bg-gold/20 text-gold' : 'text-foreground'
                                                }`}
                                            >
                                                {year}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="border-t border-border mt-2 pt-2">
                                        <div className="text-xs text-neutral font-medium mb-2 px-2">Month</div>
                                        <div className="grid grid-cols-4 gap-1">
                                            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, idx) => (
                                                <button
                                                    key={month}
                                                    onClick={() => {
                                                        setSelectedDate(prev => new Date(prev.getFullYear(), idx, 1));
                                                        setShowYearPicker(false);
                                                    }}
                                                    className={`px-2 py-1 text-xs rounded hover:bg-background-tertiary ${
                                                        selectedDate.getMonth() === idx ? 'bg-gold/20 text-gold' : 'text-foreground'
                                                    }`}
                                                >
                                                    {month}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => changeMonth(1)}
                            className="p-2 hover:bg-background-tertiary rounded-lg"
                        >
                            <ChevronRight className="w-5 h-5 text-neutral" />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="h-80 flex items-center justify-center">
                        <div className="animate-spin w-8 h-8 border-2 border-gold border-t-transparent rounded-full" />
                    </div>
                ) : filteredSpendingData.length === 0 ? (
                    <div className="h-80 flex flex-col items-center justify-center">
                        <BarChart3 className="w-12 h-12 text-neutral mb-4" />
                        <p className="text-neutral">{spendingData.length > 0 ? 'All categories hidden' : 'No spending data for this month'}</p>
                        {spendingData.length === 0 && (
                            <Link href="/transactions" className="btn btn-primary mt-4">
                                Add Transactions
                            </Link>
                        )}
                    </div>
                ) : (
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                            <PieChart>
                                <Pie
                                    data={filteredSpendingData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={120}
                                    paddingAngle={2}
                                    dataKey="value"
                                    animationDuration={750}
                                    animationEasing="ease-out"
                                    cursor="pointer"
                                    onClick={(data) => {
                                        const slice = data as { categoryId?: string; name?: string };
                                        const { start, end } = getMonthRange(selectedDate);
                                        const params = new URLSearchParams({
                                            startDate: start.toISOString(),
                                            endDate: end.toISOString(),
                                        });
                                        if (slice.categoryId) params.set('categoryId', slice.categoryId);
                                        router.push(`/transactions?${params.toString()}`);
                                    }}
                                >
                                    {filteredSpendingData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    content={
                                        <ChartTooltip
                                            currency={currency}
                                            formatValue={(value) => formatReportCurrency(value, currency)}
                                        />
                                    }
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Totals */}
                {!loading && filteredSpendingData.length > 0 && (
                    <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                        <div className="text-center">
                            <p className="text-sm text-neutral">Filtered Spending</p>
                            <p className="text-2xl font-bold text-danger">{formatReportCurrency(filteredTotalSpending, currency)}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-sm text-neutral">Total Income</p>
                            <p className="text-2xl font-bold text-success">{formatReportCurrency(totalIncome, currency)}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Category List */}
            <div className="card">
                <h3 className="text-lg font-semibold text-foreground mb-4">Top Categories</h3>
                <div className="space-y-3">
                    {filteredSpendingData.map((cat) => {
                        const percent = filteredTotalSpending > 0 ? ((cat.value / filteredTotalSpending) * 100).toFixed(0) : 0;
                        return (
                            <div key={cat.name} className="flex items-center gap-3">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: cat.color }}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-foreground truncate">{cat.name}</span>
                                        <span className="text-sm text-neutral">{percent}%</span>
                                    </div>
                                    <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                                width: `${percent}%`,
                                                backgroundColor: cat.color,
                                            }}
                                        />
                                    </div>
                                </div>
                                <span className="text-sm font-medium text-foreground w-24 text-right">
                                    {formatReportCurrency(cat.value, currency)}
                                </span>
                            </div>
                        );
                    })}
                    {filteredSpendingData.length === 0 && !loading && (
                        <p className="text-neutral text-center py-4">
                            {spendingData.length > 0 ? 'All categories hidden' : 'No spending data'}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
