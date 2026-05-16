'use client';

import { ScrollText, Plus, Search, Filter, Check, X, RefreshCw, Calendar, Upload, Download, CheckSquare, Square, Trash2, Tag, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import TransactionForm from '@/components/TransactionForm';
import ScheduledTransactions from '@/components/ScheduledTransactions';
import CSVImportModal from '@/components/CSVImportModal';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts';
import { SkeletonTransactionList } from '@/components/Skeleton';
import { InlineCategorySelect } from '@/components/InlineEdit';
import { formatCurrency } from '@/lib/utils';
import { useSettings } from '@/components/SettingsProvider';
import { useProfile } from '@/components/ProfileProvider';
import { fetchJsonCached } from '@/lib/clientCache';

interface Transaction {
    id: string;
    date: string;
    payee: string | null;
    memo: string | null;
    amount: number;
    cleared: boolean;
    account: { id: string; name: string } | null;
    category: { id: string; name: string } | null;
    runningBalance?: number;
    isSplit?: boolean;
}

interface Account {
    id: string;
    name: string;
}

interface Category {
    id: string;
    name: string;
}

interface Filters {
    accountId: string;
    categoryId: string;
    startDate: string;
    endDate: string;
    minAmount: string;
    maxAmount: string;
    cleared: 'all' | 'cleared' | 'uncleared';
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

function TransactionRow({ 
    transaction, 
    onEdit, 
    showBalance,
    isSelected,
    onToggleSelect,
    selectedIndex,
    categories,
    onCategoryChange,
    currency = 'AUD',
}: { 
    transaction: Transaction; 
    onEdit: (t: Transaction) => void; 
    showBalance?: boolean;
    isSelected?: boolean;
    onToggleSelect?: (id: string) => void;
    selectedIndex?: number;
    categories?: Category[];
    onCategoryChange?: (transactionId: string, categoryId: string) => Promise<void>;
    currency?: string;
}) {
    const isInflow = transaction.amount > 0;
    const gridCols = showBalance 
        ? "grid-cols-[32px_80px_1fr_1fr_1fr_120px_120px_40px]"
        : "grid-cols-[32px_80px_1fr_1fr_1fr_120px_40px]";

    return (
        <>
            {/* Desktop table row — hidden on mobile */}
            <div 
                onClick={() => onEdit(transaction)}
                className={`hidden lg:grid table-row table-row-zebra ${gridCols} group cursor-pointer transition-colors ${isSelected ? 'bg-gold/10' : ''} ${selectedIndex !== undefined && selectedIndex >= 0 ? 'ring-1 ring-gold' : ''}`}>
                <div className="flex items-center justify-center" onClick={(e) => { e.stopPropagation(); onToggleSelect?.(transaction.id); }}>
                    {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-gold" />
                    ) : (
                        <Square className="w-4 h-4 text-neutral opacity-0 group-hover:opacity-100" />
                    )}
                </div>
                <div className="text-sm text-neutral">{formatDate(transaction.date)}</div>
                <div className="font-medium text-foreground truncate min-w-0">
                    {transaction.payee || '\u2014'}
                    {transaction.isSplit && (
                        <span className="ml-2 text-xs bg-secondary/30 text-secondary px-1.5 py-0.5 rounded">split</span>
                    )}
                </div>
                <div className="text-neutral min-w-0 truncate" onClick={(e) => e.stopPropagation()}>
                    {categories && onCategoryChange ? (
                        <InlineCategorySelect
                            currentCategory={transaction.category}
                            categories={categories}
                            onSelect={(categoryId) => onCategoryChange(transaction.id, categoryId)}
                        />
                    ) : (
                        transaction.category?.name || 'Uncategorized'
                    )}
                </div>
                <div className="text-sm text-neutral truncate">{transaction.memo || '—'}</div>
                <div className={`text-right font-medium ${isInflow ? 'text-positive' : 'text-foreground'}`}>
                    {isInflow ? '+' : ''}{formatCurrency(transaction.amount, currency, { useAbsolute: true })}
                </div>
                {showBalance && transaction.runningBalance !== undefined && (
                    <div className={`text-right font-medium ${transaction.runningBalance >= 0 ? 'text-foreground' : 'text-negative'}`}>
                        {formatCurrency(transaction.runningBalance)}
                    </div>
                )}
                <div className="flex justify-center">
                    {transaction.cleared ? (
                        <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center">
                            <Check className="w-4 h-4 text-success" />
                        </div>
                    ) : (
                        <div className="w-6 h-6 rounded-full bg-warning/20 flex items-center justify-center">
                            <X className="w-4 h-4 text-warning" />
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile card row — shown below lg */}
            <div
                onClick={() => onEdit(transaction)}
                className={`lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border/50 cursor-pointer active:bg-background-tertiary transition-colors ${isSelected ? 'bg-gold/10' : ''}`}
            >
                <div className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center" onClick={(e) => { e.stopPropagation(); onToggleSelect?.(transaction.id); }}>
                    {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-gold" />
                    ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${transaction.cleared ? 'bg-success/15' : 'bg-warning/15'}`}>
                            {transaction.cleared ? (
                                <Check className="w-4 h-4 text-success" />
                            ) : (
                                <X className="w-4 h-4 text-warning" />
                            )}
                        </div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground truncate">
                            {transaction.payee || '\u2014'}
                            {transaction.isSplit && (
                                <span className="ml-1.5 text-xs bg-secondary/30 text-secondary px-1.5 py-0.5 rounded">split</span>
                            )}
                        </span>
                        <span className={`flex-shrink-0 font-medium ${isInflow ? 'text-positive' : 'text-foreground'}`}>
                            {isInflow ? '+' : ''}{formatCurrency(transaction.amount, currency, { useAbsolute: true })}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-xs text-neutral truncate">
                            {formatDate(transaction.date)} · {transaction.category?.name || 'Uncategorized'}
                        </span>
                        {transaction.memo && (
                            <span className="text-xs text-neutral truncate max-w-[120px]">{transaction.memo}</span>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

export default function TransactionsPage() {
    const { showToast } = useToast();
    const { confirm: confirmDialog, Dialog: ConfirmDialogModal } = useConfirmDialog();
    const { settings } = useSettings();
    const { activeProfile } = useProfile();
    const currency = settings?.currency || 'AUD';
    const [activeTab, setActiveTab] = useState<'all' | 'scheduled'>('all');
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const [bulkCategory, setBulkCategory] = useState('');
    const [bulkCleared, setBulkCleared] = useState<'' | 'true' | 'false'>('');
    const [keyboardIndex, setKeyboardIndex] = useState(-1);
    const [filters, setFilters] = useState<Filters>({
        accountId: '',
        categoryId: '',
        startDate: '',
        endDate: '',
        minAmount: '',
        maxAmount: '',
        cleared: 'all',
    });
    const [hideReconciliationAdjustments, setHideReconciliationAdjustments] = useState(true);
    const filtersHydrated = useRef(false);

    // Per-profile localStorage key for persisting filters across reloads.
    const filterStorageKey = activeProfile ? `loot-council-tx-filters-${activeProfile.id}` : null;

    // Load saved filters when profile changes.
    useEffect(() => {
        if (typeof window === 'undefined' || !filterStorageKey) return;
        try {
            const raw = localStorage.getItem(filterStorageKey);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<Filters> & { hideReconciliationAdjustments?: boolean };
                setFilters(prev => ({
                    accountId: parsed.accountId ?? prev.accountId,
                    categoryId: parsed.categoryId ?? prev.categoryId,
                    startDate: parsed.startDate ?? prev.startDate,
                    endDate: parsed.endDate ?? prev.endDate,
                    minAmount: parsed.minAmount ?? prev.minAmount,
                    maxAmount: parsed.maxAmount ?? prev.maxAmount,
                    cleared: parsed.cleared ?? prev.cleared,
                }));
                if (typeof parsed.hideReconciliationAdjustments === 'boolean') {
                    setHideReconciliationAdjustments(parsed.hideReconciliationAdjustments);
                }
            }
        } catch {
            // Ignore corrupt JSON.
        }
        filtersHydrated.current = true;
    }, [filterStorageKey]);

    // Persist filters whenever they change (after the initial hydration).
    useEffect(() => {
        if (typeof window === 'undefined' || !filterStorageKey || !filtersHydrated.current) return;
        try {
            localStorage.setItem(
                filterStorageKey,
                JSON.stringify({ ...filters, hideReconciliationAdjustments })
            );
        } catch {
            // Quota / privacy mode — silently ignore.
        }
    }, [filters, hideReconciliationAdjustments, filterStorageKey]);

    // Date-range preset helpers (FEAT-4 ergonomics)
    const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
    function applyDatePreset(preset: 'thisMonth' | 'lastMonth' | 'last30' | 'last90' | 'thisYear' | 'allTime') {
        const now = new Date();
        let start = '';
        let end = fmtDate(now);
        switch (preset) {
            case 'thisMonth':
                start = fmtDate(new Date(now.getFullYear(), now.getMonth(), 1));
                break;
            case 'lastMonth': {
                const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const e = new Date(now.getFullYear(), now.getMonth(), 0);
                start = fmtDate(s);
                end = fmtDate(e);
                break;
            }
            case 'last30': {
                const s = new Date(now);
                s.setDate(s.getDate() - 29);
                start = fmtDate(s);
                break;
            }
            case 'last90': {
                const s = new Date(now);
                s.setDate(s.getDate() - 89);
                start = fmtDate(s);
                break;
            }
            case 'thisYear':
                start = fmtDate(new Date(now.getFullYear(), 0, 1));
                break;
            case 'allTime':
                start = '';
                end = '';
                break;
        }
        setFilters(prev => ({ ...prev, startDate: start, endDate: end }));
    }

    // FEAT-4: pagination state
    const PAGE_SIZE = 100;
    const [offset, setOffset] = useState(0);
    const [total, setTotal] = useState(0);
    const [exporting, setExporting] = useState(false);

    // Debounce search input by 300ms
    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [searchQuery]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('new') === '1') {
            setShowForm(true);
            window.history.replaceState({}, '', '/transactions');
            return;
        }

        // Drill-down support: when navigated from Reports with filter params,
        // pre-apply the filters and open the panel so the user sees the active state.
        const next: Partial<Filters> = {};
        const accountId = params.get('accountId');
        const categoryId = params.get('categoryId');
        const startDate = params.get('startDate');
        const endDate = params.get('endDate');
        const minAmount = params.get('minAmount');
        const maxAmount = params.get('maxAmount');
        const q = params.get('q');
        if (accountId) next.accountId = accountId;
        if (categoryId) next.categoryId = categoryId;
        if (startDate) next.startDate = startDate;
        if (endDate) next.endDate = endDate;
        if (minAmount) next.minAmount = minAmount;
        if (maxAmount) next.maxAmount = maxAmount;
        if (Object.keys(next).length > 0) {
            setFilters(prev => ({ ...prev, ...next }));
            setShowFilters(true);
            window.history.replaceState({}, '', '/transactions');
        }
        if (q) {
            setSearchQuery(q);
            window.history.replaceState({}, '', '/transactions');
        }
    }, []);

    function toggleSelect(id: string) {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    }

    function selectAll() {
        if (selectedIds.size === filteredTransactions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredTransactions.map(t => t.id)));
        }
    }

    async function handleBulkEdit() {
        const updates: Record<string, unknown> = {};
        if (bulkCategory) updates.categoryId = bulkCategory;
        if (bulkCleared === 'true') updates.cleared = true;
        if (bulkCleared === 'false') updates.cleared = false;

        if (Object.keys(updates).length === 0) return;

        try {
            const res = await fetch('/api/transactions/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionIds: Array.from(selectedIds),
                    updates,
                }),
            });
            if (!res.ok) throw new Error('Server returned an error');
            setSelectedIds(new Set());
            setShowBulkEdit(false);
            setBulkCategory('');
            setBulkCleared('');
            fetchTransactions();
        } catch (err) {
            console.error('Bulk edit failed:', err);
            showToast(`Failed to update ${selectedIds.size} transactions. Please try again.`, 'error');
        }
    }

    async function handleBulkDelete() {
        confirmDialog({
            title: `Delete ${selectedIds.size} transaction${selectedIds.size === 1 ? '' : 's'}`,
            message: 'These transactions will be permanently removed and account balances will be recalculated. This cannot be undone.',
            variant: 'danger',
            confirmText: 'Delete',
            onConfirm: async () => {
                try {
                    const res = await fetch('/api/transactions/bulk', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            transactionIds: Array.from(selectedIds),
                        }),
                    });
                    if (!res.ok) throw new Error('Server returned an error');
                    setSelectedIds(new Set());
                    fetchTransactions();
                } catch (err) {
                    console.error('Bulk delete failed:', err);
                    showToast(`Failed to delete ${selectedIds.size} transactions. Please try again.`, 'error');
                }
            },
        });
    }
    const [activeFiltersCount, setActiveFiltersCount] = useState(0);

    const fetchTransactions = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(offset),
            });

            if (filters.accountId) params.set('accountId', filters.accountId);
            if (filters.categoryId) params.set('categoryId', filters.categoryId);
            if (filters.startDate) params.set('startDate', filters.startDate);
            if (filters.endDate) params.set('endDate', filters.endDate);
            if (filters.minAmount) params.set('minAmount', filters.minAmount);
            if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
            if (filters.cleared !== 'all') params.set('cleared', String(filters.cleared === 'cleared'));
            if (debouncedSearch) params.set('q', debouncedSearch);
            params.set('hideReconciliationAdjustments', String(hideReconciliationAdjustments));

            const res = await fetch(`/api/transactions?${params.toString()}`, { signal });
            const data = await res.json();
            setTransactions(data.transactions || []);
            setTotal(typeof data.total === 'number' ? data.total : (data.transactions?.length ?? 0));
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            console.error('Failed to fetch transactions:', err);
        } finally {
            setLoading(false);
        }
    }, [filters, debouncedSearch, hideReconciliationAdjustments, offset]);

    // Inline category change handler
    const handleInlineCategoryChange = useCallback(async (transactionId: string, categoryId: string) => {
        try {
            await fetch(`/api/transactions/${transactionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryId }),
            });
            // Optimistic update
            setTransactions(prev => prev.map(t => 
                t.id === transactionId 
                    ? { ...t, category: categories.find(c => c.id === categoryId) || null }
                    : t
            ));
        } catch (err) {
            console.error('Failed to update category:', err);
        }
    }, [categories]);

    useEffect(() => {
        const controller = new AbortController();
        fetchTransactions(controller.signal);
        return () => controller.abort();
    }, [fetchTransactions]);

    // FEAT-4: reset to first page when filters/search/visibility toggle changes
    useEffect(() => {
        setOffset(0);
    }, [filters, debouncedSearch, hideReconciliationAdjustments]);

    useEffect(() => {
        let cancelled = false;

        async function fetchFilterMetadata() {
            try {
                const [accountsData, categoriesData] = await Promise.all([
                    fetchJsonCached<{ accounts?: Account[] }>('/api/accounts', 300_000),
                    fetchJsonCached<{ categoryGroups?: Array<{ categories: Category[] }> }>('/api/categories', 300_000),
                ]);

                if (cancelled) return;
                setAccounts(accountsData.accounts || []);

                const allCats: Category[] = [];
                (categoriesData.categoryGroups || []).forEach((g) => {
                    allCats.push(...g.categories);
                });
                setCategories(allCats);
            } catch (err) {
                console.error('Failed to fetch filter metadata:', err);
            }
        }

        fetchFilterMetadata();
        return () => {
            cancelled = true;
        };
    }, []);

    // Calculate active filters count
    useEffect(() => {
        let count = 0;
        if (filters.accountId) count++;
        if (filters.categoryId) count++;
        if (filters.startDate) count++;
        if (filters.endDate) count++;
        if (filters.minAmount) count++;
        if (filters.maxAmount) count++;
        if (filters.cleared !== 'all') count++;
        setActiveFiltersCount(count);
    }, [filters]);

    const filteredTransactions = transactions;

    // Keyboard shortcuts
    useKeyboardShortcuts([
        {
            key: 'n',
            action: () => setShowForm(true),
            description: 'New transaction',
        },
        {
            key: 'ArrowDown',
            action: () => setKeyboardIndex(Math.min(keyboardIndex + 1, filteredTransactions.length - 1)),
            description: 'Next transaction',
        },
        {
            key: 'ArrowUp',
            action: () => setKeyboardIndex(Math.max(keyboardIndex - 1, 0)),
            description: 'Previous transaction',
        },
        {
            key: 'Enter',
            action: () => {
                if (keyboardIndex >= 0 && keyboardIndex < filteredTransactions.length) {
                    handleEdit(filteredTransactions[keyboardIndex]);
                }
            },
            description: 'Edit selected',
        },
        {
            key: ' ',
            action: () => {
                if (keyboardIndex >= 0 && keyboardIndex < filteredTransactions.length) {
                    toggleSelect(filteredTransactions[keyboardIndex].id);
                }
            },
            description: 'Toggle selection',
        },
        {
            key: 'Escape',
            action: () => {
                setKeyboardIndex(-1);
                setSelectedIds(new Set());
                setShowBulkEdit(false);
            },
            description: 'Clear selection',
        },
        {
            key: 'a',
            ctrl: true,
            action: selectAll,
            description: 'Select all',
        },
    ], activeTab === 'all' && !showForm);

    function handleEdit(transaction: Transaction) {
        setEditTransaction(transaction);
        setShowForm(true);
    }

    function handleCloseForm() {
        setShowForm(false);
        setEditTransaction(null);
    }

    function clearFilters() {
        setFilters({
            accountId: '',
            categoryId: '',
            startDate: '',
            endDate: '',
            minAmount: '',
            maxAmount: '',
            cleared: 'all',
        });
        setOffset(0);
    }

    // FEAT-10: CSV export of all transactions matching the current filters.
    // Pulls every page (capped at 50k for safety) and serializes client-side.
    async function handleExportCSV() {
        if (exporting) return;
        setExporting(true);
        try {
            const params = new URLSearchParams({ limit: '500', offset: '0' });
            if (filters.accountId) params.set('accountId', filters.accountId);
            if (filters.categoryId) params.set('categoryId', filters.categoryId);
            if (filters.startDate) params.set('startDate', filters.startDate);
            if (filters.endDate) params.set('endDate', filters.endDate);
            if (filters.minAmount) params.set('minAmount', filters.minAmount);
            if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
            if (filters.cleared !== 'all') params.set('cleared', String(filters.cleared === 'cleared'));
            if (debouncedSearch) params.set('q', debouncedSearch);
            params.set('hideReconciliationAdjustments', String(hideReconciliationAdjustments));

            const all: Transaction[] = [];
            const MAX_ROWS = 50_000;
            for (let off = 0; off < MAX_ROWS; off += 500) {
                params.set('offset', String(off));
                const res = await fetch(`/api/transactions?${params.toString()}`);
                if (!res.ok) throw new Error('Fetch failed');
                const data = await res.json();
                const batch: Transaction[] = data.transactions || [];
                all.push(...batch);
                if (batch.length < 500) break;
            }

            // RFC 4180 escaping: wrap in quotes if the field contains a comma,
            // quote, or newline; double internal quotes.
            const esc = (v: unknown): string => {
                const s = v == null ? '' : String(v);
                return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const header = ['Date', 'Account', 'Payee', 'Category', 'Memo', 'Amount', 'Cleared'];
            const rows = all.map(t => [
                new Date(t.date).toISOString().slice(0, 10),
                t.account?.name ?? '',
                t.payee ?? '',
                t.category?.name ?? '',
                t.memo ?? '',
                (t.amount / 100).toFixed(2),
                t.cleared ? 'true' : 'false',
            ]);
            const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
            // Prepend UTF-8 BOM so Excel detects encoding correctly.
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `loot-council-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast(`Exported ${all.length} transactions to CSV`, 'success');
        } catch (err) {
            console.error('CSV export failed:', err);
            showToast('CSV export failed. Please try again.', 'error');
        } finally {
            setExporting(false);
        }
    }

    return (
        <div className="p-4 lg:p-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 lg:mb-8">
                <div className="flex items-center gap-3 lg:gap-4">
                    <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl bg-gold/12 flex items-center justify-center">
                        <ScrollText className="w-5 h-5 lg:w-6 lg:h-6 text-gold" />
                    </div>
                    <div>
                        <h1 className="text-xl lg:text-2xl font-semibold text-foreground">Transactions</h1>
                        <p className="text-neutral text-sm">The Ledger of All Exchanges</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => fetchTransactions()} className="btn btn-ghost" disabled={loading}>
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={handleExportCSV} className="btn btn-ghost" disabled={exporting || loading} aria-label="Export CSV" title="Export filtered transactions as CSV">
                        <Download className={`w-5 h-5 ${exporting ? 'animate-pulse' : ''}`} />
                        <span className="hidden sm:inline">{exporting ? 'Exporting…' : 'Export CSV'}</span>
                    </button>
                    <button onClick={() => setShowImport(true)} className="btn btn-secondary">
                        <Upload className="w-5 h-5" />
                        <span className="hidden sm:inline">Import CSV</span>
                    </button>
                    <button onClick={() => setShowForm(true)} className="btn btn-primary">
                        <Plus className="w-5 h-5" />
                        <span className="hidden sm:inline">Add Transaction</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => setActiveTab('all')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        activeTab === 'all'
                            ? 'bg-gold text-background'
                            : 'bg-background-secondary text-neutral hover:text-foreground'
                    }`}
                >
                    <ScrollText className="w-4 h-4 inline mr-2" />
                    All Transactions
                </button>
                <button
                    onClick={() => setActiveTab('scheduled')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        activeTab === 'scheduled'
                            ? 'bg-gold text-background'
                            : 'bg-background-secondary text-neutral hover:text-foreground'
                    }`}
                >
                    <Calendar className="w-4 h-4 inline mr-2" />
                    Scheduled
                </button>
            </div>

            {/* Scheduled Transactions Tab */}
            {activeTab === 'scheduled' && (
                <ScheduledTransactions />
            )}

            {/* All Transactions Tab */}
            {activeTab === 'all' && (
            <>
            {/* Search & Filter Bar */}
            <div className="flex items-center gap-2 sm:gap-4 mb-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral" />
                    <input
                        type="text"
                        placeholder="Search transactions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input pl-10"
                    />
                </div>
                <button 
                    onClick={() => setShowFilters(!showFilters)} 
                    className={`btn ${activeFiltersCount > 0 ? 'btn-primary' : 'btn-secondary'} relative flex-shrink-0`}
                >
                    <Filter className="w-5 h-5" />
                    <span className="hidden sm:inline">Filters</span>
                    {activeFiltersCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-gold text-background text-xs rounded-full flex items-center justify-center">
                            {activeFiltersCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Filters Panel */}
            {showFilters && (
                <div className="card mb-6 p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-foreground">Filters</h3>
                        <button onClick={clearFilters} className="text-sm text-gold hover:text-gold-light">
                            Clear All
                        </button>
                    </div>

                    {/* Date-range presets */}
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-neutral mr-1">Quick range:</span>
                        {([
                            ['thisMonth', 'This month'],
                            ['lastMonth', 'Last month'],
                            ['last30', 'Last 30 days'],
                            ['last90', 'Last 90 days'],
                            ['thisYear', 'This year'],
                            ['allTime', 'All time'],
                        ] as const).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => applyDatePreset(key)}
                                className="px-3 py-1 text-xs rounded-md bg-background-tertiary/50 hover:bg-background-tertiary border border-border hover:border-border-hover text-neutral hover:text-foreground transition-colors"
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm text-neutral mb-1">Account</label>
                            <select
                                value={filters.accountId}
                                onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}
                                className="input"
                            >
                                <option value="">All Accounts</option>
                                {accounts.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">Category</label>
                            <select
                                value={filters.categoryId}
                                onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
                                className="input"
                            >
                                <option value="">All Categories</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">From Date</label>
                            <input
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                                className="input"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">To Date</label>
                            <input
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                                className="input"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">Min Amount</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                value={filters.minAmount}
                                onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
                                className="input"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">Max Amount</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                value={filters.maxAmount}
                                onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
                                className="input"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">Status</label>
                            <select
                                value={filters.cleared}
                                onChange={(e) => setFilters({ ...filters, cleared: e.target.value as 'all' | 'cleared' | 'uncleared' })}
                                className="input"
                            >
                                <option value="all">All</option>
                                <option value="cleared">Cleared</option>
                                <option value="uncleared">Uncleared</option>
                            </select>
                        </div>
                        <div className="col-span-1 sm:col-span-2 md:col-span-4 flex items-center gap-2 pt-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={hideReconciliationAdjustments}
                                    onChange={(e) => setHideReconciliationAdjustments(e.target.checked)}
                                    className="w-4 h-4 rounded border-border bg-background-tertiary text-gold focus:ring-gold"
                                />
                                <span className="text-sm text-neutral">Hide Reconciliation Balance Adjustments</span>
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!loading && transactions.length === 0 && (
                <div className="card text-center py-12">
                    <ScrollText className="w-12 h-12 text-neutral mx-auto mb-4 opacity-60" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">Your transactions live here</h3>
                    <p className="text-neutral mb-4">Add your first one manually or import from YNAB</p>
                    <button onClick={() => setShowForm(true)} className="btn btn-primary">
                        <Plus className="w-5 h-5" />
                        Add Transaction
                    </button>
                </div>
            )}

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div className="mb-4 p-3 bg-gold/10 border border-gold/30 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <span className="text-gold font-medium">{selectedIds.size} selected</span>
                        <button onClick={() => setSelectedIds(new Set())} className="text-sm text-neutral hover:text-foreground">
                            Clear
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowBulkEdit(true)} className="btn btn-secondary">
                            <Tag className="w-4 h-4" />
                            <span className="hidden sm:inline">Categorize</span>
                        </button>
                        <button onClick={handleBulkDelete} className="btn btn-ghost text-negative">
                            <Trash2 className="w-4 h-4" />
                            <span className="hidden sm:inline">Delete</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Bulk Edit Modal */}
            {showBulkEdit && (
                <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[70] p-4 animate-fade-in" onClick={() => setShowBulkEdit(false)}>
                    <div className="bg-background-secondary rounded-xl p-6 w-full sm:w-96 shadow-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-foreground mb-4">Edit {selectedIds.size} Transactions</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-neutral mb-1">Category</label>
                                <select
                                    value={bulkCategory}
                                    onChange={(e) => setBulkCategory(e.target.value)}
                                    className="input w-full"
                                >
                                    <option value="">Don&apos;t change</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-neutral mb-1">Cleared Status</label>
                                <select
                                    value={bulkCleared}
                                    onChange={(e) => setBulkCleared(e.target.value as '' | 'true' | 'false')}
                                    className="input w-full"
                                >
                                    <option value="">Don&apos;t change</option>
                                    <option value="true">Cleared</option>
                                    <option value="false">Uncleared</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setShowBulkEdit(false)} className="btn btn-secondary flex-1">
                                Cancel
                            </button>
                            <button onClick={handleBulkEdit} className="btn btn-primary flex-1">
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Table */}
            {(loading || transactions.length > 0) && (
                <>
                    {/* Desktop table header — hidden on mobile */}
                    <div className={`hidden lg:grid table-row table-header ${filters.accountId ? 'grid-cols-[32px_80px_1fr_1fr_1fr_120px_120px_40px]' : 'grid-cols-[32px_80px_1fr_1fr_1fr_120px_40px]'} rounded-t-lg`}>
                        <div className="flex items-center justify-center">
                            <button onClick={selectAll} aria-label="Select all transactions" className="p-1 hover:bg-background-tertiary rounded">
                                {selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0 ? (
                                    <CheckSquare className="w-4 h-4 text-gold" />
                                ) : (
                                    <Square className="w-4 h-4 text-neutral" />
                                )}
                            </button>
                        </div>
                        <div>Date</div>
                        <div>Payee</div>
                        <div>Category</div>
                        <div>Memo</div>
                        <div className="text-right">Amount</div>
                        {filters.accountId && <div className="text-right">Balance</div>}
                        <div className="text-center">C</div>
                    </div>

                    {/* Mobile list header */}
                    <div className="lg:hidden flex items-center justify-between px-4 py-2 bg-background-tertiary rounded-t-lg">
                        <button onClick={selectAll} className="flex items-center gap-2 p-1 min-h-[44px]">
                            {selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0 ? (
                                <CheckSquare className="w-4 h-4 text-gold" />
                            ) : (
                                <Square className="w-4 h-4 text-neutral" />
                            )}
                            <span className="text-xs text-neutral uppercase tracking-wide">Select all</span>
                        </button>
                        <span className="text-xs text-neutral">{filteredTransactions.length} transactions</span>
                    </div>

                    <div className="card p-0 rounded-t-none">
                        {loading ? (
                            <div className="p-2">
                                <SkeletonTransactionList rows={10} />
                            </div>
                        ) : filteredTransactions.length === 0 ? (
                            <div className="p-12 text-center">
                                <Inbox className="w-12 h-12 text-neutral mx-auto mb-3 opacity-60" />
                                <p className="text-foreground font-medium mb-1">Nothing to show</p>
                                <p className="text-neutral text-sm mb-4">
                                    {searchQuery || activeFiltersCount > 0 
                                        ? 'Try adjusting your search or filters' 
                                        : 'Add a transaction to get started'}
                                </p>
                                {!searchQuery && activeFiltersCount === 0 && (
                                    <button onClick={() => setShowForm(true)} className="btn btn-primary">
                                        <Plus className="w-4 h-4" /> Add Transaction
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredTransactions.map((transaction, index) => (
                                <TransactionRow 
                                    key={transaction.id} 
                                    transaction={transaction} 
                                    onEdit={handleEdit}
                                    showBalance={!!filters.accountId}
                                    isSelected={selectedIds.has(transaction.id)}
                                    onToggleSelect={toggleSelect}
                                    selectedIndex={keyboardIndex === index ? index : undefined}
                                    categories={categories}
                                    onCategoryChange={handleInlineCategoryChange}
                                    currency={currency}
                                />
                            ))
                        )}
                    </div>

                    {/* FEAT-4: Pagination */}
                    {total > PAGE_SIZE && (
                        <div className="flex items-center justify-between gap-3 mt-4 px-1 text-sm">
                            <span className="text-neutral">
                                {total === 0 ? '0 results' : `${offset + 1}–${Math.min(offset + filteredTransactions.length, total)} of ${total}`}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                                    disabled={offset === 0 || loading}
                                    className="btn btn-ghost"
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    <span className="hidden sm:inline">Previous</span>
                                </button>
                                <span className="text-neutral tabular-nums px-2">
                                    Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                                </span>
                                <button
                                    onClick={() => setOffset(offset + PAGE_SIZE)}
                                    disabled={offset + PAGE_SIZE >= total || loading}
                                    className="btn btn-ghost"
                                    aria-label="Next page"
                                >
                                    <span className="hidden sm:inline">Next</span>
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
            </>
            )}

            {/* Add Transaction FAB */}
            <button
                onClick={() => setShowForm(true)}
                className="fixed bottom-24 lg:bottom-6 right-4 lg:right-6 w-14 h-14 rounded-full bg-gold text-background flex items-center justify-center shadow-lg hover:bg-gold-light transition-colors z-40"
            >
                <Plus className="w-6 h-6" />
            </button>

            {/* Transaction Form Modal */}
            <TransactionForm
                isOpen={showForm}
                onClose={handleCloseForm}
                onSuccess={fetchTransactions}
                editTransaction={editTransaction}
            />

            {/* CSV Import Modal */}
            <CSVImportModal
                isOpen={showImport}
                onClose={() => setShowImport(false)}
                onSuccess={fetchTransactions}
                accounts={accounts}
            />
            <ConfirmDialogModal />
        </div>
    );
}
