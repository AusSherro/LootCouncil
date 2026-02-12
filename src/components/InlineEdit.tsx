'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface Category {
    id: string;
    name: string;
}

interface InlineCategorySelectProps {
    currentCategory: Category | null;
    categories: Category[];
    onSelect: (categoryId: string) => Promise<void>;
    className?: string;
}

export function InlineCategorySelect({ 
    currentCategory, 
    categories, 
    onSelect,
    className = ''
}: InlineCategorySelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            inputRef.current?.focus();
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const filteredCategories = categories.filter(c => 
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    async function handleSelect(categoryId: string) {
        setSaving(true);
        try {
            await onSelect(categoryId);
        } finally {
            setSaving(false);
            setIsOpen(false);
            setSearch('');
        }
    }

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className="text-left w-full px-2 py-1 -mx-2 -my-1 rounded hover:bg-background-tertiary flex items-center gap-1 group"
                disabled={saving}
            >
                <span className={currentCategory ? 'text-foreground' : 'text-neutral'}>
                    {saving ? 'Saving...' : (currentCategory?.name || 'Uncategorized')}
                </span>
                <ChevronDown className="w-3 h-3 text-neutral opacity-0 group-hover:opacity-100" />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-background-secondary border border-border rounded-lg shadow-xl z-50">
                    <div className="p-2 border-b border-border">
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search categories..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="input input-sm w-full"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto py-1">
                        {filteredCategories.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-neutral">No categories found</div>
                        ) : (
                            filteredCategories.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={(e) => { e.stopPropagation(); handleSelect(cat.id); }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-background-tertiary flex items-center justify-between ${
                                        cat.id === currentCategory?.id ? 'text-gold' : 'text-foreground'
                                    }`}
                                >
                                    {cat.name}
                                    {cat.id === currentCategory?.id && <Check className="w-4 h-4" />}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

interface InlineTextEditProps {
    value: string;
    onSave: (newValue: string) => Promise<void>;
    placeholder?: string;
    className?: string;
}

export function InlineTextEdit({ value, onSave, placeholder = '', className = '' }: InlineTextEditProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(value);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    async function handleSave() {
        if (editValue === value) {
            setIsEditing(false);
            return;
        }
        setSaving(true);
        try {
            await onSave(editValue);
            setIsEditing(false);
        } finally {
            setSaving(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setEditValue(value);
            setIsEditing(false);
        }
    }

    if (isEditing) {
        return (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSave}
                    className="input input-sm flex-1 min-w-0"
                    disabled={saving}
                />
            </div>
        );
    }

    return (
        <button
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            className={`text-left px-2 py-1 -mx-2 -my-1 rounded hover:bg-background-tertiary ${className}`}
        >
            {value || <span className="text-neutral">{placeholder || '—'}</span>}
        </button>
    );
}

interface InlineAmountEditProps {
    value: number; // in cents
    onSave: (newValue: number) => Promise<void>;
    isInflow?: boolean;
    className?: string;
}

export function InlineAmountEdit({ value, onSave, isInflow, className = '' }: InlineAmountEditProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState((Math.abs(value) / 100).toFixed(2));
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    function formatDisplay(cents: number): string {
        const formatted = new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency: 'AUD',
        }).format(Math.abs(cents) / 100);
        return cents < 0 ? `-${formatted}` : formatted;
    }

    async function handleSave() {
        const newCents = Math.round(parseFloat(editValue) * 100) * (value < 0 ? -1 : 1);
        if (newCents === value || isNaN(newCents)) {
            setIsEditing(false);
            setEditValue((Math.abs(value) / 100).toFixed(2));
            return;
        }
        setSaving(true);
        try {
            await onSave(newCents);
            setIsEditing(false);
        } finally {
            setSaving(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setEditValue((Math.abs(value) / 100).toFixed(2));
            setIsEditing(false);
        }
    }

    if (isEditing) {
        return (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <span className="text-neutral text-sm">$</span>
                <input
                    ref={inputRef}
                    type="number"
                    step="0.01"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSave}
                    className="input input-sm w-24 text-right"
                    disabled={saving}
                />
            </div>
        );
    }

    return (
        <button
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            className={`text-right px-2 py-1 -mx-2 -my-1 rounded hover:bg-background-tertiary font-medium ${
                isInflow ? 'text-positive' : 'text-foreground'
            } ${className}`}
        >
            {isInflow ? '+' : ''}{formatDisplay(value)}
        </button>
    );
}
