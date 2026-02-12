'use client';

import { X, Plus, Trash2, Split, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';

interface Category {
    id: string;
    name: string;
    groupName?: string;
}

interface SplitItem {
    categoryId: string;
    amount: string;
    memo: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    transactionId: string;
    transactionAmount: number;
    transactionPayee: string | null;
}

export default function SplitTransactionModal({ isOpen, onClose, onSuccess, transactionId, transactionAmount, transactionPayee }: Props) {
    const [categories, setCategories] = useState<Category[]>([]);
    const [splits, setSplits] = useState<SplitItem[]>([
        { categoryId: '', amount: '', memo: '' },
        { categoryId: '', amount: '', memo: '' },
    ]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetch('/api/categories')
                .then(r => r.json())
                .then(d => {
                    const allCats: Category[] = [];
                    (d.categoryGroups || []).forEach((g: { name: string; categories: { id: string; name: string }[] }) => {
                        g.categories.forEach(c => {
                            allCats.push({ ...c, groupName: g.name });
                        });
                    });
                    setCategories(allCats);
                });
        }
    }, [isOpen]);

    const totalSplitAmount = splits.reduce((sum, s) => {
        const val = parseFloat(s.amount) || 0;
        return sum + Math.round(val * 100);
    }, 0);

    const remaining = Math.abs(transactionAmount) - totalSplitAmount;
    const isValid = remaining === 0 && splits.every(s => s.categoryId && parseFloat(s.amount) > 0);

    function addSplit() {
        setSplits([...splits, { categoryId: '', amount: '', memo: '' }]);
    }

    function removeSplit(index: number) {
        if (splits.length > 2) {
            setSplits(splits.filter((_, i) => i !== index));
        }
    }

    function updateSplit(index: number, field: keyof SplitItem, value: string) {
        const newSplits = [...splits];
        newSplits[index] = { ...newSplits[index], [field]: value };
        setSplits(newSplits);
    }

    function distributeEvenly() {
        const total = Math.abs(transactionAmount);
        const count = splits.length;
        const perSplit = Math.floor(total / count);
        const remainder = total - (perSplit * count);
        
        setSplits(splits.map((s, i) => ({
            ...s,
            amount: ((perSplit + (i === 0 ? remainder : 0)) / 100).toFixed(2),
        })));
    }

    async function handleSubmit() {
        setLoading(true);
        setError(null);

        try {
            const splitData = splits.map(s => ({
                categoryId: s.categoryId,
                amount: transactionAmount < 0 
                    ? -Math.round(parseFloat(s.amount) * 100)
                    : Math.round(parseFloat(s.amount) * 100),
                memo: s.memo || null,
            }));

            const res = await fetch('/api/splits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionId,
                    splits: splitData,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to split transaction');
            }

            onSuccess();
            onClose();
            setSplits([
                { categoryId: '', amount: '', memo: '' },
                { categoryId: '', amount: '', memo: '' },
            ]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background-secondary rounded-xl w-full max-w-2xl shadow-2xl animate-fade-in">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                            <Split className="w-6 h-6 text-secondary" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground">Split Transaction</h2>
                            <p className="text-sm text-neutral">{transactionPayee || 'Unknown Payee'} • {formatCurrency(transactionAmount, 'AUD', { useAbsolute: true })}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-neutral hover:text-foreground transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-negative/20 border border-negative/30 rounded-lg text-negative">
                            <AlertCircle className="w-5 h-5" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {/* Summary Bar */}
                    <div className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg">
                        <div>
                            <span className="text-neutral">Total:</span>
                            <span className="ml-2 font-medium text-foreground">{formatCurrency(transactionAmount, 'AUD', { useAbsolute: true })}</span>
                        </div>
                        <div>
                            <span className="text-neutral">Assigned:</span>
                            <span className="ml-2 font-medium text-foreground">{formatCurrency(totalSplitAmount, 'AUD', { useAbsolute: true })}</span>
                        </div>
                        <div>
                            <span className="text-neutral">Remaining:</span>
                            <span className={`ml-2 font-medium ${remaining === 0 ? 'text-positive' : 'text-warning'}`}>
                                {formatCurrency(remaining, 'AUD', { useAbsolute: true })}
                            </span>
                        </div>
                        <button onClick={distributeEvenly} className="btn btn-ghost text-sm">
                            Split Evenly
                        </button>
                    </div>

                    {/* Split Items */}
                    {splits.map((split, index) => (
                        <div key={index} className="grid grid-cols-[1fr_120px_1fr_40px] gap-3 items-center">
                            <select
                                value={split.categoryId}
                                onChange={(e) => updateSplit(index, 'categoryId', e.target.value)}
                                className="input"
                            >
                                <option value="">Select Category</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.groupName ? `${c.groupName}: ` : ''}{c.name}
                                    </option>
                                ))}
                            </select>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={split.amount}
                                    onChange={(e) => updateSplit(index, 'amount', e.target.value)}
                                    className="input pl-7"
                                />
                            </div>
                            <input
                                type="text"
                                placeholder="Memo (optional)"
                                value={split.memo}
                                onChange={(e) => updateSplit(index, 'memo', e.target.value)}
                                className="input"
                            />
                            <button
                                onClick={() => removeSplit(index)}
                                disabled={splits.length <= 2}
                                className="btn btn-ghost text-neutral hover:text-negative disabled:opacity-30"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    ))}

                    <button onClick={addSplit} className="btn btn-ghost w-full justify-center">
                        <Plus className="w-5 h-5" />
                        Add Split
                    </button>
                </div>

                <div className="flex justify-end gap-3 p-6 border-t border-border">
                    <button onClick={onClose} className="btn btn-secondary">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !isValid}
                        className="btn btn-primary"
                    >
                        {loading ? 'Splitting...' : 'Split Transaction'}
                    </button>
                </div>
            </div>
        </div>
    );
}
