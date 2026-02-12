'use client';

import { CreditCard, X, Link2, Unlink, AlertCircle, Check, DollarSign } from 'lucide-react';
import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';

interface Account {
    id: string;
    name: string;
    type: string;
    balance: number;
    onBudget?: boolean;
    closed?: boolean;
    linkedAccountId: string | null;
    linkedAccount?: { id: string; name: string } | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function CreditCardPaymentModal({ isOpen, onClose, onSuccess }: Props) {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    // Link form
    const [selectedCardId, setSelectedCardId] = useState('');
    const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState('');

    // Payment form
    const [showPayment, setShowPayment] = useState(false);
    const [paymentCardId, setPaymentCardId] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchAccounts();
            setError(null);
            setSuccess(null);
        }
    }, [isOpen]);

    async function fetchAccounts() {
        setLoading(true);
        try {
            const res = await fetch('/api/accounts');
            const data = await res.json();
            setAccounts(data.accounts || []);
        } catch (err) {
            console.error('Failed to fetch accounts:', err);
        } finally {
            setLoading(false);
        }
    }

    const creditCards = accounts.filter(a => a.type === 'credit' && !a.closed);
    const paymentAccounts = accounts.filter(a => a.type !== 'credit' && a.onBudget && !a.closed);

    async function handleLink() {
        if (!selectedCardId || !selectedPaymentAccountId) return;

        setSaving(true);
        setError(null);

        try {
            const res = await fetch('/api/accounts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: selectedCardId,
                    action: 'link',
                    linkedAccountId: selectedPaymentAccountId,
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to link accounts');
            }

            setSuccess('Credit card linked to payment account!');
            setSelectedCardId('');
            setSelectedPaymentAccountId('');
            fetchAccounts();
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setSaving(false);
        }
    }

    async function handleUnlink(cardId: string) {
        setSaving(true);
        setError(null);

        try {
            const res = await fetch('/api/accounts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: cardId,
                    action: 'link',
                    linkedAccountId: null,
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to unlink accounts');
            }

            setSuccess('Credit card unlinked!');
            fetchAccounts();
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setSaving(false);
        }
    }

    async function handlePayment() {
        if (!paymentCardId || !paymentAmount) return;

        const card = accounts.find(a => a.id === paymentCardId);
        if (!card?.linkedAccountId) {
            setError('This card is not linked to a payment account');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const amountCents = Math.round(parseFloat(paymentAmount) * 100);
            
            // Create a transfer from payment account to credit card
            const res = await fetch('/api/transfers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromAccountId: card.linkedAccountId,
                    toAccountId: paymentCardId,
                    amount: amountCents,
                    memo: 'Credit Card Payment',
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to create payment');
            }

            setSuccess(`Payment of ${formatCurrency(amountCents)} recorded!`);
            setShowPayment(false);
            setPaymentCardId('');
            setPaymentAmount('');
            fetchAccounts();
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) return null;

    const linkedCards = creditCards.filter(c => c.linkedAccountId);
    const unlinkedCards = creditCards.filter(c => !c.linkedAccountId);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background-secondary rounded-xl w-full max-w-2xl shadow-2xl animate-fade-in max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                            <CreditCard className="w-6 h-6 text-purple-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground">Credit Card Payments</h2>
                            <p className="text-sm text-neutral">Link cards to payment accounts and track payments</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-neutral hover:text-foreground transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-negative/20 border border-negative/30 rounded-lg text-negative">
                            <AlertCircle className="w-5 h-5" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="flex items-center gap-2 p-3 bg-success/20 border border-success/30 rounded-lg text-success">
                            <Check className="w-5 h-5" />
                            <span className="text-sm">{success}</span>
                        </div>
                    )}

                    {loading ? (
                        <div className="text-center py-8 text-neutral">Loading accounts...</div>
                    ) : creditCards.length === 0 ? (
                        <div className="text-center py-8">
                            <CreditCard className="w-10 h-10 text-neutral mx-auto mb-2" />
                            <p className="text-neutral">No credit card accounts</p>
                            <p className="text-sm text-neutral/70">Add a credit card account to use this feature</p>
                        </div>
                    ) : (
                        <>
                            {/* Linked Cards */}
                            <div>
                                <h3 className="font-medium text-foreground mb-3">Linked Credit Cards</h3>
                                {linkedCards.length === 0 ? (
                                    <p className="text-sm text-neutral">No credit cards linked yet</p>
                                ) : (
                                    <div className="space-y-2">
                                        {linkedCards.map((card) => (
                                            <div
                                                key={card.id}
                                                className="flex items-center justify-between p-4 bg-background rounded-lg border border-border"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <CreditCard className="w-8 h-8 text-purple-500" />
                                                    <div>
                                                        <p className="font-medium text-foreground">{card.name}</p>
                                                        <p className="text-sm text-neutral">
                                                            Balance: <span className={card.balance < 0 ? 'text-negative' : 'text-foreground'}>{formatCurrency(card.balance)}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <p className="text-sm text-neutral">Linked to</p>
                                                        <p className="text-sm text-foreground">{card.linkedAccount?.name || 'Unknown'}</p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => {
                                                                setPaymentCardId(card.id);
                                                                setPaymentAmount((Math.abs(card.balance) / 100).toFixed(2));
                                                                setShowPayment(true);
                                                            }}
                                                            className="btn btn-primary text-sm"
                                                        >
                                                            <DollarSign className="w-4 h-4" />
                                                            Pay
                                                        </button>
                                                        <button
                                                            onClick={() => handleUnlink(card.id)}
                                                            className="btn btn-ghost text-neutral"
                                                        >
                                                            <Unlink className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Link New Card */}
                            {unlinkedCards.length > 0 && paymentAccounts.length > 0 && (
                                <div className="p-4 bg-background-tertiary rounded-lg">
                                    <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                                        <Link2 className="w-4 h-4" />
                                        Link Credit Card to Payment Account
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <div>
                                            <label className="block text-sm text-neutral mb-1">Credit Card</label>
                                            <select
                                                value={selectedCardId}
                                                onChange={(e) => setSelectedCardId(e.target.value)}
                                                className="input"
                                            >
                                                <option value="">Select card...</option>
                                                {unlinkedCards.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm text-neutral mb-1">Payment Account</label>
                                            <select
                                                value={selectedPaymentAccountId}
                                                onChange={(e) => setSelectedPaymentAccountId(e.target.value)}
                                                className="input"
                                            >
                                                <option value="">Select account...</option>
                                                {paymentAccounts.map(a => (
                                                    <option key={a.id} value={a.id}>{a.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleLink}
                                        disabled={saving || !selectedCardId || !selectedPaymentAccountId}
                                        className="btn btn-primary"
                                    >
                                        {saving ? 'Linking...' : 'Link Accounts'}
                                    </button>
                                </div>
                            )}

                            {/* Make Payment Form */}
                            {showPayment && (
                                <div className="p-4 bg-gold/10 border border-gold/30 rounded-lg">
                                    <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                                        <DollarSign className="w-4 h-4 text-gold" />
                                        Make Credit Card Payment
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <div>
                                            <label className="block text-sm text-neutral mb-1">Credit Card</label>
                                            <select
                                                value={paymentCardId}
                                                onChange={(e) => setPaymentCardId(e.target.value)}
                                                className="input"
                                            >
                                                <option value="">Select card...</option>
                                                {linkedCards.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name} ({formatCurrency(c.balance)})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm text-neutral mb-1">Payment Amount</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral">$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={paymentAmount}
                                                    onChange={(e) => setPaymentAmount(e.target.value)}
                                                    placeholder="0.00"
                                                    className="input pl-7"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                setShowPayment(false);
                                                setPaymentCardId('');
                                                setPaymentAmount('');
                                            }}
                                            className="btn btn-secondary"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handlePayment}
                                            disabled={saving || !paymentCardId || !paymentAmount}
                                            className="btn btn-primary"
                                        >
                                            {saving ? 'Processing...' : 'Record Payment'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-end p-6 border-t border-border">
                    <button onClick={onClose} className="btn btn-secondary">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
