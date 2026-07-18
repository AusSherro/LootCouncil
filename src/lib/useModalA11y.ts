'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

let bodyScrollLockCount = 0;
let bodyOverflowBeforeLock = '';

function lockBodyScroll() {
    if (bodyScrollLockCount === 0) {
        bodyOverflowBeforeLock = document.body.style.overflow;
    }
    bodyScrollLockCount += 1;
    document.body.style.overflow = 'hidden';
}

function unlockBodyScroll() {
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
    if (bodyScrollLockCount === 0) {
        document.body.style.overflow = bodyOverflowBeforeLock;
        bodyOverflowBeforeLock = '';
    }
}

export function useModalA11y(isOpen: boolean, onClose: () => void) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return;

        const previouslyFocused = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        lockBodyScroll();

        const focusFrame = requestAnimationFrame(() => {
            const dialog = dialogRef.current;
            if (!dialog) return;
            const preferred = dialog.querySelector<HTMLElement>('[data-autofocus]');
            const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
            (preferred ?? firstFocusable ?? dialog).focus();
        });

        function isTopmostDialog(dialog: HTMLElement): boolean {
            const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
            return dialogs.at(-1) === dialog;
        }

        function handleKeyDown(event: KeyboardEvent) {
            const dialog = dialogRef.current;
            if (!dialog || !isTopmostDialog(dialog)) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }

            if (event.key !== 'Tab') return;

            const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
                .filter(element => element.getClientRects().length > 0);
            if (focusable.length === 0) {
                event.preventDefault();
                dialog.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;
            if (event.shiftKey && (active === first || !dialog.contains(active))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
                event.preventDefault();
                first.focus();
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', handleKeyDown);
            unlockBodyScroll();
            requestAnimationFrame(() => previouslyFocused?.focus());
        };
    }, [isOpen]);

    return dialogRef;
}