'use client';

import { useState, useEffect } from 'react';
import { X, Target, Calendar, DollarSign, Trash2 } from 'lucide-react';

interface GoalEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    categoryId: string;
    categoryName: string;
    currentGoalType: string | null;
    currentGoalTarget: number | null; // cents
    currentGoalDueDate: string | null;
    currentGoalCadence?: number | null;
    currentGoalCadenceFrequency?: number | null;
}

const GOAL_TYPES = [
    { value: '', label: 'No Goal', description: 'No savings goal for this category' },
    { value: 'TB', label: 'Target Balance', description: 'Save up to a specific amount' },
    { value: 'TBD', label: 'Target by Date', description: 'Save a specific amount by a date' },
    { value: 'MF', label: 'Monthly Funding', description: 'Set aside the same amount regularly' },
    { value: 'NEED', label: 'Spending Goal', description: 'Plan to spend a specific amount' },
    { value: 'DEBT', label: 'Debt Payoff', description: 'Track debt payoff progress' },
];

const CADENCE_OPTIONS = [
    { value: 1, label: 'Monthly', description: 'Every month' },
    { value: 2, label: 'Bi-Weekly', description: 'Every 2 weeks' },
    { value: 4, label: 'Weekly', description: 'Every week' },
    { value: 12, label: 'Yearly', description: 'Once per year' },
];

export default function GoalEditorModal({
    isOpen,
    onClose,
    onSave,
    categoryId,
    categoryName,
    currentGoalType,
    currentGoalTarget,
    currentGoalDueDate,
    currentGoalCadence,
    currentGoalCadenceFrequency,
}: GoalEditorModalProps) {
    const [goalType, setGoalType] = useState(currentGoalType || '');
    const [targetAmount, setTargetAmount] = useState(
        currentGoalTarget ? (currentGoalTarget / 100).toFixed(2) : ''
    );
    const [dueDate, setDueDate] = useState(
        currentGoalDueDate ? currentGoalDueDate.split('T')[0] : ''
    );
    const [cadence, setCadence] = useState(currentGoalCadence || 1);
    const [cadenceFrequency, setCadenceFrequency] = useState(currentGoalCadenceFrequency || 1);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset form when modal opens with new category
    useEffect(() => {
        if (isOpen) {
            setGoalType(currentGoalType || '');
            setTargetAmount(currentGoalTarget ? (currentGoalTarget / 100).toFixed(2) : '');
            setDueDate(currentGoalDueDate ? currentGoalDueDate.split('T')[0] : '');
            setCadence(currentGoalCadence || 1);
            setCadenceFrequency(currentGoalCadenceFrequency || 1);
            setError(null);
        }
    }, [isOpen, categoryId, currentGoalType, currentGoalTarget, currentGoalDueDate, currentGoalCadence, currentGoalCadenceFrequency]);

    async function handleSave() {
        setSaving(true);
        setError(null);

        try {
            const updates: Record<string, unknown> = {
                goalType: goalType || null,
                goalTarget: goalType && targetAmount ? Math.round(parseFloat(targetAmount) * 100) : null,
                goalDueDate: goalType === 'TBD' && dueDate ? new Date(dueDate).toISOString() : null,
                goalCadence: goalType === 'MF' ? cadence : null,
                goalCadenceFrequency: goalType === 'MF' ? cadenceFrequency : null,
            };

            const res = await fetch('/api/categories', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'category',
                    id: categoryId,
                    updates,
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to update goal');
            }

            onSave();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save goal');
        } finally {
            setSaving(false);
        }
    }

    async function handleRemoveGoal() {
        setSaving(true);
        setError(null);

        try {
            const res = await fetch('/api/categories', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'category',
                    id: categoryId,
                    updates: {
                        goalType: null,
                        goalTarget: null,
                        goalDueDate: null,
                        goalPercentageComplete: null,
                        goalUnderFunded: null,
                        goalOverallFunded: null,
                        goalOverallLeft: null,
                        goalCadence: null,
                        goalCadenceFrequency: null,
                    },
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to remove goal');
            }

            onSave();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove goal');
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) return null;

    const needsTarget = goalType && goalType !== '';
    const needsDueDate = goalType === 'TBD';

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] animate-fade-in">
            <div className="bg-background-secondary border border-border rounded-xl w-full max-w-md mx-4 shadow-lg">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
                            <Target className="w-5 h-5 text-gold" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Set Goal</h2>
                            <p className="text-sm text-neutral">{categoryName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-background-tertiary rounded-lg transition-colors">
                        <X className="w-5 h-5 text-neutral" />
                    </button>
                </div>

                {/* Form */}
                <div className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-danger/20 border border-danger/30 rounded-lg text-danger text-sm">
                            {error}
                        </div>
                    )}

                    {/* Goal Type Selection */}
                    <div>
                        <label className="block text-sm text-neutral mb-2">Goal Type</label>
                        <div className="space-y-2">
                            {GOAL_TYPES.map((type) => (
                                <button
                                    key={type.value}
                                    type="button"
                                    onClick={() => setGoalType(type.value)}
                                    className={`w-full p-3 rounded-lg border text-left transition-all ${
                                        goalType === type.value
                                            ? 'border-gold bg-gold/10'
                                            : 'border-border hover:border-gold/50 hover:bg-background-tertiary'
                                    }`}
                                >
                                    <div className="font-medium text-foreground">{type.label}</div>
                                    <div className="text-sm text-neutral">{type.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Target Amount */}
                    {needsTarget && (
                        <div>
                            <label className="block text-sm text-neutral mb-1">
                                {goalType === 'MF' ? 'Monthly Amount' : 'Target Amount'}
                            </label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral" />
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={targetAmount}
                                    onChange={(e) => setTargetAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="input pl-10"
                                />
                            </div>
                        </div>
                    )}

                    {/* Due Date */}
                    {needsDueDate && (
                        <div>
                            <label className="block text-sm text-neutral mb-1">Target Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral" />
                                <input
                                    type="date"
                                    value={dueDate}
                                    onChange={(e) => setDueDate(e.target.value)}
                                    className="input pl-10"
                                />
                            </div>
                        </div>
                    )}

                    {/* Cadence (for Monthly Funding goals) */}
                    {goalType === 'MF' && (
                        <div>
                            <label className="block text-sm text-neutral mb-2">Funding Frequency</label>
                            <div className="grid grid-cols-2 gap-2">
                                {CADENCE_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setCadence(option.value)}
                                        className={`p-2 rounded-lg border text-left transition-all ${
                                            cadence === option.value
                                                ? 'border-gold bg-gold/10'
                                                : 'border-border hover:border-gold/50 hover:bg-background-tertiary'
                                        }`}
                                    >
                                        <div className="text-sm font-medium text-foreground">{option.label}</div>
                                        <div className="text-xs text-neutral">{option.description}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Repeat Every N (for custom cadence) */}
                    {goalType === 'MF' && (
                        <div>
                            <label className="block text-sm text-neutral mb-1">Repeat Every</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="1"
                                    max="12"
                                    value={cadenceFrequency}
                                    onChange={(e) => setCadenceFrequency(parseInt(e.target.value) || 1)}
                                    className="input w-20"
                                />
                                <span className="text-foreground">
                                    {cadence === 1 ? 'month(s)' : cadence === 4 ? 'week(s)' : cadence === 2 ? 'pay period(s)' : 'year(s)'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        {currentGoalType && (
                            <button
                                type="button"
                                onClick={handleRemoveGoal}
                                disabled={saving}
                                className="btn btn-ghost text-danger hover:bg-danger/10 flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Remove
                            </button>
                        )}
                        <div className="flex-1" />
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving || (needsTarget && !targetAmount) || (needsDueDate && !dueDate)}
                            className="btn btn-primary"
                        >
                            {saving ? 'Saving...' : 'Save Goal'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
