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
