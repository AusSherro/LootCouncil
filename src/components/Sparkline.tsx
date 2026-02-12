'use client';

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    showFill?: boolean;
    className?: string;
}

export function Sparkline({ 
    data, 
    width = 80, 
    height = 24, 
    color = 'currentColor',
    showFill = true,
    className = ''
}: SparklineProps) {
    if (data.length < 2) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    const padding = 2;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;

    const points = data.map((value, index) => {
        const x = padding + (index / (data.length - 1)) * innerWidth;
        const y = padding + innerHeight - ((value - min) / range) * innerHeight;
        return `${x},${y}`;
    });

    const linePath = `M ${points.join(' L ')}`;
    const areaPath = `M ${padding},${padding + innerHeight} L ${points.join(' L ')} L ${padding + innerWidth},${padding + innerHeight} Z`;

    // Determine trend color if not specified
    const trendColor = color === 'currentColor' 
        ? (data[data.length - 1] > data[0] ? 'var(--color-negative)' : 'var(--color-positive)')
        : color;

    return (
        <svg 
            width={width} 
            height={height} 
            className={className}
            viewBox={`0 0 ${width} ${height}`}
        >
            {showFill && (
                <path
                    d={areaPath}
                    fill={trendColor}
                    fillOpacity="0.1"
                />
            )}
            <path
                d={linePath}
                fill="none"
                stroke={trendColor}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Current value dot */}
            <circle
                cx={padding + innerWidth}
                cy={padding + innerHeight - ((data[data.length - 1] - min) / range) * innerHeight}
                r="2"
                fill={trendColor}
            />
        </svg>
    );
}

interface TrendBadgeProps {
    current: number;
    previous: number;
    format?: 'percent' | 'currency';
    invertColors?: boolean; // For spending, down is good
    className?: string;
}

export function TrendBadge({ 
    current, 
    previous, 
    format = 'percent',
    invertColors = false,
    className = ''
}: TrendBadgeProps) {
    if (previous === 0) return null;

    const change = ((current - previous) / Math.abs(previous)) * 100;
    const isPositive = change > 0;
    const isGood = invertColors ? !isPositive : isPositive;

    const formatValue = () => {
        if (format === 'percent') {
            return `${isPositive ? '+' : ''}${change.toFixed(0)}%`;
        }
        const diff = current - previous;
        return `${diff >= 0 ? '+' : '-'}$${Math.abs(diff / 100).toFixed(0)}`;
    };

    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
            isGood ? 'text-positive' : 'text-negative'
        } ${className}`}>
            <span className={`${isPositive ? '↑' : '↓'}`} />
            {formatValue()}
        </span>
    );
}

interface SpendingTrendProps {
    monthlyData: number[]; // Last N months of spending in cents
    currentMonth: number;
    previousMonth: number;
    className?: string;
}

export function SpendingTrend({ 
    monthlyData, 
    currentMonth, 
    previousMonth,
    className = ''
}: SpendingTrendProps) {
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <Sparkline 
                data={monthlyData} 
                width={60} 
                height={20}
                color="currentColor"
            />
            <TrendBadge 
                current={currentMonth} 
                previous={previousMonth}
                invertColors={true} // Spending down = good
            />
        </div>
    );
}
