'use client';

import { Wand2, Plus, Trash2, AlertCircle, Check, PlayCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Category {
    id: string;
    name: string;
    groupName?: string;
}

interface TransactionRule {
    id: string;
    name: string;
    matchField: string;
    matchType: string;
    matchValue: string;
    categoryId: string | null;
    priority: number;
    isActive: boolean;
    category?: { id: string; name: string } | null;
}

export default function TransactionRulesSettings() {
    const [rules, setRules] = useState<TransactionRule[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingRule, setEditingRule] = useState<TransactionRule | null>(null);
    const [applying, setApplying] = useState(false);
    const [applyResult, setApplyResult] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [matchField, setMatchField] = useState('payee');
    const [matchType, setMatchType] = useState('contains');
    const [matchValue, setMatchValue] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        fetchRules();
        fetchCategories();
    }, []);

    async function fetchRules() {
        setLoading(true);
        try {
            const res = await fetch('/api/rules');
            const data = await res.json();
            setRules(data.rules || []);
        } catch (err) {
            console.error('Failed to fetch rules:', err);
        } finally {
            setLoading(false);
        }
    }

    async function fetchCategories() {
        try {
            const res = await fetch('/api/categories');
            const data = await res.json();
            const allCats: Category[] = [];
            (data.categoryGroups || []).forEach((g: { name: string; categories: { id: string; name: string }[] }) => {
                g.categories.forEach(c => {
                    allCats.push({ ...c, groupName: g.name });
                });
            });
            setCategories(allCats);
        } catch (err) {
            console.error('Failed to fetch categories:', err);
        }
    }

    function resetForm() {
        setName('');
        setMatchField('payee');
        setMatchType('contains');
        setMatchValue('');
        setCategoryId('');
        setIsActive(true);
        setEditingRule(null);
    }

    function openEditForm(rule: TransactionRule) {
        setName(rule.name);
        setMatchField(rule.matchField);
        setMatchType(rule.matchType);
        setMatchValue(rule.matchValue);
        setCategoryId(rule.categoryId || '');
        setIsActive(rule.isActive);
        setEditingRule(rule);
        setShowForm(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        
        try {
            if (editingRule) {
                await fetch('/api/rules', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: editingRule.id,
                        name,
                        matchField,
                        matchType,
                        matchValue,
                        categoryId: categoryId || null,
                        isActive,
                    }),
                });
            } else {
                await fetch('/api/rules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        matchField,
                        matchType,
                        matchValue,
                        categoryId: categoryId || null,
                        isActive,
                    }),
                });
            }
            
            resetForm();
            setShowForm(false);
            fetchRules();
        } catch (err) {
            console.error('Failed to save rule:', err);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this rule?')) return;
        
        try {
            await fetch('/api/rules', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            fetchRules();
        } catch (err) {
            console.error('Failed to delete rule:', err);
        }
    }

    async function applyRules() {
        setApplying(true);
        setApplyResult(null);
        
        try {
            const res = await fetch('/api/rules', { method: 'PUT' });
            const data = await res.json();
            setApplyResult(`Applied rules to ${data.applied} transactions`);
        } catch (err) {
            console.error('Failed to apply rules:', err);
            setApplyResult('Failed to apply rules');
        } finally {
            setApplying(false);
        }
    }

    return (
        <section className="card mb-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Wand2 className="w-6 h-6 text-secondary" />
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Transaction Rules</h2>
                        <p className="text-sm text-neutral">Auto-categorize transactions based on payee patterns</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={applyRules}
                        disabled={applying || rules.length === 0}
                        className="btn btn-secondary"
                    >
                        <PlayCircle className="w-4 h-4" />
                        {applying ? 'Applying...' : 'Apply Rules'}
                    </button>
                    <button
                        onClick={() => { resetForm(); setShowForm(true); }}
                        className="btn btn-primary"
                    >
                        <Plus className="w-4 h-4" />
                        Add Rule
                    </button>
                </div>
            </div>

            {applyResult && (
                <div className="mb-4 p-3 bg-success/20 border border-success/30 rounded-lg text-success text-sm flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    {applyResult}
                </div>
            )}

            {/* Rule Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="mb-6 p-4 bg-background-tertiary rounded-lg space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-neutral mb-1">Rule Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Amazon Purchases"
                                className="input"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">Match Value</label>
                            <input
                                type="text"
                                value={matchValue}
                                onChange={(e) => setMatchValue(e.target.value)}
                                placeholder="e.g., amazon"
                                className="input"
                                required
                            />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm text-neutral mb-1">Match Field</label>
                            <select
                                value={matchField}
                                onChange={(e) => setMatchField(e.target.value)}
                                className="input"
                            >
                                <option value="payee">Payee</option>
                                <option value="memo">Memo</option>
                                <option value="amount">Amount</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">Match Type</label>
                            <select
                                value={matchType}
                                onChange={(e) => setMatchType(e.target.value)}
                                className="input"
                            >
                                <option value="contains">Contains</option>
                                <option value="exact">Exact Match</option>
                                <option value="startsWith">Starts With</option>
                                <option value="endsWith">Ends With</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-neutral mb-1">Assign Category</label>
                            <select
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                className="input"
                            >
                                <option value="">Select category...</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.groupName ? `${c.groupName}: ` : ''}{c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                    className="w-4 h-4 rounded border-border bg-background text-gold focus:ring-gold"
                                />
                                <span className="text-sm text-neutral">Active</span>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => { resetForm(); setShowForm(false); }}
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            {editingRule ? 'Update Rule' : 'Create Rule'}
                        </button>
                    </div>
                </form>
            )}

            {/* Rules List */}
            {loading ? (
                <div className="text-center py-8 text-neutral">Loading rules...</div>
            ) : rules.length === 0 ? (
                <div className="text-center py-8">
                    <AlertCircle className="w-10 h-10 text-neutral mx-auto mb-2" />
                    <p className="text-neutral">No transaction rules yet</p>
                    <p className="text-sm text-neutral/70">Create rules to auto-categorize transactions</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {rules.map((rule, index) => (
                        <div
                            key={rule.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                                rule.isActive ? 'bg-background border-border' : 'bg-background-tertiary border-border/50 opacity-60'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-neutral w-6">#{index + 1}</span>
                                <div>
                                    <div className="font-medium text-foreground">{rule.name}</div>
                                    <div className="text-sm text-neutral">
                                        {rule.matchField} <span className="text-secondary">{rule.matchType}</span> &ldquo;{rule.matchValue}&rdquo;
                                        {rule.category && (
                                            <span> → <span className="text-gold">{rule.category.name}</span></span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {!rule.isActive && (
                                    <span className="text-xs bg-warning/20 text-warning px-2 py-1 rounded">Disabled</span>
                                )}
                                <button
                                    onClick={() => openEditForm(rule)}
                                    className="btn btn-ghost text-sm"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleDelete(rule.id)}
                                    className="btn btn-ghost text-negative"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <p className="text-xs text-neutral mt-4">
                Rules are applied in order. New transactions will be auto-categorized when imported.
            </p>
        </section>
    );
}
