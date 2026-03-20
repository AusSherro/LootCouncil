'use client';

import { type ReactNode } from 'react';

type PillVariant = 'gold' | 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'muted';

interface StatusPillProps {
    variant?: PillVariant;
    icon?: ReactNode;
    children: ReactNode;
    size?: 'sm' | 'md';
    className?: string;
}

const variantStyles: Record<PillVariant, string> = {
    gold: 'bg-[color:var(--gold)]/15 text-[color:var(--gold)] border-[color:var(--gold)]/30',
    success: 'bg-[color:var(--success)]/15 text-[color:var(--success)] border-[color:var(--success)]/30',
    danger: 'bg-[color:var(--danger)]/15 text-[color:var(--danger)] border-[color:var(--danger)]/30',
    warning: 'bg-[color:var(--warning)]/15 text-[color:var(--warning)] border-[color:var(--warning)]/30',
    info: 'bg-[color:var(--info)]/15 text-[color:var(--info)] border-[color:var(--info)]/30',
    neutral: 'bg-[color:var(--neutral)]/15 text-[color:var(--neutral)] border-[color:var(--neutral)]/30',
    muted: 'bg-[color:var(--background-tertiary)] text-[color:var(--neutral)] border-[color:var(--border)]',
};

const sizeStyles = {
    sm: 'px-1.5 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
};

export default function StatusPill({ variant = 'neutral', icon, children, size = 'md', className = '' }: StatusPillProps) {
    return (
        <span className={`status-pill inline-flex items-center font-medium tracking-normal rounded-full border transition-colors ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}>
            {icon && <span className="flex-shrink-0">{icon}</span>}
            {children}
        </span>
    );
}
