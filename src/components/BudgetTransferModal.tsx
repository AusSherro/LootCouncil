'use client';

import { useState, useEffect, useRef } from 'react';
import { X, ArrowRight, ArrowDownUp, Search, PiggyBank } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const READY_TO_ASSIGN_ID = '__READY_TO_ASSIGN__';

interface CategoryOption {
    id: string;
    name: string;
    groupName: string;
    available: number;
    assigned: number;
}

interface BudgetTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    month: string;
    categories: CategoryOption[];
    readyToAssign: number;
    preselectedFromId?: string;
    preselectedToId?: string;
}

export default function BudgetTransferModal({
    isOpen,
    onClose,
    onSuccess,
    month,
    categories,
    readyToAssign,
    preselectedFromId,
    preselectedToId,
}: BudgetTransferModalProps) {
    const [fromCategoryId, setFromCategoryId] = useState(preselectedFromId || '');
    const [toCategoryId, setToCategoryId] = useState(preselectedToId || '');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fromSearch, setFromSearch] = useState('');
    const [toSearch, setToSearch] = useState('');
    const [showFromDropdown, setShowFromDropdown] = useState(false);
    const [showToDropdown, setShowToDropdown] = useState(false);
    const amountRef = useRef<HTMLInputElement>(null);
    const fromRef = useRef<HTMLDivElement>(null);
    const toRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setFromCategoryId(preselectedFromId || '');
            setToCategoryId(preselectedToId || '');
            setAmount('');
            setError(null);
            setFromSearch('');
            setToSearch('');
        }
    }, [isOpen, preselectedFromId, preselectedToId]);

    // Focus amount input when both categories are selected
    useEffect(() => {
        if (fromCategoryId && toCategoryId && amountRef.current) {
            amountRef.current.focus();
        }
    }, [fromCategoryId, toCategoryId]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (fromRef.current && !fromRef.current.contains(e.target as Node)) {
                setShowFromDropdown(false);
            }
            if (toRef.current && !toRef.current.contains(e.target as Node)) {
                setShowToDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const rtaOption: CategoryOption = { id: READY_TO_ASSIGN_ID, name: 'Ready to Assign', groupName: '', available: readyToAssign, assigned: 0 };
    const fromCategory = fromCategoryId === READY_TO_ASSIGN_ID ? rtaOption : categories.find(c => c.id === fromCategoryId);
    const toCategory = toCategoryId === READY_TO_ASSIGN_ID ? rtaOption : categories.find(c => c.id === toCategoryId);

    // Group categories by group name for the dropdown
    function getGroupedCategories(search: string, excludeId?: string) {
        const filtered = categories.filter(c => {
            if (c.id === excludeId) return false;
            if (!search) return true;
            return c.name.toLowerCase().includes(search.toLowerCase()) ||
                   c.groupName.toLowerCase().includes(search.toLowerCase());
        });

        const groups: Record<string, CategoryOption[]> = {};
        for (const cat of filtered) {
            if (!groups[cat.groupName]) groups[cat.groupName] = [];
            groups[cat.groupName].push(cat);
        }
        return groups;
    }

    function swapCategories() {
        const temp = fromCategoryId;
        setFromCategoryId(toCategoryId);
        setToCategoryId(temp);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!fromCategoryId || !toCategoryId || !amount) return;

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            setError('Please enter a valid positive amount');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/budget/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromCategoryId: fromCategoryId === READY_TO_ASSIGN_ID ? null : fromCategoryId,
                    toCategoryId: toCategoryId === READY_TO_ASSIGN_ID ? null : toCategoryId,
                    amount: amountNum,
                    month,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to transfer funds');
            }

            onSuccess();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to transfer funds');
        } finally {
            setLoading(false);
        }
    }

    // Handle clicking the available amount to auto-fill
    function handleAvailableClick(available: number) {
        if (available > 0) {
            setAmount((available / 100).toFixed(2));
        }
    }

    if (!isOpen) return null;

    const amountCents = Math.round((parseFloat(amount) || 0) * 100);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] animate-fade-in" onClick={onClose}>
            <div className="bg-background-secondary border border-border rounded-xl w-full max-w-lg mx-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <ArrowDownUp className="w-5 h-5 text-gold" />
                        Move Money
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-background-tertiary rounded-lg transition-colors">
                        <X className="w-5 h-5 text-neutral" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-danger/20 border border-danger/30 rounded-lg text-danger text-sm">
                            {error}
                        </div>
                    )}

                    {/* From / To Category Selection */}
                    <div className="flex items-start gap-2">
                        {/* From Category */}
                        <div className="flex-1" ref={fromRef}>
                            <label className="block text-sm text-neutral mb-1">From</label>
                            <div className="relative">
                                <div
                                    className="input cursor-pointer flex items-center justify-between min-h-[38px]"
                                    onClick={() => { setShowFromDropdown(!showFromDropdown); setShowToDropdown(false); }}
                                >
                                    {fromCategory ? (
                                        <div className="truncate flex items-center gap-1.5">
                                            {fromCategoryId === READY_TO_ASSIGN_ID && <PiggyBank className="w-3.5 h-3.5 text-gold flex-shrink-0" />}
                                            <span className="text-foreground text-sm">{fromCategory.name}</span>
                                            {fromCategory.groupName && <span className="text-neutral text-xs">({fromCategory.groupName})</span>}
                                        </div>
                                    ) : (
                                        <span className="text-neutral text-sm">Select source...</span>
                                    )}
                                </div>

                                {showFromDropdown && (
                                    <div className="absolute left-0 right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-xl z-[80] max-h-72 overflow-hidden">
                                        <div className="p-2 border-b border-border">
                                            <div className="relative">
                                                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral" />
                                                <input
                                                    type="text"
                                                    placeholder="Search..."
                                                    value={fromSearch}
                                                    onChange={(e) => setFromSearch(e.target.value)}
                                                    className="input pl-8 text-sm h-8 w-full"
                                                    autoFocus
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>
                                        </div>
                                        <div className="overflow-y-auto max-h-60">
                                            {/* Ready to Assign option */}
                                            {toCategoryId !== READY_TO_ASSIGN_ID && (!fromSearch || 'ready to assign'.includes(fromSearch.toLowerCase())) && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setFromCategoryId(READY_TO_ASSIGN_ID); setShowFromDropdown(false); setFromSearch(''); }}
                                                    className={`w-full px-3 py-2.5 text-left text-sm hover:bg-background-tertiary flex items-center justify-between border-b border-border/50 ${fromCategoryId === READY_TO_ASSIGN_ID ? 'bg-gold/10 text-gold' : 'text-foreground'}`}
                                                >
                                                    <span className="flex items-center gap-1.5 font-medium">
                                                        <PiggyBank className="w-4 h-4 text-gold" />
                                                        Ready to Assign
                                                    </span>
                                                    <span className={`text-xs tabular-nums ml-2 flex-shrink-0 ${readyToAssign < 0 ? 'text-danger' : readyToAssign > 0 ? 'text-positive' : 'text-neutral'}`}>
                                                        {formatCurrency(readyToAssign)}
                                                    </span>
                                                </button>
                                            )}
                                            {Object.entries(getGroupedCategories(fromSearch, toCategoryId)).map(([groupName, cats]) => (
                                                <div key={groupName}>
                                                    <div className="px-3 py-1.5 text-xs font-semibold text-gold bg-background-tertiary/50 sticky top-0">
                                                        {groupName}
                                                    </div>
                                                    {cats.map(cat => (
                                                        <button
                                                            key={cat.id}
                                                            type="button"
                                                            onClick={() => { setFromCategoryId(cat.id); setShowFromDropdown(false); setFromSearch(''); }}
                                                            className={`w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center justify-between ${cat.id === fromCategoryId ? 'bg-gold/10 text-gold' : 'text-foreground'}`}
                                                        >
                                                            <span className="truncate">{cat.name}</span>
                                                            <span className={`text-xs tabular-nums ml-2 flex-shrink-0 ${cat.available < 0 ? 'text-danger' : cat.available > 0 ? 'text-positive' : 'text-neutral'}`}>
                                                                {formatCurrency(cat.available)}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {fromCategory && (
                                <button
                                    type="button"
                                    onClick={() => handleAvailableClick(fromCategory.available)}
                                    className="text-xs mt-1 text-neutral hover:text-foreground transition-colors"
                                    title="Click to use this amount"
                                >
                                    Available: <span className={`font-medium ${fromCategory.available < 0 ? 'text-danger' : fromCategory.available > 0 ? 'text-positive' : ''}`}>
                                        {formatCurrency(fromCategory.available)}
                                    </span>
                                </button>
                            )}
                        </div>

                        {/* Swap Button */}
                        <button
                            type="button"
                            onClick={swapCategories}
                            className="mt-7 p-2 hover:bg-background-tertiary rounded-lg transition-colors flex-shrink-0"
                            title="Swap categories"
                        >
                            <ArrowDownUp className="w-4 h-4 text-gold" />
                        </button>

                        {/* To Category */}
                        <div className="flex-1" ref={toRef}>
                            <label className="block text-sm text-neutral mb-1">To</label>
                            <div className="relative">
                                <div
                                    className="input cursor-pointer flex items-center justify-between min-h-[38px]"
                                    onClick={() => { setShowToDropdown(!showToDropdown); setShowFromDropdown(false); }}
                                >
                                    {toCategory ? (
                                        <div className="truncate flex items-center gap-1.5">
                                            {toCategoryId === READY_TO_ASSIGN_ID && <PiggyBank className="w-3.5 h-3.5 text-gold flex-shrink-0" />}
                                            <span className="text-foreground text-sm">{toCategory.name}</span>
                                            {toCategory.groupName && <span className="text-neutral text-xs">({toCategory.groupName})</span>}
                                        </div>
                                    ) : (
                                        <span className="text-neutral text-sm">Select destination...</span>
                                    )}
                                </div>

                                {showToDropdown && (
                                    <div className="absolute left-0 right-0 top-full mt-1 bg-background-secondary border border-border rounded-lg shadow-xl z-[80] max-h-72 overflow-hidden">
                                        <div className="p-2 border-b border-border">
                                            <div className="relative">
                                                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral" />
                                                <input
                                                    type="text"
                                                    placeholder="Search..."
                                                    value={toSearch}
                                                    onChange={(e) => setToSearch(e.target.value)}
                                                    className="input pl-8 text-sm h-8 w-full"
                                                    autoFocus
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>
                                        </div>
                                        <div className="overflow-y-auto max-h-60">
                                            {/* Ready to Assign option */}
                                            {fromCategoryId !== READY_TO_ASSIGN_ID && (!toSearch || 'ready to assign'.includes(toSearch.toLowerCase())) && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setToCategoryId(READY_TO_ASSIGN_ID); setShowToDropdown(false); setToSearch(''); }}
                                                    className={`w-full px-3 py-2.5 text-left text-sm hover:bg-background-tertiary flex items-center justify-between border-b border-border/50 ${toCategoryId === READY_TO_ASSIGN_ID ? 'bg-gold/10 text-gold' : 'text-foreground'}`}
                                                >
                                                    <span className="flex items-center gap-1.5 font-medium">
                                                        <PiggyBank className="w-4 h-4 text-gold" />
                                                        Ready to Assign
                                                    </span>
                                                    <span className={`text-xs tabular-nums ml-2 flex-shrink-0 ${readyToAssign < 0 ? 'text-danger' : readyToAssign > 0 ? 'text-positive' : 'text-neutral'}`}>
                                                        {formatCurrency(readyToAssign)}
                                                    </span>
                                                </button>
                                            )}
                                            {Object.entries(getGroupedCategories(toSearch, fromCategoryId)).map(([groupName, cats]) => (
                                                <div key={groupName}>
                                                    <div className="px-3 py-1.5 text-xs font-semibold text-gold bg-background-tertiary/50 sticky top-0">
                                                        {groupName}
                                                    </div>
                                                    {cats.map(cat => (
                                                        <button
                                                            key={cat.id}
                                                            type="button"
                                                            onClick={() => { setToCategoryId(cat.id); setShowToDropdown(false); setToSearch(''); }}
                                                            className={`w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center justify-between ${cat.id === toCategoryId ? 'bg-gold/10 text-gold' : 'text-foreground'}`}
                                                        >
                                                            <span className="truncate">{cat.name}</span>
                                                            <span className={`text-xs tabular-nums ml-2 flex-shrink-0 ${cat.available < 0 ? 'text-danger' : cat.available > 0 ? 'text-positive' : 'text-neutral'}`}>
                                                                {formatCurrency(cat.available)}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {toCategory && (
                                <div className="text-xs mt-1 text-neutral">
                                    Available: <span className={`font-medium ${toCategory.available < 0 ? 'text-danger' : toCategory.available > 0 ? 'text-positive' : ''}`}>
                                        {formatCurrency(toCategory.available)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Visual Preview */}
                    {fromCategory && toCategory && (
                        <div className="flex items-center justify-center gap-3 py-3 px-4 bg-background-tertiary rounded-lg">
                            <div className="text-center">
                                <div className="text-sm font-medium text-foreground">{fromCategory.name}</div>
                                {amountCents > 0 && (
                                    <div className="text-xs text-danger mt-0.5">
                                        {formatCurrency(fromCategory.available - amountCents)}
                                    </div>
                                )}
                            </div>
                            <ArrowRight className="w-5 h-5 text-gold flex-shrink-0" />
                            <div className="text-center">
                                <div className="text-sm font-medium text-foreground">{toCategory.name}</div>
                                {amountCents > 0 && (
                                    <div className="text-xs text-positive mt-0.5">
                                        {formatCurrency(toCategory.available + amountCents)}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Amount Input */}
                    <div>
                        <label className="block text-sm text-neutral mb-1">Amount</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral text-sm">$</span>
                            <input
                                ref={amountRef}
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="input pl-7 w-full text-lg font-medium tabular-nums"
                                required
                            />
                        </div>
                        {fromCategory && amountCents > 0 && fromCategory.available - amountCents < 0 && (
                            <p className="text-xs text-warning mt-1">
                                This will make {fromCategory.name} overspent by {formatCurrency(Math.abs(fromCategory.available - amountCents))}
                            </p>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-background-tertiary text-foreground hover:bg-background-tertiary/80 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !fromCategoryId || !toCategoryId || !amount || parseFloat(amount) <= 0}
                            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-gold text-background hover:bg-gold-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Moving...' : 'Move Money'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
