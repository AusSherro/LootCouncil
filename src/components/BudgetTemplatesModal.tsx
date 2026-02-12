'use client';

import { FileCheck2, Trash2, X, Copy, PlayCircle, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';

interface TemplateItem {
    id: string;
    categoryId: string;
    amount: number;
    percentage: number | null;
    categoryName?: string;
}

interface BudgetTemplate {
    id: string;
    name: string;
    description: string | null;
    items: TemplateItem[];
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onApply: () => void;
    currentBudgets: { categoryId: string; budgeted: number }[];
    month: string;
}

export default function BudgetTemplatesModal({ isOpen, onClose, onApply, currentBudgets, month }: Props) {
    const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Create template form
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchTemplates();
        }
    }, [isOpen]);

    async function fetchTemplates() {
        setLoading(true);
        try {
            const res = await fetch('/api/templates');
            const data = await res.json();
            setTemplates(data.templates || []);
        } catch (err) {
            console.error('Failed to fetch templates:', err);
        } finally {
            setLoading(false);
        }
    }


    async function handleSaveTemplate() {
        if (!newName.trim()) {
            setError('Please enter a template name');
            return;
        }

        // Filter out zero budgets and create items from current budgets
        const items = currentBudgets
            .filter(b => b.budgeted !== 0)
            .map(b => ({
                categoryId: b.categoryId,
                amount: b.budgeted,
            }));

        if (items.length === 0) {
            setError('No budgets to save. Set some budget amounts first.');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const res = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName.trim(),
                    description: newDescription.trim() || null,
                    items,
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to save template');
            }

            setSuccess(`Template "${newName}" saved!`);
            setNewName('');
            setNewDescription('');
            setShowCreate(false);
            fetchTemplates();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save template');
        } finally {
            setSaving(false);
        }
    }

    async function handleApplyTemplate(templateId: string, templateName: string) {
        setApplying(true);
        setError(null);

        try {
            const res = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'apply', templateId, month }),
            });

            if (!res.ok) {
                throw new Error('Failed to apply template');
            }

            setSuccess(`Applied template "${templateName}"!`);
            onApply();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to apply template');
        } finally {
            setApplying(false);
        }
    }

    async function handleDeleteTemplate(id: string) {
        if (!confirm('Are you sure you want to delete this template?')) return;

        try {
            await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
            fetchTemplates();
        } catch (err) {
            console.error('Failed to delete template:', err);
        }
    }

    if (!isOpen) return null;

    const totalCurrentBudgeted = currentBudgets.reduce((sum, b) => sum + b.budgeted, 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background-secondary rounded-xl w-full max-w-2xl shadow-2xl animate-fade-in max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
                            <FileCheck2 className="w-6 h-6 text-gold" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground">Budget Templates</h2>
                            <p className="text-sm text-neutral">Save and apply monthly budget templates</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-neutral hover:text-foreground transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-negative/20 border border-negative/30 rounded-lg text-negative">
                            <AlertCircle className="w-5 h-5" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="flex items-center gap-2 p-3 bg-success/20 border border-success/30 rounded-lg text-success">
                            <FileCheck2 className="w-5 h-5" />
                            <span className="text-sm">{success}</span>
                        </div>
                    )}

                    {/* Save Current Budget */}
                    <div className="p-4 bg-background-tertiary rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <h3 className="font-medium text-foreground">Save Current Budget as Template</h3>
                                <p className="text-sm text-neutral">
                                    {currentBudgets.filter(b => b.budgeted !== 0).length} categories • {formatCurrency(totalCurrentBudgeted, 'AUD', { useAbsolute: true })} total
                                </p>
                            </div>
                            {!showCreate && (
                                <button
                                    onClick={() => setShowCreate(true)}
                                    className="btn btn-primary"
                                >
                                    <Copy className="w-4 h-4" />
                                    Save Template
                                </button>
                            )}
                        </div>

                        {showCreate && (
                            <div className="space-y-3 pt-3 border-t border-border">
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Template name (e.g., 'Standard Month')"
                                    className="input"
                                />
                                <input
                                    type="text"
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    placeholder="Description (optional)"
                                    className="input"
                                />
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => { setShowCreate(false); setNewName(''); setNewDescription(''); }}
                                        className="btn btn-secondary"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveTemplate}
                                        disabled={saving}
                                        className="btn btn-primary"
                                    >
                                        {saving ? 'Saving...' : 'Save Template'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Existing Templates */}
                    <div>
                        <h3 className="font-medium text-foreground mb-3">Saved Templates</h3>
                        
                        {loading ? (
                            <div className="text-center py-8 text-neutral">Loading templates...</div>
                        ) : templates.length === 0 ? (
                            <div className="text-center py-8">
                                <FileCheck2 className="w-10 h-10 text-neutral mx-auto mb-2" />
                                <p className="text-neutral">No saved templates</p>
                                <p className="text-sm text-neutral/70">Save your current budget to create a template</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {templates.map((template) => (
                                    <div
                                        key={template.id}
                                        className="flex items-center justify-between p-4 bg-background rounded-lg border border-border"
                                    >
                                        <div className="flex-1">
                                            <div className="font-medium text-foreground">{template.name}</div>
                                            {template.description && (
                                                <p className="text-sm text-neutral">{template.description}</p>
                                            )}
                                            <div className="text-sm text-neutral mt-1">
                                                {template.items.length} categories • {formatCurrency(
                                                    template.items.reduce((sum, i) => sum + i.amount, 0),
                                                    'AUD',
                                                    { useAbsolute: true }
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleApplyTemplate(template.id, template.name)}
                                                disabled={applying}
                                                className="btn btn-primary"
                                            >
                                                <PlayCircle className="w-4 h-4" />
                                                Apply
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTemplate(template.id)}
                                                className="btn btn-ghost text-negative"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
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
