'use client';

import type { ReactNode } from 'react';

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


