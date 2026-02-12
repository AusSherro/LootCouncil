'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface UndoAction {
    id: string;
    type: 'transaction' | 'budget' | 'category' | 'account' | 'transfer';
    action: 'create' | 'update' | 'delete';
    description: string;
    data: Record<string, unknown>;
    previousData?: Record<string, unknown>;
    timestamp: number;
}

interface UndoContextType {
    canUndo: boolean;
    canRedo: boolean;
    undoStack: UndoAction[];
    redoStack: UndoAction[];
    addAction: (action: Omit<UndoAction, 'id' | 'timestamp'>) => void;
    undo: () => Promise<void>;
    redo: () => Promise<void>;
    clearHistory: () => void;
    lastAction: UndoAction | null;
}

const UndoContext = createContext<UndoContextType | null>(null);

const MAX_HISTORY = 50;

export function UndoProvider({ children }: { children: ReactNode }) {
    const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
    const [redoStack, setRedoStack] = useState<UndoAction[]>([]);

    const addAction = useCallback((action: Omit<UndoAction, 'id' | 'timestamp'>) => {
        const newAction: UndoAction = {
            ...action,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
        };

        setUndoStack(prev => {
            const updated = [newAction, ...prev];
            return updated.slice(0, MAX_HISTORY);
        });

        // Clear redo stack when new action is performed
        setRedoStack([]);
    }, []);

    const undo = useCallback(async () => {
        if (undoStack.length === 0) return;

        const action = undoStack[0];
        
        try {
            // Perform the reverse operation
            await performUndo(action);

            // Move action to redo stack
            setUndoStack(prev => prev.slice(1));
            setRedoStack(prev => [action, ...prev].slice(0, MAX_HISTORY));
        } catch (error) {
            console.error('Failed to undo:', error);
            throw error;
        }
    }, [undoStack]);

    const redo = useCallback(async () => {
        if (redoStack.length === 0) return;

        const action = redoStack[0];
        
        try {
            // Perform the original operation again
            await performRedo(action);

            // Move action back to undo stack
            setRedoStack(prev => prev.slice(1));
            setUndoStack(prev => [action, ...prev].slice(0, MAX_HISTORY));
        } catch (error) {
            console.error('Failed to redo:', error);
            throw error;
        }
    }, [redoStack]);

    const clearHistory = useCallback(() => {
        setUndoStack([]);
        setRedoStack([]);
    }, []);

    return (
        <UndoContext.Provider
            value={{
                canUndo: undoStack.length > 0,
                canRedo: redoStack.length > 0,
                undoStack,
                redoStack,
                addAction,
                undo,
                redo,
                clearHistory,
                lastAction: undoStack[0] || null,
            }}
        >
            {children}
        </UndoContext.Provider>
    );
}

export function useUndo(): UndoContextType {
    const context = useContext(UndoContext);
    if (!context) {
        throw new Error('useUndo must be used within an UndoProvider');
    }
    return context;
}

// Checked fetch — throws on non-ok responses to prevent silent state corruption
async function checkedFetch(url: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(url, init);
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Undo/redo API call failed: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
    }
    return res;
}

// Perform the reverse of an action
async function performUndo(action: UndoAction): Promise<void> {
    switch (action.type) {
        case 'transaction':
            if (action.action === 'create') {
                // Undo create = delete
                await checkedFetch(`/api/transactions?id=${action.data.id}`, {
                    method: 'DELETE',
                });
            } else if (action.action === 'delete' && action.previousData) {
                // Undo delete = recreate
                await checkedFetch('/api/transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(action.previousData),
                });
            } else if (action.action === 'update' && action.previousData) {
                // Undo update = restore previous data
                await checkedFetch(`/api/transactions/${action.data.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(action.previousData),
                });
            }
            break;

        case 'budget':
            if (action.action === 'update' && action.previousData) {
                // Undo budget update = restore previous assigned amount
                await checkedFetch('/api/budget', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        categoryId: action.data.categoryId,
                        month: action.data.month,
                        assigned: action.previousData.assigned,
                    }),
                });
            }
            break;

        case 'category':
            if (action.action === 'create') {
                await checkedFetch('/api/categories', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'category', id: action.data.id }),
                });
            } else if (action.action === 'delete' && action.previousData) {
                await checkedFetch('/api/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'category', ...action.previousData }),
                });
            }
            break;

        case 'transfer':
            if (action.action === 'create' && action.data.id) {
                await checkedFetch(`/api/transfers/${action.data.id}`, {
                    method: 'DELETE',
                });
            }
            break;

        default:
            console.warn('Unknown action type for undo:', action.type);
    }
}

// Redo an action (perform it again)
async function performRedo(action: UndoAction): Promise<void> {
    switch (action.type) {
        case 'transaction':
            if (action.action === 'create') {
                // Redo create = create again
                await checkedFetch('/api/transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(action.data),
                });
            } else if (action.action === 'delete') {
                // Redo delete = delete again
                await checkedFetch(`/api/transactions?id=${action.data.id}`, {
                    method: 'DELETE',
                });
            } else if (action.action === 'update') {
                // Redo update = apply current data
                await checkedFetch(`/api/transactions/${action.data.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(action.data),
                });
            }
            break;

        case 'budget':
            if (action.action === 'update') {
                await checkedFetch('/api/budget', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        categoryId: action.data.categoryId,
                        month: action.data.month,
                        assigned: action.data.assigned,
                    }),
                });
            }
            break;

        case 'category':
            if (action.action === 'create') {
                await checkedFetch('/api/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'category', ...action.data }),
                });
            } else if (action.action === 'delete') {
                await checkedFetch('/api/categories', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'category', id: action.data.id }),
                });
            }
            break;

        case 'transfer':
            if (action.action === 'create') {
                await checkedFetch('/api/transfers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(action.data),
                });
            }
            break;

        default:
            console.warn('Unknown action type for redo:', action.type);
    }
}

// Hook for keyboard shortcuts
export function useUndoKeyboard() {
    const { canUndo, canRedo, undo, redo } = useUndo();

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ctrl+Z = Undo (or Cmd+Z on Mac)
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            if (canUndo) {
                e.preventDefault();
                undo();
            }
        }
        // Ctrl+Shift+Z or Ctrl+Y = Redo
        if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
            if (canRedo) {
                e.preventDefault();
                redo();
            }
        }
    }, [canUndo, canRedo, undo, redo]);

    return handleKeyDown;
}
