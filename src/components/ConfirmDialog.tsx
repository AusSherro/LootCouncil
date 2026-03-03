'use client';

import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    loading?: boolean;
}

export default function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
    loading = false,
}: ConfirmDialogProps) {
    const confirmButtonRef = useRef<HTMLButtonElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);

    // Focus cancel button when opened for safety
    useEffect(() => {
        if (isOpen && cancelButtonRef.current) {
            cancelButtonRef.current.focus();
        }
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        }
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const variantStyles = {
        danger: {
            icon: <Trash2 className="w-6 h-6 text-danger" />,
            iconBg: 'bg-danger/10',
            confirmBtn: 'bg-danger hover:bg-danger/90 text-white',
        },
        warning: {
            icon: <AlertTriangle className="w-6 h-6 text-warning" />,
            iconBg: 'bg-warning/10',
            confirmBtn: 'bg-warning hover:bg-warning/90 text-background',
        },
        info: {
            icon: <AlertTriangle className="w-6 h-6 text-gold" />,
            iconBg: 'bg-gold/10',
            confirmBtn: 'bg-gold hover:bg-gold/90 text-background',
        },
    };

    const styles = variantStyles[variant];

    return (
        <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="relative bg-background-secondary rounded-xl p-6 w-full max-w-md shadow-xl animate-scale-in">
                {/* Close button */}
                <button
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="absolute top-4 right-4 text-neutral hover:text-foreground"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Icon */}
                <div className={`w-12 h-12 rounded-full ${styles.iconBg} flex items-center justify-center mx-auto mb-4`}>
                    {styles.icon}
                </div>

                {/* Content */}
                <h3 id="confirm-dialog-title" className="text-lg font-semibold text-foreground text-center mb-2">
                    {title}
                </h3>
                <p id="confirm-dialog-message" className="text-neutral text-center mb-6">
                    {message}
                </p>

                {/* Buttons */}
                <div className="flex gap-3">
                    <button
                        ref={cancelButtonRef}
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 btn btn-secondary"
                    >
                        {cancelText}
                    </button>
                    <button
                        ref={confirmButtonRef}
                        onClick={() => {
                            onConfirm();
                        }}
                        disabled={loading}
                        className={`flex-1 btn ${styles.confirmBtn} ${loading ? 'opacity-50 cursor-wait' : ''}`}
                    >
                        {loading ? 'Processing...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Hook for easy usage
import { useState, useCallback } from 'react';

export function useConfirmDialog() {
    const [state, setState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        variant: 'danger' | 'warning' | 'info';
        confirmText: string;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {},
        variant: 'danger',
        confirmText: 'Confirm',
    });

    const confirm = useCallback(({
        title,
        message,
        onConfirm,
        variant = 'danger',
        confirmText = 'Confirm',
    }: {
        title: string;
        message: string;
        onConfirm: () => void;
        variant?: 'danger' | 'warning' | 'info';
        confirmText?: string;
    }) => {
        setState({
            isOpen: true,
            title,
            message,
            onConfirm,
            variant,
            confirmText,
        });
    }, []);

    const close = useCallback(() => {
        setState(prev => ({ ...prev, isOpen: false }));
    }, []);

    const Dialog = function ConfirmDialogWrapper() {
        return (
            <ConfirmDialog
                isOpen={state.isOpen}
                onClose={close}
                onConfirm={() => {
                    state.onConfirm();
                    close();
                }}
                title={state.title}
                message={state.message}
                variant={state.variant}
                confirmText={state.confirmText}
            />
        );
    };

    return { confirm, close, Dialog };
}
