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
                className="text-left w-full px-2 py-1 -mx-2 -my-1 rounded hover:bg-background-tertiary flex items-center gap-1 group min-w-0"
                disabled={saving}
                aria-label={`Change category from ${currentCategory?.name || 'Uncategorized'}`}
                aria-expanded={isOpen}
            >
                <span className={`truncate ${currentCategory ? 'text-foreground' : 'text-neutral'}`}>
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
                            aria-label="Search categories"
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
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-background-tertiary flex items-center justify-between gap-2 ${
                                        cat.id === currentCategory?.id ? 'text-gold' : 'text-foreground'
                                    }`}
                                >
                                    <span className="truncate min-w-0">{cat.name}</span>
                                    {cat.id === currentCategory?.id && <Check className="w-4 h-4 flex-shrink-0" />}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
