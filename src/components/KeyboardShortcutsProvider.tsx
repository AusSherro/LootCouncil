'use client';

import { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

interface ShortcutGroup {
    name: string;
    shortcuts: { keys: string; description: string }[];
}

const shortcutGroups: ShortcutGroup[] = [
    {
        name: 'Navigation',
        shortcuts: [
            { keys: 'G then B', description: 'Go to Budget' },
            { keys: 'G then T', description: 'Go to Transactions' },
            { keys: 'G then A', description: 'Go to Accounts' },
            { keys: 'G then R', description: 'Go to Reports' },
            { keys: 'G then N', description: 'Go to Net Worth' },
            { keys: 'G then S', description: 'Go to Settings' },
            { keys: 'G then H', description: 'Go to Home' },
        ],
    },
    {
        name: 'Actions',
        shortcuts: [
            { keys: 'N', description: 'New transaction' },
            { keys: '/', description: 'Focus search' },
            { keys: '?', description: 'Show keyboard shortcuts' },
            { keys: 'Esc', description: 'Close modal / Cancel' },
        ],
    },
    {
        name: 'List Navigation',
        shortcuts: [
            { keys: '↑ ↓', description: 'Navigate items' },
            { keys: 'Enter', description: 'Edit selected' },
            { keys: 'Space', description: 'Toggle selection' },
            { keys: 'Home / End', description: 'First / Last item' },
        ],
    },
];

interface KeyboardContextType {
    showHelp: boolean;
    setShowHelp: (show: boolean) => void;
    pendingKey: string | null;
}

const KeyboardContext = createContext<KeyboardContextType>({
    showHelp: false,
    setShowHelp: () => {},
    pendingKey: null,
});

export function useKeyboardContext() {
    return useContext(KeyboardContext);
}

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [showHelp, setShowHelp] = useState(false);
    const [pendingKey, setPendingKey] = useState<string | null>(null);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const target = e.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

            // Always allow Escape
            if (e.key === 'Escape') {
                setShowHelp(false);
                setPendingKey(null);
                return;
            }

            // Don't handle shortcuts when in inputs (except for global ones)
            if (isInput) return;

            // "G" prefix for navigation
            if (pendingKey === 'g') {
                e.preventDefault();
                setPendingKey(null);
                switch (e.key.toLowerCase()) {
                    case 'b': router.push('/budget'); break;
                    case 't': router.push('/transactions'); break;
                    case 'a': router.push('/accounts'); break;
                    case 'r': router.push('/reports'); break;
                    case 'n': router.push('/investments'); break;
                    case 's': router.push('/settings'); break;
                    case 'h': router.push('/'); break;
                }
                return;
            }

            // Single key shortcuts
            switch (e.key.toLowerCase()) {
                case 'g':
                    e.preventDefault();
                    setPendingKey('g');
                    // Clear pending after 1.5s
                    setTimeout(() => setPendingKey(null), 1500);
                    break;
                case '?':
                    e.preventDefault();
                    setShowHelp(true);
                    break;
                case '/':
                    e.preventDefault();
                    // Focus search input if exists
                    const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]') as HTMLInputElement;
                    searchInput?.focus();
                    break;
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [router, pendingKey]);

    return (
        <KeyboardContext.Provider value={{ showHelp, setShowHelp, pendingKey }}>
            {children}
            
            {/* Pending key indicator */}
            {pendingKey && (
                <div className="fixed bottom-4 right-4 px-3 py-2 bg-background-secondary border border-border rounded-lg shadow-lg z-50">
                    <span className="text-sm text-neutral">Press key: </span>
                    <kbd className="px-2 py-1 bg-primary/20 text-primary rounded font-mono text-sm">g</kbd>
                    <span className="text-sm text-neutral"> + ...</span>
                </div>
            )}

            {/* Help Modal */}
            {showHelp && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowHelp(false)}>
                    <div className="bg-background-secondary border border-border rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <h2 className="text-lg font-semibold text-foreground">Keyboard Shortcuts</h2>
                            <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-background-tertiary rounded">
                                <X className="w-5 h-5 text-neutral" />
                            </button>
                        </div>
                        <div className="p-4 space-y-6">
                            {shortcutGroups.map(group => (
                                <div key={group.name}>
                                    <h3 className="text-sm font-medium text-foreground mb-2">{group.name}</h3>
                                    <div className="space-y-1">
                                        {group.shortcuts.map(s => (
                                            <div key={s.keys} className="flex items-center justify-between py-1">
                                                <span className="text-sm text-neutral">{s.description}</span>
                                                <kbd className="px-2 py-0.5 bg-background-tertiary text-foreground rounded text-xs font-mono">
                                                    {s.keys}
                                                </kbd>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t border-border">
                            <p className="text-xs text-neutral text-center">Press <kbd className="px-1.5 py-0.5 bg-background-tertiary rounded">?</kbd> anytime to show this help</p>
                        </div>
                    </div>
                </div>
            )}
        </KeyboardContext.Provider>
    );
}
