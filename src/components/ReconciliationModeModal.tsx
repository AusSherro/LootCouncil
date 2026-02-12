'use client';

import { CheckSquare, Square, X, Lock, AlertCircle, Check } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils';

interface Transaction {
    id: string;
    date: string;
    payee: string | null;
    memo: string | null;
    amount: number;
    cleared: boolean;
    isReconciled?: boolean;
}

interface ReconcileStatus {
    clearedBalance: number;
    unclearedCount: number;
    lastReconciled: string | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    accountId: string;
    accountName: string;
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

export default function ReconciliationModeModal({ isOpen, onClose, onSuccess, accountId, accountName }: Props) {
    const [status, setStatus] = useState<ReconcileStatus | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statementBalance, setStatementBalance] = useState('');
    const [step, setStep] = useState<'select' | 'confirm'>('select');

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch(`/api/reconcile?accountId=${accountId}`);
            const data = await res.json();
            setStatus(data);
        } catch (err) {
            console.error('Failed to fetch reconcile status:', err);
        }
    }, [accountId]);

    const fetchTransactions = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/transactions?accountId=${accountId}&limit=500`);
            const data = await res.json();
            // Filter to only show cleared but not yet reconciled transactions
            const clearedUnreconciled = (data.transactions || []).filter(
                (t: Transaction) => t.cleared && !t.isReconciled
            );
            setTransactions(clearedUnreconciled);
            // Select all by default
            setSelectedIds(new Set(clearedUnreconciled.map((t: Transaction) => t.id)));
        } catch (err) {
            console.error('Failed to fetch transactions:', err);
        } finally {
            setLoading(false);
        }
    }, [accountId]);

    useEffect(() => {
        if (isOpen) {
            fetchStatus();
            fetchTransactions();
            setSelectedIds(new Set());
            setStatementBalance('');
            setStep('select');
        }
    }, [isOpen, fetchStatus, fetchTransactions]);

    function toggleTransaction(id: string) {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    }

    function selectAll() {
        setSelectedIds(new Set(transactions.map(t => t.id)));
    }

    function deselectAll() {
        setSelectedIds(new Set());
    }

    const selectedTotal = transactions
        .filter(t => selectedIds.has(t.id))
        .reduce((sum, t) => sum + t.amount, 0);

    const expectedBalance = (status?.clearedBalance || 0) + selectedTotal;

    async function handleMark() {
        if (selectedIds.size === 0) return;

        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/reconcile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountId,
                    transactionIds: Array.from(selectedIds),
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to mark transactions as reconciled');
            }

            setStep('confirm');
            fetchStatus();
            fetchTransactions();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleFinalize() {
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/reconcile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountId,
                    statementBalance: statementBalance ? parseFloat(statementBalance) * 100 : undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to finalize reconciliation');
            }

            onSuccess();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setSubmitting(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background-secondary rounded-xl w-full max-w-4xl shadow-2xl animate-fade-in max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                            <Lock className="w-6 h-6 text-success" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground">Reconcile {accountName}</h2>
                            <p className="text-sm text-neutral">
                                {status?.lastReconciled 
                                    ? `Last reconciled: ${new Date(status.lastReconciled).toLocaleDateString('en-AU')}`
                                    : 'Never reconciled'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-neutral hover:text-foreground transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {error && (
                        <div className="flex items-center gap-2 p-3 mb-4 bg-negative/20 border border-negative/30 rounded-lg text-negative">
                            <AlertCircle className="w-5 h-5" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {step === 'select' && (
                        <>
                            {/* Summary */}
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                <div className="p-4 bg-background-tertiary rounded-lg">
                                    <p className="text-sm text-neutral">Cleared Balance</p>
                                    <p className="text-lg font-bold text-foreground">{formatCurrency(status?.clearedBalance || 0)}</p>
                                </div>
                                <div className="p-4 bg-background-tertiary rounded-lg">
                                    <p className="text-sm text-neutral">Selected ({selectedIds.size})</p>
                                    <p className={`text-lg font-bold ${selectedTotal >= 0 ? 'text-positive' : 'text-negative'}`}>
                                        {selectedTotal >= 0 ? '+' : ''}{formatCurrency(selectedTotal)}
                                    </p>
                                </div>
                                <div className="p-4 bg-background-tertiary rounded-lg">
                                    <p className="text-sm text-neutral">New Balance</p>
                                    <p className={`text-lg font-bold ${expectedBalance >= 0 ? 'text-foreground' : 'text-negative'}`}>
                                        {formatCurrency(expectedBalance)}
                                    </p>
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-neutral">
                                    {transactions.length} cleared transactions to reconcile
                                </p>
                                <div className="flex gap-2">
                                    <button onClick={selectAll} className="btn btn-ghost text-sm">Select All</button>
                                    <button onClick={deselectAll} className="btn btn-ghost text-sm">Deselect All</button>
                                </div>
                            </div>

                            {/* Transaction List */}
                            {loading ? (
                                <div className="text-center py-8 text-neutral">Loading transactions...</div>
                            ) : transactions.length === 0 ? (
                                <div className="text-center py-8">
                                    <Check className="w-10 h-10 text-success mx-auto mb-2" />
                                    <p className="text-neutral">All cleared transactions are reconciled</p>
                                    <p className="text-sm text-neutral/70">No new transactions to reconcile</p>
                                </div>
                            ) : (
                                <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                                    {transactions.map((tx) => (
                                        <div
                                            key={tx.id}
                                            onClick={() => toggleTransaction(tx.id)}
                                            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                                selectedIds.has(tx.id)
                                                    ? 'bg-success/10 border border-success/30'
                                                    : 'bg-background border border-border hover:bg-background-tertiary'
                                            }`}
                                        >
                                            {selectedIds.has(tx.id) ? (
                                                <CheckSquare className="w-5 h-5 text-success flex-shrink-0" />
                                            ) : (
                                                <Square className="w-5 h-5 text-neutral flex-shrink-0" />
                                            )}
                                            <span className="text-sm text-neutral w-20 flex-shrink-0">{formatDate(tx.date)}</span>
                                            <span className="font-medium text-foreground flex-1 truncate">{tx.payee || 'Unknown'}</span>
                                            <span className={`font-medium ${tx.amount >= 0 ? 'text-positive' : 'text-foreground'}`}>
                                                {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {step === 'confirm' && (
                        <div className="text-center py-8">
                            <Check className="w-16 h-16 text-success mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-foreground mb-2">Transactions Marked</h3>
                            <p className="text-neutral mb-6">
                                {selectedIds.size} transactions marked as reconciled.
                            </p>

                            <div className="max-w-sm mx-auto">
                                <label className="block text-sm text-neutral mb-2">
                                    Confirm Statement Balance (optional)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral">$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={statementBalance}
                                        onChange={(e) => setStatementBalance(e.target.value)}
                                        placeholder="Enter bank statement balance"
                                        className="input pl-7 w-full"
                                    />
                                </div>
                                <p className="text-xs text-neutral mt-2">
                                    Enter your bank statement balance to verify the reconciliation.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 p-6 border-t border-border">
                    <button onClick={onClose} className="btn btn-secondary">
                        {step === 'confirm' ? 'Close' : 'Cancel'}
                    </button>
                    {step === 'select' && (
                        <button
                            onClick={handleMark}
                            disabled={submitting || selectedIds.size === 0}
                            className="btn btn-primary"
                        >
                            {submitting ? 'Processing...' : `Reconcile ${selectedIds.size} Transactions`}
                        </button>
                    )}
                    {step === 'confirm' && (
                        <button
                            onClick={handleFinalize}
                            disabled={submitting}
                            className="btn btn-primary"
                        >
                            {submitting ? 'Finalizing...' : 'Finalize Reconciliation'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
