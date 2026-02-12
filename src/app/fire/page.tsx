'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Flame, RefreshCw, Settings, DollarSign,
    Calendar, Target, Save, ChevronRight
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface FIREData {
    settings: {
        id?: string;
        yearOfBirth: number;
        retirementAge: number;
        preservationAge: number;
        annualExpenses: number;
        withdrawalRate: number;
        expectedReturn: number;
        inflationRate: number;
    };
    calculations: {
        currentAge: number;
        yearsToRetirement: number;
        preSuperNetWorth: number;
        superBalance: number;
        totalNetWorth: number;
        fireNumber: number;
        preSuperFireNumber: number;
        coastFireNumber: number;
        fireProgress: number;
        coastFireProgress: number;
        additionalNeeded: number;
        monthlySavingsNeeded: number;
        isCoastFire: boolean;
        isFire: boolean;
    };
}

function formatFireCurrency(cents: number): string {
    return formatCurrency(cents, 'AUD', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

export default function FIREPage() {
    const [data, setData] = useState<FIREData | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form state
    const [currentAge, setCurrentAge] = useState(30);
    const [targetExpenses, setTargetExpenses] = useState(60000);
    const [withdrawalRate, setWithdrawalRate] = useState(4);
    const [expectedReturn, setExpectedReturn] = useState(7);
    const [inflationRate, setInflationRate] = useState(3);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/fire');
            const fireData = await res.json();
            setData(fireData);

            // Populate form with current settings
            if (fireData.settings) {
                // Calculate current age from year of birth
                const age = new Date().getFullYear() - (fireData.settings.yearOfBirth || 1990);
                setCurrentAge(age);
                setTargetExpenses(Math.round((fireData.settings.annualExpenses || 0) / 100));
                // Convert from decimal to percentage for display
                setWithdrawalRate((fireData.settings.withdrawalRate || 0.04) * 100);
                setExpectedReturn((fireData.settings.expectedReturn || 0.07) * 100);
                setInflationRate((fireData.settings.inflationRate || 0.03) * 100);
            }
        } catch (err) {
            console.error('Failed to fetch FIRE data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    async function handleSave() {
        setSaving(true);
        try {
            // Calculate year of birth from current age
            const yearOfBirth = new Date().getFullYear() - currentAge;
            
            await fetch('/api/fire', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    yearOfBirth,
                    annualExpenses: targetExpenses * 100, // Convert to cents
                    withdrawalRate: withdrawalRate / 100, // Convert percentage to decimal
                    expectedReturn: expectedReturn / 100, // Convert percentage to decimal
                    inflationRate: inflationRate / 100, // Convert percentage to decimal
                }),
            });
            setEditing(false);
            await fetchData();
        } catch (err) {
            console.error('Failed to save FIRE settings:', err);
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-screen">
                <RefreshCw className="w-8 h-8 text-gold animate-spin" />
            </div>
        );
    }

    const progressPct = data?.calculations && data.calculations.fireNumber > 0 
        ? Math.min(100, (data.calculations.preSuperNetWorth / data.calculations.fireNumber) * 100)
        : 0;

    return (
        <div className="p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                        <Flame className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">FIRE Calculator</h1>
                        <p className="text-neutral">Financial Independence, Retire Early</p>
                    </div>
                </div>
                <button
                    onClick={() => setEditing(!editing)}
                    className="btn btn-ghost"
                >
                    {editing ? (
                        <>Cancel</>
                    ) : (
                        <>
                            <Settings className="w-4 h-4" />
                            Settings
                        </>
                    )}
                </button>
            </div>

            {/* Main Progress */}
            <div className="card mb-6 bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-500/30">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className="text-sm text-neutral mb-1">Progress to FIRE</p>
                        <p className="text-4xl font-bold text-foreground">{progressPct.toFixed(1)}%</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-neutral mb-1">FIRE Number</p>
                        <p className="text-2xl font-bold text-gold">{formatFireCurrency(data?.calculations?.fireNumber || 0)}</p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-4 bg-background-tertiary rounded-full overflow-hidden mb-4">
                    <div
                        className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>

                <div className="flex items-center justify-between text-sm">
                    <div>
                        <span className="text-neutral">Current: </span>
                        <span className="text-foreground font-medium">{formatFireCurrency(data?.calculations?.preSuperNetWorth || 0)}</span>
                    </div>
                    <div>
                        <span className="text-neutral">Remaining: </span>
                        <span className="text-foreground font-medium">
                            {formatFireCurrency(Math.max(0, (data?.calculations?.fireNumber || 0) - (data?.calculations?.preSuperNetWorth || 0)))}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Summary Cards */}
                <div className="space-y-4">
                    <div className="card">
                        <div className="flex items-center gap-3 mb-3">
                            <Calendar className="w-5 h-5 text-gold" />
                            <p className="text-sm text-neutral">Years to FIRE</p>
                        </div>
                        <p className="text-3xl font-bold text-foreground">
                            {data?.calculations?.isFire ? 'Achieved! 🎉' : 
                             data?.calculations?.yearsToRetirement && data.calculations.yearsToRetirement > 100 ? '100+' :
                             data?.calculations?.yearsToRetirement?.toFixed(1)}
                        </p>
                        {data?.calculations && !data.calculations.isFire && (
                            <p className="text-sm text-neutral mt-1">
                                FIRE at age {Math.round(data.calculations.currentAge + data.calculations.yearsToRetirement)}
                            </p>
                        )}
                    </div>

                    <div className="card">
                        <div className="flex items-center gap-3 mb-3">
                            <DollarSign className="w-5 h-5 text-gold" />
                            <p className="text-sm text-neutral">Annual Savings Needed</p>
                        </div>
                        <p className="text-2xl font-bold text-foreground">
                            {formatFireCurrency(data?.calculations?.monthlySavingsNeeded ? data.calculations.monthlySavingsNeeded * 12 : 0)}
                        </p>
                        <p className="text-sm text-neutral mt-1">
                            {formatFireCurrency(data?.calculations?.monthlySavingsNeeded || 0)}/month
                        </p>
                    </div>

                    <div className="card">
                        <div className="flex items-center gap-3 mb-3">
                            <Target className="w-5 h-5 text-gold" />
                            <p className="text-sm text-neutral">Target Annual Expenses</p>
                        </div>
                        <p className="text-2xl font-bold text-foreground">
                            {formatFireCurrency((data?.settings?.annualExpenses || 0))}
                        </p>
                        <p className="text-sm text-neutral mt-1">
                            {formatFireCurrency((data?.settings?.annualExpenses || 0) / 12)}/month
                        </p>
                    </div>
                </div>

                {/* Middle Column - Settings or Projection Chart */}
                <div className="lg:col-span-2">
                    {editing ? (
                        <div className="card">
                            <h3 className="text-lg font-semibold text-foreground mb-4">FIRE Settings</h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">Current Age</label>
                                    <input
                                        type="number"
                                        value={currentAge}
                                        onChange={(e) => setCurrentAge(parseInt(e.target.value) || 0)}
                                        min="18"
                                        max="100"
                                        className="input w-full"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">Target Annual Expenses ($)</label>
                                    <input
                                        type="number"
                                        value={targetExpenses}
                                        onChange={(e) => setTargetExpenses(parseInt(e.target.value) || 0)}
                                        min="0"
                                        step="1000"
                                        className="input w-full"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">
                                        Safe Withdrawal Rate (%)
                                    </label>
                                    <input
                                        type="number"
                                        value={withdrawalRate}
                                        onChange={(e) => setWithdrawalRate(parseFloat(e.target.value) || 0)}
                                        min="2"
                                        max="10"
                                        step="0.25"
                                        className="input w-full"
                                    />
                                    <p className="text-xs text-neutral mt-1">Standard is 4% (Trinity Study)</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">
                                        Expected Annual Return (%)
                                    </label>
                                    <input
                                        type="number"
                                        value={expectedReturn}
                                        onChange={(e) => setExpectedReturn(parseFloat(e.target.value) || 0)}
                                        min="0"
                                        max="20"
                                        step="0.5"
                                        className="input w-full"
                                    />
                                    <p className="text-xs text-neutral mt-1">Historical S&P 500: ~10%</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">
                                        Inflation Rate (%)
                                    </label>
                                    <input
                                        type="number"
                                        value={inflationRate}
                                        onChange={(e) => setInflationRate(parseFloat(e.target.value) || 0)}
                                        min="0"
                                        max="10"
                                        step="0.5"
                                        className="input w-full"
                                    />
                                    <p className="text-xs text-neutral mt-1">Historical average: ~2-3%</p>
                                </div>
                            </div>

                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="btn btn-primary"
                                >
                                    {saving ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            Save Settings
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* FIRE Formula Explainer */}
                            <div className="mt-6 p-4 bg-background-tertiary rounded-lg">
                                <p className="text-sm font-medium text-foreground mb-2">How is FIRE Number calculated?</p>
                                <p className="text-sm text-neutral">
                                    FIRE Number = Annual Expenses ÷ Withdrawal Rate
                                </p>
                                <p className="text-sm text-gold mt-2">
                                    ${targetExpenses.toLocaleString()} ÷ {withdrawalRate}% = ${Math.round(targetExpenses / (withdrawalRate / 100)).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="card">
                            <h3 className="text-lg font-semibold text-foreground mb-4">FIRE Progress</h3>
                            
                            {/* Progress Summary */}
                            <div className="space-y-6">
                                {/* Coast FIRE Status */}
                                <div className="p-4 rounded-lg bg-background-tertiary">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-foreground">Coast FIRE Progress</span>
                                        <span className={`text-sm font-bold ${data?.calculations?.isCoastFire ? 'text-positive' : 'text-warning'}`}>
                                            {data?.calculations?.isCoastFire ? 'Achieved! 🎉' : `${((data?.calculations?.coastFireProgress || 0) * 100).toFixed(1)}%`}
                                        </span>
                                    </div>
                                    <div className="h-3 bg-background rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
                                            style={{ width: `${Math.min(100, (data?.calculations?.coastFireProgress || 0) * 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-neutral mt-2">
                                        Coast FIRE Number: {formatFireCurrency(data?.calculations?.coastFireNumber || 0)}
                                    </p>
                                </div>

                                {/* Full FIRE Status */}
                                <div className="p-4 rounded-lg bg-background-tertiary">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-foreground">Full FIRE Progress</span>
                                        <span className={`text-sm font-bold ${data?.calculations?.isFire ? 'text-positive' : 'text-warning'}`}>
                                            {data?.calculations?.isFire ? 'Achieved! 🎉' : `${((data?.calculations?.fireProgress || 0) * 100).toFixed(1)}%`}
                                        </span>
                                    </div>
                                    <div className="h-3 bg-background rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
                                            style={{ width: `${Math.min(100, (data?.calculations?.fireProgress || 0) * 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-neutral mt-2">
                                        FIRE Number: {formatFireCurrency(data?.calculations?.fireNumber || 0)}
                                    </p>
                                </div>

                                {/* Key Milestones */}
                                <div className="pt-4 border-t border-border">
                                    <h4 className="text-sm font-medium text-foreground mb-3">Key Milestones</h4>
                                    <div className="space-y-2">
                                        {[25, 50, 75, 100].map(pct => {
                                            const fireNumber = data?.calculations?.fireNumber || 0;
                                            const currentNetWorth = data?.calculations?.preSuperNetWorth || 0;
                                            const targetAmount = fireNumber * pct / 100;
                                            const achieved = currentNetWorth >= targetAmount;
                                            
                                            return (
                                                <div key={pct} className="flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <ChevronRight className={`w-4 h-4 ${achieved ? 'text-positive' : 'text-neutral'}`} />
                                                        <span className={achieved ? 'text-positive' : 'text-foreground'}>
                                                            {pct}% ({formatFireCurrency(targetAmount)})
                                                        </span>
                                                    </div>
                                                    <span className={achieved ? 'text-positive font-medium' : 'text-neutral'}>
                                                        {achieved ? 'Achieved!' : `${formatFireCurrency(targetAmount - currentNetWorth)} to go`}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Net Worth Breakdown */}
                                <div className="pt-4 border-t border-border">
                                    <h4 className="text-sm font-medium text-foreground mb-3">Net Worth Breakdown</h4>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div className="p-3 rounded bg-background">
                                            <p className="text-neutral">Investments</p>
                                            <p className="font-bold text-foreground">{formatFireCurrency(data?.calculations?.preSuperNetWorth || 0)}</p>
                                        </div>
                                        <div className="p-3 rounded bg-background">
                                            <p className="text-neutral">Superannuation</p>
                                            <p className="font-bold text-foreground">{formatFireCurrency(data?.calculations?.superBalance || 0)}</p>
                                        </div>
                                        <div className="p-3 rounded bg-background col-span-2">
                                            <p className="text-neutral">Total Net Worth</p>
                                            <p className="font-bold text-gold">{formatFireCurrency(data?.calculations?.totalNetWorth || 0)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="card bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                    <h4 className="font-semibold text-foreground mb-2">The 4% Rule</h4>
                    <p className="text-sm text-neutral">
                        Based on the 1998 Trinity Study, withdrawing 4% of your portfolio annually 
                        has a high probability of lasting 30+ years without depleting your funds.
                    </p>
                </div>

                <div className="card bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                    <h4 className="font-semibold text-foreground mb-2">CoastFIRE</h4>
                    <p className="text-sm text-neutral">
                        Once you&apos;ve invested enough that compound growth alone will reach your FIRE number, 
                        you only need to cover current expenses—no more saving required!
                    </p>
                </div>

                <div className="card bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                    <h4 className="font-semibold text-foreground mb-2">BaristaFIRE</h4>
                    <p className="text-sm text-neutral">
                        Having enough invested to cover part of your expenses, supplemented by 
                        low-stress part-time work. A middle ground between working and full retirement.
                    </p>
                </div>
            </div>
        </div>
    );
}
