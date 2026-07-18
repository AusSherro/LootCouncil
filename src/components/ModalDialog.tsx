'use client';

import type { HTMLAttributes, MouseEvent } from 'react';
import { useModalA11y } from '@/lib/useModalA11y';

interface ModalDialogProps extends HTMLAttributes<HTMLDivElement> {
    isOpen: boolean;
    onClose: () => void;
}

export default function ModalDialog({
    isOpen,
    onClose,
    onClick,
    children,
    ...props
}: ModalDialogProps) {
    const dialogRef = useModalA11y(isOpen, onClose);

    function handleClick(event: MouseEvent<HTMLDivElement>) {
        event.stopPropagation();
        onClick?.(event);
    }

    return (
        <div
            {...props}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            onClick={handleClick}
        >
            {children}
        </div>
    );
}