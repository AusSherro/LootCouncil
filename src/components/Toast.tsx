'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { X, AlertTriangle, Info, AlertCircle } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    message: string;
    variant: ToastVariant;
    exiting?: boolean;
}

interface ToastContextType {
    showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType>({
    showToast: () => {},
});

export function useToast() {
    return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            timersRef.current.forEach(t => clearTimeout(t));
        };
    }, []);

    const removeToast = useCallback((id: number) => {
        // Start exit animation
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        // Remove after exit animation completes
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 200);
    }, []);

    const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
        const id = ++nextId;
        setToasts(prev => [...prev, { id, message, variant }]);

        const timer = setTimeout(() => {
            removeToast(id);
            timersRef.current.delete(id);
        }, 3000);
        timersRef.current.set(id, timer);
    }, [removeToast]);

    const dismiss = useCallback((id: number) => {
        const timer = timersRef.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(id);
        }
        removeToast(id);
    }, [removeToast]);

    const variantStyles: Record<ToastVariant, { bg: string; border: string; text: string; Icon: typeof AlertTriangle | null }> = {
        error: { bg: 'bg-danger/20', border: 'border-danger/40', text: 'text-danger', Icon: AlertCircle },
        warning: { bg: 'bg-warning/20', border: 'border-warning/40', text: 'text-warning', Icon: AlertTriangle },
        success: { bg: 'bg-success/20', border: 'border-success/40', text: 'text-success', Icon: null },
        info: { bg: 'bg-info/20', border: 'border-info/40', text: 'text-info', Icon: Info },
    };

    const SuccessCheckmark = () => (
        <svg className="w-5 h-5 flex-shrink-0 success-checkmark-circle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="text-success" opacity="0.3" />
            <path d="M7 12.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success success-checkmark-path" />
        </svg>
    );

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast Container — aria-live so screen readers announce notifications */}
            <div
                className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none"
                role="status"
                aria-live="polite"
                aria-atomic="false"
            >
                {toasts.map(toast => {
                    const { bg, border, text, Icon } = variantStyles[toast.variant];
                    return (
                        <div
                            key={toast.id}
                            className={`${bg} ${border} border rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg pointer-events-auto min-w-[280px] max-w-[440px] ${toast.exiting ? 'animate-slide-out-bottom' : 'animate-slide-in-bottom'}`}
                        >
                            {toast.variant === 'success' ? (
                                <SuccessCheckmark />
                            ) : Icon ? (
                                <Icon className={`w-5 h-5 ${text} flex-shrink-0`} aria-hidden="true" />
                            ) : null}
                            <span className="text-sm text-foreground flex-1">{toast.message}</span>
                            <button
                                onClick={() => dismiss(toast.id)}
                                className="text-neutral hover:text-foreground transition-colors flex-shrink-0"
                                aria-label="Dismiss notification"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}
