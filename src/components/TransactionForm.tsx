'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { X, Calendar, DollarSign, Tag, FileText, Building2, Split, AlertCircle, RefreshCw } from 'lucide-react';
import PayeeAutocomplete from './PayeeAutocomplete';
import SplitTransactionModal from './SplitTransactionModal';
import ConfirmDialog from './ConfirmDialog';
import { useModalA11y } from '@/lib/useModalA11y';
import { useProfile } from './ProfileProvider';
import { getLastTransactionAccountKey, resolveTransactionAccountId } from '@/lib/transactionFormPreferences';
import { toLocalDateString } from '@/lib/utils';

interface Account {
    id: string;
    name: string;
    type: string;
    closed?: boolean;
}

interface Category {
    id: string;
    name: string;
    isHidden?: boolean;
}

interface CategoryGroup {
    id: string;
    name: string;
    isHidden?: boolean;
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
    isSplit?: boolean;
    account?: { id: string; name: string } | null;
    category?: { id: string; name: string } | null;
}

interface TransactionFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    defaultAccountId?: string;
    editTransaction?: Transaction | null;
    defaultIsInflow?: boolean;
}

export default function TransactionForm({ isOpen, onClose, onSuccess, defaultAccountId, editTransaction, defaultIsInflow }: TransactionFormProps) {
    const { activeProfile } = useProfile();
    const formId = useId();
    const dialogTitleId = `${formId}-title`;
    const amountId = `${formId}-amount`;
    const payeeId = `${formId}-payee`;
    const dateId = `${formId}-date`;
    const accountIdField = `${formId}-account`;
    const categoryIdField = `${formId}-category`;
    const memoId = `${formId}-memo`;
    const dialogRef = useModalA11y(isOpen, onClose);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Form state
    const [date, setDate] = useState(toLocalDateString());
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
            setCategoryId(editTransaction.isSplit ? '' : (editTransaction.category?.id || editTransaction.categoryId || ''));
            setMemo(editTransaction.memo || '');
            setCleared(editTransaction.cleared);
        } else if (!editTransaction && isOpen) {
            // Reset form for new transaction
            setDate(toLocalDateString());
            setPayee('');
            setAmount('');
            setIsOutflow(defaultIsInflow ? false : true);
            setAccountId('');
            setCategoryId('');
            setMemo('');
            setCleared(false);
        }
    }, [editTransaction, isOpen, defaultAccountId, defaultIsInflow]);

    const fetchFormOptions = useCallback(async (signal?: AbortSignal) => {
        if (!activeProfile) return;

        setOptionsLoading(true);
        setFetchError(null);
        setAccounts([]);
        setCategoryGroups([]);

        const [accountsResult, categoriesResult] = await Promise.allSettled([
            fetch('/api/accounts', { cache: 'no-store', signal }).then(async response => {
                if (!response.ok) throw new Error('Failed to load accounts');
                return response.json() as Promise<{ accounts?: Account[] }>;
            }),
            fetch('/api/categories?showHidden=true', { cache: 'no-store', signal }).then(async response => {
                if (!response.ok) throw new Error('Failed to load categories');
                return response.json() as Promise<{ categoryGroups?: CategoryGroup[] }>;
            }),
        ]);

        if (signal?.aborted) return;

        const failedOptions: string[] = [];
        if (accountsResult.status === 'fulfilled') {
            const editAccountId = editTransaction?.account?.id || editTransaction?.accountId;
            const selectableAccounts = (accountsResult.value.accounts || []).filter(
                account => !account.closed || account.id === editAccountId
            );
            setAccounts(selectableAccounts);

            let storedAccountId: string | null = null;
            try {
                storedAccountId = localStorage.getItem(getLastTransactionAccountKey(activeProfile.id));
            } catch {
                // Storage may be unavailable in privacy mode.
            }
            setAccountId(resolveTransactionAccountId(
                selectableAccounts,
                editAccountId,
                defaultAccountId,
                storedAccountId,
            ));
        } else {
            failedOptions.push('accounts');
            if (!(accountsResult.reason instanceof DOMException && accountsResult.reason.name === 'AbortError')) {
                console.error('Failed to fetch accounts:', accountsResult.reason);
            }
        }

        if (categoriesResult.status === 'fulfilled') {
            const editCategoryId = editTransaction?.category?.id || editTransaction?.categoryId;
            const selectableGroups = (categoriesResult.value.categoryGroups || [])
                .map(group => ({
                    ...group,
                    name: group.isHidden ? `${group.name} (hidden)` : group.name,
                    categories: group.categories
                        .filter(category => (!group.isHidden && !category.isHidden) || category.id === editCategoryId)
                        .map(category => ({
                            ...category,
                            name: category.isHidden ? `${category.name} (hidden)` : category.name,
                        })),
                }))
                .filter(group => group.categories.length > 0);
            setCategoryGroups(selectableGroups);
        } else {
            failedOptions.push('categories');
            if (!(categoriesResult.reason instanceof DOMException && categoriesResult.reason.name === 'AbortError')) {
                console.error('Failed to fetch categories:', categoriesResult.reason);
            }
        }

        if (failedOptions.length > 0) {
            setFetchError(`Could not load ${failedOptions.join(' or ')}. Please try again.`);
        }
        setOptionsLoading(false);
    }, [activeProfile, defaultAccountId, editTransaction]);

    useEffect(() => {
        if (!isOpen || !activeProfile) return;
        const controller = new AbortController();
        void fetchFormOptions(controller.signal);
        return () => controller.abort();
    }, [isOpen, activeProfile, fetchFormOptions]);

    function handleAccountChange(nextAccountId: string) {
        setAccountId(nextAccountId);
        if (isEditing || !activeProfile || !nextAccountId) return;
        try {
            localStorage.setItem(getLastTransactionAccountKey(activeProfile.id), nextAccountId);
        } catch {
            // Storage may be unavailable in privacy mode.
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const numAmount = parseFloat(amount);
            if (isNaN(numAmount) || numAmount <= 0) {
                throw new Error('Amount must be a positive number');
            }
            if (numAmount > 999999999) {
                throw new Error('Amount is too large');
            }
            if (payee && payee.length > 200) {
                throw new Error('Payee name is too long (max 200 characters)');
            }
            if (memo && memo.length > 500) {
                throw new Error('Memo is too long (max 500 characters)');
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
                    categoryId: editTransaction?.isSplit ? null : (categoryId || null),
                    cleared,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || `Failed to ${isEditing ? 'update' : 'create'} transaction`);
            }

            if (!isEditing && activeProfile && accountId) {
                try {
                    localStorage.setItem(getLastTransactionAccountKey(activeProfile.id), accountId);
                } catch {
                    // Storage may be unavailable in privacy mode.
                }
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
            <div
                ref={dialogRef}
                className="bg-background-secondary border border-border rounded-xl w-full max-w-lg mx-4 shadow-lg animate-scale-in"
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                tabIndex={-1}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 id={dialogTitleId} className="text-lg font-semibold text-foreground">
                        {isEditing ? 'Edit Transaction' : 'Add Transaction'}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-background-tertiary rounded-lg transition-colors" aria-label="Close transaction form">
                        <X className="w-5 h-5 text-neutral" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-danger/20 border border-danger/30 rounded-lg text-danger text-sm" role="alert">
                            {error}
                        </div>
                    )}

                    {fetchError && (
                        <div className="p-3 bg-danger/20 border border-danger/30 rounded-lg flex items-center gap-3" role="alert">
                            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-danger text-sm">{fetchError}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    void fetchFormOptions();
                                }}
                                className="text-danger hover:text-danger/80 transition-colors flex-shrink-0"
                                aria-label="Retry loading accounts and categories"
                                title="Retry loading accounts and categories"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Amount with Inflow/Outflow toggle */}
                    <div>
                        <label htmlFor={amountId} className="block text-sm text-neutral mb-1">Amount</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral" />
                                <input
                                    id={amountId}
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="999999999"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="input pl-10"
                                    required
                                    aria-label="Transaction amount"
                                    data-autofocus
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
                        <label htmlFor={payeeId} className="block text-sm text-neutral mb-1">Payee</label>
                        <PayeeAutocomplete
                            id={payeeId}
                            value={payee}
                            onChange={setPayee}
                            onPayeeSelect={(p) => {
                                const categoryIsSelectable = categoryGroups.some(group =>
                                    group.categories.some(category => category.id === p?.lastCategoryId)
                                );
                                if (!isEditing && p?.lastCategoryId && !categoryId && categoryIsSelectable) {
                                    setCategoryId(p.lastCategoryId);
                                }
                            }}
                            placeholder="Who did you pay?"
                        />
                    </div>

                    {/* Date */}
                    <div>
                        <label htmlFor={dateId} className="block text-sm text-neutral mb-1">Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral" />
                            <input
                                id={dateId}
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
                        <label htmlFor={accountIdField} className="block text-sm text-neutral mb-1">Account</label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral" />
                            <select
                                id={accountIdField}
                                value={accountId}
                                onChange={(e) => handleAccountChange(e.target.value)}
                                className="input pl-10"
                                required
                                disabled={optionsLoading}
                            >
                                <option value="">{optionsLoading ? 'Loading accounts...' : 'Select account...'}</option>
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
                        <label htmlFor={categoryIdField} className="block text-sm text-neutral mb-1">Category</label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral" />
                            <select
                                id={categoryIdField}
                                value={editTransaction?.isSplit ? '' : categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                className="input pl-10"
                                disabled={optionsLoading || Boolean(editTransaction?.isSplit)}
                            >
                                <option value="">
                                    {editTransaction?.isSplit
                                        ? 'Split across multiple categories'
                                        : optionsLoading
                                            ? 'Loading categories...'
                                            : categoryGroups.length === 0
                                                ? 'No active categories'
                                                : 'Uncategorized'}
                                </option>
                                {!editTransaction?.isSplit && categoryGroups.map((group) => (
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
                        <label htmlFor={memoId} className="block text-sm text-neutral mb-1">Memo</label>
                        <div className="relative">
                            <FileText className="absolute left-3 top-3 w-5 h-5 text-neutral" />
                            <textarea
                                id={memoId}
                                value={memo}
                                onChange={(e) => setMemo(e.target.value)}
                                placeholder="Add a note..."
                                className="input pl-10 min-h-[80px] resize-none"
                                maxLength={500}
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
                                    {editTransaction.isSplit ? 'Edit Splits' : 'Split'}
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
                            disabled={loading || optionsLoading || !accountId || !amount}
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
