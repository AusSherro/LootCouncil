'use client';

import { PiggyBank, ChevronRight, ChevronLeft, ChevronDown, Plus, RefreshCw, Eye, EyeOff, MoreHorizontal, Edit3, X, GripVertical, Target, FileCheck2, Copy, AlertTriangle, Clock, Calculator, Zap, Search, LayoutGrid, List, DollarSign, ArrowDownUp } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import GoalProgress from '@/components/GoalProgress';
import GoalEditorModal from '@/components/GoalEditorModal';
import BudgetTemplatesModal from '@/components/BudgetTemplatesModal';
import BudgetFlowBar from '@/components/BudgetFlowBar';
import BudgetTransferModal from '@/components/BudgetTransferModal';
import { useToast } from '@/components/Toast';
import { formatCurrency } from '@/lib/utils';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Category {
    id: string;
    name: string;
    assigned: number;
    activity: number;
    available: number;
    goalType: string | null;
    goalAmount: number | null;
    goalDueDate: string | null;
    goalPercentageComplete: number | null;
    goalUnderFunded: number | null;
    goalOverallFunded: number | null;
    goalOverallLeft: number | null;
    isInflow?: boolean;
    spendingTrend?: number[];
    previousActivity?: number;
}

interface CategoryGroup {
    id: string;
    name: string;
    isHidden?: boolean;
    isInflow?: boolean;
    categories: Category[];
}

interface BudgetData {
    month: string;
    groups: CategoryGroup[];
    totals: {
        readyToAssign: number;
        assigned: number;
        activity: number;
        available: number;
    };
}

function formatMonth(monthStr: string): string {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

function getMonthOffset(monthStr: string, offset: number): string {
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1 + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

interface CategoryRowProps {
    category: Category;
    month: string;
    onUpdate: () => void;
    onHide: (id: string, hide: boolean) => void;
    onRename: (id: string, name: string) => void;
    onGoalClick: (category: Category) => void;
    onMoveMoney?: (categoryId: string) => void;
    onError?: (message: string) => void;
    isHidden?: boolean;
    isDragging?: boolean;
    isCompact?: boolean;
}

function CategoryRow({ category, month, onUpdate, onHide, onRename, onGoalClick, onMoveMoney, onError, isHidden, isDragging, isCompact }: CategoryRowProps) {
    const [editing, setEditing] = useState(false);
    const [assignedInput, setAssignedInput] = useState((category.assigned / 100).toFixed(2));
    const [showMenu, setShowMenu] = useState(false);
    const [showQuickActions, setShowQuickActions] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [nameInput, setNameInput] = useState(category.name);
    const [quickLoading, setQuickLoading] = useState(false);

    async function handleQuickAction(action: string) {
        setQuickLoading(true);
        try {
            const res = await fetch('/api/budget/quick-actions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, categoryId: category.id, month }),
            });
            if (!res.ok) throw new Error('Quick action failed');
            onUpdate();
        } catch (err) {
            console.error('Quick action failed:', err);
            onError?.(`Quick action failed for "${category.name}". Please try again.`);
        } finally {
            setQuickLoading(false);
            setShowQuickActions(false);
        }
    }

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: category.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    async function handleSave() {
        const amount = parseFloat(assignedInput);
        if (isNaN(amount)) return;

        try {
            await fetch('/api/budget', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoryId: category.id,
                    month,
                    amount,
                }),
            });
            setEditing(false);
            onUpdate();
        } catch (err) {
            console.error('Failed to save budget:', err);
        }
    }

    function handleRenameClick() {
        setShowMenu(false);
        setNameInput(category.name);
        setRenaming(true);
    }

    function handleRenameSave() {
        if (nameInput.trim() && nameInput !== category.name) {
            onRename(category.id, nameInput.trim());
        }
        setRenaming(false);
    }

    const availableColor = category.available < 0 ? 'text-danger' :
        category.available > 0 ? 'text-positive' : 'text-neutral';

    const compactClass = isCompact 
        ? 'py-1 text-xs min-h-0' 
        : 'py-2 text-sm';

    return (
        <div 
            ref={setNodeRef}
            style={style}
            className={`grid grid-cols-[24px_1fr_120px_120px_140px_40px] items-center border-b border-border/50 group hover:bg-background-tertiary/50 ${isHidden ? 'opacity-50' : ''} ${compactClass}`}
        >
            <div 
                className="flex items-center justify-center cursor-grab active:cursor-grabbing"
                {...attributes}
                {...listeners}
            >
                <GripVertical className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} text-neutral opacity-0 group-hover:opacity-100 transition-opacity`} />
            </div>
            <div className="flex items-center gap-2 truncate">
                {renaming ? (
                    <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onBlur={handleRenameSave}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameSave();
                            if (e.key === 'Escape') setRenaming(false);
                        }}
                        className={`input ${isCompact ? 'text-xs py-0.5 px-1 w-40' : 'text-sm py-1 px-2 w-48'}`}
                        autoFocus
                    />
                ) : (
                    <span 
                        className="text-foreground cursor-pointer hover:text-gold transition-colors truncate"
                        onDoubleClick={() => {
                            setNameInput(category.name);
                            setRenaming(true);
                        }}
                        title="Double-click to rename"
                    >
                        {category.name}
                    </span>
                )}
                {!isCompact && category.goalType ? (
                    <button
                        type="button"
                        onClick={() => onGoalClick(category)}
                        className="hover:opacity-80 transition-opacity cursor-pointer flex-shrink-0"
                    >
                        <GoalProgress
                            goalType={category.goalType}
                            goalTarget={category.goalAmount}
                            goalDueDate={category.goalDueDate}
                            goalPercentageComplete={category.goalPercentageComplete}
                            goalUnderFunded={category.goalUnderFunded}
                            goalOverallFunded={category.goalOverallFunded}
                            goalOverallLeft={category.goalOverallLeft}
                            available={category.available}
                            assigned={category.assigned}
                        />
                    </button>
                ) : !isCompact ? (
                    <button
                        type="button"
                        onClick={() => onGoalClick(category)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-neutral hover:text-gold flex items-center gap-1 transition-all flex-shrink-0"
                    >
                        <Target className="w-3 h-3" />
                        Set Goal
                    </button>
                ) : null}
                {isHidden && <EyeOff className={`${isCompact ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-neutral flex-shrink-0`} />}
            </div>
            <div className="text-right relative">
                {editing ? (
                    <input
                        type="number"
                        value={assignedInput}
                        onChange={(e) => setAssignedInput(e.target.value)}
                        onBlur={handleSave}
                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                        className={`input w-24 text-right ${isCompact ? 'text-xs py-0.5' : 'text-sm py-1'}`}
                        autoFocus
                    />
                ) : (
                    <div className="flex items-center justify-end gap-1">
                        {!isCompact && (
                            <button
                                onClick={() => setShowQuickActions(!showQuickActions)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-background-tertiary rounded transition-opacity"
                                title="Quick budget actions"
                                disabled={quickLoading}
                            >
                                <Zap className={`w-3 h-3 text-gold ${quickLoading ? 'animate-spin' : ''}`} />
                            </button>
                        )}
                        <button
                            onClick={() => setEditing(true)}
                            className="text-foreground hover:text-gold transition-colors"
                        >
                            {formatCurrency(category.assigned)}
                        </button>
                    </div>
                )}
                {showQuickActions && (
                    <div className="absolute right-0 top-full z-[60] bg-background-secondary border border-border rounded-lg shadow-lg py-1 min-w-[180px] mt-1">
                        <button
                            onClick={() => handleQuickAction('lastMonth')}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
                        >
                            <Clock className="w-4 h-4" />
                            Budget Last Month
                        </button>
                        <button
                            onClick={() => handleQuickAction('average')}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
                        >
                            <Calculator className="w-4 h-4" />
                            Budget Average (3mo)
                        </button>
                        {category.goalType && (
                            <button
                                onClick={() => handleQuickAction('underfunded')}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
                            >
                                <Target className="w-4 h-4" />
                                Budget Underfunded
                            </button>
                        )}
                        <button
                            onClick={() => handleQuickAction('clear')}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center gap-2 text-neutral"
                        >
                            <X className="w-4 h-4" />
                            Clear Assignment
                        </button>
                    </div>
                )}
            </div>
            <div className={`text-right tabular-nums ${category.activity < 0 ? 'text-danger' : 'text-neutral'}`}>
                {formatCurrency(category.activity)}
            </div>
            <div className={`text-right font-medium ${availableColor} flex items-center justify-end gap-1`}>
                {category.available < 0 && (
                    <span title="Overspent">
                        <AlertTriangle className={`${isCompact ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-danger`} />
                    </span>
                )}
                {formatCurrency(category.available)}
            </div>
            <div className="relative">
                <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-background-tertiary rounded"
                >
                    <MoreHorizontal className="w-4 h-4 text-neutral" />
                </button>
                {showMenu && (
                    <div className="absolute right-0 top-full z-[60] bg-background-secondary border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                        <button
                            onClick={() => { onMoveMoney?.(category.id); setShowMenu(false); }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
                        >
                            <ArrowDownUp className="w-4 h-4" />
                            Move Money
                        </button>
                        <button
                            onClick={handleRenameClick}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
                        >
                            <Edit3 className="w-4 h-4" />
                            Rename
                        </button>
                        <button
                            onClick={() => { onHide(category.id, !isHidden); setShowMenu(false); }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
                        >
                            {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            {isHidden ? 'Show' : 'Hide'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

interface GroupSectionProps {
    group: CategoryGroup;
    month: string;
    onUpdate: () => void;
    onHideCategory: (id: string, hide: boolean) => void;
    onHideGroup: (id: string, hide: boolean) => void;
    onRenameCategory: (id: string, name: string) => void;
    onRenameGroup: (id: string, name: string) => void;
    onGoalClick: (category: Category) => void;
    onMoveMoney?: (categoryId: string) => void;
    onError?: (message: string) => void;
    showHidden: boolean;
    activeId: string | null;
    isCompact?: boolean;
    searchQuery?: string;
}

function CategoryGroupSection({ group, month, onUpdate, onHideCategory, onHideGroup, onRenameCategory, onRenameGroup, onGoalClick, onMoveMoney, onError, showHidden, activeId, isCompact, searchQuery }: GroupSectionProps) {
    const [showMenu, setShowMenu] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [nameInput, setNameInput] = useState(group.name);
    const totalAssigned = group.categories.reduce((sum, c) => sum + c.assigned, 0);
    const totalActivity = group.categories.reduce((sum, c) => sum + c.activity, 0);
    const totalAvailable = group.categories.reduce((sum, c) => sum + c.available, 0);

    function handleRenameClick() {
        setShowMenu(false);
        setNameInput(group.name);
        setRenaming(true);
    }

    function handleRenameSave() {
        if (nameInput.trim() && nameInput !== group.name) {
            onRenameGroup(group.id, nameInput.trim());
        }
        setRenaming(false);
    }

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: `group-${group.id}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // Skip Inflow groups in main display (they're handled separately) 
    if (group.isInflow && !showHidden) return null;

    const availableColor = totalAvailable < 0 ? 'text-danger' :
        totalAvailable > 0 ? 'text-positive' : 'text-neutral';

    const categoryIds = group.categories.map(c => c.id);

    const compactClass = isCompact 
        ? 'py-1 text-xs' 
        : 'py-2 text-sm';

    return (
        <div ref={setNodeRef} style={style} className={`${isCompact ? 'mb-1' : 'mb-2'} ${group.isHidden ? 'opacity-50' : ''}`}>
            <div 
                className={`grid grid-cols-[24px_1fr_120px_120px_140px_40px] items-center bg-background-tertiary sticky top-0 z-10 group cursor-pointer hover:bg-background-tertiary/80 ${compactClass}`}
            >
                <div 
                    className="flex items-center justify-center cursor-grab active:cursor-grabbing"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} text-gold opacity-0 group-hover:opacity-100 transition-opacity`} />
                </div>
                <div className="flex items-center gap-2" onClick={() => !renaming && setCollapsed(!collapsed)}>
                    {collapsed ? (
                        <ChevronRight className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} text-gold transition-transform`} />
                    ) : (
                        <ChevronDown className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} text-gold transition-transform`} />
                    )}
                    {renaming ? (
                        <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            onBlur={handleRenameSave}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameSave();
                                if (e.key === 'Escape') setRenaming(false);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className={`input ${isCompact ? 'text-xs py-0.5 px-1 w-40' : 'text-sm py-1 px-2 w-48'} font-semibold`}
                            autoFocus
                        />
                    ) : (
                        <span 
                            className="text-gold font-semibold cursor-pointer hover:text-gold-light transition-colors"
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setNameInput(group.name);
                                setRenaming(true);
                            }}
                            title="Double-click to rename"
                        >
                            {group.name}
                        </span>
                    )}
                    {group.isHidden && <EyeOff className={`${isCompact ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-neutral`} />}
                    {group.isInflow && <span className="text-xs bg-info/20 text-info px-2 py-0.5 rounded">Inflow</span>}
                </div>
                <div className="text-right">{formatCurrency(totalAssigned)}</div>
                <div className="text-right">{formatCurrency(totalActivity)}</div>
                <div className={`text-right font-medium ${availableColor}`}>{formatCurrency(totalAvailable)}</div>
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-background-tertiary rounded"
                    >
                        <MoreHorizontal className="w-4 h-4 text-neutral" />
                    </button>
                    {showMenu && (
                        <div className="absolute right-0 top-full z-[60] bg-background-secondary border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                            <button
                                onClick={handleRenameClick}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
                            >
                                <Edit3 className="w-4 h-4" />
                                Rename
                            </button>
                            <button
                                onClick={() => { onHideGroup(group.id, !group.isHidden); setShowMenu(false); }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
                            >
                                {group.isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                {group.isHidden ? 'Show Group' : 'Hide Group'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
            {!collapsed && (
                <SortableContext items={categoryIds} strategy={verticalListSortingStrategy}>
                    {group.categories
                        .filter(cat => !searchQuery || cat.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((category) => (
                        <CategoryRow
                            key={category.id}
                            category={category}
                            month={month}
                            onUpdate={onUpdate}
                            onHide={onHideCategory}
                            onRename={onRenameCategory}
                            onGoalClick={onGoalClick}
                            onMoveMoney={onMoveMoney}
                            onError={onError}
                            isHidden={group.isHidden}
                            isDragging={activeId === category.id}
                            isCompact={isCompact}
                        />
                    ))}
                </SortableContext>
            )}
        </div>
    );
}

interface CreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    groups: CategoryGroup[];
    onCreated: () => void;
}

function CreateModal({ isOpen, onClose, groups, onCreated }: CreateModalProps) {
    const [type, setType] = useState<'category' | 'group'>('category');
    const [name, setName] = useState('');
    const [groupId, setGroupId] = useState('');
    const [saving, setSaving] = useState(false);

    async function handleCreate() {
        if (!name.trim()) return;
        if (type === 'category' && !groupId) return;

        setSaving(true);
        try {
            await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    name: name.trim(),
                    ...(type === 'category' && { groupId }),
                }),
            });
            setName('');
            setGroupId('');
            onClose();
            onCreated();
        } catch (err) {
            console.error('Failed to create:', err);
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]" onClick={onClose}>
            <div className="bg-background-secondary rounded-xl p-6 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-foreground">Create New</h3>
                    <button onClick={onClose} className="text-neutral hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setType('category')}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'category' ? 'bg-gold text-background' : 'bg-background-tertiary text-foreground'}`}
                    >
                        Category
                    </button>
                    <button
                        onClick={() => setType('group')}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'group' ? 'bg-gold text-background' : 'bg-background-tertiary text-foreground'}`}
                    >
                        Category Group
                    </button>
                </div>

                <div className="space-y-4">
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={type === 'group' ? 'Group name...' : 'Category name...'}
                        className="input w-full"
                        autoFocus
                    />

                    {type === 'category' && (
                        <select
                            value={groupId}
                            onChange={(e) => setGroupId(e.target.value)}
                            className="input w-full"
                        >
                            <option value="">Select a group...</option>
                            {groups.filter(g => !g.isInflow).map((g) => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                        </select>
                    )}

                    <button
                        onClick={handleCreate}
                        disabled={saving || !name.trim() || (type === 'category' && !groupId)}
                        className="btn btn-primary w-full"
                    >
                        {saving ? 'Creating...' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function BudgetPage() {
    const { showToast } = useToast();
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showHidden, setShowHidden] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [editingGoal, setEditingGoal] = useState<Category | null>(null);
    const [autoAssigning, setAutoAssigning] = useState(false);
    const [lastAutoAssign, setLastAutoAssign] = useState<{ month: string; categories: { categoryId: string; amount: number }[] } | null>(null);
    const [showTemplates, setShowTemplates] = useState(false);
    const [copyingBudget, setCopyingBudget] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isCompact, setIsCompact] = useState(false);
    const [fundingUnderfunded, setFundingUnderfunded] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferFromId, setTransferFromId] = useState<string | undefined>();

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Require 8px movement before dragging starts
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const fetchBudget = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/budget?month=${currentMonth}&showHidden=${showHidden}`);
            const data = await res.json();
            // Only set data if it has the expected structure
            if (data && data.totals) {
                setBudgetData(data);
            } else {
                console.error('Invalid budget response:', data);
                setBudgetData(null);
            }
        } catch (err) {
            console.error('Failed to fetch budget:', err);
            setBudgetData(null);
        } finally {
            setLoading(false);
        }
    }, [currentMonth, showHidden]);

    useEffect(() => {
        fetchBudget();
    }, [fetchBudget]);

    const prevMonth = () => setCurrentMonth(getMonthOffset(currentMonth, -1));
    const nextMonth = () => setCurrentMonth(getMonthOffset(currentMonth, 1));

    async function handleAutoAssign() {
        if (autoAssigning) return;
        setAutoAssigning(true);
        
        try {
            const res = await fetch('/api/budget/auto-assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: currentMonth }),
            });
            
            const data = await res.json();
            
            if (res.ok && data.success) {
                // Save the assignment for undo
                if (data.categories?.length > 0) {
                    setLastAutoAssign({
                        month: currentMonth,
                        categories: data.categories.map((c: { categoryId: string; amount: number }) => ({
                            categoryId: c.categoryId,
                            amount: c.amount,
                        })),
                    });
                }
                // Refresh budget to show updated assignments
                fetchBudget();
            } else {
                console.error('Auto-assign failed:', data.error);
            }
        } catch (err) {
            console.error('Failed to auto-assign:', err);
        } finally {
            setAutoAssigning(false);
        }
    }

    async function handleUndoAutoAssign() {
        if (!lastAutoAssign) return;
        try {
            const res = await fetch('/api/budget/auto-assign', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lastAutoAssign),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setLastAutoAssign(null);
                fetchBudget();
            } else {
                console.error('Undo auto-assign failed:', data.error);
            }
        } catch (err) {
            console.error('Failed to undo auto-assign:', err);
        }
    }

    async function handleCopyLastMonth() {
        if (copyingBudget) return;
        setCopyingBudget(true);

        const lastMonth = getMonthOffset(currentMonth, -1);

        try {
            const res = await fetch('/api/budget/copy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceMonth: lastMonth,
                    targetMonth: currentMonth,
                }),
            });

            if (res.ok) {
                fetchBudget();
            }
        } catch (err) {
            console.error('Failed to copy budget:', err);
        } finally {
            setCopyingBudget(false);
        }
    }

    // Calculate underfunded categories
    const underfundedCategories = budgetData?.groups.flatMap(g => 
        g.categories.filter(c => c.goalUnderFunded && c.goalUnderFunded > 0)
    ) || [];
    const totalUnderfunded = underfundedCategories.reduce((sum, c) => sum + (c.goalUnderFunded || 0), 0);

    async function handleFundUnderfunded() {
        if (fundingUnderfunded || underfundedCategories.length === 0) return;
        setFundingUnderfunded(true);

        try {
            // Fund each underfunded category
            for (const category of underfundedCategories) {
                const newAmount = category.assigned + (category.goalUnderFunded || 0);
                await fetch('/api/budget', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        categoryId: category.id,
                        month: currentMonth,
                        amount: newAmount / 100,
                    }),
                });
            }
            fetchBudget();
        } catch (err) {
            console.error('Failed to fund underfunded:', err);
        } finally {
            setFundingUnderfunded(false);
        }
    }

    async function handleHideCategory(id: string, hide: boolean) {
        try {
            await fetch('/api/categories', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'category',
                    id,
                    updates: { isHidden: hide },
                }),
            });
            fetchBudget();
        } catch (err) {
            console.error('Failed to hide category:', err);
        }
    }

    async function handleHideGroup(id: string, hide: boolean) {
        try {
            await fetch('/api/categories', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'group',
                    id,
                    updates: { isHidden: hide },
                }),
            });
            fetchBudget();
        } catch (err) {
            console.error('Failed to hide group:', err);
        }
    }

    async function handleRenameCategory(id: string, name: string) {
        try {
            await fetch('/api/categories', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'category',
                    id,
                    updates: { name },
                }),
            });
            fetchBudget();
        } catch (err) {
            console.error('Failed to rename category:', err);
        }
    }

    async function handleRenameGroup(id: string, name: string) {
        try {
            await fetch('/api/categories', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'group',
                    id,
                    updates: { name },
                }),
            });
            fetchBudget();
        } catch (err) {
            console.error('Failed to rename group:', err);
        }
    }

    function handleDragStart(event: DragStartEvent) {
        setActiveId(event.active.id as string);
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        setActiveId(null);

        if (!over || active.id === over.id || !budgetData) return;

        const activeIdStr = active.id as string;
        const overIdStr = over.id as string;

        // Check if dragging groups
        if (activeIdStr.startsWith('group-') && overIdStr.startsWith('group-')) {
            const activeGroupId = activeIdStr.replace('group-', '');
            const overGroupId = overIdStr.replace('group-', '');

            const oldIndex = budgetData.groups.findIndex(g => g.id === activeGroupId);
            const newIndex = budgetData.groups.findIndex(g => g.id === overGroupId);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newGroups = arrayMove(budgetData.groups, oldIndex, newIndex);
                setBudgetData({ ...budgetData, groups: newGroups });

                // Update sort order on server
                updateGroupOrder(newGroups.map((g, i) => ({ id: g.id, sortOrder: i })));
            }
            return;
        }

        // Find which groups the categories belong to
        let sourceGroup: CategoryGroup | null = null;
        let destGroup: CategoryGroup | null = null;

        for (const group of budgetData.groups) {
            if (group.categories.some(c => c.id === activeIdStr)) {
                sourceGroup = group;
            }
            if (group.categories.some(c => c.id === overIdStr)) {
                destGroup = group;
            }
        }

        if (!sourceGroup) return;

        // If dropping within the same group
        if (sourceGroup === destGroup && destGroup) {
            const oldIndex = sourceGroup.categories.findIndex(c => c.id === activeIdStr);
            const newIndex = sourceGroup.categories.findIndex(c => c.id === overIdStr);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newCategories = arrayMove(sourceGroup.categories, oldIndex, newIndex);
                const newGroups = budgetData.groups.map(g =>
                    g.id === sourceGroup!.id ? { ...g, categories: newCategories } : g
                );
                setBudgetData({ ...budgetData, groups: newGroups });

                // Update sort order on server
                updateCategoryOrder(
                    newCategories.map((c, i) => ({ id: c.id, sortOrder: i, groupId: sourceGroup!.id }))
                );
            }
        } else if (destGroup) {
            // Moving to a different group
            const category = sourceGroup.categories.find(c => c.id === activeIdStr);
            if (!category) return;

            const newSourceCategories = sourceGroup.categories.filter(c => c.id !== activeIdStr);
            const overIndex = destGroup.categories.findIndex(c => c.id === overIdStr);
            const newDestCategories = [
                ...destGroup.categories.slice(0, overIndex + 1),
                category,
                ...destGroup.categories.slice(overIndex + 1),
            ];

            const newGroups = budgetData.groups.map(g => {
                if (g.id === sourceGroup!.id) return { ...g, categories: newSourceCategories };
                if (g.id === destGroup!.id) return { ...g, categories: newDestCategories };
                return g;
            });
            setBudgetData({ ...budgetData, groups: newGroups });

            // Update on server - move category to new group
            updateCategoryOrder(
                newDestCategories.map((c, i) => ({ id: c.id, sortOrder: i, groupId: destGroup!.id }))
            );
        }
    }

    async function updateGroupOrder(orders: { id: string; sortOrder: number }[]) {
        try {
            await fetch('/api/categories', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'groups', orders }),
            });
        } catch (err) {
            console.error('Failed to update group order:', err);
            fetchBudget(); // Revert on error
        }
    }

    async function updateCategoryOrder(orders: { id: string; sortOrder: number; groupId: string }[]) {
        try {
            await fetch('/api/categories', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'categories', orders }),
            });
        } catch (err) {
            console.error('Failed to update category order:', err);
            fetchBudget(); // Revert on error
        }
    }

    return (
        <div className="p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
                        <PiggyBank className="w-7 h-7 text-gold" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Budget</h1>
                        <p className="text-neutral">{formatMonth(currentMonth)}</p>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                    {/* Search */}
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral" />
                        <input
                            type="text"
                            placeholder="Search categories..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input pl-9 pr-3 h-9 w-48 text-sm"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral hover:text-foreground"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* View Toggle */}
                    <div className="flex items-center bg-background-tertiary rounded-lg h-9 p-1">
                        <button
                            onClick={() => setIsCompact(false)}
                            className={`flex items-center justify-center w-7 h-7 rounded ${!isCompact ? 'bg-background-secondary text-gold' : 'text-neutral hover:text-foreground'}`}
                            title="Comfortable view"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setIsCompact(true)}
                            className={`flex items-center justify-center w-7 h-7 rounded ${isCompact ? 'bg-background-secondary text-gold' : 'text-neutral hover:text-foreground'}`}
                            title="Compact view"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Copy Last Month */}
                    <button
                        onClick={handleCopyLastMonth}
                        disabled={copyingBudget}
                        className="flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-sm bg-background-tertiary text-neutral hover:text-foreground transition-colors disabled:opacity-50"
                        title="Copy last month's budget"
                    >
                        <Copy className={`w-4 h-4 shrink-0 ${copyingBudget ? 'animate-spin' : ''}`} />
                        <span className="hidden xl:inline whitespace-nowrap">{copyingBudget ? 'Copying...' : 'Copy Last Month'}</span>
                    </button>

                    {/* Move Money */}
                    <button
                        onClick={() => { setTransferFromId(undefined); setShowTransferModal(true); }}
                        className="flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-sm bg-background-tertiary text-neutral hover:text-foreground transition-colors"
                        title="Move money between categories"
                    >
                        <ArrowDownUp className="w-4 h-4 shrink-0" />
                        <span className="hidden xl:inline whitespace-nowrap">Move Money</span>
                    </button>

                    {/* Fund Underfunded */}
                    {underfundedCategories.length > 0 && (
                        <button
                            onClick={handleFundUnderfunded}
                            disabled={fundingUnderfunded || (budgetData?.totals?.readyToAssign ?? 0) < totalUnderfunded}
                            className="flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-sm bg-gold/20 text-gold hover:bg-gold/30 transition-colors disabled:opacity-50"
                            title={`Fund ${underfundedCategories.length} underfunded categories (${formatCurrency(totalUnderfunded)})`}
                        >
                            <DollarSign className={`w-4 h-4 shrink-0 ${fundingUnderfunded ? 'animate-spin' : ''}`} />
                            <span className="hidden xl:inline whitespace-nowrap">Fund Underfunded ({underfundedCategories.length})</span>
                        </button>
                    )}

                    {/* Templates Button */}
                    <button
                        onClick={() => setShowTemplates(true)}
                        className="flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-sm bg-background-tertiary text-neutral hover:text-foreground transition-colors"
                        title="Budget templates"
                    >
                        <FileCheck2 className="w-4 h-4 shrink-0" />
                        <span className="hidden xl:inline whitespace-nowrap">Templates</span>
                    </button>

                    {/* Show Hidden Toggle */}
                    <button
                        onClick={() => setShowHidden(!showHidden)}
                        className={`flex items-center justify-center h-9 w-9 rounded-lg text-sm transition-colors ${showHidden ? 'bg-gold/20 text-gold' : 'bg-background-tertiary text-neutral hover:text-foreground'}`}
                        title={showHidden ? 'Hide hidden items' : 'Show hidden items'}
                    >
                        {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>

                    {/* Month Navigation */}
                    <div className="flex items-center gap-1">
                        <button onClick={prevMonth} className="flex items-center justify-center h-9 w-9 rounded-lg bg-background-tertiary text-neutral hover:text-foreground transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="flex items-center justify-center h-9 px-3 bg-background-tertiary rounded-lg font-medium text-sm min-w-[140px]">
                            {formatMonth(currentMonth)}
                        </span>
                        <button onClick={nextMonth} className="flex items-center justify-center h-9 w-9 rounded-lg bg-background-tertiary text-neutral hover:text-foreground transition-colors">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Budget Flow Visualization */}
            {(() => {
                const rta = budgetData?.totals?.readyToAssign ?? 0;
                const assignedTotal = budgetData?.totals?.assigned ?? 0;
                const activityTotal = budgetData?.totals?.activity ?? 0;
                const totalIncome = Math.max(0, rta + assignedTotal);
                const overspentCats = budgetData?.groups.flatMap(g =>
                    g.categories.filter(c => c.available < 0)
                ) || [];
                const overspentAmt = overspentCats.reduce((sum, c) => sum + Math.abs(c.available), 0);
                return (
                    <div className="mb-6">
                        <BudgetFlowBar
                            totalIncome={totalIncome}
                            assigned={assignedTotal}
                            readyToAssign={rta}
                            activity={activityTotal}
                            overspentTotal={overspentAmt}
                            overspentCount={overspentCats.length}
                            onAutoAssign={handleAutoAssign}
                            autoAssigning={autoAssigning}
                            onUndoAutoAssign={lastAutoAssign ? handleUndoAutoAssign : undefined}
                        />
                    </div>
                );
            })()}

            {/* Category Table Header */}
            <div className={`grid grid-cols-[24px_1fr_120px_120px_140px_40px] items-center bg-background-tertiary font-medium text-neutral uppercase tracking-wide rounded-t-lg ${isCompact ? 'py-1 text-[10px]' : 'py-2 text-xs'}`}>
                <div></div>
                <div>CATEGORY</div>
                <div className="text-right">ASSIGNED</div>
                <div className="text-right">ACTIVITY</div>
                <div className="text-right">AVAILABLE</div>
                <div></div>
            </div>

            {/* Category Groups */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div className="card p-0 rounded-t-none">
                    {loading ? (
                        <div className="p-8 text-center">
                            <RefreshCw className="w-8 h-8 text-gold mx-auto animate-spin" />
                            <p className="text-neutral mt-2">Loading budget...</p>
                        </div>
                    ) : (budgetData?.groups.length ?? 0) === 0 ? (
                        <div className="p-8 text-center">
                            <PiggyBank className="w-12 h-12 text-neutral mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-foreground mb-2">No categories yet</h3>
                            <p className="text-neutral mb-4">Import from YNAB or create categories to start budgeting</p>
                        </div>
                    ) : (
                        <SortableContext 
                            items={budgetData?.groups.map(g => `group-${g.id}`) ?? []} 
                            strategy={verticalListSortingStrategy}
                        >
                            {budgetData?.groups
                                .filter(g => !searchQuery || g.name.toLowerCase().includes(searchQuery.toLowerCase()) || g.categories.some(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())))
                                .map((group) => (
                                <CategoryGroupSection
                                    key={group.id}
                                    group={group}
                                    month={currentMonth}
                                    onUpdate={fetchBudget}
                                    onHideCategory={handleHideCategory}
                                    onHideGroup={handleHideGroup}
                                    onRenameCategory={handleRenameCategory}
                                    onRenameGroup={handleRenameGroup}
                                    onGoalClick={setEditingGoal}
                                    onMoveMoney={(catId) => { setTransferFromId(catId); setShowTransferModal(true); }}
                                    onError={(msg) => showToast(msg, 'error')}
                                    showHidden={showHidden}
                                    activeId={activeId}
                                    isCompact={isCompact}
                                    searchQuery={searchQuery}
                                />
                            ))}
                        </SortableContext>
                    )}
                    
                    {/* Budget Summary Footer */}
                    {!loading && budgetData && budgetData.groups.length > 0 && (
                        <div className="table-row grid-cols-[24px_1fr_120px_120px_140px_40px] bg-background-tertiary border-t border-border font-medium">
                            <div></div>
                            <div className="text-neutral">Total</div>
                            <div className="text-right text-foreground">{formatCurrency(budgetData.totals.assigned)}</div>
                            <div className={`text-right ${budgetData.totals.activity < 0 ? 'text-danger' : 'text-neutral'}`}>
                                {formatCurrency(budgetData.totals.activity)}
                            </div>
                            <div className={`text-right ${budgetData.totals.available < 0 ? 'text-danger' : budgetData.totals.available > 0 ? 'text-positive' : 'text-neutral'}`}>
                                {formatCurrency(budgetData.totals.available)}
                            </div>
                            <div></div>
                        </div>
                    )}
                </div>
            </DndContext>

            {/* Create Modal */}
            <CreateModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                groups={budgetData?.groups ?? []}
                onCreated={fetchBudget}
            />

            {/* Goal Editor Modal */}
            {editingGoal && (
                <GoalEditorModal
                    isOpen={true}
                    onClose={() => setEditingGoal(null)}
                    onSave={fetchBudget}
                    categoryId={editingGoal.id}
                    categoryName={editingGoal.name}
                    currentGoalType={editingGoal.goalType}
                    currentGoalTarget={editingGoal.goalAmount}
                    currentGoalDueDate={editingGoal.goalDueDate}
                />
            )}

            {/* Budget Templates Modal */}
            <BudgetTemplatesModal
                isOpen={showTemplates}
                onClose={() => setShowTemplates(false)}
                onApply={() => {
                    setShowTemplates(false);
                    fetchBudget();
                }}
                month={currentMonth}
                currentBudgets={budgetData?.groups.flatMap(g => 
                    g.categories.map(c => ({ categoryId: c.id, budgeted: c.assigned }))
                ) || []}
            />

            {/* Budget Transfer Modal */}
            <BudgetTransferModal
                isOpen={showTransferModal}
                onClose={() => setShowTransferModal(false)}
                onSuccess={() => {
                    setShowTransferModal(false);
                    fetchBudget();
                }}
                month={currentMonth}
                categories={budgetData?.groups.filter(g => !g.isInflow).flatMap(g =>
                    g.categories.map(c => ({
                        id: c.id,
                        name: c.name,
                        groupName: g.name,
                        available: c.available,
                        assigned: c.assigned,
                    }))
                ) || []}
                readyToAssign={budgetData?.totals?.readyToAssign ?? 0}
                preselectedFromId={transferFromId}
            />

            {/* Add Category FAB */}
            <button
                onClick={() => setShowCreateModal(true)}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gold text-background flex items-center justify-center shadow-lg hover:bg-gold-light transition-all animate-pulse-gold"
            >
                <Plus className="w-6 h-6" />
            </button>
        </div>
    );
}
