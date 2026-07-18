'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, TrendingUp } from 'lucide-react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import ChartTooltip from '@/components/ChartTooltip';

interface CategoryTrendData {
    month: string;
    [key: string]: string | number;
}

interface Props {
    currency: string;
    excludeCategoryNames: Set<string>;
}

const COLORS = [
    '#d4a846', '#4ade80', '#f87171', '#60a5fa', '#a78bfa',
    '#fb923c', '#2dd4bf', '#f472b6', '#818cf8', '#fbbf24',
];

const DATE_RANGE_PRESETS = [
    { label: '3 Months', months: 3 },
    { label: '6 Months', months: 6 },
    { label: '1 Year', months: 12 },
    { label: '2 Years', months: 24 },
    { label: '3 Years', months: 36 },
    { label: 'All Time', months: 0 },
];

/**
 * Category Trends — multi-series line chart of spending by top categories
 * over a configurable trailing window. Honors the global category exclusion
 * set so hidden categories don't appear as lines.
 */
export default function CategoryTrendsTab({ currency, excludeCategoryNames }: Props) {
    const [months, setMonths] = useState(6);
    const [showRangeDropdown, setShowRangeDropdown] = useState(false);
    const [data, setData] = useState<CategoryTrendData[]>([]);
    const [trendCategories, setTrendCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const excludeQueryParam = useMemo(
        () => Array.from(excludeCategoryNames).join(','),
        [excludeCategoryNames]
    );

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ type: 'category-trends', months: String(months) });
            if (excludeQueryParam) params.set('excludeCategories', excludeQueryParam);
            const res = await fetch(`/api/reports/advanced?${params.toString()}`);
            const json = await res.json();
            setData(json.data || []);
            setTrendCategories(json.categories || []);
        } catch (err) {
            console.error('Failed to fetch trend data:', err);
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
                <h2 className="text-lg font-semibold text-foreground">Category Trends</h2>
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

            {/* Line Chart */}
            <div className="card">
                <h3 className="text-lg font-semibold text-foreground mb-4">Spending Trends by Category</h3>
                {loading ? (
                    <div className="h-96 flex items-center justify-center">
                        <div className="animate-spin w-8 h-8 border-2 border-gold border-t-transparent rounded-full" />
                    </div>
                ) : data.length === 0 ? (
                    <div className="h-96 flex flex-col items-center justify-center">
                        <TrendingUp className="w-12 h-12 text-neutral mb-4" />
                        <p className="text-neutral">No trend data available</p>
                    </div>
                ) : (
                    <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                            <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                                <XAxis dataKey="month" stroke="var(--neutral)" fontSize={11} tickLine={false} />
                                <YAxis stroke="var(--neutral)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                <Tooltip
                                    content={
                                        <ChartTooltip
                                            currency={currency}
                                            formatValue={(value) => `$${typeof value === 'number' ? value.toFixed(2) : value}`}
                                        />
                                    }
                                    cursor={{ stroke: 'var(--gold)', strokeOpacity: 0.3, strokeDasharray: '4 3' }}
                                />
                                <Legend />
                                {trendCategories.slice(0, 8).map((category, index) => (
                                    <Line
                                        key={category}
                                        type="monotone"
                                        dataKey={category}
                                        stroke={COLORS[index % COLORS.length]}
                                        strokeWidth={2}
                                        dot={{ r: 3, strokeWidth: 2 }}
                                        activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--background-secondary)' }}
                                        animationDuration={750}
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
    );
}
