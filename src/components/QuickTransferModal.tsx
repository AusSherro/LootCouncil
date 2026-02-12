'use client';

import { useState, useEffect } from 'react';
import { X, ArrowRight, DollarSign } from 'lucide-react';

interface Account {
    id: string;
    name: string;
    type: string;
    balance: number;
}

interface QuickTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    defaultSourceAccountId?: string;
}

export default function QuickTransferModal({
    isOpen,
    onClose,
    onSuccess,
    defaultSourceAccountId,
}: QuickTransferModalProps) {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [sourceAccountId, setSourceAccountId] = useState(defaultSourceAccountId || '');
    const [destinationAccountId, setDestinationAccountId] = useState('');
    const [amount, setAmount] = useState('');
    const [memo, setMemo] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        if (isOpen) {
            fetchAccounts();
        }
    }, [isOpen]);

    useEffect(() => {
        if (defaultSourceAccountId) {
            setSourceAccountId(defaultSourceAccountId);
        }
    }, [defaultSourceAccountId]);

    async function fetchAccounts() {
        try {
            const res = await fetch('/api/accounts');
            const data = await res.json();
            const allAccounts = data.accounts || [];
            // Filter out closed accounts
            setAccounts(allAccounts.filter((a: Account & { closed?: boolean }) => !a.closed));
        } catch (err) {
            console.error('Failed to fetch accounts:', err);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/transfers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceAccountId,
                    destinationAccountId,
                    amount: parseFloat(amount),
                    date,
                    memo: memo || null,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create transfer');
            }

            // Reset form
            setAmount('');
            setMemo('');
            setDestinationAccountId('');

            onSuccess();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create transfer');
        } finally {
            setLoading(false);
        }
    }

    function swapAccounts() {
        const temp = sourceAccountId;
        setSourceAccountId(destinationAccountId);
        setDestinationAccountId(temp);
    }

    if (!isOpen) return null;

    const sourceAccount = accounts.find(a => a.id === sourceAccountId);
    const destAccount = accounts.find(a => a.id === destinationAccountId);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] animate-fade-in">
            <div className="bg-background-secondary border border-border rounded-xl w-full max-w-lg mx-4 shadow-lg">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <ArrowRight className="w-5 h-5 text-gold" />
                        Quick Transfer
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

                    {/* Account Selection with Visual Arrow */}
                    <div className="flex items-center gap-2">
                        {/* Source Account */}
                        <div className="flex-1">
                            <label className="block text-sm text-neutral mb-1">From</label>
                            <select
                                value={sourceAccountId}
                                onChange={(e) => setSourceAccountId(e.target.value)}
                                className="input"
                                required
                            >
                                <option value="">Select account...</option>
                                {accounts.map((acct) => (
                                    <option 
                                        key={acct.id} 
                                        value={acct.id}
                                        disabled={acct.id === destinationAccountId}
                                    >
                                        {acct.name} (${(acct.balance / 100).toFixed(2)})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Swap Button */}
                        <button
                            type="button"
                            onClick={swapAccounts}
                            className="mt-6 p-2 hover:bg-background-tertiary rounded-lg transition-colors"
                            title="Swap accounts"
                        >
                            <ArrowRight className="w-5 h-5 text-gold" />
                        </button>

                        {/* Destination Account */}
                        <div className="flex-1">
                            <label className="block text-sm text-neutral mb-1">To</label>
                            <select
                                value={destinationAccountId}
                                onChange={(e) => setDestinationAccountId(e.target.value)}
                                className="input"
                                required
                            >
                                <option value="">Select account...</option>
                                {accounts.map((acct) => (
                                    <option 
                                        key={acct.id} 
                                        value={acct.id}
                                        disabled={acct.id === sourceAccountId}
                                    >
                                        {acct.name} (${(acct.balance / 100).toFixed(2)})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Visual Preview */}
                    {sourceAccount && destAccount && (
                        <div className="flex items-center justify-center gap-3 py-3 px-4 bg-background-tertiary rounded-lg">
                            <span className="text-sm font-medium text-foreground">{sourceAccount.name}</span>
                            <ArrowRight className="w-5 h-5 text-gold" />
                            <span className="text-sm font-medium text-foreground">{destAccount.name}</span>
                        </div>
                    )}

                    {/* Amount */}
                    <div>
                        <label className="block text-sm text-neutral mb-1">Amount</label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral" />
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="input pl-10"
                                required
                            />
                        </div>
                    </div>

                    {/* Date */}
                    <div>
                        <label className="block text-sm text-neutral mb-1">Date</label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="input"
                            required
                        />
                    </div>

                    {/* Memo (optional) */}
                    <div>
                        <label className="block text-sm text-neutral mb-1">Memo (optional)</label>
                        <input
                            type="text"
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                            placeholder="Add a note..."
                            className="input"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-secondary flex-1"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !sourceAccountId || !destinationAccountId || !amount}
                            className="btn btn-primary flex-1"
                        >
                            {loading ? 'Transferring...' : 'Transfer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
