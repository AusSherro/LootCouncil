'use client';

import { formatCurrency } from '@/lib/utils';

interface GoalProgressProps {
    goalType: string | null;
    goalTarget: number | null; // cents
    goalDueDate: string | null;
    goalPercentageComplete: number | null; // 0-100
    goalUnderFunded: number | null; // cents
    goalOverallFunded: number | null; // cents
    goalOverallLeft: number | null; // cents
    available: number; // cents
    assigned: number; // cents
}

function formatGoalCurrency(cents: number): string {
    // Show cents when there's a fractional dollar amount
    const hasCents = cents % 100 !== 0;
    return formatCurrency(cents, 'AUD', {
        minimumFractionDigits: hasCents ? 2 : 0,
        maximumFractionDigits: hasCents ? 2 : 0,
        useAbsolute: true,
        showSign: cents < 0,
    });
}

function getGoalLabel(goalType: string | null): string {
    switch (goalType) {
        case 'TB': return 'Target Balance';
        case 'TBD': return 'Target by Date';
        case 'MF': return 'Monthly';
        case 'NEED': return 'Needed';
        case 'DEBT': return 'Debt';
        default: return goalType || '';
    }
}

function getProgressColor(percentage: number, isUnderFunded: boolean): string {
    if (isUnderFunded) return 'bg-warning';
    if (percentage >= 100) return 'bg-success';
    if (percentage >= 75) return 'bg-gold';
    if (percentage >= 50) return 'bg-warning';
    return 'bg-danger';
}

export default function GoalProgress({
    goalType,
    goalTarget,
    goalDueDate,
    goalPercentageComplete,
    goalUnderFunded,
    goalOverallFunded,
    goalOverallLeft,
    available,
    assigned,
}: GoalProgressProps) {
    if (!goalType) return null;

    const percentage = goalPercentageComplete ?? 0;
    const underFunded = goalUnderFunded ?? 0;
    const isUnderFunded = underFunded > 0;
    const progressColor = getProgressColor(percentage, isUnderFunded);

    // Determine what to show based on goal type
    const renderGoalContent = () => {
        switch (goalType) {
            case 'TB': // Target Balance
                return (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-ghost-400">Target: {formatGoalCurrency(goalTarget || 0)}</span>
                            <span className="text-ghost-300">{percentage}%</span>
                        </div>
                        <div className="h-1.5 bg-midnight-700 rounded-full overflow-hidden">
                            <div 
                                className={`h-full ${progressColor} transition-all duration-300`}
                                style={{ width: `${Math.min(percentage, 100)}%` }}
                            />
                        </div>
                        {isUnderFunded && (
                            <div className="text-xs text-warning font-medium">
                                Needs {formatGoalCurrency(underFunded)}
                            </div>
                        )}
                    </div>
                );

            case 'TBD': // Target by Date
                const dueDate = goalDueDate ? new Date(goalDueDate) : null;
                const monthsLeft = dueDate 
                    ? Math.max(0, (dueDate.getFullYear() - new Date().getFullYear()) * 12 + 
                        (dueDate.getMonth() - new Date().getMonth()))
                    : null;
                
                return (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-ghost-400">
                                {formatGoalCurrency(goalTarget || 0)} by {dueDate?.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}
                            </span>
                            <span className="text-ghost-300">{percentage}%</span>
                        </div>
                        <div className="h-1.5 bg-midnight-700 rounded-full overflow-hidden">
                            <div 
                                className={`h-full ${progressColor} transition-all duration-300`}
                                style={{ width: `${Math.min(percentage, 100)}%` }}
                            />
                        </div>
                        {isUnderFunded && monthsLeft !== null && monthsLeft > 0 && (
                            <div className="text-xs text-warning font-medium">
                                Needs {formatGoalCurrency(underFunded)}/mo
                            </div>
                        )}
                        {isUnderFunded && (monthsLeft === null || monthsLeft === 0) && (
                            <div className="text-xs text-danger font-medium">
                                {formatGoalCurrency(underFunded)} short!
                            </div>
                        )}
                    </div>
                );

            case 'MF': // Monthly Funding
                // Use available (includes rollover) to determine if funded
                const mfNeeded = Math.max(0, (goalTarget || 0) - available);
                const isFunded = mfNeeded === 0;
                return (
                    <div className="flex items-center gap-2">
                        {isFunded ? (
                            <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded font-medium">
                                ✓ Funded
                            </span>
                        ) : (
                            <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded font-medium">
                                Needs {formatGoalCurrency(mfNeeded)}
                            </span>
                        )}
                        <span className="text-xs text-ghost-500">
                            Goal: {formatGoalCurrency(goalTarget || 0)}/mo
                        </span>
                    </div>
                );

            case 'NEED': // Needed for Spending
                // Calculate underfunded dynamically from current data
                const needUnderFunded = goalTarget ? Math.max(0, goalTarget - available) : underFunded;
                return (
                    <div className="flex items-center gap-2">
                        {needUnderFunded > 0 ? (
                            <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded font-medium">
                                Needs {formatGoalCurrency(needUnderFunded)}
                            </span>
                        ) : available >= 0 ? (
                            <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded font-medium">
                                ✓ Ready
                            </span>
                        ) : (
                            <span className="text-xs bg-danger/20 text-danger px-2 py-0.5 rounded font-medium">
                                Overspent {formatGoalCurrency(Math.abs(available))}
                            </span>
                        )}
                    </div>
                );

            case 'DEBT': // Debt Payoff
                const paidOff = goalOverallFunded ?? 0;
                const remaining = goalOverallLeft ?? 0;
                const total = paidOff + remaining;
                const debtPercentage = total > 0 ? Math.round((paidOff / total) * 100) : 0;
                
                return (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-ghost-400">Debt Progress</span>
                            <span className="text-ghost-300">{debtPercentage}%</span>
                        </div>
                        <div className="h-1.5 bg-midnight-700 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-success transition-all duration-300"
                                style={{ width: `${debtPercentage}%` }}
                            />
                        </div>
                        {remaining > 0 && (
                            <div className="text-xs text-ghost-400">
                                {formatGoalCurrency(remaining)} remaining
                            </div>
                        )}
                    </div>
                );

            default:
                // Fallback for unknown goal types
                return (
                    <span className="text-xs bg-gold/20 text-gold px-2 py-0.5 rounded">
                        {getGoalLabel(goalType)}
                    </span>
                );
        }
    };

    return (
        <div className="min-w-[140px]">
            {renderGoalContent()}
        </div>
    );
}
