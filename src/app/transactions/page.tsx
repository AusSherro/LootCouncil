'use client';

import { ScrollText, Plus, Search, Filter, Check, X, RefreshCw, Calendar, Upload, CheckSquare, Square, Trash2, Tag, Inbox } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import TransactionForm from '@/components/TransactionForm';
import ScheduledTransactions from '@/components/ScheduledTransactions';
import CSVImportModal from '@/components/CSVImportModal';
import { useToast } from '@/components/Toast';
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts';
import { SkeletonTransactionList } from '@/components/Skeleton';
import { InlineCategorySelect } from '@/components/InlineEdit';
import { formatCurrency } from '@/lib/utils';

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
}: { 
    transaction: Transaction; 
    onEdit: (t: Transaction) => void; 
    showBalance?: boolean;
    isSelected?: boolean;
    onToggleSelect?: (id: string) => void;
    selectedIndex?: number;
    categories?: Category[];
    onCategoryChange?: (transactionId: string, categoryId: string) => Promise<void>;
}) {
    const isInflow = transaction.amount > 0;
    const gridCols = showBalance 
        ? "grid-cols-[32px_80px_1fr_1fr_1fr_120px_120px_40px]"
        : "grid-cols-[32px_80px_1fr_1fr_1fr_120px_40px]";

    return (
        <div 
            onClick={() => onEdit(transaction)}
            className={`table-row ${gridCols} group cursor-pointer hover:bg-background-tertiary transition-colors ${isSelected ? 'bg-gold/10' : ''} ${selectedIndex !== undefined && selectedIndex >= 0 ? 'ring-1 ring-gold' : ''}`}>
            <div className="flex items-center justify-center" onClick={(e) => { e.stopPropagation(); onToggleSelect?.(transaction.id); }}>
                {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-gold" />
                ) : (
                    <Square className="w-4 h-4 text-neutral opacity-0 group-hover:opacity-100" />
                )}
            </div>
            <div className="text-sm text-neutral">{formatDate(transaction.date)}</div>
            <div className="font-medium text-foreground">
                {transaction.payee || '—'}
                {transaction.isSplit && (
                    <span className="ml-2 text-xs bg-secondary/30 text-secondary px-1.5 py-0.5 rounded">split</span>
                )}
            </div>
            <div className="text-neutral" onClick={(e) => e.stopPropagation()}>
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
                {isInflow ? '+' : ''}{formatCurrency(transaction.amount, 'AUD', { useAbsolute: true })}
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
    );
}

export default function TransactionsPage() {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'all' | 'scheduled'>('all');
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
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
            fetchTransactions(filters.accountId || undefined);
        } catch (err) {
            console.error('Bulk edit failed:', err);
            showToast(`Failed to update ${selectedIds.size} transactions. Please try again.`, 'error');
        }
    }

    async function handleBulkDelete() {
        if (!confirm(`Delete ${selectedIds.size} transactions?`)) return;

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
            fetchTransactions(filters.accountId || undefined);
        } catch (err) {
            console.error('Bulk delete failed:', err);
            showToast(`Failed to delete ${selectedIds.size} transactions. Please try again.`, 'error');
        }
    }
    const [activeFiltersCount, setActiveFiltersCount] = useState(0);

    const fetchTransactions = useCallback(async (accountId?: string) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: '100' });
            if (accountId) params.set('accountId', accountId);
            const res = await fetch(`/api/transactions?${params.toString()}`);
            const data = await res.json();
            setTransactions(data.transactions || []);
        } catch (err) {
            console.error('Failed to fetch transactions:', err);
        } finally {
            setLoading(false);
        }
    }, []);

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
        fetchTransactions(filters.accountId || undefined);
        // Fetch accounts and categories for filters
        fetch('/api/accounts').then(r => r.json()).then(d => setAccounts(d.accounts || []));
        fetch('/api/categories').then(r => r.json()).then(d => {
            const allCats: Category[] = [];
            (d.categoryGroups || []).forEach((g: { categories: Category[] }) => {
                allCats.push(...g.categories);
            });
            setCategories(allCats);
        });
    }, [fetchTransactions, filters.accountId]);

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

    const filteredTransactions = transactions.filter(t => {
        // Filter reconciliation adjustments if enabled
        if (hideReconciliationAdjustments && t.payee?.toLowerCase().includes('reconciliation balance adjustment')) {
            return false;
        }
        
        // Text search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matches = 
                t.payee?.toLowerCase().includes(query) ||
                t.memo?.toLowerCase().includes(query) ||
                t.category?.name.toLowerCase().includes(query);
            if (!matches) return false;
        }
        
        // Account filter
        if (filters.accountId && t.account?.id !== filters.accountId) return false;
        
        // Category filter
        if (filters.categoryId && t.category?.id !== filters.categoryId) return false;
        
        // Date range
        if (filters.startDate && t.date < filters.startDate) return false;
        if (filters.endDate && t.date > filters.endDate) return false;
        
        // Amount range
        if (filters.minAmount) {
            const min = parseFloat(filters.minAmount) * 100;
            if (Math.abs(t.amount) < min) return false;
        }
        if (filters.maxAmount) {
            const max = parseFloat(filters.maxAmount) * 100;
            if (Math.abs(t.amount) > max) return false;
        }
        
        // Cleared status
        if (filters.cleared === 'cleared' && !t.cleared) return false;
        if (filters.cleared === 'uncleared' && t.cleared) return false;
        
        return true;
    });

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
    }

    return (
        <div className="p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
                        <ScrollText className="w-7 h-7 text-gold" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
                        <p className="text-neutral">The Ledger of All Exchanges</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => fetchTransactions(filters.accountId || undefined)} className="btn btn-ghost" disabled={loading}>
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setShowImport(true)} className="btn btn-secondary">
                        <Upload className="w-5 h-5" />
                        Import CSV
                    </button>
                    <button onClick={() => setShowForm(true)} className="btn btn-primary">
                        <Plus className="w-5 h-5" />
                        Add Transaction
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
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
            <div className="flex items-center gap-4 mb-6">
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
                    className={`btn ${activeFiltersCount > 0 ? 'btn-primary' : 'btn-secondary'} relative`}
                >
                    <Filter className="w-5 h-5" />
                    Filters
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                        <div className="col-span-2 md:col-span-4 flex items-center gap-2 pt-2">
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
                    <ScrollText className="w-12 h-12 text-neutral mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No transactions yet</h3>
                    <p className="text-neutral mb-4">Add your first transaction or import from YNAB</p>
                    <button onClick={() => setShowForm(true)} className="btn btn-primary">
                        <Plus className="w-5 h-5" />
                        Add Transaction
                    </button>
                </div>
            )}

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div className="mb-4 p-3 bg-gold/10 border border-gold/30 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-gold font-medium">{selectedIds.size} selected</span>
                        <button onClick={() => setSelectedIds(new Set())} className="text-sm text-neutral hover:text-foreground">
                            Clear
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowBulkEdit(true)} className="btn btn-secondary">
                            <Tag className="w-4 h-4" />
                            Categorize
                        </button>
                        <button onClick={handleBulkDelete} className="btn btn-ghost text-negative">
                            <Trash2 className="w-4 h-4" />
                            Delete
                        </button>
                    </div>
                </div>
            )}

            {/* Bulk Edit Modal */}
            {showBulkEdit && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]" onClick={() => setShowBulkEdit(false)}>
                    <div className="bg-background-secondary rounded-xl p-6 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
                    <div className={`table-row table-header ${filters.accountId ? 'grid-cols-[32px_80px_1fr_1fr_1fr_120px_120px_40px]' : 'grid-cols-[32px_80px_1fr_1fr_1fr_120px_40px]'} rounded-t-lg`}>
                        <div className="flex items-center justify-center">
                            <button onClick={selectAll} className="p-1 hover:bg-background-tertiary rounded">
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

                    <div className="card p-0 rounded-t-none">
                        {loading ? (
                            <div className="p-2">
                                <SkeletonTransactionList rows={10} />
                            </div>
                        ) : filteredTransactions.length === 0 ? (
                            <div className="p-12 text-center">
                                <Inbox className="w-12 h-12 text-neutral mx-auto mb-3" />
                                <p className="text-foreground font-medium mb-1">No transactions found</p>
                                <p className="text-neutral text-sm mb-4">
                                    {searchQuery || activeFiltersCount > 0 
                                        ? 'Try adjusting your search or filters' 
                                        : 'Add your first transaction to get started'}
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
                                />
                            ))
                        )}
                    </div>
                </>
            )}
            </>
            )}

            {/* Add Transaction FAB */}
            <button
                onClick={() => setShowForm(true)}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gold text-background flex items-center justify-center shadow-lg hover:bg-gold-light transition-all animate-pulse-gold"
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
        </div>
    );
}
