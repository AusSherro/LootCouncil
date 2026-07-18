'use client';

import { useState, useEffect, useRef, useCallback, useId } from 'react';

interface Payee {
    id: string;
    name: string;
    lastCategoryId?: string | null;
}

interface PayeeAutocompleteProps {
    value: string;
    onChange: (value: string) => void;
    onPayeeSelect?: (payee: Payee | null) => void;
    placeholder?: string;
    className?: string;
    id?: string;
}

export default function PayeeAutocomplete({
    value,
    onChange,
    onPayeeSelect,
    placeholder = "Enter payee...",
    className = "",
    id,
}: PayeeAutocompleteProps) {
    const generatedId = useId();
    const inputId = id ?? `payee-${generatedId}`;
    const listboxId = `${inputId}-listbox`;
    const [suggestions, setSuggestions] = useState<Payee[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Debounced search
    const fetchSuggestions = useCallback(async (query: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/payees?q=${encodeURIComponent(query)}&limit=8`);
            if (res.ok) {
                const data = await res.json();
                setSuggestions(data.payees || []);
            }
        } catch (error) {
            console.error('Failed to fetch payees:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (value.length >= 1 || value.length === 0) {
                fetchSuggestions(value);
            }
        }, 200);

        return () => clearTimeout(timer);
    }, [value, fetchSuggestions]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
        setIsOpen(true);
        setHighlightedIndex(0);
    };

    const handleSelectPayee = async (payee: Payee) => {
        onChange(payee.name);
        onPayeeSelect?.(payee);
        setIsOpen(false);
    };

    const handleCreateNew = async () => {
        if (!value.trim()) return;
        
        try {
            const res = await fetch('/api/payees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: value.trim() }),
            });
            
            if (res.ok) {
                const data = await res.json();
                onPayeeSelect?.(data.payee);
                setIsOpen(false);
            }
        } catch (error) {
            console.error('Failed to create payee:', error);
        }
    };

    const showCreateOption = Boolean(value.trim() && !suggestions.find(s => s.name.toLowerCase() === value.trim().toLowerCase()));
    const optionCount = suggestions.length + (showCreateOption ? 1 : 0);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex((prev) => optionCount > 0 && prev < optionCount - 1 ? prev + 1 : 0);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) => optionCount > 0 && prev > 0 ? prev - 1 : Math.max(0, optionCount - 1));
                break;
            case 'Enter':
                e.preventDefault();
                if (showCreateOption && highlightedIndex === 0) {
                    handleCreateNew();
                } else {
                    const suggestionIndex = highlightedIndex - (showCreateOption ? 1 : 0);
                    if (suggestions[suggestionIndex]) handleSelectPayee(suggestions[suggestionIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
        }
    };

    const activeOptionId = isOpen && optionCount > 0
        ? `${listboxId}-option-${highlightedIndex}`
        : undefined;

    return (
        <div className="relative">
            <input
                id={inputId}
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleInputChange}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={`input ${className}`}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isOpen}
                aria-controls={listboxId}
                aria-activedescendant={activeOptionId}
            />
            
            {isOpen && (suggestions.length > 0 || showCreateOption) && (
                <div
                    id={listboxId}
                    ref={dropdownRef}
                    className="absolute z-20 w-full mt-1 bg-background-secondary border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto"
                    role="listbox"
                    aria-label="Payee suggestions"
                >
                    {showCreateOption && (
                        <button
                            id={`${listboxId}-option-0`}
                            type="button"
                            onClick={handleCreateNew}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-background-tertiary ${
                                highlightedIndex === 0 ? 'bg-background-tertiary' : ''
                            }`}
                            role="option"
                            aria-selected={highlightedIndex === 0}
                        >
                            <span className="text-gold">+</span>
                            <span className="text-neutral">Create &quot;{value.trim()}&quot;</span>
                        </button>
                    )}
                    
                    {suggestions.map((payee, index) => (
                        <button
                            key={payee.id}
                            id={`${listboxId}-option-${index + (showCreateOption ? 1 : 0)}`}
                            type="button"
                            onClick={() => handleSelectPayee(payee)}
                            className={`w-full px-3 py-2 text-left text-sm text-foreground hover:bg-background-tertiary ${
                                highlightedIndex === (showCreateOption ? index + 1 : index) ? 'bg-background-tertiary' : ''
                            }`}
                            role="option"
                            aria-selected={highlightedIndex === (showCreateOption ? index + 1 : index)}
                        >
                            {payee.name}
                        </button>
                    ))}
                    
                    {isLoading && (
                        <div className="px-3 py-2 text-sm text-neutral">
                            Loading...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
