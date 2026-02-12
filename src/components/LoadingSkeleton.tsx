'use client';

// Loading skeleton components for better perceived performance

export function SkeletonRow({ columns = 5 }: { columns?: number }) {
    return (
        <div className="flex items-center gap-4 p-3 animate-pulse">
            {Array.from({ length: columns }).map((_, i) => (
                <div
                    key={i}
                    className={`h-4 bg-background-tertiary rounded ${i === 0 ? 'w-20' : i === columns - 1 ? 'w-24' : 'flex-1'}`}
                />
            ))}
        </div>
    );
}

export function SkeletonCard() {
    return (
        <div className="card animate-pulse">
            <div className="h-4 w-24 bg-background-tertiary rounded mb-2" />
            <div className="h-8 w-32 bg-background-tertiary rounded" />
        </div>
    );
}

export function SkeletonTable({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
    return (
        <div className="space-y-1">
            {Array.from({ length: rows }).map((_, i) => (
                <SkeletonRow key={i} columns={columns} />
            ))}
        </div>
    );
}

// Pre-computed bar heights to avoid impure Math.random during render
const BAR_HEIGHTS = [45, 72, 28, 91, 55, 38, 83, 67, 22, 76, 48, 60];

export function SkeletonChart() {
    return (
        <div className="card animate-pulse">
            <div className="h-4 w-32 bg-background-tertiary rounded mb-4" />
            <div className="flex items-end gap-2 h-48">
                {BAR_HEIGHTS.map((height, i) => (
                    <div
                        key={i}
                        className="flex-1 bg-background-tertiary rounded-t"
                        style={{ height: `${height}%` }}
                    />
                ))}
            </div>
        </div>
    );
}

export function SkeletonSidebar() {
    return (
        <div className="space-y-4 p-4 animate-pulse">
            <div className="h-10 bg-background-tertiary rounded" />
            <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-10 bg-background-tertiary rounded" />
                ))}
            </div>
        </div>
    );
}

export function SkeletonPage() {
    return (
        <div className="p-6 animate-pulse">
            <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-background-tertiary rounded-xl" />
                <div>
                    <div className="h-6 w-32 bg-background-tertiary rounded mb-2" />
                    <div className="h-4 w-48 bg-background-tertiary rounded" />
                </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>
            <SkeletonTable />
        </div>
    );
}
