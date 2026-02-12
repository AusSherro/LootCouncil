'use client';

import { Coins, Plus, ArrowUpRight, ArrowDownLeft, RefreshCw, X, Lock, MoreVertical, Archive, ArrowRightLeft, CreditCard } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import QuickTransferModal from '@/components/QuickTransferModal';
import ReconciliationModeModal from '@/components/ReconciliationModeModal';
import CreditCardPaymentModal from '@/components/CreditCardPaymentModal';
import { formatCurrency } from '@/lib/utils';

interface Account {
    id: string;
    name: string;
    type: string;
    balance: number;
    clearedBalance: number;
    onBudget: boolean;
    closed?: boolean;
    lastReconciled?: string;
}

function AccountCard({ account, onReconcile, onClose, onReopen }: { 
    account: Account; 
    onReconcile: (account: Account) => void;
    onClose: (id: string) => void;
    onReopen: (id: string) => void;
}) {
    const [showMenu, setShowMenu] = useState(false);
    const isNegative = account.balance < 0;
    const typeIcons: Record<string, string> = {
        checking: '🏦',
        savings: '💰',
        credit: '💳',
        investment: '📈',
    };

    return (
        <div className={`card card-hover cursor-pointer group ${account.closed ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{typeIcons[account.type] || '💵'}</span>
                    <div>
                        <h3 className="font-semibold text-foreground group-hover:text-gold transition-colors">
                            {account.name}
                        </h3>
                        <p className="text-sm text-neutral capitalize">{account.type}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {account.closed && (
                        <span className="text-xs bg-neutral/20 text-neutral px-2 py-1 rounded-full">Closed</span>
                    )}
                    {account.onBudget && !account.closed && (
                        <span className="text-xs bg-gold/20 text-gold px-2 py-1 rounded-full">On Budget</span>
                    )}
                    {account.lastReconciled && !account.closed && (
                        <span className="text-xs bg-success/20 text-success px-2 py-1 rounded-full flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Reconciled
                        </span>
                    )}
                    <div className="relative">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                            className="p-1 hover:bg-background-tertiary rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <MoreVertical className="w-4 h-4 text-neutral" />
                        </button>
                        {showMenu && (
                            <div className="absolute right-0 top-full z-[60] bg-background-secondary border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                                {account.closed ? (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onReopen(account.id); setShowMenu(false); }}
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        Reopen Account
                                    </button>
                                ) : (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onClose(account.id); setShowMenu(false); }}
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
                                    >
                                        <Archive className="w-4 h-4" />
                                        Close Account
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral">Working Balance</span>
                    <span className={`text-xl font-bold ${isNegative ? 'text-negative' : 'text-positive'}`}>
                        {formatCurrency(account.balance)}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral">Cleared Balance</span>
                    <span className="text-sm text-neutral">{formatCurrency(account.clearedBalance)}</span>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                {account.balance !== account.clearedBalance ? (
                    <span className="text-xs text-warning">
                        {formatCurrency(account.balance - account.clearedBalance)} uncleared
                    </span>
                ) : (
                    <span className="text-xs text-success">All cleared</span>
                )}
                {!account.closed && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onReconcile(account); }}
                        className="text-xs px-3 py-1 bg-background-tertiary hover:bg-gold/20 text-neutral hover:text-gold rounded transition-colors"
                    >
                        Reconcile
                    </button>
                )}
            </div>
        </div>
    );
}

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [reconcileAccount, setReconcileAccount] = useState<Account | null>(null);
    const [showCreditCard, setShowCreditCard] = useState(false);
    const [newAccount, setNewAccount] = useState({ name: '', type: 'checking', balance: '' });

    const fetchAccounts = useCallback(async () => {
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
    }, []);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    async function handleAddAccount(e: React.FormEvent) {
        e.preventDefault();
        try {
            const res = await fetch('/api/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newAccount.name,
                    type: newAccount.type,
                    balance: parseFloat(newAccount.balance) || 0,
                }),
            });

            if (res.ok) {
                setNewAccount({ name: '', type: 'checking', balance: '' });
                setShowAddForm(false);
                fetchAccounts();
            }
        } catch (err) {
            console.error('Failed to create account:', err);
        }
    }

    async function handleCloseAccount(id: string) {
        try {
            await fetch('/api/accounts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, updates: { closed: true } }),
            });
            fetchAccounts();
        } catch (err) {
            console.error('Failed to close account:', err);
        }
    }

    async function handleReopenAccount(id: string) {
        try {
            await fetch('/api/accounts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, updates: { closed: false } }),
            });
            fetchAccounts();
        } catch (err) {
            console.error('Failed to reopen account:', err);
        }
    }

    const activeAccounts = accounts.filter(a => !a.closed);
    const closedAccounts = accounts.filter(a => a.closed);
    const totalOnBudget = activeAccounts
        .filter(a => a.onBudget)
        .reduce((sum, a) => sum + a.balance, 0);

    const totalAssets = activeAccounts
        .filter(a => a.balance > 0)
        .reduce((sum, a) => sum + a.balance, 0);

    const totalLiabilities = activeAccounts
        .filter(a => a.balance < 0)
        .reduce((sum, a) => sum + a.balance, 0);

    return (
        <div className="p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
                        <Coins className="w-7 h-7 text-gold" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
                        <p className="text-neutral">Manage your accounts</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={fetchAccounts} className="btn btn-ghost" disabled={loading}>
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setShowCreditCard(true)} className="btn btn-secondary">
                        <CreditCard className="w-5 h-5" />
                        Credit Cards
                    </button>
                    <button onClick={() => setShowTransferModal(true)} className="btn btn-secondary">
                        <ArrowRightLeft className="w-5 h-5" />
                        Transfer
                    </button>
                    <button onClick={() => setShowAddForm(true)} className="btn btn-primary">
                        <Plus className="w-5 h-5" />
                        Add Account
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="card">
                    <div className="flex items-center gap-2 mb-2">
                        <ArrowUpRight className="w-5 h-5 text-success" />
                        <span className="text-sm text-neutral">Total Assets</span>
                    </div>
                    <p className="text-2xl font-bold text-success">{formatCurrency(totalAssets)}</p>
                </div>
                <div className="card">
                    <div className="flex items-center gap-2 mb-2">
                        <ArrowDownLeft className="w-5 h-5 text-danger" />
                        <span className="text-sm text-neutral">Total Liabilities</span>
                    </div>
                    <p className="text-2xl font-bold text-danger">{formatCurrency(totalLiabilities)}</p>
                </div>
                <div className="card border-gold/30">
                    <div className="flex items-center gap-2 mb-2">
                        <Coins className="w-5 h-5 text-gold" />
                        <span className="text-sm text-neutral">Net Worth</span>
                    </div>
                    <p className="text-2xl font-bold text-gold">{formatCurrency(totalAssets + totalLiabilities)}</p>
                </div>
            </div>

            {/* Accounts Grid */}
            {loading ? (
                <div className="card text-center py-12">
                    <RefreshCw className="w-8 h-8 text-gold mx-auto animate-spin" />
                    <p className="text-neutral mt-2">Loading accounts...</p>
                </div>
            ) : accounts.length === 0 ? (
                <div className="card text-center py-12">
                    <Coins className="w-12 h-12 text-neutral mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No accounts yet</h3>
                    <p className="text-neutral mb-4">Add your first account or import from YNAB</p>
                    <button onClick={() => setShowAddForm(true)} className="btn btn-primary">
                        <Plus className="w-5 h-5" />
                        Add Account
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-foreground">Budget Accounts</h2>
                        <span className="text-gold font-medium">{formatCurrency(totalOnBudget)}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {activeAccounts.filter(a => a.onBudget).map((account) => (
                            <AccountCard 
                                key={account.id} 
                                account={account} 
                                onReconcile={setReconcileAccount}
                                onClose={handleCloseAccount}
                                onReopen={handleReopenAccount}
                            />
                        ))}
                    </div>

                    {/* Closed Accounts */}
                    {closedAccounts.length > 0 && (
                        <>
                            <div className="flex items-center justify-between mt-8 mb-4">
                                <h2 className="text-lg font-semibold text-neutral">Closed Accounts</h2>
                                <span className="text-neutral text-sm">{closedAccounts.length} account{closedAccounts.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {closedAccounts.map((account) => (
                                    <AccountCard 
                                        key={account.id} 
                                        account={account} 
                                        onReconcile={setReconcileAccount}
                                        onClose={handleCloseAccount}
                                        onReopen={handleReopenAccount}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </>
            )}

            {/* Add Account Modal */}
            {showAddForm && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] animate-fade-in">
                    <div className="bg-background-secondary border border-border rounded-xl w-full max-w-md mx-4 p-6">
                        <h2 className="text-lg font-semibold text-foreground mb-4">Add Account</h2>
                        <form onSubmit={handleAddAccount} className="space-y-4">
                            <div>
                                <label className="block text-sm text-neutral mb-1">Account Name</label>
                                <input
                                    type="text"
                                    value={newAccount.name}
                                    onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                                    placeholder="e.g., Main Checking"
                                    className="input"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-neutral mb-1">Account Type</label>
                                <select
                                    value={newAccount.type}
                                    onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value })}
                                    className="input"
                                >
                                    <option value="checking">Checking</option>
                                    <option value="savings">Savings</option>
                                    <option value="credit">Credit Card</option>
                                    <option value="cash">Cash</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-neutral mb-1">Starting Balance</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={newAccount.balance}
                                    onChange={(e) => setNewAccount({ ...newAccount, balance: e.target.value })}
                                    placeholder="0.00"
                                    className="input"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAddForm(false)}
                                    className="btn btn-secondary flex-1"
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary flex-1">
                                    Add Account
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Quick Transfer Modal */}
            <QuickTransferModal
                isOpen={showTransferModal}
                onClose={() => setShowTransferModal(false)}
                onSuccess={fetchAccounts}
            />

            {/* Advanced Reconciliation Modal */}
            {reconcileAccount && (
                <ReconciliationModeModal
                    isOpen={true}
                    onClose={() => setReconcileAccount(null)}
                    onSuccess={fetchAccounts}
                    accountId={reconcileAccount.id}
                    accountName={reconcileAccount.name}
                />
            )}

            {/* Credit Card Payment Modal */}
            <CreditCardPaymentModal
                isOpen={showCreditCard}
                onClose={() => setShowCreditCard(false)}
                onSuccess={fetchAccounts}
            />
        </div>
    );
}
