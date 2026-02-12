'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Calendar, DollarSign, Tag, FileText, Building2, Split, AlertCircle, RefreshCw } from 'lucide-react';
import PayeeAutocomplete from './PayeeAutocomplete';
import SplitTransactionModal from './SplitTransactionModal';
import ConfirmDialog from './ConfirmDialog';

interface Account {
    id: string;
    name: string;
    type: string;
}

interface Category {
    id: string;
    name: string;
}

interface CategoryGroup {
    id: string;
    name: string;
    categories: Category[];
}

interface Transaction {
    id: string;
    date: string;
    amount: number;
    payee: string | null;
    memo: string | null;
    accountId?: string;
    categoryId?: string | null;
    cleared: boolean;
    account?: { id: string; name: string } | null;
    category?: { id: string; name: string } | null;
}

interface TransactionFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    defaultAccountId?: string;
    editTransaction?: Transaction | null;
}

export default function TransactionForm({ isOpen, onClose, onSuccess, defaultAccountId, editTransaction }: TransactionFormProps) {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Form state
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [payee, setPayee] = useState('');
    const [amount, setAmount] = useState('');
    const [isOutflow, setIsOutflow] = useState(true);
    const [accountId, setAccountId] = useState(defaultAccountId || '');
    const [categoryId, setCategoryId] = useState('');
    const [memo, setMemo] = useState('');
    const [cleared, setCleared] = useState(false);
    const [showSplitModal, setShowSplitModal] = useState(false);

    const isEditing = !!editTransaction;

    // Populate form when editing
    useEffect(() => {
        if (editTransaction && isOpen) {
            setDate(editTransaction.date.split('T')[0]);
            setPayee(editTransaction.payee || '');
            const absAmount = Math.abs(editTransaction.amount) / 100;
            setAmount(absAmount.toFixed(2));
            setIsOutflow(editTransaction.amount < 0);
            setAccountId(editTransaction.account?.id || editTransaction.accountId || '');
            setCategoryId(editTransaction.category?.id || editTransaction.categoryId || '');
            setMemo(editTransaction.memo || '');
            setCleared(editTransaction.cleared);
        } else if (!editTransaction && isOpen) {
            // Reset form for new transaction
            setDate(new Date().toISOString().split('T')[0]);
            setPayee('');
            setAmount('');
            setIsOutflow(true);
            setAccountId(defaultAccountId || '');
            setCategoryId('');
            setMemo('');
            setCleared(false);
        }
    }, [editTransaction, isOpen, defaultAccountId]);

    const fetchAccounts = useCallback(async () => {
        try {
            const res = await fetch('/api/accounts');
            if (!res.ok) throw new Error('Failed to load accounts');
            const data = await res.json();
            setAccounts(data.accounts || []);
            if (!accountId && data.accounts?.length > 0) {
                setAccountId(data.accounts[0].id);
            }
        } catch (err) {
            console.error('Failed to fetch accounts:', err);
            setFetchError('Failed to load accounts and categories. Please try again.');
        }
    }, [accountId]);

    useEffect(() => {
        if (isOpen) {
            setFetchError(null);
            fetchAccounts();
            fetchCategories();
        }
    }, [isOpen, fetchAccounts]);

    useEffect(() => {
        if (defaultAccountId) {
            setAccountId(defaultAccountId);
        }
    }, [defaultAccountId]);

    async function fetchCategories() {
        try {
            const res = await fetch('/api/categories');
            if (!res.ok) throw new Error('Failed to load categories');
            const data = await res.json();
            setCategoryGroups(data.categoryGroups || []);
        } catch (err) {
            console.error('Failed to fetch categories:', err);
            setFetchError('Failed to load accounts and categories. Please try again.');
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const numAmount = parseFloat(amount);
            if (isNaN(numAmount)) {
                throw new Error('Invalid amount');
            }

            const url = isEditing ? `/api/transactions?id=${editTransaction.id}` : '/api/transactions';
            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date,
                    amount: isOutflow ? -numAmount : numAmount,
                    payee,
                    memo,
                    accountId,
                    categoryId: categoryId || null,
                    cleared,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || `Failed to ${isEditing ? 'update' : 'create'} transaction`);
            }

            // Reset form
            setPayee('');
            setAmount('');
            setMemo('');
            setCategoryId('');
            setCleared(false);

            onSuccess();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : `Failed to ${isEditing ? 'update' : 'create'} transaction`);
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete() {
        if (!editTransaction) return;
        setShowDeleteConfirm(true);
    }

    async function confirmDelete() {
        if (!editTransaction) return;
        
        setShowDeleteConfirm(false);
        setDeleting(true);
        try {
            const res = await fetch(`/api/transactions?id=${editTransaction.id}`, {
                method: 'DELETE',
            });
            
            if (!res.ok) {
                throw new Error('Failed to delete transaction');
            }
            
            onSuccess();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete transaction');
        } finally {
            setDeleting(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] animate-fade-in">
            <div className="bg-background-secondary border border-border rounded-xl w-full max-w-lg mx-4 shadow-lg">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-foreground">
                        {isEditing ? 'Edit Transaction' : 'Add Transaction'}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-background-tertiary rounded-lg transition-colors">
                        <X className="w-5 h-5 text-neutral" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-danger/20 border border-danger/30 rounded-lg text-danger text-sm">
                            {error}
                        </div>
                    )}

                    {fetchError && (
                        <div className="p-3 bg-danger/20 border border-danger/30 rounded-lg flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-danger text-sm">{fetchError}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setFetchError(null);
                                    fetchAccounts();
                                    fetchCategories();
                                }}
                                className="text-danger hover:text-danger/80 transition-colors flex-shrink-0"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Amount with Inflow/Outflow toggle */}
                    <div>
                        <label className="block text-sm text-neutral mb-1">Amount</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral" />
                                <input
                                    type="number"
                                    step="0.01"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="input pl-10"
                                    required
                                />
                            </div>
                            <div className="flex rounded-lg border border-border overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setIsOutflow(true)}
                                    className={`px-4 py-2 text-sm font-medium transition-colors ${isOutflow ? 'bg-danger/20 text-danger' : 'text-neutral hover:bg-background-tertiary'
                                        }`}
                                >
                                    Outflow
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsOutflow(false)}
                                    className={`px-4 py-2 text-sm font-medium transition-colors ${!isOutflow ? 'bg-success/20 text-success' : 'text-neutral hover:bg-background-tertiary'
                                        }`}
                                >
                                    Inflow
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Payee */}
                    <div>
                        <label className="block text-sm text-neutral mb-1">Payee</label>
                        <PayeeAutocomplete
                            value={payee}
                            onChange={setPayee}
                            placeholder="Who did you pay?"
                        />
                    </div>

                    {/* Date */}
                    <div>
                        <label className="block text-sm text-neutral mb-1">Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral" />
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="input pl-10"
                                required
                            />
                        </div>
                    </div>

                    {/* Account */}
                    <div>
                        <label className="block text-sm text-neutral mb-1">Account</label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral" />
                            <select
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                                className="input pl-10"
                                required
                            >
                                <option value="">Select account...</option>
                                {accounts.map((acct) => (
                                    <option key={acct.id} value={acct.id}>
                                        {acct.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm text-neutral mb-1">Category</label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral" />
                            <select
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                className="input pl-10"
                            >
                                <option value="">Select category...</option>
                                {categoryGroups.map((group) => (
                                    <optgroup key={group.id} label={group.name}>
                                        {group.categories.map((cat) => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Memo */}
                    <div>
                        <label className="block text-sm text-neutral mb-1">Memo</label>
                        <div className="relative">
                            <FileText className="absolute left-3 top-3 w-5 h-5 text-neutral" />
                            <textarea
                                value={memo}
                                onChange={(e) => setMemo(e.target.value)}
                                placeholder="Add a note..."
                                className="input pl-10 min-h-[80px] resize-none"
                            />
                        </div>
                    </div>

                    {/* Cleared checkbox */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={cleared}
                            onChange={(e) => setCleared(e.target.checked)}
                            className="w-4 h-4 rounded border-border bg-background text-gold focus:ring-gold"
                        />
                        <span className="text-sm text-neutral">Mark as cleared</span>
                    </label>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        {isEditing && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="btn bg-danger/20 text-danger hover:bg-danger/30 border border-danger/30"
                                >
                                    {deleting ? 'Deleting...' : 'Delete'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowSplitModal(true)}
                                    className="btn btn-secondary"
                                >
                                    <Split className="w-4 h-4" />
                                    Split
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-secondary flex-1"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !accountId || !amount}
                            className="btn btn-primary flex-1"
                        >
                            {loading ? 'Saving...' : isEditing ? 'Update' : 'Add Transaction'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDelete}
                title="Delete Transaction"
                message={`Are you sure you want to delete this transaction${editTransaction?.payee ? ` from ${editTransaction.payee}` : ''}? This action cannot be undone.`}
                confirmText="Delete"
                variant="danger"
                loading={deleting}
            />

            {/* Split Transaction Modal */}
            {editTransaction && (
                <SplitTransactionModal
                    isOpen={showSplitModal}
                    onClose={() => setShowSplitModal(false)}
                    onSuccess={() => {
                        setShowSplitModal(false);
                        onClose();
                        onSuccess();
                    }}
                    transactionId={editTransaction.id}
                    transactionAmount={editTransaction.amount}
                    transactionPayee={editTransaction.payee}
                />
            )}
        </div>
    );
}
