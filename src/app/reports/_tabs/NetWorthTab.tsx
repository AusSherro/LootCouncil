'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Filter, TrendingUp, X } from 'lucide-react';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import ChartTooltip from '@/components/ChartTooltip';

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

interface Props {
    currency: string;
    // Reserved for API parity with other tabs; net worth has its own
    // account/asset exclusion model and does not filter by category.
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
 * Net Worth — area chart of net worth (accounts + assets) over a configurable
 * trailing window, with per-account / per-asset exclusion filters and an
 * "Exclude Super" shortcut. Uses /api/networth which already aggregates and
 * back-fills history.
 */
export default function NetWorthTab({ currency, excludeCategoryNames: _excludeCategoryNames }: Props) {
    void _excludeCategoryNames;

    const [data, setData] = useState<NetWorthData[]>([]);
    const [loading, setLoading] = useState(true);
    const [months, setMonths] = useState(12);
    const [showRangeDropdown, setShowRangeDropdown] = useState(false);

    const [availableAccounts, setAvailableAccounts] = useState<NetWorthFilterItem[]>([]);
    const [availableAssets, setAvailableAssets] = useState<NetWorthFilterItem[]>([]);
    const [excludedAccounts, setExcludedAccounts] = useState<Set<string>>(new Set());
    const [excludedAssets, setExcludedAssets] = useState<Set<string>>(new Set());
    const [excludeSuper, setExcludeSuper] = useState(false);
    const [showFilter, setShowFilter] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const monthsParam = months === 0 ? 0 : months;
            const excludeAccountsParam = Array.from(excludedAccounts).join(',');
            const excludeAssetsParam = Array.from(excludedAssets).join(',');
            const url = `/api/networth?months=${monthsParam}&excludeAccounts=${excludeAccountsParam}&excludeAssets=${excludeAssetsParam}${excludeSuper ? '&excludeAssetClass=super' : ''}`;
            const res = await fetch(url);
            const json = await res.json();
            setData(json.history || []);
            // Only set available items on first load (don't overwrite when filtering)
            if (json.availableAccounts && availableAccounts.length === 0) {
                setAvailableAccounts(json.availableAccounts);
            }
            if (json.availableAssets && availableAssets.length === 0) {
                setAvailableAssets(json.availableAssets);
            }
        } catch (err) {
            console.error('Failed to fetch net worth data:', err);
        } finally {
            setLoading(false);
        }
    }, [months, excludedAccounts, excludedAssets, excludeSuper, availableAccounts.length, availableAssets.length]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <TrendingUp className="w-6 h-6 text-gold" />
                    <h2 className="text-lg font-semibold text-foreground">Net Worth Over Time{excludeSuper && ' (ex. Super)'}</h2>
                    {(excludedAccounts.size > 0 || excludedAssets.size > 0) && (
                        <span className="text-xs text-warning bg-warning/10 px-2 py-1 rounded">
                            {excludedAccounts.size + excludedAssets.size} excluded
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* Exclude Super toggle */}
                    <button
                        onClick={() => setExcludeSuper(!excludeSuper)}
                        className={`btn btn-ghost ${excludeSuper ? 'text-gold' : ''}`}
                        title={excludeSuper ? 'Super excluded from net worth' : 'Super included in net worth'}
                    >
                        {excludeSuper ? 'Include Super' : 'Exclude Super'}
                    </button>
                    {/* Filter button */}
                    <button
                        onClick={() => setShowFilter(!showFilter)}
                        className={`btn btn-ghost flex items-center gap-2 ${showFilter ? 'text-gold' : ''}`}
                    >
                        <Filter className="w-4 h-4" />
                        Filter
                    </button>
                    {/* Date range dropdown */}
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
            </div>

            {/* Filter Panel */}
            {showFilter && (
                <div className="mb-4 p-4 bg-background-tertiary rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium text-foreground">Include/Exclude from Net Worth</h3>
                        <button
                            onClick={() => setShowFilter(false)}
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
            ) : data.length === 0 ? (
                <div className="h-80 flex flex-col items-center justify-center">
                    <TrendingUp className="w-12 h-12 text-neutral mb-4" />
                    <p className="text-neutral">Add accounts and transactions to track net worth</p>
                </div>
            ) : (
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#d4a846" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#d4a846" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="accountGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="assetGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                            <XAxis dataKey="month" stroke="var(--neutral)" fontSize={11} tickLine={false} />
                            <YAxis
                                stroke="var(--neutral)"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => {
                                    if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
                                    return `$${value.toFixed(0)}`;
                                }}
                            />
                            <Tooltip
                                content={
                                    <ChartTooltip
                                        currency={currency}
                                        formatValue={(value) => `$${value.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`}
                                        labelFormatter={(label) => label}
                                    />
                                }
                                cursor={{ stroke: 'var(--gold)', strokeOpacity: 0.3, strokeDasharray: '4 3' }}
                            />
                            <Legend />
                            <Area
                                type="monotone"
                                dataKey="accountBalance"
                                name="Accounts"
                                stroke="#60a5fa"
                                strokeWidth={1.5}
                                fill="url(#accountGradient)"
                                strokeDasharray="4 2"
                                animationDuration={750}
                            />
                            <Area
                                type="monotone"
                                dataKey="assetValue"
                                name="Assets"
                                stroke="#34d399"
                                strokeWidth={1.5}
                                fill="url(#assetGradient)"
                                strokeDasharray="4 2"
                                animationDuration={750}
                            />
                            <Area
                                type="monotone"
                                dataKey="netWorth"
                                name="Net Worth"
                                stroke="#d4a846"
                                strokeWidth={2.5}
                                fill="url(#goldGradient)"
                                animationDuration={750}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
