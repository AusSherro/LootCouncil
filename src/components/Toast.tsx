'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    message: string;
    variant: ToastVariant;
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

    const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
        const id = ++nextId;
        setToasts(prev => [...prev, { id, message, variant }]);

        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const variantStyles: Record<ToastVariant, { bg: string; border: string; text: string; Icon: typeof AlertTriangle }> = {
        error: { bg: 'bg-danger/20', border: 'border-danger/40', text: 'text-danger', Icon: AlertCircle },
        warning: { bg: 'bg-warning/20', border: 'border-warning/40', text: 'text-warning', Icon: AlertTriangle },
        success: { bg: 'bg-success/20', border: 'border-success/40', text: 'text-success', Icon: CheckCircle },
        info: { bg: 'bg-info/20', border: 'border-info/40', text: 'text-info', Icon: Info },
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast Container */}
            {toasts.length > 0 && (
                <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
                    {toasts.map(toast => {
                        const { bg, border, text, Icon } = variantStyles[toast.variant];
                        return (
                            <div
                                key={toast.id}
                                className={`${bg} ${border} border rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg animate-fade-in pointer-events-auto min-w-[280px] max-w-[440px]`}
                            >
                                <Icon className={`w-5 h-5 ${text} flex-shrink-0`} />
                                <span className="text-sm text-foreground flex-1">{toast.message}</span>
                                <button
                                    onClick={() => dismiss(toast.id)}
                                    className="text-neutral hover:text-foreground transition-colors flex-shrink-0"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </ToastContext.Provider>
    );
}
