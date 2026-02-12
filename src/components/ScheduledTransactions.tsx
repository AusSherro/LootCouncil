'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
    Calendar, Plus, RefreshCw, Trash2, Edit3, Clock, 
    AlertTriangle, CheckCircle, X, Repeat, ChevronRight 
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface ScheduledTransaction {
    id: string;
    name: string;
    amount: number;
    payee: string | null;
    memo: string | null;
    accountId: string;
    accountName: string;
    categoryId: string | null;
    categoryName: string | null;
    frequency: string;
    nextDueDate: string;
    dayOfMonth: number | null;
    autoCreate: boolean;
    reminderDays: number;
    isActive: boolean;
}

interface Account {
    id: string;
    name: string;
    closed?: boolean;
}

interface Category {
    id: string;
    name: string;
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getDaysUntil(dateStr: string): number {
    const date = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const frequencyLabels: Record<string, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Every 2 Weeks',
    monthly: 'Monthly',
    yearly: 'Yearly',
};

interface ScheduledTransactionsProps {
    compact?: boolean;
    limit?: number;
    onViewAll?: () => void;
}

export default function ScheduledTransactions({ compact, limit, onViewAll }: ScheduledTransactionsProps) {
    const [scheduled, setScheduled] = useState<ScheduledTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingItem, setEditingItem] = useState<ScheduledTransaction | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);

    const fetchScheduled = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/scheduled');
            const data = await res.json();
            setScheduled(data.scheduled || []);
        } catch (err) {
            console.error('Failed to fetch scheduled transactions:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchScheduled();
        // Fetch accounts and categories for the form
        fetch('/api/accounts').then(r => r.json()).then(d => setAccounts(d.accounts || []));
        fetch('/api/categories').then(r => r.json()).then(d => {
            const allCats: Category[] = [];
            (d.categoryGroups || []).forEach((g: { categories: Category[] }) => {
                allCats.push(...g.categories);
            });
            setCategories(allCats);
        });
    }, [fetchScheduled]);

    async function handleDelete(id: string) {
        if (!confirm('Delete this scheduled transaction?')) return;
        try {
            await fetch(`/api/scheduled?id=${id}`, { method: 'DELETE' });
            fetchScheduled();
        } catch (err) {
            console.error('Failed to delete:', err);
        }
    }

    async function handleProcessDue() {
        try {
            const res = await fetch('/api/scheduled', { method: 'PUT' });
            const data = await res.json();
            if (data.processed > 0) {
                alert(`Created ${data.processed} transaction(s) from scheduled items!`);
                fetchScheduled();
            } else {
                alert('No scheduled transactions are due for auto-creation.');
            }
        } catch (err) {
            console.error('Failed to process:', err);
        }
    }

    const displayItems = limit ? scheduled.slice(0, limit) : scheduled;

    if (loading) {
        return (
            <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 text-gold mx-auto animate-spin" />
                <p className="text-neutral mt-2">Loading scheduled transactions...</p>
            </div>
        );
    }

    // Compact view for dashboard
    if (compact) {
        if (scheduled.length === 0) {
            return (
                <div className="text-center py-4">
                    <Clock className="w-8 h-8 text-neutral mx-auto mb-2" />
                    <p className="text-sm text-neutral">No scheduled transactions</p>
                </div>
            );
        }

        return (
            <div className="space-y-2">
                {displayItems.map(item => {
                    const daysUntil = getDaysUntil(item.nextDueDate);
                    const isOverdue = daysUntil < 0;
                    const isSoon = daysUntil <= item.reminderDays;

                    return (
                        <div 
                            key={item.id}
                            className={`flex items-center justify-between p-3 rounded-lg ${
                                isOverdue ? 'bg-danger/10 border border-danger/30' :
                                isSoon ? 'bg-warning/10 border border-warning/30' :
                                'bg-background hover:bg-background-tertiary'
                            } transition-colors`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${
                                    isOverdue ? 'bg-danger' : isSoon ? 'bg-warning' : 'bg-success'
                                }`} />
                                <div>
                                    <p className="font-medium text-foreground">{item.name}</p>
                                    <p className="text-xs text-neutral">
                                        {isOverdue ? 'Overdue' : isSoon ? `Due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}` : formatDate(item.nextDueDate)}
                                    </p>
                                </div>
                            </div>
                            <span className={`font-semibold ${item.amount < 0 ? 'text-foreground' : 'text-success'}`}>
                                {formatCurrency(item.amount)}
                            </span>
                        </div>
                    );
                })}
                {scheduled.length > (limit || 0) && onViewAll && (
                    <button 
                        onClick={onViewAll}
                        className="w-full text-center py-2 text-sm text-neutral hover:text-gold transition-colors flex items-center justify-center gap-1"
                    >
                        View all {scheduled.length} scheduled
                        <ChevronRight className="w-4 h-4" />
                    </button>
                )}
            </div>
        );
    }

    // Full view
    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-gold" />
                    <h3 className="font-semibold text-foreground">Scheduled Transactions</h3>
                    <span className="text-sm text-neutral">({scheduled.length})</span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleProcessDue}
                        className="btn btn-secondary text-sm"
                        title="Create transactions for all due scheduled items"
                    >
                        <Clock className="w-4 h-4" />
                        Process Due
                    </button>
                    <button onClick={() => setShowAddModal(true)} className="btn btn-primary text-sm">
                        <Plus className="w-4 h-4" />
                        Add Scheduled
                    </button>
                </div>
            </div>

            {/* List */}
            {scheduled.length === 0 ? (
                <div className="card text-center py-8">
                    <Repeat className="w-12 h-12 text-neutral mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No scheduled transactions</h3>
                    <p className="text-neutral mb-4">Set up recurring bills and income to track upcoming payments</p>
                    <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                        <Plus className="w-5 h-5" />
                        Add Scheduled Transaction
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {scheduled.map(item => {
                        const daysUntil = getDaysUntil(item.nextDueDate);
                        const isOverdue = daysUntil < 0;
                        const isSoon = daysUntil <= item.reminderDays && daysUntil >= 0;

                        return (
                            <div 
                                key={item.id}
                                className={`card flex items-center gap-4 ${
                                    isOverdue ? 'border-danger/30 bg-danger/5' :
                                    isSoon ? 'border-warning/30 bg-warning/5' :
                                    'hover:border-gold/20'
                                }`}
                            >
                                {/* Status Icon */}
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                    isOverdue ? 'bg-danger/20' :
                                    isSoon ? 'bg-warning/20' :
                                    'bg-gold/10'
                                }`}>
                                    {isOverdue ? (
                                        <AlertTriangle className="w-5 h-5 text-danger" />
                                    ) : isSoon ? (
                                        <Clock className="w-5 h-5 text-warning" />
                                    ) : (
                                        <CheckCircle className="w-5 h-5 text-gold" />
                                    )}
                                </div>

                                {/* Details */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-semibold text-foreground">{item.name}</h4>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-background-tertiary text-neutral">
                                            {frequencyLabels[item.frequency] || item.frequency}
                                        </span>
                                        {item.autoCreate && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success">
                                                Auto
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-neutral">
                                        {item.accountName}
                                        {item.categoryName && ` → ${item.categoryName}`}
                                    </p>
                                </div>

                                {/* Next Due */}
                                <div className="text-right">
                                    <p className={`font-semibold ${
                                        isOverdue ? 'text-danger' :
                                        isSoon ? 'text-warning' :
                                        'text-neutral'
                                    }`}>
                                        {isOverdue ? `${Math.abs(daysUntil)} days overdue` :
                                         daysUntil === 0 ? 'Due today' :
                                         daysUntil === 1 ? 'Due tomorrow' :
                                         `In ${daysUntil} days`}
                                    </p>
                                    <p className="text-xs text-neutral">{formatDate(item.nextDueDate)}</p>
                                </div>

                                {/* Amount */}
                                <div className={`text-right font-bold text-lg ${
                                    item.amount < 0 ? 'text-foreground' : 'text-success'
                                }`}>
                                    {formatCurrency(item.amount)}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setEditingItem(item)}
                                        className="p-2 hover:bg-background-tertiary rounded-lg text-neutral hover:text-foreground transition-colors"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="p-2 hover:bg-danger/20 rounded-lg text-neutral hover:text-danger transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add/Edit Modal */}
            {(showAddModal || editingItem) && (
                <ScheduledTransactionModal
                    isOpen={true}
                    onClose={() => { setShowAddModal(false); setEditingItem(null); }}
                    onSave={fetchScheduled}
                    accounts={accounts}
                    categories={categories}
                    editItem={editingItem}
                />
            )}
        </div>
    );
}

// Modal Component
interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    accounts: Account[];
    categories: Category[];
    editItem: ScheduledTransaction | null;
}

function ScheduledTransactionModal({ isOpen, onClose, onSave, accounts, categories, editItem }: ModalProps) {
    const [form, setForm] = useState({
        name: editItem?.name || '',
        amount: editItem ? Math.abs(editItem.amount) / 100 : '',
        isExpense: editItem ? editItem.amount < 0 : true,
        payee: editItem?.payee || '',
        memo: editItem?.memo || '',
        accountId: editItem?.accountId || '',
        categoryId: editItem?.categoryId || '',
        frequency: editItem?.frequency || 'monthly',
        nextDueDate: editItem?.nextDueDate ? new Date(editItem.nextDueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        dayOfMonth: editItem?.dayOfMonth || '',
        autoCreate: editItem?.autoCreate ?? false,
        reminderDays: editItem?.reminderDays ?? 3,
    });
    const [saving, setSaving] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);

        const amount = parseFloat(form.amount as string) * (form.isExpense ? -1 : 1);

        try {
            if (editItem) {
                await fetch('/api/scheduled', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: editItem.id,
                        name: form.name,
                        amount,
                        payee: form.payee || null,
                        memo: form.memo || null,
                        accountId: form.accountId,
                        categoryId: form.categoryId || null,
                        frequency: form.frequency,
                        nextDueDate: form.nextDueDate,
                        dayOfMonth: form.dayOfMonth ? parseInt(form.dayOfMonth as string) : null,
                        autoCreate: form.autoCreate,
                        reminderDays: form.reminderDays,
                    }),
                });
            } else {
                await fetch('/api/scheduled', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: form.name,
                        amount,
                        payee: form.payee || null,
                        memo: form.memo || null,
                        accountId: form.accountId,
                        categoryId: form.categoryId || null,
                        frequency: form.frequency,
                        nextDueDate: form.nextDueDate,
                        dayOfMonth: form.dayOfMonth ? parseInt(form.dayOfMonth as string) : null,
                        autoCreate: form.autoCreate,
                        reminderDays: form.reminderDays,
                    }),
                });
            }
            onSave();
            onClose();
        } catch (err) {
            console.error('Failed to save:', err);
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] animate-fade-in" onClick={onClose}>
            <div className="bg-background-secondary border border-border rounded-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-foreground">
                        {editItem ? 'Edit Scheduled Transaction' : 'New Scheduled Transaction'}
                    </h2>
                    <button onClick={onClose} className="text-neutral hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm text-neutral mb-1">Name *</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            placeholder="e.g., Netflix, Rent, Salary"
                            className="input w-full"
                            required
                        />
                    </div>

                    {/* Amount & Type */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-neutral mb-1">Amount *</label>
                            <input
                                type="number"
                                step="0.01"
                                value={form.amount}
                                onChange={e => setForm({ ...form, amount: e.target.value })}
                                placeholder="0.00"
                                className="input w-full"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">Type</label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, isExpense: true })}
                                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        form.isExpense ? 'bg-danger/20 text-danger' : 'bg-background-tertiary text-neutral'
                                    }`}
                                >
                                    Expense
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, isExpense: false })}
                                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        !form.isExpense ? 'bg-success/20 text-success' : 'bg-background-tertiary text-neutral'
                                    }`}
                                >
                                    Income
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Account & Category */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-neutral mb-1">Account *</label>
                            <select
                                value={form.accountId}
                                onChange={e => setForm({ ...form, accountId: e.target.value })}
                                className="input w-full"
                                required
                            >
                                <option value="">Select account...</option>
                                {accounts.filter(a => !a.closed).map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">Category</label>
                            <select
                                value={form.categoryId}
                                onChange={e => setForm({ ...form, categoryId: e.target.value })}
                                className="input w-full"
                            >
                                <option value="">Select category...</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Frequency & Next Due Date */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-neutral mb-1">Frequency *</label>
                            <select
                                value={form.frequency}
                                onChange={e => setForm({ ...form, frequency: e.target.value })}
                                className="input w-full"
                                required
                            >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="biweekly">Every 2 Weeks</option>
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">Next Due Date *</label>
                            <input
                                type="date"
                                value={form.nextDueDate}
                                onChange={e => setForm({ ...form, nextDueDate: e.target.value })}
                                className="input w-full"
                                required
                            />
                        </div>
                    </div>

                    {/* Day of Month (for monthly) */}
                    {form.frequency === 'monthly' && (
                        <div>
                            <label className="block text-sm text-neutral mb-1">Day of Month</label>
                            <input
                                type="number"
                                min="1"
                                max="31"
                                value={form.dayOfMonth}
                                onChange={e => setForm({ ...form, dayOfMonth: e.target.value })}
                                placeholder="e.g., 15"
                                className="input w-full"
                            />
                        </div>
                    )}

                    {/* Payee & Memo */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-neutral mb-1">Payee</label>
                            <input
                                type="text"
                                value={form.payee}
                                onChange={e => setForm({ ...form, payee: e.target.value })}
                                placeholder="Optional"
                                className="input w-full"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">Memo</label>
                            <input
                                type="text"
                                value={form.memo}
                                onChange={e => setForm({ ...form, memo: e.target.value })}
                                placeholder="Optional"
                                className="input w-full"
                            />
                        </div>
                    </div>

                    {/* Auto Create & Reminder */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-background">
                            <input
                                type="checkbox"
                                id="autoCreate"
                                checked={form.autoCreate}
                                onChange={e => setForm({ ...form, autoCreate: e.target.checked })}
                                className="w-4 h-4 accent-gold"
                            />
                            <label htmlFor="autoCreate" className="text-sm text-foreground">
                                Auto-create when due
                            </label>
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">Remind before (days)</label>
                            <input
                                type="number"
                                min="0"
                                max="30"
                                value={form.reminderDays}
                                onChange={e => setForm({ ...form, reminderDays: parseInt(e.target.value) || 0 })}
                                className="input w-full"
                            />
                        </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                            {saving ? 'Saving...' : editItem ? 'Save Changes' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
