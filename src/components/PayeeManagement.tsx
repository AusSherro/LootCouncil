'use client';

import { useState, useEffect } from 'react';
import { Users, Search, Merge, Edit3, AlertCircle, Check, X, Sparkles, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Payee {
    name: string;
    count: number;
    total: number;
}

interface SimilarGroup {
    payees: string[];
    suggestedName: string;
    confidence: number;
}

export default function PayeeManagement() {
    const [payees, setPayees] = useState<Payee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPayees, setSelectedPayees] = useState<string[]>([]);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [renamePayee, setRenamePayee] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [mergeTarget, setMergeTarget] = useState('');
    const [actionResult, setActionResult] = useState<string | null>(null);
    const [similarGroups, setSimilarGroups] = useState<SimilarGroup[]>([]);
    const [findingSimilar, setFindingSimilar] = useState(false);

    useEffect(() => {
        fetchPayees();
    }, []);

    async function fetchPayees() {
        setLoading(true);
        try {
            const res = await fetch('/api/payees/manage');
            const data = await res.json();
            setPayees(data.payees || []);
        } catch (err) {
            console.error('Failed to fetch payees:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleMerge() {
        if (selectedPayees.length < 2 || !mergeTarget) return;

        try {
            for (const fromPayee of selectedPayees) {
                if (fromPayee === mergeTarget) continue;
                await fetch('/api/payees/manage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'merge',
                        fromPayee,
                        toPayee: mergeTarget,
                    }),
                });
            }

            setActionResult(`Merged ${selectedPayees.length - 1} payees into "${mergeTarget}"`);
            setSelectedPayees([]);
            setShowMergeModal(false);
            fetchPayees();
        } catch (err) {
            console.error('Failed to merge:', err);
        }
    }

    async function handleRename() {
        if (!renamePayee || !newName.trim()) return;

        try {
            await fetch('/api/payees/manage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'rename',
                    fromPayee: renamePayee,
                    newName: newName.trim(),
                }),
            });

            setActionResult(`Renamed "${renamePayee}" to "${newName.trim()}"`);
            setShowRenameModal(false);
            setRenamePayee(null);
            setNewName('');
            fetchPayees();
        } catch (err) {
            console.error('Failed to rename:', err);
        }
    }

    function toggleSelect(name: string) {
        if (selectedPayees.includes(name)) {
            setSelectedPayees(selectedPayees.filter(p => p !== name));
        } else {
            setSelectedPayees([...selectedPayees, name]);
        }
    }

    async function findSimilarPayees() {
        if (payees.length < 2) return;
        setFindingSimilar(true);
        setSimilarGroups([]);

        try {
            const res = await fetch('/api/payees/similar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payees: payees.map(p => p.name) }),
            });
            const data = await res.json();
            setSimilarGroups(data.groups || []);
        } catch (err) {
            console.error('Failed to find similar payees:', err);
        } finally {
            setFindingSimilar(false);
        }
    }

    async function mergeSimilarGroup(group: SimilarGroup) {
        try {
            for (const fromPayee of group.payees) {
                if (fromPayee === group.suggestedName) continue;
                await fetch('/api/payees/manage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'merge',
                        fromPayee,
                        toPayee: group.suggestedName,
                    }),
                });
            }

            setActionResult(`Merged ${group.payees.length} payees into "${group.suggestedName}"`);
            setSimilarGroups(prev => prev.filter(g => g.suggestedName !== group.suggestedName));
            fetchPayees();
        } catch (err) {
            console.error('Failed to merge similar:', err);
        }
    }

    const filteredPayees = payees.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <section className="card mb-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Users className="w-6 h-6 text-secondary" />
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Payee Management</h2>
                        <p className="text-sm text-neutral">Merge duplicates and rename payees</p>
                    </div>
                </div>
                {selectedPayees.length >= 2 && (
                    <button
                        onClick={() => setShowMergeModal(true)}
                        className="btn btn-primary"
                    >
                        <Merge className="w-4 h-4" />
                        Merge Selected ({selectedPayees.length})
                    </button>
                )}
                <button
                    onClick={findSimilarPayees}
                    disabled={findingSimilar || payees.length < 2}
                    className="btn bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                >
                    {findingSimilar ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Sparkles className="w-4 h-4" />
                    )}
                    Find Similar
                </button>
            </div>

            {actionResult && (
                <div className="mb-4 p-3 bg-success/20 border border-success/30 rounded-lg text-success text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        {actionResult}
                    </div>
                    <button onClick={() => setActionResult(null)} className="text-success hover:text-success/80">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* AI Similar Payees Suggestions */}
            {similarGroups.length > 0 && (
                <div className="mb-4 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-5 h-5 text-purple-400" />
                        <h3 className="font-semibold text-foreground">Similar Payees Found</h3>
                    </div>
                    <div className="space-y-3">
                        {similarGroups.map((group, i) => (
                            <div key={i} className="bg-background/50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <span className="text-sm text-neutral">Merge into: </span>
                                        <span className="font-medium text-foreground">{group.suggestedName}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-neutral">
                                            {Math.round(group.confidence * 100)}% match
                                        </span>
                                        <button
                                            onClick={() => mergeSimilarGroup(group)}
                                            className="btn btn-primary text-sm py-1"
                                        >
                                            <Merge className="w-3 h-3" />
                                            Merge
                                        </button>
                                        <button
                                            onClick={() => setSimilarGroups(prev => prev.filter((_, idx) => idx !== i))}
                                            className="btn btn-ghost text-sm py-1"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {group.payees.map(p => (
                                        <span key={p} className="text-xs bg-background-tertiary px-2 py-1 rounded">
                                            {p}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral" />
                <input
                    type="text"
                    placeholder="Search payees..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input pl-10"
                />
            </div>

            {/* Payee List */}
            {loading ? (
                <div className="text-center py-8 text-neutral">Loading payees...</div>
            ) : filteredPayees.length === 0 ? (
                <div className="text-center py-8">
                    <AlertCircle className="w-10 h-10 text-neutral mx-auto mb-2" />
                    <p className="text-neutral">No payees found</p>
                </div>
            ) : (
                <div className="max-h-96 overflow-y-auto space-y-1">
                    {filteredPayees.map((payee) => (
                        <div
                            key={payee.name}
                            className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                                selectedPayees.includes(payee.name)
                                    ? 'bg-gold/10 border-gold/30'
                                    : 'bg-background border-border hover:bg-background-tertiary'
                            }`}
                            onClick={() => toggleSelect(payee.name)}
                        >
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={selectedPayees.includes(payee.name)}
                                    onChange={() => toggleSelect(payee.name)}
                                    className="w-4 h-4 rounded border-border bg-background text-gold focus:ring-gold"
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <div>
                                    <div className="font-medium text-foreground">{payee.name}</div>
                                    <div className="text-xs text-neutral">
                                        {payee.count} transactions · {formatCurrency(payee.total)}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setRenamePayee(payee.name);
                                    setNewName(payee.name);
                                    setShowRenameModal(true);
                                }}
                                className="btn btn-ghost text-sm"
                            >
                                <Edit3 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <p className="text-xs text-neutral mt-4">
                Select multiple payees to merge them. The merge target will be used for all transactions.
            </p>

            {/* Merge Modal */}
            {showMergeModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]" onClick={() => setShowMergeModal(false)}>
                    <div className="bg-background-secondary rounded-xl p-6 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-foreground mb-4">Merge Payees</h3>
                        <p className="text-sm text-neutral mb-4">
                            All transactions from the selected payees will be updated to use the target payee name.
                        </p>
                        <div className="mb-4">
                            <label className="block text-sm text-neutral mb-1">Merge into:</label>
                            <select
                                value={mergeTarget}
                                onChange={(e) => setMergeTarget(e.target.value)}
                                className="input w-full"
                            >
                                <option value="">Select target payee...</option>
                                {selectedPayees.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowMergeModal(false)} className="btn btn-secondary flex-1">
                                Cancel
                            </button>
                            <button onClick={handleMerge} disabled={!mergeTarget} className="btn btn-primary flex-1">
                                <Merge className="w-4 h-4" />
                                Merge
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rename Modal */}
            {showRenameModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]" onClick={() => setShowRenameModal(false)}>
                    <div className="bg-background-secondary rounded-xl p-6 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-foreground mb-4">Rename Payee</h3>
                        <p className="text-sm text-neutral mb-4">
                            Renaming &ldquo;{renamePayee}&rdquo; will update all transactions with this payee.
                        </p>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="input w-full mb-4"
                            placeholder="New payee name..."
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setShowRenameModal(false)} className="btn btn-secondary flex-1">
                                Cancel
                            </button>
                            <button onClick={handleRename} disabled={!newName.trim()} className="btn btn-primary flex-1">
                                Rename
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
