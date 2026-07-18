'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    TrendingUp, RefreshCw, Plus, DollarSign,
    PieChart, Target, Wallet, ChevronDown, ChevronRight,
    Trash2, X, AlertCircle, ArrowUpRight, ArrowDownRight, Edit,
    Calculator, Info
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useSettings } from '@/components/SettingsProvider';
import GoldCoinSpinner from '@/components/GoldCoinSpinner';
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
import { useConfirmDialog } from '@/components/ConfirmDialog';
import ModalDialog from '@/components/ModalDialog';

interface Asset {
    id: string;
    symbol: string;
    name: string;
    assetClass: string;
    currency: string;
    quantity: number;
    costBasis: number;
    currentPrice: number;
    isManual: boolean;
    dividendYield: number;
    stakingYield: number;
    totalUnits: number;
    totalCostBasis: number;
    currentValue: number;
    totalReturn: number;
    totalReturnPct: number;
    annualDividendIncome: number;
    lastUpdated: string;
    lots: AssetLot[];
    // AUD-converted values
    currentValueAUD: number;
    totalCostBasisAUD: number;
    totalReturnAUD: number;
}

interface AssetLot {
    id: string;
    purchaseDate: string;
    units: number;
    unitPrice: number;
    totalCost: number;
    brokerage: number;
    soldUnits: number;
    remainingUnits: number;
    currentValue: number;
    unrealizedGain: number;
    isEligibleForDiscount: boolean;
    holdingDays: number;
}

interface Allocation {
    assetClass: string;
    currentValue: number;
    currentPct: number;
    targetPct: number;
    deltaPct: number;
    deltaValue: number;
}

interface InvestmentData {
    assets: Asset[];
    summary: {
        totalValue: number;
        totalCostBasis: number;
        totalReturn: number;
        totalReturnPct: number;
        totalDividends: number;
    };
    allocations: { assetClass: string; value: number; currentPct: number }[];
}

interface AllocationData {
    allocations: Allocation[];
    totalValue: number;
    investNext: string | null;
    investNextAmount: number;
}

interface NetWorthData {
    history: Array<{ month: string; netWorth: number; accountBalance?: number; assetValue?: number }>;
    currentNetWorth: number;
    accountBalance: number;
    assetValue: number;
}

const ASSET_CLASSES = [
    { value: 'etf', label: 'ETFs', color: '#4ade80' },
    { value: 'stock', label: 'Stocks', color: '#60a5fa' },
    { value: 'crypto', label: 'Crypto', color: '#f59e0b' },
    { value: 'cash', label: 'Cash', color: '#a78bfa' },
    { value: 'super', label: 'Super', color: '#f472b6' },
    { value: 'property', label: 'Property', color: '#2dd4bf' },
    { value: 'other', label: 'Other', color: '#94a3b8' },
];

function formatCurrencyShort(cents: number, currency = 'AUD'): string {
    return formatCurrency(cents, currency, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

function formatPercent(decimal: number): string {
    return (decimal * 100).toFixed(1) + '%';
}

function getAssetClassColor(assetClass: string): string {
    return ASSET_CLASSES.find(c => c.value === assetClass)?.color || '#94a3b8';
}

export default function InvestmentsPage() {
    const { settings } = useSettings();
    const currency = settings?.currency || 'AUD';
    const fmt = useCallback((cents: number) => formatCurrencyShort(cents, currency), [currency]);
    const [data, setData] = useState<InvestmentData | null>(null);
    const [allocations, setAllocations] = useState<AllocationData | null>(null);
    const [netWorthData, setNetWorthData] = useState<NetWorthData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingManualAsset, setEditingManualAsset] = useState<Asset | null>(null);
    const [addingLotAsset, setAddingLotAsset] = useState<Asset | null>(null);
    const [showAllocationSettings, setShowAllocationSettings] = useState(false);
    const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'portfolio' | 'allocation' | 'cgt'>('overview');
    const [binanceConnected, setBinanceConnected] = useState(false);
    const [syncingBinance, setSyncingBinance] = useState(false);
    const [hideZeroBalances, setHideZeroBalances] = useState(true);
    const [excludeSuperFromNetWorth, setExcludeSuperFromNetWorth] = useState(false);
    const [dismissedSuperReminder, setDismissedSuperReminder] = useState(false);

    // PERF-2b: Capture `now` once at mount so render-time derivations stay pure.
    // Stable per session; "30+ days old" doesn't need millisecond precision.
    const [nowMs] = useState(() => Date.now());

    const fetchData = useCallback(async () => {
        try {
            const [investRes, allocRes, netWorthRes] = await Promise.all([
                fetch('/api/investments'),
                fetch('/api/investments/allocations'),
                fetch(`/api/networth?months=12${excludeSuperFromNetWorth ? '&excludeAssetClass=super' : ''}`),
            ]);
            
            const investData = await investRes.json();
            const allocData = await allocRes.json();
            const nwData = await netWorthRes.json();
            
            setData(investData);
            setAllocations(allocData);
            setNetWorthData(nwData);
        } catch (err) {
            console.error('Failed to fetch investments:', err);
        } finally {
            setLoading(false);
        }
    }, [excludeSuperFromNetWorth]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Check if Binance is connected
    useEffect(() => {
        async function checkBinance() {
            try {
                const res = await fetch('/api/integrations');
                const data = await res.json();
                const binance = data.integrations?.find((i: { provider: string; enabled: boolean }) => 
                    i.provider === 'binance' && i.enabled
                );
                setBinanceConnected(!!binance);
            } catch {
                setBinanceConnected(false);
            }
        }
        checkBinance();
    }, []);

    async function refreshPrices() {
        setRefreshing(true);
        try {
            await fetch('/api/investments/prices', { method: 'POST' });
            await fetchData();
        } catch (err) {
            console.error('Failed to refresh prices:', err);
        } finally {
            setRefreshing(false);
        }
    }

    async function handleSyncBinance() {
        setSyncingBinance(true);
        try {
            const res = await fetch('/api/binance', { method: 'POST' });
            if (res.ok) {
                await fetchData();
            }
        } catch (err) {
            console.error('Failed to sync Binance:', err);
        } finally {
            setSyncingBinance(false);
        }
    }

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-screen">
                <GoldCoinSpinner size="lg" />
            </div>
        );
    }

    const summary = data?.summary || { totalValue: 0, totalCostBasis: 0, totalReturn: 0, totalReturnPct: 0, totalDividends: 0 };
    const chartData = netWorthData?.history || [];
    const currentNetWorth = netWorthData?.currentNetWorth || 0;

    // Calculate Super value separately (from investment data, which always includes everything)
    const superValue = data?.assets
        .filter(a => a.assetClass === 'super')
        .reduce((sum, a) => sum + (a.currentValueAUD ?? a.currentValue ?? 0), 0) || 0;
    
    // When super is excluded via API, assetValue already excludes it — no double subtraction
    const investmentsExSuper = excludeSuperFromNetWorth
        ? (netWorthData?.assetValue || 0)
        : (netWorthData?.assetValue || 0) - superValue;

    // Calculate tradeable return (exclude manual assets and Binance-synced crypto)
    const tradeableAssets = data?.assets.filter(a => !a.isManual && !a.symbol.endsWith('-BINANCE')) || [];
    const tradeableReturn = tradeableAssets.reduce((sum, a) => sum + (a.totalReturnAUD ?? a.totalReturn ?? 0), 0);
    const tradeableCost = tradeableAssets.reduce((sum, a) => sum + (a.totalCostBasisAUD ?? a.totalCostBasis ?? 0), 0);
    const tradeableReturnPct = tradeableCost > 0 ? tradeableReturn / tradeableCost : 0;
    const isPositive = tradeableReturn >= 0;

    // Check for super assets that need updating (30+ days old)
    const superAssetsNeedingUpdate = data?.assets.filter(a => {
        if (a.assetClass !== 'super') return false;
        if (!a.lastUpdated) return true;
        const lastUpdated = new Date(a.lastUpdated);
        const daysSinceUpdate = Math.floor((nowMs - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceUpdate >= 30;
    }) || [];

    return (
        <div className="p-6 lg:p-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gold/12 flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-gold" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-foreground">Investment Portfolio</h1>
                        <p className="text-neutral">Track your wealth and investments</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {binanceConnected && (
                        <button
                            onClick={handleSyncBinance}
                            disabled={syncingBinance}
                            className="btn btn-ghost"
                        >
                            <Wallet className={`w-4 h-4 ${syncingBinance ? 'animate-pulse' : ''}`} />
                            {syncingBinance ? 'Syncing...' : 'Binance'}
                        </button>
                    )}
                    <button
                        onClick={() => setHideZeroBalances(!hideZeroBalances)}
                        className={`btn btn-ghost ${hideZeroBalances ? 'text-gold' : ''}`}
                        title={hideZeroBalances ? 'Showing non-zero balances only' : 'Showing all balances'}
                    >
                        {hideZeroBalances ? 'Show All' : 'Hide $0'}
                    </button>
                    <button
                        onClick={() => setExcludeSuperFromNetWorth(!excludeSuperFromNetWorth)}
                        className={`btn btn-ghost ${excludeSuperFromNetWorth ? 'text-gold' : ''}`}
                        title={excludeSuperFromNetWorth ? 'Super excluded from net worth' : 'Super included in net worth'}
                    >
                        {excludeSuperFromNetWorth ? 'Include Super' : 'Exclude Super'}
                    </button>
                    <button
                        onClick={refreshPrices}
                        disabled={refreshing}
                        className="btn btn-ghost"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'Updating...' : 'Refresh'}
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="btn btn-primary"
                    >
                        <Plus className="w-4 h-4" />
                        Add Asset
                    </button>
                </div>
            </div>

            {/* Super Update Reminder */}
            {superAssetsNeedingUpdate.length > 0 && !dismissedSuperReminder && (
                <div className="mb-4 p-4 rounded-lg bg-warning/10 border border-warning/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-warning" />
                        <div>
                            <p className="font-medium text-foreground">Time to update your Super balance!</p>
                            <p className="text-sm text-neutral">
                                {superAssetsNeedingUpdate.map(a => a.name).join(', ')} {superAssetsNeedingUpdate.length === 1 ? 'hasn\'t' : 'haven\'t'} been updated in over 30 days
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setDismissedSuperReminder(true)}
                        className="btn btn-ghost btn-sm"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="card">
                    <p className="text-sm text-neutral mb-1">
                        Net Worth {excludeSuperFromNetWorth && '(ex. Super)'} (AUD)
                    </p>
                    <p className="text-2xl font-bold text-gold">
                        {fmt(currentNetWorth)}
                    </p>
                    {netWorthData && (
                        <p className="text-xs text-neutral mt-1">
                            Cash: {fmt(netWorthData.accountBalance)} + 
                            Investments: {fmt(investmentsExSuper)}
                            {superValue > 0 && !excludeSuperFromNetWorth && <> + Super: {fmt(superValue)}</>}
                            {superValue > 0 && excludeSuperFromNetWorth && <span className="text-neutral/50"> (Super: {fmt(superValue)} excluded)</span>}
                        </p>
                    )}
                </div>
                <div className="card">
                    <p className="text-sm text-neutral mb-1">Investments (AUD)</p>
                    <p className="text-2xl font-bold text-foreground">{fmt(netWorthData?.assetValue || 0)}</p>
                    <p className="text-xs text-neutral mt-1">Cost: {fmt(summary.totalCostBasis)}</p>
                </div>
                <div className="card">
                    <p className="text-sm text-neutral mb-1">Investment Return (AUD)</p>
                    <div className="flex items-center gap-2">
                        {isPositive ? (
                            <ArrowUpRight className="w-5 h-5 text-positive" />
                        ) : (
                            <ArrowDownRight className="w-5 h-5 text-danger" />
                        )}
                        <p className={`text-2xl font-bold ${isPositive ? 'text-positive' : 'text-danger'}`}>
                            {fmt(tradeableReturn)}
                        </p>
                    </div>
                    <p className={`text-xs mt-1 ${isPositive ? 'text-positive' : 'text-danger'}`}>
                        {isPositive ? '+' : ''}{formatPercent(tradeableReturnPct)}
                    </p>
                </div>
                <div className="card">
                    <p className="text-sm text-neutral mb-1">Annual Dividends</p>
                    <p className="text-2xl font-bold text-info">{fmt(summary.totalDividends)}</p>
                    <p className="text-xs text-neutral mt-1">{fmt(summary.totalDividends / 12)}/month</p>
                </div>
            </div>

            {/* Invest Next Recommendation */}
            {allocations?.investNext && (
                <div className="card bg-gold/10 border-gold/30 mb-6">
                    <div className="flex items-center gap-3">
                        <Target className="w-6 h-6 text-gold" />
                        <div>
                            <p className="text-sm text-neutral">Next Investment Recommendation</p>
                            <p className="text-lg font-semibold text-foreground">
                                Invest <span className="text-gold">{fmt(allocations.investNextAmount)}</span> in{' '}
                                <span className="text-gold capitalize">{allocations.investNext}</span> to reach target allocation
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
                {[
                    { id: 'overview', label: 'Overview', icon: TrendingUp },
                    { id: 'portfolio', label: 'Holdings', icon: Wallet },
                    { id: 'allocation', label: 'Allocation', icon: PieChart },
                    { id: 'cgt', label: 'Capital Gains', icon: DollarSign },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                            activeTab === tab.id
                                ? 'bg-gold/20 text-gold'
                                : 'text-neutral hover:text-foreground hover:bg-background-tertiary'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Overview Tab - Net Worth Chart */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    <div className="card">
                        <h3 className="text-lg font-semibold text-foreground mb-4">Net Worth Over Time{excludeSuperFromNetWorth && ' (ex. Super)'}</h3>
                        {chartData.length === 0 ? (
                            <div className="h-64 flex items-center justify-center border border-dashed border-border rounded-lg">
                                <p className="text-neutral">Add transactions or holdings to see your net worth chart</p>
                            </div>
                        ) : (
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#d4a846" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#d4a846" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="accountGradientInv" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.15} />
                                                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="assetGradientInv" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#34d399" stopOpacity={0.15} />
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
                                                    formatValue={(value) => fmt(value * 100)}
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
                                            fill="url(#accountGradientInv)"
                                            strokeDasharray="4 2"
                                            animationDuration={750}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="assetValue"
                                            name="Assets"
                                            stroke="#34d399"
                                            strokeWidth={1.5}
                                            fill="url(#assetGradientInv)"
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

                    {/* Quick Allocation Summary */}
                    {allocations && allocations.allocations.length > 0 && (
                        <div className="card">
                            <h3 className="text-lg font-semibold text-foreground mb-4">Asset Allocation</h3>
                            <div className="flex flex-wrap items-center gap-4 mb-4">
                                {allocations.allocations.map(alloc => (
                                    <div key={alloc.assetClass} className="flex items-center gap-2">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: getAssetClassColor(alloc.assetClass) }}
                                        />
                                        <span className="text-sm text-foreground capitalize">{alloc.assetClass}</span>
                                        <span className="text-sm text-neutral">{formatPercent(alloc.currentPct)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="h-4 rounded-full overflow-hidden bg-background-tertiary flex">
                                {allocations.allocations.map(alloc => (
                                    <div
                                        key={alloc.assetClass}
                                        style={{
                                            width: `${alloc.currentPct * 100}%`,
                                            backgroundColor: getAssetClassColor(alloc.assetClass),
                                        }}
                                        className="h-full transition-all"
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Portfolio Tab */}
            {activeTab === 'portfolio' && (
                <PortfolioView
                    data={data}
                    expandedAsset={expandedAsset}
                    setExpandedAsset={setExpandedAsset}
                    onRefresh={fetchData}
                    setShowAddModal={setShowAddModal}
                    hideZeroBalances={hideZeroBalances}
                    onUpdateManualAsset={setEditingManualAsset}
                    onAddLot={setAddingLotAsset}
                    formatMoney={fmt}
                />
            )}

            {/* Allocation Tab */}
            {activeTab === 'allocation' && allocations && (
                <AllocationView
                    allocations={allocations}
                    onUpdate={fetchData}
                    showSettings={showAllocationSettings}
                    setShowSettings={setShowAllocationSettings}
                    formatMoney={fmt}
                />
            )}

            {/* CGT Tab */}
            {activeTab === 'cgt' && <CapitalGainsView assets={data?.assets || []} formatMoney={fmt} />}

            {/* Add Asset Modal */}
            {showAddModal && (
                <AddAssetModal
                    onClose={() => setShowAddModal(false)}
                    onAdded={fetchData}
                />
            )}

            {/* Add Lot Modal */}
            {addingLotAsset && (
                <AddLotModal
                    asset={addingLotAsset}
                    onClose={() => setAddingLotAsset(null)}
                    onAdded={fetchData}
                />
            )}

            {/* Update Manual Asset Modal */}
            {editingManualAsset && (
                <UpdateManualAssetModal
                    asset={editingManualAsset}
                    onClose={() => setEditingManualAsset(null)}
                    onUpdated={fetchData}
                />
            )}
        </div>
    );
}

function PortfolioView({
    data,
    expandedAsset,
    setExpandedAsset,
    onRefresh,
    setShowAddModal,
    hideZeroBalances,
    onUpdateManualAsset,
    onAddLot,
    formatMoney,
}: {
    data: InvestmentData | null;
    expandedAsset: string | null;
    setExpandedAsset: (id: string | null) => void;
    onRefresh: () => void;
    setShowAddModal: (v: boolean) => void;
    hideZeroBalances: boolean;
    onUpdateManualAsset: (asset: Asset) => void;
    onAddLot: (asset: Asset) => void;
    formatMoney: (cents: number) => string;
}) {
    const { confirm, Dialog: ConfirmDialogModal } = useConfirmDialog();

    async function handleDelete(assetId: string, symbol: string) {
        confirm({
            title: `Delete ${symbol}`,
            message: `Permanently remove ${symbol} from your portfolio? Lots and price history for this asset will be deleted.`,
            variant: 'danger',
            confirmText: 'Delete asset',
            onConfirm: async () => {
                try {
                    await fetch(`/api/investments/${assetId}`, { method: 'DELETE' });
                    onRefresh();
                } catch (err) {
                    console.error('Failed to delete asset:', err);
                }
            },
        });
    }

    return (
        <div className="space-y-4">
            {ASSET_CLASSES.map(assetClass => {
                let classAssets = data?.assets.filter(a => a.assetClass === assetClass.value) || [];
                
                // Hide zero balance assets if toggled on
                if (hideZeroBalances) {
                    classAssets = classAssets.filter(a => a.currentValue > 0 || a.totalUnits > 0);
                }
                
                if (classAssets.length === 0) return null;

                const classTotal = classAssets.reduce((sum, a) => sum + (a.currentValueAUD ?? a.currentValue ?? 0), 0);
                const classReturn = classAssets.reduce((sum, a) => sum + (a.totalReturnAUD ?? a.totalReturn ?? 0), 0);
                const classCost = classAssets.reduce((sum, a) => sum + (a.totalCostBasisAUD ?? a.totalCostBasis ?? 0), 0);
                const classReturnPct = classCost > 0 ? classReturn / classCost : 0;

                return (
                    <div key={assetClass.value} className="card">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: assetClass.color }}
                                />
                                <h3 className="text-lg font-semibold text-foreground">{assetClass.label}</h3>
                                <span className="text-sm text-neutral">({classAssets.length} assets)</span>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-bold text-foreground">{formatMoney(classTotal)}</p>
                                <p className={`text-sm ${classReturn >= 0 ? 'text-positive' : 'text-danger'}`}>
                                    {classReturn >= 0 ? '+' : ''}{formatMoney(classReturn)} ({formatPercent(classReturnPct)})
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {classAssets.map(asset => (
                                <div key={asset.id}>
                                    <div
                                        className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg cursor-pointer hover:bg-background-tertiary/80 group"
                                        onClick={() => setExpandedAsset(expandedAsset === asset.id ? null : asset.id)}
                                    >
                                        <div className="flex items-center gap-3">
                                            {expandedAsset === asset.id ? (
                                                <ChevronDown className="w-4 h-4 text-neutral" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4 text-neutral" />
                                            )}
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium text-foreground">{asset.symbol}</p>
                                                    {asset.isManual && (
                                                        <span className="text-xs bg-neutral/20 text-neutral px-1.5 py-0.5 rounded">
                                                            Manual
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-neutral">{asset.name}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            {/* Hide units for manual assets */}
                                            {!asset.isManual && (
                                                <div className="text-right hidden sm:block">
                                                    <p className="text-sm text-neutral">Units</p>
                                                    <p className="font-medium text-foreground">{(asset.totalUnits ?? 0).toFixed(4)}</p>
                                                </div>
                                            )}
                                            {/* Show Value instead of Price for manual assets */}
                                            {asset.isManual ? (
                                                <div className="text-right">
                                                    <p className="text-sm text-neutral">Value ({asset.currency})</p>
                                                    <p className="font-medium text-foreground">{formatCurrency(asset.currentValue ?? 0, asset.currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="text-right hidden md:block">
                                                        <p className="text-sm text-neutral">Price ({asset.currency})</p>
                                                        <p className="font-medium text-foreground">{formatCurrency(asset.currentPrice ?? 0, asset.currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm text-neutral">Value ({asset.currency})</p>
                                                        <p className="font-medium text-foreground">{formatCurrency(asset.currentValue ?? 0, asset.currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                                                    </div>
                                                </>
                                            )}
                                            {/* Only show return for tradeable assets with purchase lots, not manual or Binance-synced */}
                                            {!asset.isManual && !asset.symbol.endsWith('-BINANCE') && (
                                                <div className="text-right w-24">
                                                    <p className="text-sm text-neutral">Return</p>
                                                    <p className={`font-medium ${(asset.totalReturn ?? 0) >= 0 ? 'text-positive' : 'text-danger'}`}>
                                                        {(asset.totalReturn ?? 0) >= 0 ? '+' : ''}{formatPercent(asset.totalReturnPct ?? 0)}
                                                    </p>
                                                </div>
                                            )}
                                            {/* Update Value button for manual assets */}
                                            {asset.isManual && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onUpdateManualAsset(asset);
                                                    }}
                                                    className="p-1.5 hover:bg-gold/20 rounded text-neutral hover:text-gold transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Update Value"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(asset.id, asset.symbol);
                                                }}
                                                className="p-1.5 hover:bg-danger/20 rounded text-neutral hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Lot Details */}
                                    {expandedAsset === asset.id && !asset.isManual && (
                                        <div className="ml-8 mt-2 space-y-1">
                                            {asset.lots.length > 0 && (
                                                <>
                                                    <div className="text-xs text-neutral font-medium py-1 grid grid-cols-7 gap-2">
                                                        <span>Date</span>
                                                        <span className="text-right">Units</span>
                                                        <span className="text-right">Cost/Unit</span>
                                                        <span className="text-right">Total Cost</span>
                                                        <span className="text-right">Current</span>
                                                        <span className="text-right">Gain</span>
                                                        <span className="text-right">CGT</span>
                                                    </div>
                                                    {asset.lots.map((lot: AssetLot) => (
                                                        <div
                                                            key={lot.id}
                                                            className="text-sm grid grid-cols-7 gap-2 py-2 border-t border-border/50"
                                                        >
                                                            <span className="text-foreground">
                                                                {new Date(lot.purchaseDate).toLocaleDateString('en-AU')}
                                                            </span>
                                                            <span className="text-right text-foreground">
                                                                {(lot.remainingUnits ?? 0).toFixed(4)}
                                                            </span>
                                                            <span className="text-right text-foreground">
                                                                {formatCurrency(lot.unitPrice, asset.currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                            </span>
                                                            <span className="text-right text-foreground">
                                                                {formatCurrency(lot.totalCost, asset.currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                            </span>
                                                            <span className="text-right text-foreground">
                                                                {formatCurrency(lot.currentValue, asset.currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                            </span>
                                                            <span className={`text-right ${lot.unrealizedGain >= 0 ? 'text-positive' : 'text-danger'}`}>
                                                                {lot.unrealizedGain >= 0 ? '+' : '-'}{formatCurrency(lot.unrealizedGain, asset.currency, { minimumFractionDigits: 0, maximumFractionDigits: 0, useAbsolute: true })}
                                                            </span>
                                                            <span className="text-right">
                                                                {lot.isEligibleForDiscount ? (
                                                                    <span className="text-positive text-xs">50% discount</span>
                                                                ) : (
                                                                    <span className="text-neutral text-xs">{lot.holdingDays}d</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onAddLot(asset);
                                                }}
                                                className="flex items-center gap-1 text-xs text-gold hover:text-gold/80 mt-2 py-1 transition-colors"
                                            >
                                                <Plus className="w-3 h-3" />
                                                Add Purchase Lot
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}

            {(!data?.assets || data.assets.length === 0) && (
                <div className="card text-center py-12">
                    <Wallet className="w-12 h-12 text-neutral mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No investments yet</h3>
                    <p className="text-neutral mb-4">Add your first asset to start tracking your portfolio</p>
                    <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                        <Plus className="w-4 h-4" />
                        Add Asset
                    </button>
                </div>
            )}
            <ConfirmDialogModal />
        </div>
    );
}

function AllocationView({
    allocations,
    onUpdate,
    showSettings,
    setShowSettings,
    formatMoney,
}: {
    allocations: AllocationData;
    onUpdate: () => void;
    showSettings: boolean;
    setShowSettings: (v: boolean) => void;
    formatMoney: (cents: number) => string;
}) {
    const [targets, setTargets] = useState<Record<string, number>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const initial: Record<string, number> = {};
        allocations.allocations.forEach(a => {
            initial[a.assetClass] = a.targetPct * 100;
        });
        setTargets(initial);
    }, [allocations]);

    async function saveTargets() {
        setSaving(true);
        try {
            await fetch('/api/investments/allocations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targets: Object.entries(targets).map(([assetClass, pct]) => ({
                        assetClass,
                        targetPct: pct / 100,
                    })),
                }),
            });
            setShowSettings(false);
            onUpdate();
        } catch (err) {
            console.error('Failed to save targets:', err);
        } finally {
            setSaving(false);
        }
    }

    const totalTarget = Object.values(targets).reduce((sum, v) => sum + v, 0);

    return (
        <div className="space-y-6">
            {/* Pie Chart Visualization */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-foreground">Asset Allocation</h3>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="btn btn-ghost text-sm"
                    >
                        <Target className="w-4 h-4" />
                        {showSettings ? 'Cancel' : 'Set Targets'}
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Visual Pie */}
                    <div className="relative h-64 flex items-center justify-center">
                        <div className="relative w-48 h-48">
                            {/* SVG Pie Chart */}
                            <svg viewBox="0 0 100 100" className="transform -rotate-90">
                                {allocations.allocations.reduce((acc, alloc) => {
                                    const offset = acc.offset;
                                    const percentage = alloc.currentPct * 100;
                                    const color = getAssetClassColor(alloc.assetClass);
                                    
                                    acc.elements.push(
                                        <circle
                                            key={alloc.assetClass}
                                            cx="50"
                                            cy="50"
                                            r="40"
                                            fill="transparent"
                                            stroke={color}
                                            strokeWidth="20"
                                            strokeDasharray={`${percentage * 2.51} 251`}
                                            strokeDashoffset={-offset * 2.51}
                                        />
                                    );
                                    
                                    return { offset: offset + percentage, elements: acc.elements };
                                }, { offset: 0, elements: [] as React.ReactNode[] }).elements}
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-foreground">
                                        {formatMoney(allocations.totalValue)}
                                    </p>
                                    <p className="text-xs text-neutral">Total</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Allocation Table */}
                    <div className="space-y-2">
                        {allocations.allocations.map(alloc => (
                            <div key={alloc.assetClass} className="flex items-center gap-3">
                                <div
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: getAssetClassColor(alloc.assetClass) }}
                                />
                                <span className="flex-1 text-foreground capitalize">{alloc.assetClass}</span>
                                
                                {showSettings ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={targets[alloc.assetClass] || 0}
                                            onChange={(e) => setTargets({
                                                ...targets,
                                                [alloc.assetClass]: parseFloat(e.target.value) || 0,
                                            })}
                                            className="input w-20 text-right text-sm"
                                        />
                                        <span className="text-neutral">%</span>
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-foreground font-medium w-24 text-right">
                                            {formatPercent(alloc.currentPct)}
                                        </span>
                                        {alloc.targetPct > 0 && (
                                            <span className={`w-20 text-right text-sm ${
                                                alloc.deltaPct < -0.01 ? 'text-danger' :
                                                alloc.deltaPct > 0.01 ? 'text-positive' :
                                                'text-neutral'
                                            }`}>
                                                {alloc.deltaPct > 0 ? '+' : ''}{formatPercent(alloc.deltaPct)}
                                            </span>
                                        )}
                                        <span className="text-neutral w-24 text-right">
                                            Target: {formatPercent(alloc.targetPct)}
                                        </span>
                                    </>
                                )}
                            </div>
                        ))}

                        {showSettings && (
                            <div className="pt-4 border-t border-border mt-4 space-y-4">
                                {/* Preset Allocation Buttons */}
                                <div>
                                    <p className="text-sm text-neutral mb-2">Common allocation strategies:</p>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setTargets({ etf: 70, stock: 20, crypto: 10 })}
                                            className="btn btn-ghost btn-sm text-xs"
                                        >
                                            Growth (70/20/10)
                                        </button>
                                        <button
                                            onClick={() => setTargets({ etf: 60, stock: 25, crypto: 10, cash: 5 })}
                                            className="btn btn-ghost btn-sm text-xs"
                                        >
                                            Balanced (60/25/10/5)
                                        </button>
                                        <button
                                            onClick={() => setTargets({ etf: 80, stock: 15, crypto: 5 })}
                                            className="btn btn-ghost btn-sm text-xs"
                                        >
                                            Conservative (80/15/5)
                                        </button>
                                        <button
                                            onClick={() => setTargets({ etf: 50, stock: 30, crypto: 20 })}
                                            className="btn btn-ghost btn-sm text-xs"
                                        >
                                            High Risk (50/30/20)
                                        </button>
                                    </div>
                                    <p className="text-xs text-neutral mt-2">ETFs / Stocks / Crypto / Cash</p>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-foreground font-medium">Total</span>
                                    <span className={`font-bold ${
                                        Math.abs(totalTarget - 100) < 0.1 ? 'text-positive' : 'text-danger'
                                    }`}>
                                        {totalTarget.toFixed(1)}%
                                    </span>
                                </div>
                                {Math.abs(totalTarget - 100) > 0.1 && (
                                    <p className="text-danger text-sm">
                                        <AlertCircle className="w-4 h-4 inline mr-1" />
                                        Targets should sum to 100%
                                    </p>
                                )}
                                <button
                                    onClick={saveTargets}
                                    disabled={saving || Math.abs(totalTarget - 100) > 0.1}
                                    className="btn btn-primary w-full"
                                >
                                    {saving ? 'Saving...' : 'Save Targets'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function CapitalGainsView({ assets, formatMoney }: { assets: Asset[]; formatMoney: (cents: number) => string }) {
    const allLots = assets.flatMap(a => 
        a.lots.map(lot => ({
            ...lot,
            symbol: a.symbol,
            name: a.name,
            assetClass: a.assetClass,
            currentPrice: a.currentPrice,
        }))
    );

    // Sort by holding days (closest to 12 months first for tax planning)
    const sortedLots = [...allLots].sort((a, b) => {
        // Prioritize lots close to 1-year mark
        const aToDiscount = 365 - a.holdingDays;
        const bToDiscount = 365 - b.holdingDays;
        if (aToDiscount > 0 && aToDiscount < 30) return -1;
        if (bToDiscount > 0 && bToDiscount < 30) return 1;
        return b.holdingDays - a.holdingDays;
    });

    const totalUnrealizedGain = allLots.reduce((sum, l) => sum + l.unrealizedGain, 0);
    const eligibleGains = allLots
        .filter(l => l.isEligibleForDiscount && l.unrealizedGain > 0)
        .reduce((sum, l) => sum + l.unrealizedGain, 0);
    const taxableAtHalf = eligibleGains / 2; // 50% CGT discount

    return (
        <div className="space-y-6">
            {/* CGT Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card">
                    <p className="text-sm text-neutral mb-1">Total Unrealized Gains</p>
                    <p className={`text-2xl font-bold ${totalUnrealizedGain >= 0 ? 'text-positive' : 'text-danger'}`}>
                        {totalUnrealizedGain >= 0 ? '+' : ''}{formatMoney(totalUnrealizedGain)}
                    </p>
                </div>
                <div className="card">
                    <p className="text-sm text-neutral mb-1">Eligible for 50% Discount</p>
                    <p className="text-2xl font-bold text-positive">{formatMoney(eligibleGains)}</p>
                    <p className="text-xs text-neutral">Held &gt; 12 months</p>
                </div>
                <div className="card">
                    <p className="text-sm text-neutral mb-1">Taxable (After Discount)</p>
                    <p className="text-2xl font-bold text-warning">{formatMoney(totalUnrealizedGain - taxableAtHalf)}</p>
                </div>
            </div>

            {/* Lots Table */}
            <div className="card">
                <h3 className="text-lg font-semibold text-foreground mb-4">All Holdings</h3>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="text-left py-2 px-3 text-neutral font-medium">Asset</th>
                                <th className="text-left py-2 px-3 text-neutral font-medium">Purchase Date</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium">Days Held</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium">Units</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium">Cost</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium">Value</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium">Gain</th>
                                <th className="text-right py-2 px-3 text-neutral font-medium">CGT Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedLots.map(lot => (
                                <tr key={lot.id} className="border-b border-border hover:bg-background-tertiary">
                                    <td className="py-2 px-3">
                                        <span className="font-medium text-foreground">{lot.symbol}</span>
                                    </td>
                                    <td className="py-2 px-3 text-foreground">
                                        {new Date(lot.purchaseDate).toLocaleDateString('en-AU')}
                                    </td>
                                    <td className="py-2 px-3 text-right text-foreground">{lot.holdingDays}</td>
                                    <td className="py-2 px-3 text-right text-foreground">{lot.remainingUnits.toFixed(4)}</td>
                                    <td className="py-2 px-3 text-right text-foreground">{formatMoney(lot.totalCost)}</td>
                                    <td className="py-2 px-3 text-right text-foreground">{formatMoney(lot.currentValue)}</td>
                                    <td className={`py-2 px-3 text-right font-medium ${lot.unrealizedGain >= 0 ? 'text-positive' : 'text-danger'}`}>
                                        {lot.unrealizedGain >= 0 ? '+' : ''}{formatMoney(lot.unrealizedGain)}
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                        {lot.isEligibleForDiscount ? (
                                            <span className="text-positive text-sm bg-positive/10 px-2 py-0.5 rounded">
                                                50% discount
                                            </span>
                                        ) : lot.holdingDays >= 335 ? (
                                            <span className="text-warning text-sm bg-warning/10 px-2 py-0.5 rounded">
                                                {365 - lot.holdingDays}d to discount
                                            </span>
                                        ) : (
                                            <span className="text-neutral text-sm">{lot.holdingDays}d</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {sortedLots.length === 0 && (
                    <div className="text-center py-8 text-neutral">
                        No purchase lots recorded. Add purchases to track capital gains.
                    </div>
                )}
            </div>

            {/* 2026-27 Budget CGT reform calculator */}
            <CGTReformCalculator assets={assets} formatMoney={formatMoney} />
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// 2026-27 Federal Budget CGT reform calculator
//
// Proposed change (Treasury announcement, May 2026 — still pending legislation):
// From 1 July 2027 the 50% CGT discount for individuals/trusts/partnerships is
// replaced with:
//   • CPI cost-base indexation (only the *real* gain is taxed), AND
//   • A 30% minimum effective tax rate on the net capital gain.
//
// Assets held on 1 Jul 2027 and sold after use a transitional split:
//   • Gain accrued pre-1 Jul 2027 → existing 50% discount
//   • Gain accrued post-1 Jul 2027 → indexed + 30% floor
// The split uses ATO time-apportionment (or formal valuation).
//
// Super funds keep their 1/3 discount; main residence is unaffected; this
// calculator targets individuals holding ETFs / shares / crypto / property.
// ────────────────────────────────────────────────────────────────────────────

const REFORM_DATE = new Date('2027-07-01T00:00:00Z');
const REFORM_TS = REFORM_DATE.getTime();
const MIN_RATE = 0.30; // 30% minimum effective rate on post-reform gains
const DISCOUNT = 0.5;  // existing 50% individual discount
const DAY_MS = 1000 * 60 * 60 * 24;

// AU resident marginal rates 2024-25 (Stage 3). Medicare levy added separately.
const MARGINAL_BRACKETS = [
    { label: 'Tax-free ($0 – $18,200)', rate: 0.00 },
    { label: '16% ($18,201 – $45,000)', rate: 0.16 },
    { label: '30% ($45,001 – $135,000)', rate: 0.30 },
    { label: '37% ($135,001 – $190,000)', rate: 0.37 },
    { label: '45% ($190,001+)', rate: 0.45 },
];

interface LotCalc {
    symbol: string;
    purchaseDate: string;
    holdingDays: number;
    nominalGain: number;       // cents — value − cost (no inflation)
    taxCurrent: number;        // cents — sale at chosen date under CURRENT law (50% discount if eligible)
    taxProposed: number;       // cents — sale at chosen date under PROPOSED law (indexation + 30% min)
    taxRushSale: number;       // cents — sale TODAY under current law (timing option)
    indexedCostBase: number;   // cents — cost base after inflation indexation
    realGain: number;          // cents — gain after inflation indexation
    transitional: boolean;     // straddles 1 Jul 2027?
}

function CGTReformCalculator({ assets, formatMoney }: { assets: Asset[]; formatMoney: (cents: number) => string }) {
    const [marginalRate, setMarginalRate] = useState(0.37);
    const [includeMedicare, setIncludeMedicare] = useState(true);
    const [inflation, setInflation] = useState(0.03);
    const [futureSaleDate, setFutureSaleDate] = useState(() => {
        // default to 1 year after the reform starts
        const d = new Date(REFORM_TS);
        d.setUTCFullYear(d.getUTCFullYear() + 1);
        return d.toISOString().split('T')[0];
    });
    const [includeLosses, setIncludeLosses] = useState(false);

    // Captured once at mount so the useMemo below stays pure (react-hooks/purity).
    // Stable for the session; the tax projection doesn't need millisecond accuracy.
    const [now] = useState(() => Date.now());

    const effectiveRate = marginalRate + (marginalRate > 0 && includeMedicare ? 0.02 : 0);

    // Flatten lots with remaining units. Use AUD-converted figures when present so
    // foreign-currency assets contribute consistently to the Aussie tax estimate.
    const lots = useMemo(() => {
        return assets.flatMap(a =>
            a.lots
                .filter(l => l.remainingUnits > 0)
                .map(l => {
                    // Pro-rate AUD totals back to this lot using its share of cost basis
                    const costShare = a.totalCostBasis > 0 ? l.totalCost / a.totalCostBasis : 0;
                    const aud = a.currency !== 'AUD' && a.totalCostBasisAUD > 0;
                    const costAUD = aud ? Math.round(a.totalCostBasisAUD * costShare) : l.totalCost;
                    const valueAUD = aud ? Math.round(a.currentValueAUD * costShare) : l.currentValue;
                    return {
                        id: l.id,
                        symbol: a.symbol,
                        purchaseDate: l.purchaseDate,
                        purchaseTs: new Date(l.purchaseDate).getTime(),
                        holdingDays: l.holdingDays,
                        cost: costAUD,
                        value: valueAUD,
                        nominalGain: valueAUD - costAUD,
                    };
                })
        );
    }, [assets]);

    const sellLaterTs = new Date(futureSaleDate + 'T00:00:00Z').getTime();
    const sellLaterIsAfterReform = sellLaterTs >= REFORM_TS;

    const calcs: LotCalc[] = useMemo(() => {
        return lots
            .filter(l => includeLosses || l.nominalGain > 0)
            .map(l => {
                const gain = l.nominalGain;

                // ── Scenario "rush sale": sell TODAY under current law (timing reference).
                //    Useful for "should I crystallise before the reform?" decisions.
                const heldOver12moNow = (now - l.purchaseTs) / DAY_MS >= 365;
                const rushTaxable = gain > 0 && heldOver12moNow ? gain * DISCOUNT : Math.max(0, gain);
                const taxRushSale = rushTaxable * effectiveRate;

                // ── Scenario "current law": sell at the chosen `futureSaleDate` under
                //    today's 50% discount rules (the regime that exists right now).
                const heldOver12moAtSale = (sellLaterTs - l.purchaseTs) / DAY_MS >= 365;
                const currentTaxable = gain > 0 && heldOver12moAtSale ? gain * DISCOUNT : Math.max(0, gain);
                const taxCurrent = currentTaxable * effectiveRate;

                // ── Scenario "proposed law": sell at the same chosen `futureSaleDate`
                //    under the new indexed + 30%-minimum regime.
                let taxProposed = 0;
                let indexedCostBase = l.cost;
                let realGain = gain;
                let transitional = false;

                if (!sellLaterIsAfterReform) {
                    // Reform hasn't started by the chosen date — proposed law doesn't apply yet.
                    // Match the current-law result so Δ is exactly zero.
                    taxProposed = taxCurrent;
                    realGain = gain;
                } else if (l.purchaseTs >= REFORM_TS) {
                    // Acquired AFTER reform — pure new regime: index cost base by CPI.
                    const years = (sellLaterTs - l.purchaseTs) / (DAY_MS * 365.25);
                    indexedCostBase = l.cost * Math.pow(1 + inflation, years);
                    realGain = l.value - indexedCostBase;
                    if (realGain > 0) {
                        taxProposed = realGain * Math.max(effectiveRate, MIN_RATE);
                    }
                } else {
                    // Transitional: lot acquired before reform, sold after — gain straddles 1 Jul 2027.
                    transitional = true;
                    const totalDays = (sellLaterTs - l.purchaseTs) / DAY_MS;
                    const preDays = Math.max(0, (REFORM_TS - l.purchaseTs) / DAY_MS);
                    const postDays = Math.max(0, (sellLaterTs - REFORM_TS) / DAY_MS);
                    const preShare = totalDays > 0 ? preDays / totalDays : 0;

                    // Notional value at 1 Jul 2027 = cost + apportioned share of nominal gain.
                    const valueAtReform = l.cost + gain * preShare;
                    const heldOver12moAtReform = preDays >= 365;

                    // Pre portion — old 50% discount, taxed at marginal.
                    const preGain = gain * preShare;
                    const preTaxable = preGain > 0 && heldOver12moAtReform ? preGain * DISCOUNT : Math.max(0, preGain);
                    const preTax = preTaxable * effectiveRate;

                    // Post portion — indexed cost base + 30% floor.
                    const postYears = postDays / 365.25;
                    const indexedPostCost = valueAtReform * Math.pow(1 + inflation, postYears);
                    indexedCostBase = indexedPostCost;
                    const postRealGain = Math.max(0, l.value - indexedPostCost);
                    const postTax = postRealGain * Math.max(effectiveRate, MIN_RATE);

                    realGain = preGain + postRealGain;
                    taxProposed = preTax + postTax;
                }

                return {
                    symbol: l.symbol,
                    purchaseDate: l.purchaseDate,
                    holdingDays: l.holdingDays,
                    nominalGain: gain,
                    taxCurrent: Math.round(taxCurrent),
                    taxProposed: Math.round(taxProposed),
                    taxRushSale: Math.round(taxRushSale),
                    indexedCostBase: Math.round(indexedCostBase),
                    realGain: Math.round(realGain),
                    transitional,
                };
            });
    }, [lots, effectiveRate, inflation, sellLaterTs, sellLaterIsAfterReform, includeLosses, now]);

    const totals = useMemo(() => {
        const sum = (key: keyof LotCalc) => calcs.reduce((s, c) => s + (c[key] as number), 0);
        const gross = sum('nominalGain');
        const taxCurrent = sum('taxCurrent');
        const taxProposed = sum('taxProposed');
        const taxRush = sum('taxRushSale');
        return {
            gross,
            taxCurrent,
            taxProposed,
            taxRush,
            delta: taxProposed - taxCurrent,
            netCurrent: gross - taxCurrent,
            netProposed: gross - taxProposed,
        };
    }, [calcs]);

    const formatPct = (n: number) => `${(n * 100).toFixed(1)}%`;

    return (
        <div className="card">
            <div className="flex items-start gap-3 mb-1">
                <div className="p-2 rounded-lg bg-gold/10">
                    <Calculator className="w-5 h-5 text-gold" />
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground">
                        2026-27 Budget CGT reform calculator
                    </h3>
                    <p className="text-sm text-neutral">
                        Estimate the impact of replacing the 50% discount with CPI indexation
                        + a 30% minimum tax rate, starting 1 July 2027.
                    </p>
                </div>
            </div>

            <div className="mt-3 p-3 rounded-lg bg-info/5 border border-info/20 flex gap-2 text-xs text-neutral">
                <Info className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
                <span>
                    Proposed only — still pending legislation. Estimates ignore prior-year
                    capital losses, the CGT main-residence exemption, super (1/3 discount),
                    and companies (unaffected). Foreign-currency assets are converted to AUD
                    using current rates. Not tax advice.
                </span>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                <div>
                    <label className="block text-xs text-neutral mb-1">Your marginal tax bracket</label>
                    <select
                        value={marginalRate}
                        onChange={(e) => setMarginalRate(parseFloat(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-background-tertiary border border-border text-foreground text-sm"
                    >
                        {MARGINAL_BRACKETS.map(b => (
                            <option key={b.rate} value={b.rate}>{b.label}</option>
                        ))}
                    </select>
                    <label className="flex items-center gap-2 mt-2 text-xs text-neutral cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeMedicare}
                            onChange={(e) => setIncludeMedicare(e.target.checked)}
                            className="accent-gold"
                        />
                        Include 2% Medicare levy
                    </label>
                </div>
                <div>
                    <label className="block text-xs text-neutral mb-1">
                        Assumed annual inflation (CPI) — {formatPct(inflation)}
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="0.08"
                        step="0.005"
                        value={inflation}
                        onChange={(e) => setInflation(parseFloat(e.target.value))}
                        className="w-full accent-gold"
                    />
                    <p className="text-xs text-neutral mt-1">
                        Used to index the cost base under the new rules.
                    </p>
                </div>
                <div>
                    <label className="block text-xs text-neutral mb-1">Hypothetical sale date</label>
                    <input
                        type="date"
                        value={futureSaleDate}
                        onChange={(e) => setFutureSaleDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-background-tertiary border border-border text-foreground text-sm"
                    />
                    <p className="text-xs text-neutral mt-1">
                        {sellLaterIsAfterReform
                            ? 'After 1 Jul 2027 — proposed law applies (with transitional split for lots acquired earlier).'
                            : 'Before 1 Jul 2027 — current law still applies on this date.'}
                    </p>
                </div>
                <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 text-xs text-neutral cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeLosses}
                            onChange={(e) => setIncludeLosses(e.target.checked)}
                            className="accent-gold"
                        />
                        Include loss-making lots
                    </label>
                    <p className="text-xs text-neutral mt-1">
                        Effective rate used: <span className="text-foreground font-medium">{formatPct(effectiveRate)}</span>
                    </p>
                </div>
            </div>

            {/* Summary cards — apples-to-apples: same sale date, both regimes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="rounded-lg border border-border bg-background-tertiary/40 p-4">
                    <p className="text-xs text-neutral uppercase tracking-wide">
                        Tax under current law
                    </p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatMoney(totals.taxCurrent)}</p>
                    <p className="text-xs text-neutral mt-1">
                        Selling on {new Date(sellLaterTs).toLocaleDateString('en-AU')} with 50% discount
                        · net {formatMoney(totals.netCurrent)}
                    </p>
                </div>
                <div className="rounded-lg border border-border bg-background-tertiary/40 p-4">
                    <p className="text-xs text-neutral uppercase tracking-wide">
                        Tax under proposed law
                    </p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatMoney(totals.taxProposed)}</p>
                    <p className="text-xs text-neutral mt-1">
                        {sellLaterIsAfterReform
                            ? <>Indexed cost base + 30% floor · net {formatMoney(totals.netProposed)}</>
                            : <>Reform not yet in force on this date · net {formatMoney(totals.netProposed)}</>}
                    </p>
                </div>
                <div className={`rounded-lg border p-4 ${
                    totals.delta > 0
                        ? 'border-danger/30 bg-danger/5'
                        : totals.delta < 0
                            ? 'border-positive/30 bg-positive/5'
                            : 'border-border bg-background-tertiary/40'
                }`}>
                    <p className="text-xs text-neutral uppercase tracking-wide">Impact of the reform</p>
                    <p className={`text-2xl font-bold mt-1 ${
                        totals.delta > 0 ? 'text-danger' : totals.delta < 0 ? 'text-positive' : 'text-foreground'
                    }`}>
                        {totals.delta > 0 ? '+' : ''}{formatMoney(totals.delta)}
                    </p>
                    <p className="text-xs text-neutral mt-1">
                        {totals.taxCurrent > 0
                            ? `${totals.delta >= 0 ? '+' : ''}${((totals.delta / totals.taxCurrent) * 100).toFixed(1)}% vs current law`
                            : 'No taxable gains'}
                        {totals.delta < 0 && ' — indexation beats the 50% discount for short holds in low-inflation periods.'}
                    </p>
                </div>
            </div>

            {/* Timing reference: rush-sale (sell today, current law) */}
            <div className="mt-3 p-3 rounded-lg bg-background-tertiary/30 border border-border flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm">
                    <span className="text-neutral">For reference, selling </span>
                    <span className="text-foreground font-medium">today</span>
                    <span className="text-neutral"> under current law would cost </span>
                    <span className="text-foreground font-semibold">{formatMoney(totals.taxRush)}</span>
                    <span className="text-neutral"> in tax.</span>
                </div>
                <div className="text-xs text-neutral">
                    {totals.taxRush > totals.taxCurrent
                        ? `That's ${formatMoney(totals.taxRush - totals.taxCurrent)} more than holding to your chosen date (lots haven't hit 12 months yet).`
                        : totals.taxRush < totals.taxCurrent
                            ? `That's ${formatMoney(totals.taxCurrent - totals.taxRush)} less than your chosen date — beating the reform by selling early.`
                            : 'Same as your chosen date.'}
                </div>
            </div>

            {/* Per-lot breakdown */}
            {calcs.length > 0 && (
                <div className="mt-6">
                    <h4 className="text-sm font-medium text-foreground mb-2">Per-lot breakdown</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-neutral">
                                    <th className="text-left py-2 px-3 font-medium">Asset</th>
                                    <th className="text-left py-2 px-3 font-medium">Acquired</th>
                                    <th className="text-right py-2 px-3 font-medium">Nominal gain</th>
                                    <th className="text-right py-2 px-3 font-medium">Real gain (proposed)</th>
                                    <th className="text-right py-2 px-3 font-medium">Current law</th>
                                    <th className="text-right py-2 px-3 font-medium">Proposed law</th>
                                    <th className="text-right py-2 px-3 font-medium">Δ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {calcs.map((c, i) => (
                                    <tr key={i} className="border-b border-border/50 hover:bg-background-tertiary">
                                        <td className="py-2 px-3 text-foreground font-medium">
                                            {c.symbol}
                                            {c.transitional && (
                                                <span
                                                    className="ml-2 text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning"
                                                    title="Straddles 1 Jul 2027 — gain is apportioned between regimes"
                                                >
                                                    split
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 px-3 text-neutral">
                                            {new Date(c.purchaseDate).toLocaleDateString('en-AU')}
                                        </td>
                                        <td className={`py-2 px-3 text-right ${c.nominalGain >= 0 ? 'text-foreground' : 'text-danger'}`}>
                                            {formatMoney(c.nominalGain)}
                                        </td>
                                        <td className="py-2 px-3 text-right text-foreground">
                                            {sellLaterIsAfterReform ? formatMoney(c.realGain) : '—'}
                                        </td>
                                        <td className="py-2 px-3 text-right text-foreground">{formatMoney(c.taxCurrent)}</td>
                                        <td className="py-2 px-3 text-right text-foreground">{formatMoney(c.taxProposed)}</td>
                                        <td className={`py-2 px-3 text-right font-medium ${
                                            c.taxProposed - c.taxCurrent > 0
                                                ? 'text-danger'
                                                : c.taxProposed - c.taxCurrent < 0
                                                    ? 'text-positive'
                                                    : 'text-neutral'
                                        }`}>
                                            {c.taxProposed - c.taxCurrent > 0 ? '+' : ''}
                                            {formatMoney(c.taxProposed - c.taxCurrent)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {calcs.length === 0 && (
                <div className="text-center py-6 text-neutral text-sm">
                    {lots.length === 0
                        ? 'No lots to analyse. Add purchase lots to see the impact.'
                        : 'No gain-making lots. Tick "Include loss-making lots" to see all.'}
                </div>
            )}
        </div>
    );
}

function AddAssetModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
    const [symbol, setSymbol] = useState('');
    const [name, setName] = useState('');
    const [assetClass, setAssetClass] = useState('stock');
    const [isManual, setIsManual] = useState(false);
    const [currentPrice, setCurrentPrice] = useState('');
    const [saving, setSaving] = useState(false);
    const [looking, setLooking] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [step, setStep] = useState<'asset' | 'purchase'>('asset');
    const [createdAssetId, setCreatedAssetId] = useState<string | null>(null);
    const [fetchedPrice, setFetchedPrice] = useState<number | null>(null);
    const [fetchedCurrency, setFetchedCurrency] = useState<string>('AUD');

    // Purchase form
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
    const [units, setUnits] = useState('');
    const [unitPrice, setUnitPrice] = useState('');
    const [brokerage, setBrokerage] = useState('');

    async function handleLookup() {
        if (!symbol.trim()) return;
        setLooking(true);
        setLookupError('');
        try {
            const type = assetClass === 'crypto' ? 'crypto' : 'stock';
            const res = await fetch(`/api/investments/prices?symbol=${encodeURIComponent(symbol.trim())}&type=${type}&lookup=true`);
            if (!res.ok) {
                setLookupError('Symbol not found');
                return;
            }
            const data = await res.json();
            if (data.name) setName(data.name);
            if (data.currency) setFetchedCurrency(data.currency);
            if (data.price) {
                setFetchedPrice(data.price);
                setUnitPrice(data.price.toFixed(2));
            }
        } catch (err) {
            setLookupError('Lookup failed');
            console.error('Lookup error:', err);
        } finally {
            setLooking(false);
        }
    }

    async function handleCreateAsset() {
        if (!symbol.trim() || !name.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/investments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: symbol.trim(),
                    name: name.trim(),
                    assetClass,
                    currency: fetchedCurrency,
                    isManual,
                    currentPrice: isManual ? Math.round(parseFloat(currentPrice || '0') * 100) : (fetchedPrice ? Math.round(fetchedPrice * 100) : 0),
                }),
            });
            const asset = await res.json();
            setCreatedAssetId(asset.id);
            
            // Refresh price for non-manual assets
            if (!isManual) {
                await fetch('/api/investments/prices', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ symbols: [symbol.trim()] }),
                });
            }
            
            setStep('purchase');
        } catch (err) {
            console.error('Failed to create asset:', err);
        } finally {
            setSaving(false);
        }
    }

    async function handleAddPurchase() {
        if (!createdAssetId || !units || !unitPrice) return;
        setSaving(true);
        try {
            await fetch('/api/investments/lots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assetId: createdAssetId,
                    purchaseDate,
                    units: parseFloat(units),
                    unitPrice: parseFloat(unitPrice) * 100, // Convert to cents
                    brokerage: parseFloat(brokerage || '0') * 100,
                }),
            });
            onAdded();
            onClose();
        } catch (err) {
            console.error('Failed to add purchase:', err);
        } finally {
            setSaving(false);
        }
    }

    function skipPurchase() {
        onAdded();
        onClose();
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <ModalDialog
                isOpen={true}
                onClose={onClose}
                aria-label={step === 'asset' ? 'Add asset' : 'Add purchase'}
                className="bg-background-secondary rounded-xl p-6 w-full max-w-md mx-4 animate-scale-in"
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-foreground">
                        {step === 'asset' ? 'Add Asset' : 'Add Purchase'}
                    </h2>
                    <button onClick={onClose} aria-label="Close" className="text-neutral hover:text-foreground transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {step === 'asset' ? (
                    <div className="space-y-4">
                        {/* Manual checkbox first - changes the form behavior */}
                        <label className="flex items-center gap-2 p-2 bg-background-tertiary/50 rounded-lg border border-border">
                            <input
                                type="checkbox"
                                checked={isManual}
                                onChange={(e) => {
                                    setIsManual(e.target.checked);
                                    if (e.target.checked) {
                                        // Auto-fill symbol from name for manual entries
                                        if (!symbol && name) {
                                            setSymbol(name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10));
                                        }
                                        // Default to "super" asset class for manual entries
                                        if (assetClass === 'etf') {
                                            setAssetClass('super');
                                        }
                                    }
                                }}
                                className="w-4 h-4"
                            />
                            <span className="text-sm text-foreground">Manual asset (Super, property, etc.)</span>
                        </label>

                        {isManual ? (
                            /* Manual entry flow - Name first, symbol auto-generated */
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => {
                                            setName(e.target.value);
                                            // Auto-generate symbol from name
                                            setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10));
                                        }}
                                        placeholder="e.g. Australian Super, Partner's Super"
                                        className="input w-full"
                                        data-autofocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">Current Value ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={currentPrice}
                                        onChange={(e) => setCurrentPrice(e.target.value)}
                                        placeholder="10000.00"
                                        className="input w-full"
                                    />
                                </div>
                            </>
                        ) : (
                            /* Stock/ETF lookup flow */
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">Symbol/Ticker</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={symbol}
                                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                            onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                                            placeholder="MSFT, VGS.AX, BTC..."
                                            className="input flex-1"
                                        />
                                        <button
                                            onClick={handleLookup}
                                            disabled={looking || !symbol.trim()}
                                            className="btn btn-ghost"
                                        >
                                            {looking ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Lookup'}
                                        </button>
                                    </div>
                                    {lookupError && <p className="text-danger text-xs mt-1">{lookupError}</p>}
                                    {fetchedPrice && <p className="text-positive text-xs mt-1">Found: {fetchedCurrency === 'USD' ? 'US' : ''}${fetchedPrice.toFixed(2)} {fetchedCurrency}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Auto-filled from lookup..."
                                        className="input w-full"
                                    />
                                </div>
                            </>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-neutral mb-1">Asset Class</label>
                            <select
                                value={assetClass}
                                onChange={(e) => setAssetClass(e.target.value)}
                                className="input w-full"
                            >
                                {ASSET_CLASSES.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={handleCreateAsset}
                            disabled={saving || !symbol.trim() || !name.trim()}
                            className="btn btn-primary w-full"
                        >
                            {saving ? 'Creating...' : 'Create Asset'}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm text-neutral">
                            Asset <span className="text-gold font-medium">{symbol}</span> created. Add your purchase details:
                        </p>

                        <div>
                            <label className="block text-sm font-medium text-neutral mb-1">Purchase Date</label>
                            <input
                                type="date"
                                value={purchaseDate}
                                onChange={(e) => setPurchaseDate(e.target.value)}
                                className="input w-full"
                            />
                            <p className="text-xs text-neutral mt-1">When did you buy this? (affects CGT discount eligibility)</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-neutral mb-1">Units</label>
                                <input
                                    type="number"
                                    step="0.0001"
                                    value={units}
                                    onChange={(e) => setUnits(e.target.value)}
                                    placeholder="10"
                                    className="input w-full"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral mb-1">Price/Unit ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={unitPrice}
                                    onChange={(e) => setUnitPrice(e.target.value)}
                                    placeholder="100.00"
                                    className="input w-full"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-neutral mb-1">Brokerage ($)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={brokerage}
                                onChange={(e) => setBrokerage(e.target.value)}
                                placeholder="9.50"
                                className="input w-full"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button onClick={skipPurchase} className="btn btn-ghost flex-1">
                                Skip
                            </button>
                            <button
                                onClick={handleAddPurchase}
                                disabled={saving || !units || !unitPrice}
                                className="btn btn-primary flex-1"
                            >
                                {saving ? 'Adding...' : 'Add Purchase'}
                            </button>
                        </div>
                    </div>
                )}
            </ModalDialog>
        </div>
    );
}

function AddLotModal({ asset, onClose, onAdded }: { asset: Asset; onClose: () => void; onAdded: () => void }) {
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
    const [units, setUnits] = useState('');
    const [unitPrice, setUnitPrice] = useState('');
    const [brokerage, setBrokerage] = useState('');
    const [saving, setSaving] = useState(false);

    async function handleSubmit() {
        if (!units || !unitPrice) return;
        setSaving(true);
        try {
            await fetch('/api/investments/lots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assetId: asset.id,
                    purchaseDate,
                    units: parseFloat(units),
                    unitPrice: parseFloat(unitPrice) * 100,
                    brokerage: parseFloat(brokerage || '0') * 100,
                }),
            });
            onAdded();
            onClose();
        } catch (err) {
            console.error('Failed to add lot:', err);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <ModalDialog
                isOpen={true}
                onClose={onClose}
                aria-label={`Add lot for ${asset.symbol}`}
                className="bg-background-secondary rounded-xl p-6 w-full max-w-md mx-4 animate-scale-in"
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-foreground">
                        Add Lot — <span className="text-gold">{asset.symbol}</span>
                    </h2>
                    <button onClick={onClose} aria-label="Close" className="text-neutral hover:text-foreground transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-neutral mb-1">Purchase/Vest Date</label>
                        <input
                            type="date"
                            value={purchaseDate}
                            onChange={(e) => setPurchaseDate(e.target.value)}
                            className="input w-full"
                        />
                        <p className="text-xs text-neutral mt-1">When did you buy/vest? (affects CGT discount eligibility)</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-neutral mb-1">Units</label>
                            <input
                                type="number"
                                step="0.0001"
                                value={units}
                                onChange={(e) => setUnits(e.target.value)}
                                placeholder="2"
                                className="input w-full"
                                data-autofocus
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-neutral mb-1">Price/Unit ($)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={unitPrice}
                                onChange={(e) => setUnitPrice(e.target.value)}
                                placeholder="400.00"
                                className="input w-full"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral mb-1">Brokerage ($)</label>
                        <input
                            type="number"
                            step="0.01"
                            value={brokerage}
                            onChange={(e) => setBrokerage(e.target.value)}
                            placeholder="0.00"
                            className="input w-full"
                        />
                    </div>

                    <div className="flex gap-3">
                        <button onClick={onClose} className="btn btn-ghost flex-1">
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={saving || !units || !unitPrice}
                            className="btn btn-primary flex-1"
                        >
                            {saving ? 'Adding...' : 'Add Lot'}
                        </button>
                    </div>
                </div>
            </ModalDialog>
        </div>
    );
}

function UpdateManualAssetModal({ 
    asset, 
    onClose, 
    onUpdated 
}: { 
    asset: Asset; 
    onClose: () => void; 
    onUpdated: () => void; 
}) {
    const [value, setValue] = useState((asset.currentPrice / 100).toString());
    const [saving, setSaving] = useState(false);

    async function handleUpdate() {
        setSaving(true);
        try {
            // Value is in dollars, convert to cents for API
            const valueInCents = Math.round(parseFloat(value) * 100);
            
            await fetch(`/api/investments/${asset.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPrice: valueInCents }),
            });
            
            onUpdated();
            onClose();
        } catch (err) {
            console.error('Failed to update asset:', err);
        } finally {
            setSaving(false);
        }
    }

    const previousValue = asset.currentPrice / 100;
    const newValue = parseFloat(value) || 0;
    const change = newValue - previousValue;
    const changePct = previousValue > 0 ? (change / previousValue) * 100 : 0;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
            <ModalDialog
                isOpen={true}
                onClose={onClose}
                aria-label={`Update ${asset.name}`}
                className="bg-background-secondary rounded-xl border border-border p-6 w-full max-w-md animate-scale-in"
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-foreground">Update {asset.name}</h2>
                    <button onClick={onClose} aria-label="Close" className="p-1 hover:bg-background-tertiary rounded">
                        <X className="w-5 h-5 text-neutral" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-neutral mb-1">
                            Current Value ($)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="input w-full text-lg"
                            data-autofocus
                        />
                    </div>

                    {change !== 0 && (
                        <div className={`p-3 rounded-lg ${change >= 0 ? 'bg-positive/10' : 'bg-danger/10'}`}>
                            <p className="text-sm text-neutral">Change from previous update:</p>
                            <p className={`text-lg font-semibold ${change >= 0 ? 'text-positive' : 'text-danger'}`}>
                                {change >= 0 ? '+' : ''}{formatCurrency(change * 100, asset.currency || 'AUD')} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%)
                            </p>
                        </div>
                    )}

                    <p className="text-xs text-neutral">
                        Previous value: {formatCurrency(previousValue * 100, asset.currency || 'AUD')} (as of {new Date(asset.lastUpdated).toLocaleDateString('en-AU')})
                    </p>

                    <button
                        onClick={handleUpdate}
                        disabled={saving || !value}
                        className="btn btn-primary w-full"
                    >
                        {saving ? 'Saving...' : 'Update Value'}
                    </button>
                </div>
            </ModalDialog>
        </div>
    );
}
