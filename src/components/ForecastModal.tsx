'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, TrendingUp, Calendar, DollarSign, AlertTriangle, CheckCircle2, ChevronDown, Sparkles, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { getMonthOffset } from '@/lib/budgetUtils';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
} from 'recharts';
import ChartTooltip from '@/components/ChartTooltip';
import ModalDialog from './ModalDialog';

interface MonthProjection {
    month: string;
    label: string;
    income: number;
    expenses: number;
    scheduled: number;
    additionalExpense: number;
    balance: number;
    isTarget: boolean;
    isCurrent: boolean;
}

interface ForecastData {
    canAfford: boolean;
    projectedBalanceAtTarget: number;
    shortfall: number;
    lowestBalance: number;
    lowestMonth: string;
    monthlyProjections: MonthProjection[];
    additionalExpense: {
        amount: number;
        description: string;
        month: string;
    } | null;
    summary: {
        currentBalance: number;
        monthlyIncome: number;
        monthlyExpenses: number;
        scheduledCount: number;
        categoriesWithGoals: number;
        monthsProjected: number;
    };
}

interface CategoryOption {
    id: string;
    name: string;
    groupName: string;
    goalType: string | null;
    goalAmount: number | null;
}

interface ForecastModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentMonth: string;
    categories: CategoryOption[];
}

function formatMonthDisplay(monthStr: string): string {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

export default function ForecastModal({
    isOpen,
    onClose,
    currentMonth,
    categories,
}: ForecastModalProps) {
    // Form state
    const [targetMonth, setTargetMonth] = useState(() => getMonthOffset(currentMonth, 3));
    const [expenseType, setExpenseType] = useState<'custom' | 'category'>('custom');
    const [customAmount, setCustomAmount] = useState('');
    const [customDescription, setCustomDescription] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState('');
    const [expenseMonth, setExpenseMonth] = useState(() => getMonthOffset(currentMonth, 3));
    const [monthlyIncome, setMonthlyIncome] = useState('');

    // Data state
    const [forecastData, setForecastData] = useState<ForecastData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasQueried, setHasQueried] = useState(false);

    // Reset when modal opens
    useEffect(() => {
        if (isOpen) {
            setTargetMonth(getMonthOffset(currentMonth, 3));
            setExpenseMonth(getMonthOffset(currentMonth, 3));
            setExpenseType('custom');
            setCustomAmount('');
            setCustomDescription('');
            setSelectedCategoryId('');
            setMonthlyIncome('');
            setForecastData(null);
            setError(null);
            setHasQueried(false);
        }
    }, [isOpen, currentMonth]);

    // Sync expense month with target month when target changes
    useEffect(() => {
        setExpenseMonth(prev => prev > targetMonth ? targetMonth : prev);
    }, [targetMonth]);

    // Auto-extend target month if expense month is set beyond it
    useEffect(() => {
        if (expenseMonth > targetMonth) {
            setTargetMonth(expenseMonth);
        }
    }, [expenseMonth, targetMonth]);

    const fetchForecast = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            let additionalAmount = 0;
            let additionalDescription = '';

            if (expenseType === 'custom' && customAmount) {
                additionalAmount = Math.round(parseFloat(customAmount) * 100);
                additionalDescription = customDescription || 'Planned expense';
            } else if (expenseType === 'category' && selectedCategoryId) {
                const cat = categories.find(c => c.id === selectedCategoryId);
                if (cat?.goalAmount) {
                    additionalAmount = cat.goalAmount;
                    additionalDescription = cat.name;
                }
            }

            const incomeInCents = monthlyIncome ? Math.round(parseFloat(monthlyIncome) * 100) : 0;

            const params = new URLSearchParams({
                currentMonth,
                targetMonth,
                additionalAmount: String(additionalAmount),
                additionalDescription,
                additionalTargetMonth: expenseMonth,
                monthlyIncome: String(incomeInCents),
            });

            const res = await fetch(`/api/budget/forecast?${params}`);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to generate forecast');
            }

            const data = await res.json();
            setForecastData(data);
            setHasQueried(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate forecast');
        } finally {
            setLoading(false);
        }
    }, [currentMonth, targetMonth, expenseType, customAmount, customDescription, selectedCategoryId, categories, expenseMonth, monthlyIncome]);

    if (!isOpen) return null;

    // Prepare chart data
    const chartData = forecastData?.monthlyProjections.map(p => ({
        name: p.label,
        month: p.month,
        balance: p.balance / 100,
        income: p.income / 100,
        expenses: (p.expenses + p.scheduled + p.additionalExpense) / 100,
        isTarget: p.isTarget,
        isCurrent: p.isCurrent,
    })) || [];

    const minBalance = forecastData ? Math.min(...forecastData.monthlyProjections.map(p => p.balance)) / 100 : 0;
    const maxBalance = forecastData ? Math.max(...forecastData.monthlyProjections.map(p => p.balance)) / 100 : 0;
    const yMin = Math.floor(Math.min(minBalance, 0) / 100) * 100;
    const yMax = Math.ceil(maxBalance / 100) * 100 + 100;

    // Group categories by group for the dropdown
    const groupedCategories = categories.reduce<Record<string, CategoryOption[]>>((acc, cat) => {
        if (!acc[cat.groupName]) acc[cat.groupName] = [];
        acc[cat.groupName].push(cat);
        return acc;
    }, {});

    const selectedCategory = categories.find(c => c.id === selectedCategoryId);

    // Target month minimum is next month
    const minTargetMonth = getMonthOffset(currentMonth, 1);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] animate-fade-in" onClick={onClose}>
            <ModalDialog
                isOpen={isOpen}
                onClose={onClose}
                aria-label="Budget forecast"
                className="bg-background-secondary rounded-xl shadow-xl w-full max-w-[720px] mx-4 max-h-[90vh] overflow-y-auto animate-scale-in"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-gold" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Budget Forecast</h2>
                            <p className="text-sm text-neutral">Can you afford it? Let&apos;s find out.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-neutral hover:text-foreground transition-colors" aria-label="Close">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <div className="p-6 space-y-5">
                    {/* Monthly Income */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                            <DollarSign className="w-4 h-4 inline mr-1.5 text-positive" />
                            Monthly take-home income
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral">$</span>
                            <input
                                type="number"
                                value={monthlyIncome}
                                onChange={(e) => setMonthlyIncome(e.target.value)}
                                placeholder="e.g. 5000"
                                min="0"
                                step="0.01"
                                className="input w-full pl-7"
                            />
                        </div>
                        <p className="text-xs text-neutral mt-1">How much you bring home each month after tax</p>
                    </div>

                    {/* Target Month + Expense Month */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                <Calendar className="w-4 h-4 inline mr-1.5 text-gold" />
                                Forecast until
                                <span className="relative inline-block ml-1 group/tip">
                                    <Info className="w-3.5 h-3.5 inline text-neutral cursor-help" />
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/tip:block w-52 p-2 text-xs font-normal text-foreground bg-background-secondary border border-border rounded-lg shadow-lg z-10">
                                        How far into the future to project your budget. The chart will show every month from now until this date.
                                    </span>
                                </span>
                            </label>
                            <input
                                type="month"
                                value={targetMonth}
                                min={minTargetMonth}
                                onChange={(e) => setTargetMonth(e.target.value)}
                                className="input w-full"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                <Calendar className="w-4 h-4 inline mr-1.5 text-gold" />
                                Expense hits in
                                <span className="relative inline-block ml-1 group/tip">
                                    <Info className="w-3.5 h-3.5 inline text-neutral cursor-help" />
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/tip:block w-52 p-2 text-xs font-normal text-foreground bg-background-secondary border border-border rounded-lg shadow-lg z-10">
                                        The month when the planned expense will be deducted. This is when the money actually leaves your account.
                                    </span>
                                </span>
                            </label>
                            <input
                                type="month"
                                value={expenseMonth}
                                min={minTargetMonth}
                                onChange={(e) => setExpenseMonth(e.target.value)}
                                className="input w-full"
                            />
                        </div>
                    </div>

                    {/* Expense Type Toggle */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            <DollarSign className="w-4 h-4 inline mr-1.5 text-gold" />
                            What are you planning?
                        </label>
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={() => setExpenseType('custom')}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    expenseType === 'custom'
                                        ? 'bg-gold text-background'
                                        : 'bg-background-tertiary text-foreground hover:bg-background-tertiary/80'
                                }`}
                            >
                                Custom Expense
                            </button>
                            <button
                                onClick={() => setExpenseType('category')}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    expenseType === 'category'
                                        ? 'bg-gold text-background'
                                        : 'bg-background-tertiary text-foreground hover:bg-background-tertiary/80'
                                }`}
                            >
                                From Category Goal
                            </button>
                        </div>

                        {expenseType === 'custom' ? (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <input
                                        type="text"
                                        value={customDescription}
                                        onChange={(e) => setCustomDescription(e.target.value)}
                                        placeholder="e.g. Vacation, New laptop..."
                                        className="input w-full"
                                    />
                                </div>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral">$</span>
                                    <input
                                        type="number"
                                        value={customAmount}
                                        onChange={(e) => setCustomAmount(e.target.value)}
                                        placeholder="0.00"
                                        min="0"
                                        step="0.01"
                                        className="input w-full pl-7"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="relative">
                                <select
                                    value={selectedCategoryId}
                                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                                    className="input w-full appearance-none pr-8"
                                >
                                    <option value="">Select a category with a goal...</option>
                                    {Object.entries(groupedCategories).map(([groupName, cats]) => (
                                        <optgroup key={groupName} label={groupName}>
                                            {cats.filter(c => c.goalType).map((cat) => (
                                                <option key={cat.id} value={cat.id}>
                                                    {cat.name} — Goal: {formatCurrency(cat.goalAmount || 0)}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral pointer-events-none" />
                                {selectedCategory && selectedCategory.goalAmount && (
                                    <p className="text-xs text-neutral mt-1">
                                        Goal: {formatCurrency(selectedCategory.goalAmount)} ({selectedCategory.goalType})
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Generate Button */}
                    <button
                        onClick={fetchForecast}
                        disabled={loading}
                        className="btn btn-primary w-full flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Sparkles className="w-4 h-4 animate-spin" />
                                Generating forecast...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                {hasQueried ? 'Update Forecast' : 'Generate Forecast'}
                            </>
                        )}
                    </button>

                    {error && (
                        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">
                            {error}
                        </div>
                    )}

                    {/* Results */}
                    {forecastData && (
                        <div className="space-y-5 animate-fade-in">
                            {/* Verdict Banner */}
                            <div className={`rounded-xl p-4 ${
                                forecastData.canAfford
                                    ? 'bg-positive/10 border border-positive/30'
                                    : 'bg-danger/10 border border-danger/30'
                            }`}>
                                <div className="flex items-start gap-3">
                                    {forecastData.canAfford ? (
                                        <CheckCircle2 className="w-6 h-6 text-positive flex-shrink-0 mt-0.5" />
                                    ) : (
                                        <AlertTriangle className="w-6 h-6 text-danger flex-shrink-0 mt-0.5" />
                                    )}
                                    <div>
                                        <h3 className={`font-semibold text-lg ${
                                            forecastData.canAfford ? 'text-positive' : 'text-danger'
                                        }`}>
                                            {forecastData.canAfford ? 'Yes, you can afford it!' : 'Not quite yet...'}
                                        </h3>
                                        <p className="text-sm text-neutral mt-1">
                                            {forecastData.canAfford ? (
                                                <>
                                                    Projected balance of{' '}
                                                    <span className="font-medium text-positive">
                                                        {formatCurrency(forecastData.projectedBalanceAtTarget)}
                                                    </span>{' '}
                                                    {forecastData.additionalExpense
                                                        ? `after ${forecastData.additionalExpense.description}`
                                                        : `by ${formatMonthDisplay(targetMonth)}`
                                                    }.
                                                </>
                                            ) : (
                                                <>
                                                    You&apos;d be short by{' '}
                                                    <span className="font-medium text-danger">
                                                        {formatCurrency(forecastData.shortfall)}
                                                    </span>
                                                    . Consider reducing expenses or pushing the date back.
                                                </>
                                            )}
                                        </p>
                                        {forecastData.lowestBalance < 0 && (
                                            <p className="text-xs text-danger mt-1">
                                                ⚠ Balance dips to {formatCurrency(forecastData.lowestBalance)} in{' '}
                                                {formatMonthDisplay(forecastData.lowestMonth)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Chart */}
                            <div className="bg-background-tertiary rounded-xl p-4">
                                <h4 className="text-sm font-medium text-foreground mb-3">Projected Balance</h4>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                                        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                            <defs>
                                                <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--gold)" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="var(--gold)" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="dangerGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="var(--danger)" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                                            <XAxis
                                                dataKey="name"
                                                tick={{ fontSize: '0.6875rem', fill: 'var(--neutral)' }}
                                                tickLine={false}
                                                axisLine={{ stroke: 'var(--border)' }}
                                            />
                                            <YAxis
                                                tick={{ fontSize: '0.6875rem', fill: 'var(--neutral)' }}
                                                tickLine={false}
                                                axisLine={false}
                                                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                                                domain={[yMin, yMax]}
                                            />
                                            <Tooltip
                                                content={
                                                    <ChartTooltip
                                                        formatValue={(value) => formatCurrency(Math.round(value * 100))}
                                                    />
                                                }
                                                cursor={{ stroke: 'var(--gold)', strokeOpacity: 0.3, strokeDasharray: '4 3' }}
                                            />
                                            <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="3 3" strokeOpacity={0.7} />
                                            <Area
                                                type="monotone"
                                                dataKey="balance"
                                                stroke="var(--gold)"
                                                strokeWidth={2}
                                                fill="url(#balanceGradient)"
                                                name="Balance"
                                                dot={({ cx, cy, payload }: Record<string, unknown>) => {
                                                    const x = cx as number ?? 0;
                                                    const y = cy as number ?? 0;
                                                    const data = payload as { isTarget?: boolean; isCurrent?: boolean };
                                                    if (data?.isTarget) {
                                                        return (
                                                            <circle
                                                                key={`target-${x}`}
                                                                cx={x}
                                                                cy={y}
                                                                r={6}
                                                                fill="var(--gold)"
                                                                stroke="var(--background-secondary)"
                                                                strokeWidth={2}
                                                            />
                                                        );
                                                    }
                                                    if (data?.isCurrent) {
                                                        return (
                                                            <circle
                                                                key={`current-${x}`}
                                                                cx={x}
                                                                cy={y}
                                                                r={4}
                                                                fill="var(--info)"
                                                                stroke="var(--background-secondary)"
                                                                strokeWidth={2}
                                                            />
                                                        );
                                                    }
                                                    return <circle key={`dot-${x}`} cx={x} cy={y} r={0} />;
                                                }}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex items-center justify-center gap-4 mt-2 text-xs text-neutral">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-info"></span>
                                        Current
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-3 h-3 rounded-full bg-gold"></span>
                                        Target
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-6 h-0.5 bg-danger opacity-70" style={{ borderTop: '1px dashed' }}></span>
                                        Zero line
                                    </span>
                                </div>
                            </div>

                            {/* Summary Cards */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-background-tertiary rounded-lg p-3 text-center">
                                    <p className="text-xs text-neutral mb-1">Current Balance</p>
                                    <p className="text-lg font-semibold text-foreground">
                                        {formatCurrency(forecastData.summary.currentBalance)}
                                    </p>
                                </div>
                                <div className="bg-background-tertiary rounded-lg p-3 text-center">
                                    <p className="text-xs text-neutral mb-1">Monthly Income</p>
                                    <p className="text-lg font-semibold text-positive">
                                        {formatCurrency(forecastData.summary.monthlyIncome)}
                                    </p>
                                </div>
                                <div className="bg-background-tertiary rounded-lg p-3 text-center">
                                    <p className="text-xs text-neutral mb-1">Monthly Expenses</p>
                                    <p className="text-lg font-semibold text-danger">
                                        {formatCurrency(forecastData.summary.monthlyExpenses)}
                                    </p>
                                </div>
                            </div>

                            {/* Detailed monthly breakdown */}
                            <div className="bg-background-tertiary rounded-xl overflow-hidden">
                                <div className="px-4 py-3 border-b border-border">
                                    <h4 className="text-sm font-medium text-foreground">Month-by-Month Breakdown</h4>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-background-tertiary">
                                            <tr className="text-neutral text-xs">
                                                <th className="text-left px-4 py-2">Month</th>
                                                <th className="text-right px-4 py-2">Income</th>
                                                <th className="text-right px-4 py-2">Expenses</th>
                                                <th className="text-right px-4 py-2">Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {forecastData.monthlyProjections.map((p) => (
                                                <tr
                                                    key={p.month}
                                                    className={`border-t border-border/30 ${
                                                        p.isTarget ? 'bg-gold/5' : ''
                                                    } ${p.isCurrent ? 'bg-info/5' : ''}`}
                                                >
                                                    <td className="px-4 py-2 text-foreground">
                                                        {p.label}
                                                        {p.isTarget && (
                                                            <span className="ml-1.5 text-[10px] bg-gold/20 text-gold px-1.5 py-0.5 rounded">
                                                                TARGET
                                                            </span>
                                                        )}
                                                        {p.isCurrent && (
                                                            <span className="ml-1.5 text-[10px] bg-info/20 text-info px-1.5 py-0.5 rounded">
                                                                NOW
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 text-right text-positive">
                                                        {p.isCurrent ? '—' : `+${formatCurrency(p.income)}`}
                                                    </td>
                                                    <td className="px-4 py-2 text-right text-danger">
                                                        {formatCurrency(p.expenses + p.scheduled + p.additionalExpense)}
                                                        {p.additionalExpense > 0 && (
                                                            <span className="block text-[10px] text-neutral">
                                                                incl. {formatCurrency(p.additionalExpense)} planned
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className={`px-4 py-2 text-right font-medium ${
                                                        p.balance < 0 ? 'text-danger' : 'text-positive'
                                                    }`}>
                                                        {formatCurrency(p.balance)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Footer info */}
                            <p className="text-xs text-neutral text-center">
                                Based on {forecastData.summary.categoriesWithGoals} categories with goals
                                {forecastData.summary.scheduledCount > 0 && (
                                    <> and {forecastData.summary.scheduledCount} scheduled transactions</>
                                )}
                                . Forecast covers {forecastData.summary.monthsProjected} months.
                            </p>
                        </div>
                    )}
                </div>
            </ModalDialog>
        </div>
    );
}
