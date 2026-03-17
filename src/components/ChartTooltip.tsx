'use client';

import { formatCurrency } from '@/lib/utils';

interface ChartTooltipProps {
    active?: boolean;
    payload?: Array<{
        name: string;
        value: number;
        color?: string;
        dataKey?: string;
        payload?: Record<string, unknown>;
    }>;
    label?: string;
    currency?: string;
    formatValue?: (value: number, name: string) => string;
    labelFormatter?: (label: string) => string;
}

export default function ChartTooltip({
    active,
    payload,
    label,
    currency = 'AUD',
    formatValue,
    labelFormatter,
}: ChartTooltipProps) {
    if (!active || !payload?.length) return null;

    const displayLabel = labelFormatter ? labelFormatter(label || '') : label;

    return (
        <div className="chart-tooltip">
            {displayLabel && (
                <p className="chart-tooltip-label">{displayLabel}</p>
            )}
            <div className="space-y-1.5">
                {payload.map((entry, i) => {
                    const displayValue = formatValue
                        ? formatValue(entry.value, entry.name)
                        : typeof entry.value === 'number'
                            ? formatCurrency(entry.value, currency)
                            : String(entry.value);

                    return (
                        <div key={i} className="flex items-center justify-between gap-6">
                            <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--neutral)' }}>
                                {entry.color && (
                                    <span
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: entry.color }}
                                    />
                                )}
                                {entry.name}
                            </span>
                            <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
                                {displayValue}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
