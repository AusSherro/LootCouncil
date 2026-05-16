'use client';

import { BarChart3, Eye, EyeOff } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSettings } from '@/components/SettingsProvider';
import { useProfile } from '@/components/ProfileProvider';
import SavingsRateTab from './_tabs/SavingsRateTab';
import TopMoversTab from './_tabs/TopMoversTab';
import SpendingBreakdownTab from './_tabs/SpendingBreakdownTab';
import IncomeExpenseTab from './_tabs/IncomeExpenseTab';
import BudgetVsActualTab from './_tabs/BudgetVsActualTab';
import NetWorthTab from './_tabs/NetWorthTab';
import ByPayeeTab from './_tabs/ByPayeeTab';
import CategoryTrendsTab from './_tabs/CategoryTrendsTab';

const reportTabs = [
    { id: 'spending', name: 'Spending Breakdown' },
    { id: 'top-movers', name: 'Top Movers' },
    { id: 'income', name: 'Income v Expense' },
    { id: 'savings-rate', name: 'Savings Rate' },
    { id: 'budget-actual', name: 'Budget vs Actual' },
    { id: 'networth', name: 'Net Worth' },
    { id: 'payees', name: 'By Payee' },
    { id: 'trends', name: 'Category Trends' },
];

/**
 * Reports — thin shell that owns the active tab and the global category
 * exclusion set (persisted per profile). Each report tab is a self-contained
 * component under `_tabs/` that fetches and renders its own data.
 */
export default function ReportsPage() {
    const { settings } = useSettings();
    const { activeProfile } = useProfile();
    const currency = settings?.currency || 'AUD';
    const [activeTab, setActiveTab] = useState('spending');

    // Globally excluded category names — applied to every report. Defaults to
    // 'Uncategorized'. Persisted per profile in localStorage so two-person
    // households don't bleed exclusions across profiles.
    const [excludedCategoryNames, setExcludedCategoryNames] = useState<Set<string>>(new Set(['Uncategorized']));
    const [allCategoryNames, setAllCategoryNames] = useState<string[]>([]);
    const [showExcludeDropdown, setShowExcludeDropdown] = useState(false);
    const exclusionsHydrated = useRef(false);

    const exclusionStorageKey = activeProfile ? `loot-council-reports-excluded-${activeProfile.id}` : null;

    // Hydrate exclusions from localStorage when profile changes.
    // setState is wrapped in a microtask so it doesn't fire synchronously
    // in the effect body (react-hooks/set-state-in-effect, React 19).
    useEffect(() => {
        if (typeof window === 'undefined' || !exclusionStorageKey) return;
        let cancelled = false;
        Promise.resolve().then(() => {
            if (cancelled) return;
            try {
                const raw = localStorage.getItem(exclusionStorageKey);
                if (raw) {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) {
                        setExcludedCategoryNames(new Set(arr.filter((s: unknown) => typeof s === 'string')));
                    }
                }
            } catch {
                // ignore corrupt JSON
            }
            exclusionsHydrated.current = true;
        });
        return () => { cancelled = true; };
    }, [exclusionStorageKey]);

    // Persist exclusions on change.
    useEffect(() => {
        if (typeof window === 'undefined' || !exclusionStorageKey || !exclusionsHydrated.current) return;
        try {
            localStorage.setItem(exclusionStorageKey, JSON.stringify(Array.from(excludedCategoryNames)));
        } catch {
            // quota / privacy mode — ignore
        }
    }, [excludedCategoryNames, exclusionStorageKey]);

    // Fetch the full category list for the exclusion picker.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/categories');
                const data = await res.json();
                if (cancelled) return;
                const names: string[] = [];
                for (const group of data.categoryGroups || []) {
                    for (const cat of group.categories || []) {
                        if (cat?.name) names.push(cat.name);
                    }
                }
                names.sort((a, b) => a.localeCompare(b));
                if (!names.includes('Uncategorized')) names.unshift('Uncategorized');
                setAllCategoryNames(names);
            } catch (err) {
                console.error('Failed to load categories for exclude picker:', err);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    function toggleCategoryVisibility(categoryName: string) {
        setExcludedCategoryNames(prev => {
            const next = new Set(prev);
            if (next.has(categoryName)) {
                next.delete(categoryName);
            } else {
                next.add(categoryName);
            }
            return next;
        });
    }

    return (
        <div className="p-6 lg:p-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gold/12 flex items-center justify-center">
                        <BarChart3 className="w-6 h-6 text-gold" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
                        <p className="text-neutral">Analyze your spending patterns</p>
                    </div>
                </div>

                {/* Global exclude-categories dropdown — applies to every tab */}
                <div className="relative">
                    <button
                        onClick={() => setShowExcludeDropdown(!showExcludeDropdown)}
                        className={`btn btn-ghost flex items-center gap-2 ${
                            excludedCategoryNames.size > 0 ? 'text-gold' : ''
                        }`}
                        title="Exclude categories from all reports"
                    >
                        <EyeOff className="w-4 h-4" />
                        {excludedCategoryNames.size > 0
                            ? `${excludedCategoryNames.size} excluded`
                            : 'Exclude categories'}
                    </button>
                    {showExcludeDropdown && (
                        <div className="absolute right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-lg z-20 py-2 min-w-[220px] max-h-[60vh] overflow-y-auto">
                            <div className="px-3 py-1 text-xs text-neutral font-medium">Exclude from all reports</div>
                            {allCategoryNames.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-neutral">Loading…</div>
                            ) : (
                                allCategoryNames.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => toggleCategoryVisibility(cat)}
                                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
                                    >
                                        {excludedCategoryNames.has(cat) ? (
                                            <EyeOff className="w-4 h-4 text-neutral" />
                                        ) : (
                                            <Eye className="w-4 h-4 text-gold" />
                                        )}
                                        <span className={excludedCategoryNames.has(cat) ? 'text-neutral' : 'text-foreground'}>{cat}</span>
                                    </button>
                                ))
                            )}
                            {excludedCategoryNames.size > 0 && (
                                <div className="border-t border-border mt-1 pt-1">
                                    <button
                                        onClick={() => setExcludedCategoryNames(new Set())}
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

            {/* Tabs */}
            <div className="flex items-center gap-2 mb-4 border-b border-border pb-2 flex-wrap">
                {reportTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeTab === tab.id
                                ? 'bg-gold/20 text-gold'
                                : 'text-neutral hover:text-foreground hover:bg-background-tertiary'
                        }`}
                    >
                        {tab.name}
                    </button>
                ))}
            </div>

            {activeTab === 'spending' && (
                <SpendingBreakdownTab currency={currency} excludeCategoryNames={excludedCategoryNames} />
            )}
            {activeTab === 'top-movers' && (
                <TopMoversTab currency={currency} excludeCategoryNames={excludedCategoryNames} />
            )}
            {activeTab === 'income' && (
                <IncomeExpenseTab currency={currency} excludeCategoryNames={excludedCategoryNames} />
            )}
            {activeTab === 'savings-rate' && (
                <SavingsRateTab currency={currency} excludeCategoryNames={excludedCategoryNames} />
            )}
            {activeTab === 'budget-actual' && (
                <BudgetVsActualTab currency={currency} excludeCategoryNames={excludedCategoryNames} />
            )}
            {activeTab === 'networth' && (
                <NetWorthTab currency={currency} excludeCategoryNames={excludedCategoryNames} />
            )}
            {activeTab === 'payees' && (
                <ByPayeeTab currency={currency} excludeCategoryNames={excludedCategoryNames} />
            )}
            {activeTab === 'trends' && (
                <CategoryTrendsTab currency={currency} excludeCategoryNames={excludedCategoryNames} />
            )}
        </div>
    );
}
