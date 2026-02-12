'use client';

import { useEffect, useState, useRef } from 'react';
import { Undo2, Redo2, X } from 'lucide-react';
import { useUndo, useUndoKeyboard } from '@/lib/useUndo';

export default function UndoToast() {
    const { canUndo, canRedo, lastAction, undo, redo } = useUndo();
    const handleKeyDown = useUndoKeyboard();
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [undoing, setUndoing] = useState(false);
    const [redoing, setRedoing] = useState(false);

    // Set up keyboard shortcuts
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Track previous action ID to detect new actions
    const prevActionIdRef = useRef<string | null>(null);

    // Show toast when a new action is added
    useEffect(() => {
        if (lastAction && lastAction.id !== prevActionIdRef.current) {
            prevActionIdRef.current = lastAction.id;
            setToastMessage(lastAction.description);
            setShowToast(true);

            const timer = setTimeout(() => {
                setShowToast(false);
            }, 5000);

            return () => clearTimeout(timer);
        }
    }, [lastAction]);

    async function handleUndo() {
        if (!canUndo || undoing) return;
        setUndoing(true);
        try {
            await undo();
            setToastMessage('Action undone');
        } catch {
            setToastMessage('Failed to undo');
        } finally {
            setUndoing(false);
        }
    }

    async function handleRedo() {
        if (!canRedo || redoing) return;
        setRedoing(true);
        try {
            await redo();
            setToastMessage('Action redone');
        } catch {
            setToastMessage('Failed to redo');
        } finally {
            setRedoing(false);
        }
    }

    if (!showToast && !canUndo && !canRedo) return null;

    return (
        <div className="fixed bottom-20 lg:bottom-6 right-6 z-50 flex items-center gap-2">
            {/* Toast message */}
            {showToast && toastMessage && (
                <div className="bg-background-secondary border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 animate-fade-in">
                    <span className="text-sm text-foreground">{toastMessage}</span>
                    <button
                        onClick={() => setShowToast(false)}
                        className="p-1 hover:bg-background-tertiary rounded transition-colors"
                    >
                        <X className="w-4 h-4 text-neutral" />
                    </button>
                </div>
            )}

            {/* Undo/Redo buttons */}
            <div className="bg-background-secondary border border-border rounded-lg shadow-lg flex overflow-hidden">
                <button
                    onClick={handleUndo}
                    disabled={!canUndo || undoing}
                    className="p-3 hover:bg-background-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-r border-border"
                    title="Undo (Ctrl+Z)"
                >
                    <Undo2 className={`w-5 h-5 ${canUndo ? 'text-foreground' : 'text-neutral'} ${undoing ? 'animate-spin' : ''}`} />
                </button>
                <button
                    onClick={handleRedo}
                    disabled={!canRedo || redoing}
                    className="p-3 hover:bg-background-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Redo (Ctrl+Shift+Z)"
                >
                    <Redo2 className={`w-5 h-5 ${canRedo ? 'text-foreground' : 'text-neutral'} ${redoing ? 'animate-spin' : ''}`} />
                </button>
            </div>
        </div>
    );
}
