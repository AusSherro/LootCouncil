'use client';

import { BarChart3, Calendar, ChevronLeft, ChevronRight, TrendingUp, EyeOff, Eye, Filter, X } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    AreaChart,
    Area,
    LineChart,
    Line,
} from 'recharts';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

interface SpendingData {
    name: string;
    value: number;
    color: string;
}

interface IncomeExpenseData {
    month: string;
    income: number;
    expense: number;
    net: number;
}

interface NetWorthData {
    month: string;
    netWorth: number;
    accountBalance?: number;
    assetValue?: number;
}

interface NetWorthFilterItem {
    id: string;
    name: string;
    type?: string;
    symbol?: string;
    assetClass?: string;
}

interface PayeeSpendingData {
    payee: string;
    total: number;
    count: number;
}

interface CategoryTrendData {
    month: string;
    [key: string]: string | number;
}

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

const COLORS = [
    '#d4a846', '#4ade80', '#f87171', '#60a5fa', '#a78bfa',
    '#fb923c', '#2dd4bf', '#f472b6', '#818cf8', '#fbbf24'
];

// Preset date range options
const DATE_RANGE_PRESETS = [
    { label: '3 Months', months: 3 },
    { label: '6 Months', months: 6 },
    { label: '1 Year', months: 12 },
    { label: '2 Years', months: 24 },
    { label: '3 Years', months: 36 },
    { label: 'All Time', months: 0 },
];

function formatReportCurrency(cents: number): string {
    return formatCurrency(cents, 'AUD', { useAbsolute: true });
}

const reportTabs = [
    { id: 'spending', name: 'Spending Breakdown' },
    { id: 'income', name: 'Income v Expense' },
    { id: 'budget-actual', name: 'Budget vs Actual' },
    { id: 'networth', name: 'Net Worth' },
    { id: 'payees', name: 'By Payee' },
    { id: 'trends', name: 'Category Trends' },
];

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState('spending');
    const [spendingData, setSpendingData] = useState<SpendingData[]>([]);
    const [incomeExpenseData, setIncomeExpenseData] = useState<IncomeExpenseData[]>([]);
    const [netWorthData, setNetWorthData] = useState<NetWorthData[]>([]);
    const [payeeSpendingData, setPayeeSpendingData] = useState<PayeeSpendingData[]>([]);
    const [categoryTrendData, setCategoryTrendData] = useState<CategoryTrendData[]>([]);
    const [trendCategories, setTrendCategories] = useState<string[]>([]);
    const [budgetVsActualData, setBudgetVsActualData] = useState<BudgetVsActualData[]>([]);
    const [budgetVsActualSummary, setBudgetVsActualSummary] = useState<BudgetVsActualSummary[]>([]);
    const [budgetVsActualTotals, setBudgetVsActualTotals] = useState<{ budgeted: number; actual: number; variance: number }>({ budgeted: 0, actual: 0, variance: 0 });
    const [budgetVsActualMonths, setBudgetVsActualMonths] = useState(6);
    const [showBudgetActualRangeDropdown, setShowBudgetActualRangeDropdown] = useState(false);
    const [loading, setLoading] = useState(true);
    const [, setTotalSpending] = useState(0);
    const [totalIncome, setTotalIncome] = useState(0);
    
    // Date selection for spending breakdown
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const [showYearPicker, setShowYearPicker] = useState(false);
    
    // Hidden categories for spending breakdown
    const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set(['Uncategorized']));
    const [showCategoryFilter, setShowCategoryFilter] = useState(false);
    
    // Date range for Income vs Expense and Net Worth
    const [incomeExpenseMonths, setIncomeExpenseMonths] = useState(12);
    const [netWorthMonths, setNetWorthMonths] = useState(12);
    const [payeeMonths, setPayeeMonths] = useState(6);
    const [trendMonths, setTrendMonths] = useState(6);
    const [showIncomeRangeDropdown, setShowIncomeRangeDropdown] = useState(false);
    const [showNetWorthRangeDropdown, setShowNetWorthRangeDropdown] = useState(false);
    const [showPayeeRangeDropdown, setShowPayeeRangeDropdown] = useState(false);
    const [showTrendRangeDropdown, setShowTrendRangeDropdown] = useState(false);
    
    // Net worth filter state
    const [availableAccounts, setAvailableAccounts] = useState<NetWorthFilterItem[]>([]);
    const [availableAssets, setAvailableAssets] = useState<NetWorthFilterItem[]>([]);
    const [excludedAccounts, setExcludedAccounts] = useState<Set<string>>(new Set());
    const [excludedAssets, setExcludedAssets] = useState<Set<string>>(new Set());
    const [showNetWorthFilter, setShowNetWorthFilter] = useState(false);

    const getMonthRange = useCallback((date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0, 23, 59, 59);
        return { start, end };
    }, []);

    const fetchSpendingData = useCallback(async () => {
        setLoading(true);
        try {
            const { start, end } = getMonthRange(selectedDate);
            const res = await fetch(
                `/api/transactions?limit=1000&startDate=${start.toISOString()}&endDate=${end.toISOString()}`
            );
            const data = await res.json();
            const transactions = data.transactions || [];

            // Group spending by category
            const categoryTotals = new Map<string, number>();
            let totalExp = 0;
            let totalInc = 0;

            for (const t of transactions) {
                if (t.amount < 0) {
                    const category = t.category?.name || 'Uncategorized';
                    const current = categoryTotals.get(category) || 0;
                    categoryTotals.set(category, current + Math.abs(t.amount));
                    totalExp += Math.abs(t.amount);
                } else if (t.amount > 0) {
                    totalInc += t.amount;
                }
            }

            // Convert to array and sort
            const sorted = Array.from(categoryTotals.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, value], i) => ({
                    name,
                    value,
                    color: COLORS[i % COLORS.length],
                }));

            setSpendingData(sorted);
            setTotalSpending(totalExp);
            setTotalIncome(totalInc);
        } catch (err) {
            console.error('Failed to fetch spending data:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedDate, getMonthRange]);

    const fetchIncomeExpenseData = useCallback(async () => {
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
                const data = await res.json();
                const transactions = data.transactions || [];
                
                let income = 0;
                let expense = 0;
                
                for (const t of transactions) {
                    if (t.amount > 0) {
                        income += t.amount;
                    } else {
                        expense += Math.abs(t.amount);
                    }
                }
                
                // Include year in label if showing more than 12 months
                const monthLabel = monthsToFetch > 12 
                    ? date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
                    : date.toLocaleDateString('en-AU', { month: 'short' });
                
                months.push({
                    month: monthLabel,
                    income: income / 100,
                    expense: expense / 100,
                    net: (income - expense) / 100,
                });
            }
            
            setIncomeExpenseData(months);
        } catch (err) {
            console.error('Failed to fetch income/expense data:', err);
        } finally {
            setLoading(false);
        }
    }, [getMonthRange, incomeExpenseMonths]);

    const fetchNetWorthData = useCallback(async () => {
        setLoading(true);
        try {
            const monthsParam = netWorthMonths === 0 ? 0 : netWorthMonths;
            const excludeAccountsParam = Array.from(excludedAccounts).join(',');
            const excludeAssetsParam = Array.from(excludedAssets).join(',');
            const url = `/api/networth?months=${monthsParam}&excludeAccounts=${excludeAccountsParam}&excludeAssets=${excludeAssetsParam}`;
            const res = await fetch(url);
            const data = await res.json();
            setNetWorthData(data.history || []);
            // Only set available items on first load (don't overwrite when filtering)
            if (data.availableAccounts && availableAccounts.length === 0) {
                setAvailableAccounts(data.availableAccounts);
            }
            if (data.availableAssets && availableAssets.length === 0) {
                setAvailableAssets(data.availableAssets);
            }
        } catch (err) {
            console.error('Failed to fetch net worth data:', err);
        } finally {
            setLoading(false);
        }
    }, [netWorthMonths, excludedAccounts, excludedAssets, availableAccounts.length, availableAssets.length]);

    const fetchPayeeData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/reports/advanced?type=spending-by-payee&months=${payeeMonths}`);
            const data = await res.json();
            setPayeeSpendingData(data.data || []);
        } catch (err) {
            console.error('Failed to fetch payee data:', err);
        } finally {
            setLoading(false);
        }
    }, [payeeMonths]);

    const fetchTrendData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/reports/advanced?type=category-trends&months=${trendMonths}`);
            const data = await res.json();
            setCategoryTrendData(data.data || []);
            setTrendCategories(data.categories || []);
        } catch (err) {
            console.error('Failed to fetch trend data:', err);
        } finally {
            setLoading(false);
        }
    }, [trendMonths]);

    const fetchBudgetVsActualData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/reports/advanced?type=budget-vs-actual&months=${budgetVsActualMonths}`);
            const data = await res.json();
            setBudgetVsActualData(data.data || []);
            setBudgetVsActualSummary(data.monthlySummary || []);
            setBudgetVsActualTotals(data.totals || { budgeted: 0, actual: 0, variance: 0 });
        } catch (err) {
            console.error('Failed to fetch budget vs actual data:', err);
        } finally {
            setLoading(false);
        }
    }, [budgetVsActualMonths]);

    useEffect(() => {
        if (activeTab === 'spending') {
            fetchSpendingData();
        } else if (activeTab === 'income') {
            fetchIncomeExpenseData();
        } else if (activeTab === 'networth') {
            fetchNetWorthData();
        } else if (activeTab === 'payees') {
            fetchPayeeData();
        } else if (activeTab === 'trends') {
            fetchTrendData();
        } else if (activeTab === 'budget-actual') {
            fetchBudgetVsActualData();
        }
    }, [activeTab, fetchSpendingData, fetchIncomeExpenseData, fetchNetWorthData, fetchPayeeData, fetchTrendData, fetchBudgetVsActualData]);

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

    // Generate available years (current year - 5 to current year)
    const availableYears = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let y = currentYear; y >= currentYear - 10; y--) {
            years.push(y);
        }
        return years;
    }, []);

    // Filter spending data by hidden categories
    const filteredSpendingData = useMemo(() => {
        return spendingData.filter(cat => !hiddenCategories.has(cat.name));
    }, [spendingData, hiddenCategories]);

    const filteredTotalSpending = useMemo(() => {
        return filteredSpendingData.reduce((sum, cat) => sum + cat.value, 0);
    }, [filteredSpendingData]);

    // Get all unique categories from spending data
    const allCategories = useMemo(() => {
        return spendingData.map(cat => cat.name);
    }, [spendingData]);

    function toggleCategoryVisibility(categoryName: string) {
        setHiddenCategories(prev => {
            const next = new Set(prev);
            if (next.has(categoryName)) {
                next.delete(categoryName);
            } else {
                next.add(categoryName);
            }
            return next;
        });
    }

    // Calculate summary stats for income vs expense
    const avgIncome = incomeExpenseData.length > 0 
        ? incomeExpenseData.reduce((sum, d) => sum + d.income, 0) / incomeExpenseData.length 
        : 0;
    const avgExpense = incomeExpenseData.length > 0 
        ? incomeExpenseData.reduce((sum, d) => sum + d.expense, 0) / incomeExpenseData.length 
        : 0;
    const avgNet = avgIncome - avgExpense;

    return (
        <div className="p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
                        <BarChart3 className="w-7 h-7 text-gold" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
                        <p className="text-neutral">Analyze your spending patterns</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 mb-6 border-b border-border pb-2">
                {reportTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id
                                ? 'bg-gold/20 text-gold'
                                : 'text-neutral hover:text-foreground hover:bg-background-tertiary'
                            }`}
                    >
                        {tab.name}
                    </button>
                ))}
            </div>

            {activeTab === 'spending' && (
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
                                
                                {/* Category Filter */}
                                <div className="relative ml-2">
                                    <button
                                        onClick={() => setShowCategoryFilter(!showCategoryFilter)}
                                        className={`p-2 rounded-lg transition-colors ${
                                            hiddenCategories.size > 0 ? 'bg-gold/20 text-gold' : 'hover:bg-background-tertiary text-neutral'
                                        }`}
                                        title="Filter categories"
                                    >
                                        <EyeOff className="w-5 h-5" />
                                    </button>
                                    {showCategoryFilter && (
                                        <div className="absolute right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-lg z-20 py-2 min-w-[200px]">
                                            <div className="px-3 py-1 text-xs text-neutral font-medium">Hide Categories</div>
                                            {allCategories.length === 0 ? (
                                                <div className="px-3 py-2 text-sm text-neutral">No categories to filter</div>
                                            ) : (
                                                allCategories.map(cat => (
                                                    <button
                                                        key={cat}
                                                        onClick={() => toggleCategoryVisibility(cat)}
                                                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
                                                    >
                                                        {hiddenCategories.has(cat) ? (
                                                            <EyeOff className="w-4 h-4 text-neutral" />
                                                        ) : (
                                                            <Eye className="w-4 h-4 text-gold" />
                                                        )}
                                                        <span className={hiddenCategories.has(cat) ? 'text-neutral' : 'text-foreground'}>{cat}</span>
                                                    </button>
                                                ))
                                            )}
                                            {hiddenCategories.size > 0 && (
                                                <div className="border-t border-border mt-1 pt-1">
                                                    <button
                                                        onClick={() => setHiddenCategories(new Set())}
                                                        className="w-full px-3 py-1.5 text-left text-sm text-gold hover:bg-background-tertiary"
                                                    >
                                                        Show All
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
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
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={filteredSpendingData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={80}
                                            outerRadius={120}
                                            paddingAngle={2}
                                            dataKey="value"
                                        >
                                            {filteredSpendingData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1a1a24',
                                                border: '1px solid #2d2d3d',
                                                borderRadius: '8px',
                                            }}
                                            formatter={(value) => typeof value === 'number' ? formatReportCurrency(value) : ''}
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
                                    <p className="text-2xl font-bold text-danger">{formatReportCurrency(filteredTotalSpending)}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-neutral">Total Income</p>
                                    <p className="text-2xl font-bold text-success">{formatReportCurrency(totalIncome)}</p>
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
                                            {formatReportCurrency(cat.value)}
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
            )}

            {/* Income vs Expense Tab */}
            {activeTab === 'income' && (
                <div className="space-y-6">
                    {/* Date Range Selector */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-foreground">Income vs Expense</h2>
                        <div className="relative">
                            <button
                                onClick={() => setShowIncomeRangeDropdown(!showIncomeRangeDropdown)}
                                className="btn btn-ghost flex items-center gap-2"
                            >
                                <Calendar className="w-4 h-4" />
                                {DATE_RANGE_PRESETS.find(p => p.months === incomeExpenseMonths)?.label || 'Custom'}
                            </button>
                            {showIncomeRangeDropdown && (
                                <div className="absolute right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
                                    {DATE_RANGE_PRESETS.map((preset) => (
                                        <button
                                            key={preset.months}
                                            onClick={() => {
                                                setIncomeExpenseMonths(preset.months);
                                                setShowIncomeRangeDropdown(false);
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
                        ) : incomeExpenseData.length === 0 ? (
                            <div className="h-80 flex flex-col items-center justify-center">
                                <BarChart3 className="w-12 h-12 text-neutral mb-4" />
                                <p className="text-neutral">No transaction data available</p>
                            </div>
                        ) : (
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={incomeExpenseData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#2d2d3d" />
                                        <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                                        <YAxis 
                                            stroke="#94a3b8" 
                                            fontSize={12}
                                            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1a1a24',
                                                border: '1px solid #2d2d3d',
                                                borderRadius: '8px',
                                            }}
                                            formatter={(value) => typeof value === 'number' ? [`$${value.toFixed(2)}`, ''] : ''}
                                        />
                                        <Legend />
                                        <Bar dataKey="income" name="Income" fill="#4ade80" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="expense" name="Expense" fill="#f87171" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* Monthly Breakdown Table */}
                    <div className="card">
                        <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Details</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left py-2 px-3 text-neutral font-medium">Month</th>
                                        <th className="text-right py-2 px-3 text-neutral font-medium">Income</th>
                                        <th className="text-right py-2 px-3 text-neutral font-medium">Expense</th>
                                        <th className="text-right py-2 px-3 text-neutral font-medium">Net</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {incomeExpenseData.slice().reverse().map((row) => (
                                        <tr key={row.month} className="border-b border-border hover:bg-background-tertiary">
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
            )}

            {/* Budget vs Actual Tab */}
            {activeTab === 'budget-actual' && (
                <div className="space-y-6">
                    {/* Date Range Selector */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-foreground">Budget vs Actual</h2>
                        <div className="relative">
                            <button
                                onClick={() => setShowBudgetActualRangeDropdown(!showBudgetActualRangeDropdown)}
                                className="btn btn-ghost flex items-center gap-2"
                            >
                                <Calendar className="w-4 h-4" />
                                {DATE_RANGE_PRESETS.find(p => p.months === budgetVsActualMonths)?.label || 'Custom'}
                            </button>
                            {showBudgetActualRangeDropdown && (
                                <div className="absolute right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
                                    {DATE_RANGE_PRESETS.map((preset) => (
                                        <button
                                            key={preset.months}
                                            onClick={() => {
                                                setBudgetVsActualMonths(preset.months);
                                                setShowBudgetActualRangeDropdown(false);
                                            }}
                                            className={`w-full text-left px-4 py-2 text-sm hover:bg-background-tertiary ${
                                                budgetVsActualMonths === preset.months ? 'text-gold' : 'text-foreground'
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
                            <p className="text-2xl font-bold text-foreground">${budgetVsActualTotals.budgeted.toFixed(0)}</p>
                        </div>
                        <div className="card">
                            <p className="text-sm text-neutral mb-1">Total Spent</p>
                            <p className="text-2xl font-bold text-danger">${budgetVsActualTotals.actual.toFixed(0)}</p>
                        </div>
                        <div className="card">
                            <p className="text-sm text-neutral mb-1">Under/Over Budget</p>
                            <p className={`text-2xl font-bold ${budgetVsActualTotals.variance >= 0 ? 'text-success' : 'text-danger'}`}>
                                {budgetVsActualTotals.variance >= 0 ? '+' : ''}{budgetVsActualTotals.variance.toFixed(0)}
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
                        ) : budgetVsActualSummary.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center">
                                <BarChart3 className="w-12 h-12 text-neutral mb-4" />
                                <p className="text-neutral">No budget data available</p>
                            </div>
                        ) : (
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={budgetVsActualSummary}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#2d2d3d" />
                                        <XAxis 
                                            dataKey="month" 
                                            stroke="#94a3b8" 
                                            fontSize={12}
                                            tickFormatter={(value) => {
                                                const [year, month] = value.split('-');
                                                return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-AU', { month: 'short' });
                                            }}
                                        />
                                        <YAxis 
                                            stroke="#94a3b8" 
                                            fontSize={12}
                                            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1a1a24',
                                                border: '1px solid #2d2d3d',
                                                borderRadius: '8px',
                                            }}
                                            formatter={(value) => typeof value === 'number' ? [`$${value.toFixed(2)}`, ''] : ''}
                                        />
                                        <Legend />
                                        <Bar dataKey="budgeted" name="Budgeted" fill="#4fc3f7" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="actual" name="Actual" fill="#f87171" radius={[4, 4, 0, 0]} />
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
                                    {budgetVsActualData.slice(0, 20).map((row) => (
                                        <tr key={row.categoryId} className="border-b border-border hover:bg-background-tertiary">
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
            )}

            {/* Net Worth Tab */}
            {activeTab === 'networth' && (
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <TrendingUp className="w-6 h-6 text-gold" />
                            <h2 className="text-lg font-semibold text-foreground">Net Worth Over Time</h2>
                            {(excludedAccounts.size > 0 || excludedAssets.size > 0) && (
                                <span className="text-xs text-warning bg-warning/10 px-2 py-1 rounded">
                                    {excludedAccounts.size + excludedAssets.size} excluded
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Filter button */}
                            <button
                                onClick={() => setShowNetWorthFilter(!showNetWorthFilter)}
                                className={`btn btn-ghost flex items-center gap-2 ${showNetWorthFilter ? 'text-gold' : ''}`}
                            >
                                <Filter className="w-4 h-4" />
                                Filter
                            </button>
                            {/* Date range dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowNetWorthRangeDropdown(!showNetWorthRangeDropdown)}
                                    className="btn btn-ghost flex items-center gap-2"
                                >
                                    <Calendar className="w-4 h-4" />
                                    {DATE_RANGE_PRESETS.find(p => p.months === netWorthMonths)?.label || 'Custom'}
                                </button>
                                {showNetWorthRangeDropdown && (
                                    <div className="absolute right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
                                        {DATE_RANGE_PRESETS.map((preset) => (
                                            <button
                                                key={preset.months}
                                                onClick={() => {
                                                    setNetWorthMonths(preset.months);
                                                    setShowNetWorthRangeDropdown(false);
                                                }}
                                                className={`w-full text-left px-4 py-2 text-sm hover:bg-background-tertiary ${
                                                    netWorthMonths === preset.months ? 'text-gold' : 'text-foreground'
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Filter Panel */}
                    {showNetWorthFilter && (
                        <div className="mb-4 p-4 bg-background-tertiary rounded-lg border border-border">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-medium text-foreground">Include/Exclude from Net Worth</h3>
                                <button
                                    onClick={() => setShowNetWorthFilter(false)}
                                    className="p-1 hover:bg-background-secondary rounded"
                                >
                                    <X className="w-4 h-4 text-neutral" />
                                </button>
                            </div>
                            <p className="text-xs text-neutral mb-3">
                                Uncheck items to exclude them. Assets only appear in the chart from the date they were added.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Accounts */}
                                <div>
                                    <h4 className="text-xs font-medium text-neutral uppercase mb-2">Accounts</h4>
                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {availableAccounts.map(account => (
                                            <label key={account.id} className="flex items-center gap-2 cursor-pointer hover:bg-background-secondary p-1.5 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={!excludedAccounts.has(account.id)}
                                                    onChange={(e) => {
                                                        const newExcluded = new Set(excludedAccounts);
                                                        if (e.target.checked) {
                                                            newExcluded.delete(account.id);
                                                        } else {
                                                            newExcluded.add(account.id);
                                                        }
                                                        setExcludedAccounts(newExcluded);
                                                    }}
                                                    className="w-4 h-4 rounded border-border accent-gold"
                                                />
                                                <span className="text-sm text-foreground">{account.name}</span>
                                                <span className="text-xs text-neutral">({account.type})</span>
                                            </label>
                                        ))}
                                        {availableAccounts.length === 0 && (
                                            <p className="text-xs text-neutral italic">No on-budget accounts</p>
                                        )}
                                    </div>
                                </div>
                                {/* Assets */}
                                <div>
                                    <h4 className="text-xs font-medium text-neutral uppercase mb-2">Assets</h4>
                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {availableAssets.map(asset => (
                                            <label key={asset.id} className="flex items-center gap-2 cursor-pointer hover:bg-background-secondary p-1.5 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={!excludedAssets.has(asset.id)}
                                                    onChange={(e) => {
                                                        const newExcluded = new Set(excludedAssets);
                                                        if (e.target.checked) {
                                                            newExcluded.delete(asset.id);
                                                        } else {
                                                            newExcluded.add(asset.id);
                                                        }
                                                        setExcludedAssets(newExcluded);
                                                    }}
                                                    className="w-4 h-4 rounded border-border accent-gold"
                                                />
                                                <span className="text-sm text-foreground">{asset.name || asset.symbol}</span>
                                                <span className="text-xs text-neutral">({asset.assetClass})</span>
                                            </label>
                                        ))}
                                        {availableAssets.length === 0 && (
                                            <p className="text-xs text-neutral italic">No assets tracked</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {(excludedAccounts.size > 0 || excludedAssets.size > 0) && (
                                <button
                                    onClick={() => {
                                        setExcludedAccounts(new Set());
                                        setExcludedAssets(new Set());
                                    }}
                                    className="mt-3 text-xs text-gold hover:underline"
                                >
                                    Clear all exclusions
                                </button>
                            )}
                        </div>
                    )}

                    {loading ? (
                        <div className="h-80 flex items-center justify-center">
                            <div className="animate-spin w-8 h-8 border-2 border-gold border-t-transparent rounded-full" />
                        </div>
                    ) : netWorthData.length === 0 ? (
                        <div className="h-80 flex flex-col items-center justify-center">
                            <TrendingUp className="w-12 h-12 text-neutral mb-4" />
                            <p className="text-neutral">Add accounts and transactions to track net worth</p>
                        </div>
                    ) : (
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={netWorthData}>
                                    <defs>
                                        <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#d4a846" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#d4a846" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2d2d3d" />
                                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                                    <YAxis
                                        stroke="#94a3b8"
                                        fontSize={12}
                                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1a1a24',
                                            border: '1px solid #2d2d3d',
                                            borderRadius: '8px',
                                        }}
                                        formatter={(value, name) => {
                                            if (typeof value !== 'number') return ['', ''];
                                            const label = name === 'netWorth' ? 'Net Worth' : String(name);
                                            return [`$${value.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, label];
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="netWorth"
                                        stroke="#d4a846"
                                        strokeWidth={2}
                                        fill="url(#goldGradient)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}

            {/* Spending by Payee Tab */}
            {activeTab === 'payees' && (
                <div className="space-y-6">
                    {/* Date Range Selector */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-foreground">Spending by Payee</h2>
                        <div className="relative">
                            <button
                                onClick={() => setShowPayeeRangeDropdown(!showPayeeRangeDropdown)}
                                className="btn btn-ghost flex items-center gap-2"
                            >
                                <Calendar className="w-4 h-4" />
                                {DATE_RANGE_PRESETS.find(p => p.months === payeeMonths)?.label || 'Custom'}
                            </button>
                            {showPayeeRangeDropdown && (
                                <div className="absolute right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
                                    {DATE_RANGE_PRESETS.map((preset) => (
                                        <button
                                            key={preset.months}
                                            onClick={() => {
                                                setPayeeMonths(preset.months);
                                                setShowPayeeRangeDropdown(false);
                                            }}
                                            className={`w-full text-left px-4 py-2 text-sm hover:bg-background-tertiary ${
                                                payeeMonths === preset.months ? 'text-gold' : 'text-foreground'
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
                        ) : payeeSpendingData.length === 0 ? (
                            <div className="h-80 flex flex-col items-center justify-center">
                                <BarChart3 className="w-12 h-12 text-neutral mb-4" />
                                <p className="text-neutral">No spending data available</p>
                            </div>
                        ) : (
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={payeeSpendingData.slice(0, 15)} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#2d2d3d" />
                                        <XAxis type="number" stroke="#94a3b8" fontSize={12} tickFormatter={(value) => `$${value}`} />
                                        <YAxis type="category" dataKey="payee" stroke="#94a3b8" fontSize={11} width={120} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1a1a24',
                                                border: '1px solid #2d2d3d',
                                                borderRadius: '8px',
                                            }}
                                            formatter={(value, name) => [typeof value === 'number' ? `$${value.toFixed(2)}` : value, name === 'total' ? 'Total Spent' : name]}
                                        />
                                        <Bar dataKey="total" fill="#f87171" radius={[0, 4, 4, 0]} />
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
                                    {payeeSpendingData.map((row) => (
                                        <tr key={row.payee} className="border-b border-border hover:bg-background-tertiary">
                                            <td className="py-2 px-3 text-foreground">{row.payee}</td>
                                            <td className="py-2 px-3 text-right text-neutral">{row.count}</td>
                                            <td className="py-2 px-3 text-right text-danger">${row.total.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Category Trends Tab */}
            {activeTab === 'trends' && (
                <div className="space-y-6">
                    {/* Date Range Selector */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-foreground">Category Trends</h2>
                        <div className="relative">
                            <button
                                onClick={() => setShowTrendRangeDropdown(!showTrendRangeDropdown)}
                                className="btn btn-ghost flex items-center gap-2"
                            >
                                <Calendar className="w-4 h-4" />
                                {DATE_RANGE_PRESETS.find(p => p.months === trendMonths)?.label || 'Custom'}
                            </button>
                            {showTrendRangeDropdown && (
                                <div className="absolute right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
                                    {DATE_RANGE_PRESETS.map((preset) => (
                                        <button
                                            key={preset.months}
                                            onClick={() => {
                                                setTrendMonths(preset.months);
                                                setShowTrendRangeDropdown(false);
                                            }}
                                            className={`w-full text-left px-4 py-2 text-sm hover:bg-background-tertiary ${
                                                trendMonths === preset.months ? 'text-gold' : 'text-foreground'
                                            }`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Line Chart */}
                    <div className="card">
                        <h3 className="text-lg font-semibold text-foreground mb-4">Spending Trends by Category</h3>
                        {loading ? (
                            <div className="h-96 flex items-center justify-center">
                                <div className="animate-spin w-8 h-8 border-2 border-gold border-t-transparent rounded-full" />
                            </div>
                        ) : categoryTrendData.length === 0 ? (
                            <div className="h-96 flex flex-col items-center justify-center">
                                <TrendingUp className="w-12 h-12 text-neutral mb-4" />
                                <p className="text-neutral">No trend data available</p>
                            </div>
                        ) : (
                            <div className="h-96">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={categoryTrendData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#2d2d3d" />
                                        <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                                        <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(value) => `$${value}`} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1a1a24',
                                                border: '1px solid #2d2d3d',
                                                borderRadius: '8px',
                                            }}
                                            formatter={(value) => typeof value === 'number' ? [`$${value.toFixed(2)}`, ''] : ''}
                                        />
                                        <Legend />
                                        {trendCategories.slice(0, 8).map((category, index) => (
                                            <Line
                                                key={category}
                                                type="monotone"
                                                dataKey={category}
                                                stroke={COLORS[index % COLORS.length]}
                                                strokeWidth={2}
                                                dot={{ r: 3 }}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* Category Legend */}
                    <div className="card">
                        <h3 className="text-lg font-semibold text-foreground mb-4">Categories Tracked</h3>
                        <div className="flex flex-wrap gap-3">
                            {trendCategories.slice(0, 8).map((category, index) => (
                                <div key={category} className="flex items-center gap-2 px-3 py-1 bg-background-tertiary rounded-full">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                    />
                                    <span className="text-sm text-foreground">{category}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
