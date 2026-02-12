'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Payee {
    id: string;
    name: string;
}

interface PayeeAutocompleteProps {
    value: string;
    onChange: (value: string) => void;
    onPayeeSelect?: (payee: Payee | null) => void;
    placeholder?: string;
    className?: string;
}

export default function PayeeAutocomplete({
    value,
    onChange,
    onPayeeSelect,
    placeholder = "Enter payee...",
    className = "",
}: PayeeAutocompleteProps) {
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
                setHighlightedIndex((prev) =>
                    prev < suggestions.length ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) =>
                    prev > 0 ? prev - 1 : suggestions.length
                );
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex === 0 && value.trim() && !suggestions.find(s => s.name.toLowerCase() === value.toLowerCase())) {
                    handleCreateNew();
                } else if (highlightedIndex > 0 && suggestions[highlightedIndex - 1]) {
                    handleSelectPayee(suggestions[highlightedIndex - 1]);
                } else if (suggestions.length > 0 && highlightedIndex === 0) {
                    handleSelectPayee(suggestions[0]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
        }
    };

    const showCreateOption = value.trim() && !suggestions.find(s => s.name.toLowerCase() === value.trim().toLowerCase());

    return (
        <div className="relative">
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleInputChange}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={`input ${className}`}
            />
            
            {isOpen && (suggestions.length > 0 || showCreateOption) && (
                <div
                    ref={dropdownRef}
                    className="absolute z-[200] w-full mt-1 bg-background-secondary border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto"
                >
                    {showCreateOption && (
                        <button
                            type="button"
                            onClick={handleCreateNew}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-background-tertiary ${
                                highlightedIndex === 0 ? 'bg-background-tertiary' : ''
                            }`}
                        >
                            <span className="text-gold">+</span>
                            <span className="text-neutral">Create &quot;{value.trim()}&quot;</span>
                        </button>
                    )}
                    
                    {suggestions.map((payee, index) => (
                        <button
                            key={payee.id}
                            type="button"
                            onClick={() => handleSelectPayee(payee)}
                            className={`w-full px-3 py-2 text-left text-sm text-foreground hover:bg-background-tertiary ${
                                highlightedIndex === (showCreateOption ? index + 1 : index) ? 'bg-background-tertiary' : ''
                            }`}
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
