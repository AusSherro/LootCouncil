'use client';

import { useEffect, useCallback } from 'react';

interface KeyboardShortcut {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    action: () => void;
    description: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!enabled) return;

        // Don't trigger shortcuts when typing in inputs
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            // Allow Escape in inputs
            if (e.key !== 'Escape') return;
        }

        for (const shortcut of shortcuts) {
            const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey;
            const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
            const altMatch = shortcut.alt ? e.altKey : !e.altKey;
            const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

            if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
                e.preventDefault();
                shortcut.action();
                return;
            }
        }
    }, [shortcuts, enabled]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}

// Common shortcuts for list navigation
export function useListNavigation({
    items,
    selectedIndex,
    onSelect,
    onEdit,
    onEscape,
    enabled = true,
}: {
    items: unknown[];
    selectedIndex: number;
    onSelect: (index: number) => void;
    onEdit?: () => void;
    onEscape?: () => void;
    enabled?: boolean;
}) {
    useKeyboardShortcuts([
        {
            key: 'ArrowDown',
            action: () => {
                const next = Math.min(selectedIndex + 1, items.length - 1);
                onSelect(next);
            },
            description: 'Select next item',
        },
        {
            key: 'ArrowUp',
            action: () => {
                const prev = Math.max(selectedIndex - 1, 0);
                onSelect(prev);
            },
            description: 'Select previous item',
        },
        {
            key: 'Enter',
            action: () => {
                if (onEdit && selectedIndex >= 0) {
                    onEdit();
                }
            },
            description: 'Edit selected item',
        },
        {
            key: 'Escape',
            action: () => {
                if (onEscape) {
                    onEscape();
                } else {
                    onSelect(-1);
                }
            },
            description: 'Deselect / Cancel',
        },
        {
            key: 'Home',
            action: () => onSelect(0),
            description: 'Select first item',
        },
        {
            key: 'End',
            action: () => onSelect(items.length - 1),
            description: 'Select last item',
        },
    ], enabled);
}

// Shortcuts help component
export function ShortcutsHelp({ shortcuts }: { shortcuts: KeyboardShortcut[] }) {
    return (
        <div className="text-xs text-neutral space-y-1">
            {shortcuts.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 bg-background-tertiary rounded text-[10px] font-mono">
                        {s.ctrl && 'Ctrl+'}
                        {s.shift && 'Shift+'}
                        {s.alt && 'Alt+'}
                        {s.key}
                    </kbd>
                    <span>{s.description}</span>
                </div>
            ))}
        </div>
    );
}
