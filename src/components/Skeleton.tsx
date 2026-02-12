'use client';

import { ReactNode } from 'react';

// Base skeleton component with animation
export function Skeleton({ className = '' }: { className?: string }) {
    return (
        <div className={`animate-pulse bg-background-tertiary rounded ${className}`} />
    );
}

// Text line skeleton
export function SkeletonText({ width = 'w-full', height = 'h-4' }: { width?: string; height?: string }) {
    return <Skeleton className={`${width} ${height}`} />;
}

// Circle skeleton (for avatars, icons)
export function SkeletonCircle({ size = 'w-10 h-10' }: { size?: string }) {
    return <Skeleton className={`${size} rounded-full`} />;
}

// Card skeleton
export function SkeletonCard({ children, className = '' }: { children?: ReactNode; className?: string }) {
    return (
        <div className={`card ${className}`}>
            {children}
        </div>
    );
}

// Stat card skeleton
export function SkeletonStatCard() {
    return (
        <SkeletonCard className="space-y-3">
            <div className="flex items-center gap-2">
                <Skeleton className="w-9 h-9 rounded-lg" />
                <SkeletonText width="w-24" />
            </div>
            <SkeletonText width="w-32" height="h-8" />
            <SkeletonText width="w-20" height="h-3" />
        </SkeletonCard>
    );
}

// Transaction row skeleton
export function SkeletonTransactionRow() {
    return (
        <div className="table-row grid-cols-[32px_80px_1fr_1fr_1fr_120px_40px]">
            <div className="flex items-center justify-center">
                <Skeleton className="w-4 h-4" />
            </div>
            <SkeletonText width="w-16" />
            <SkeletonText width="w-32" />
            <SkeletonText width="w-24" />
            <SkeletonText width="w-40" />
            <div className="flex justify-end">
                <SkeletonText width="w-20" />
            </div>
            <div />
        </div>
    );
}

// Transaction list skeleton
export function SkeletonTransactionList({ rows = 8 }: { rows?: number }) {
    return (
        <div className="space-y-1">
            {Array.from({ length: rows }).map((_, i) => (
                <SkeletonTransactionRow key={i} />
            ))}
        </div>
    );
}

// Budget category skeleton
export function SkeletonBudgetCategory() {
    return (
        <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-2">
                <SkeletonText width="w-32" />
                <SkeletonText width="w-24" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
        </div>
    );
}

// Budget group skeleton
export function SkeletonBudgetGroup() {
    return (
        <div className="card p-0 overflow-hidden">
            <div className="p-4 border-b border-border bg-background-tertiary/50">
                <SkeletonText width="w-40" height="h-5" />
            </div>
            <SkeletonBudgetCategory />
            <SkeletonBudgetCategory />
            <SkeletonBudgetCategory />
        </div>
    );
}

// Chart skeleton
export function SkeletonChart({ height = 'h-64' }: { height?: string }) {
    const barHeights = [45, 72, 33, 88, 56, 41, 67, 79, 52, 38, 84, 60];
    return (
        <SkeletonCard>
            <SkeletonText width="w-32" height="h-5" />
            <div className={`mt-4 ${height} flex items-end gap-2`}>
                {barHeights.map((h, i) => (
                    <div 
                        key={i} 
                        className="flex-1"
                        style={{ height: `${h}%` }}
                    >
                        <Skeleton className="w-full h-full rounded-t" />
                    </div>
                ))}
            </div>
        </SkeletonCard>
    );
}

// Table skeleton
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
    return (
        <div className="space-y-2">
            <div className="flex gap-4 pb-2 border-b border-border">
                {Array.from({ length: cols }).map((_, i) => (
                    <SkeletonText key={i} width="w-24" />
                ))}
            </div>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex gap-4 py-2">
                    {Array.from({ length: cols }).map((_, j) => (
                        <SkeletonText key={j} width="w-24" />
                    ))}
                </div>
            ))}
        </div>
    );
}

// Dashboard skeleton
export function SkeletonDashboard() {
    return (
        <div className="p-6 lg:p-8 space-y-6">
            {/* Header */}
            <div className="space-y-1">
                <SkeletonText width="w-24" height="h-4" />
                <SkeletonText width="w-32" height="h-8" />
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-2">
                    <SkeletonStatCard />
                </div>
                <SkeletonStatCard />
                <SkeletonStatCard />
            </div>
            
            {/* Secondary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <SkeletonStatCard />
                <div className="lg:col-span-2">
                    <SkeletonCard className="h-48" />
                </div>
            </div>
        </div>
    );
}

// Page loading skeleton
export function SkeletonPage({ title = true }: { title?: boolean }) {
    return (
        <div className="p-6 lg:p-8 space-y-6">
            {title && (
                <div className="space-y-1">
                    <SkeletonText width="w-32" height="h-8" />
                    <SkeletonText width="w-48" height="h-4" />
                </div>
            )}
            <SkeletonCard className="h-96" />
        </div>
    );
}
