'use client';

import { formatCurrency } from '@/lib/utils';
import { Wand2, TrendingUp, TrendingDown, AlertTriangle, ArrowRight, PiggyBank, Undo2 } from 'lucide-react';

interface BudgetFlowBarProps {
  /** Total income/inflow for the month (cents) */
  totalIncome: number;
  /** Total assigned to categories (cents) */
  assigned: number;
  /** Ready to assign — unallocated money (cents, can be negative) */
  readyToAssign: number;
  /** Total activity/spending (cents, typically negative) */
  activity: number;
  /** Total overspent across categories (cents, positive value) */
  overspentTotal: number;
  /** Number of overspent categories */
  overspentCount: number;
  /** Auto-assign handler */
  onAutoAssign?: () => void;
  /** Whether auto-assign is in progress */
  autoAssigning?: boolean;
  /** Undo last auto-assign (only available when there's something to undo) */
  onUndoAutoAssign?: () => void;
}

export default function BudgetFlowBar({
  totalIncome,
  assigned,
  readyToAssign,
  activity,
  overspentTotal,
  overspentCount,
  onAutoAssign,
  autoAssigning,
  onUndoAutoAssign,
}: BudgetFlowBarProps) {
  // Calculate percentages for the stacked bar
  // The bar represents the total funding pool
  const isOverAssigned = readyToAssign < 0;
  const absReadyToAssign = Math.abs(readyToAssign);

  // Total pool for bar width calculation
  // When over-assigned, the bar shows assigned exceeding the pool
  const totalPool = isOverAssigned
    ? assigned // assigned exceeds income
    : assigned + readyToAssign;

  // Segment widths as percentages
  const assignedPercent = totalPool > 0 ? (assigned / totalPool) * 100 : 0;
  const availablePercent = !isOverAssigned && totalPool > 0 ? (readyToAssign / totalPool) * 100 : 0;
  // Overspent is shown as an overlay/badge, not a bar segment, unless we want to show it
  // Actually let's show overspent as a segment that "eats into" the available/assigned
  const overspentPercent = totalPool > 0 ? (overspentTotal / totalPool) * 100 : 0;

  // For the stacked bar, show: [Assigned - Overspent] [Overspent] [Available]
  // If overspent, it visually shows a red chunk at the end of assigned
  const healthyAssignedPercent = Math.max(0, assignedPercent - overspentPercent);
  const displayOverspentPercent = Math.min(overspentPercent, assignedPercent);

  // Ready to assign color
  const readyColor = readyToAssign < 0
    ? 'text-danger'
    : readyToAssign > 0
      ? 'text-positive'
      : 'text-gold';

  const readyBgColor = readyToAssign < 0
    ? 'bg-danger/10 border-danger/30'
    : readyToAssign > 0
      ? 'bg-positive/10 border-positive/30'
      : 'bg-gold/10 border-gold/30';

  return (
    <div className="card border-gold/20 p-5">
      {/* Top row: Ready to Assign hero + key stats */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className={`px-4 py-2 rounded-xl border ${readyBgColor}`}>
            <p className="text-xs text-neutral mb-0.5 uppercase tracking-wide">Ready to Assign</p>
            <p className={`text-2xl font-bold tabular-nums ${readyColor}`}>
              {formatCurrency(readyToAssign)}
            </p>
          </div>

          {readyToAssign > 0 && onAutoAssign && (
            <button
              onClick={onAutoAssign}
              disabled={autoAssigning}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gold hover:text-gold-light bg-gold/10 hover:bg-gold/20 rounded-lg transition-colors disabled:opacity-50"
              title="Auto-assign to goals"
            >
              <Wand2 className={`w-4 h-4 ${autoAssigning ? 'animate-spin' : ''}`} />
              {autoAssigning ? 'Assigning...' : 'Auto-Assign'}
            </button>
          )}

          {onUndoAutoAssign && (
            <button
              onClick={onUndoAutoAssign}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-ghost-400 hover:text-warning bg-midnight-700 hover:bg-midnight-600 rounded-lg transition-colors"
              title="Undo last auto-assign"
            >
              <Undo2 className="w-4 h-4" />
              Undo
            </button>
          )}
        </div>

        {/* Flow narrative: Income → Assigned → Spent */}
        <div className="flex items-center gap-6 text-sm">
          <div className="text-right">
            <p className="text-neutral text-xs uppercase tracking-wide">Income</p>
            <p className="font-semibold text-foreground tabular-nums flex items-center gap-1 justify-end">
              <TrendingUp className="w-3.5 h-3.5 text-positive" />
              {formatCurrency(totalIncome)}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-neutral/40" />
          <div className="text-right">
            <p className="text-neutral text-xs uppercase tracking-wide">Assigned</p>
            <p className="font-semibold text-gold tabular-nums">{formatCurrency(assigned)}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-neutral/40" />
          <div className="text-right">
            <p className="text-neutral text-xs uppercase tracking-wide">Spent</p>
            <p className={`font-semibold tabular-nums ${activity < 0 ? 'text-danger' : 'text-foreground'} flex items-center gap-1 justify-end`}>
              <TrendingDown className="w-3.5 h-3.5 text-danger" />
              {formatCurrency(activity)}
            </p>
          </div>
        </div>
      </div>

      {/* Stacked Bar */}
      {totalPool > 0 && (
        <div className="mb-3">
          <div className="h-5 rounded-lg overflow-hidden flex bg-background-tertiary relative group">
            {/* Healthy assigned segment */}
            {healthyAssignedPercent > 0 && (
              <div
                className="h-full bg-gold/80 transition-all duration-500 ease-out relative group/seg"
                style={{ width: `${healthyAssignedPercent}%` }}
                title={`Assigned: ${formatCurrency(assigned - overspentTotal)}`}
              >
                {healthyAssignedPercent > 15 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-background/80">
                    Assigned
                  </span>
                )}
              </div>
            )}

            {/* Overspent segment (red chunk within assigned) */}
            {displayOverspentPercent > 0 && (
              <div
                className="h-full bg-danger/80 transition-all duration-500 ease-out relative"
                style={{ width: `${displayOverspentPercent}%` }}
                title={`Overspent: ${formatCurrency(overspentTotal)} across ${overspentCount} ${overspentCount === 1 ? 'category' : 'categories'}`}
              >
                {displayOverspentPercent > 12 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white/80">
                    Overspent
                  </span>
                )}
              </div>
            )}

            {/* Available / Ready to Assign segment */}
            {availablePercent > 0 && (
              <div
                className="h-full bg-positive/60 transition-all duration-500 ease-out relative"
                style={{ width: `${availablePercent}%` }}
                title={`Ready to Assign: ${formatCurrency(readyToAssign)}`}
              >
                {availablePercent > 12 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-background/80">
                    Available
                  </span>
                )}
              </div>
            )}

            {/* Over-assigned indicator */}
            {isOverAssigned && (
              <div
                className="h-full bg-danger/40 transition-all duration-500 ease-out flex-shrink-0"
                style={{ width: '4px', minWidth: '4px' }}
                title={`Over-assigned by ${formatCurrency(absReadyToAssign)}`}
              />
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-5 flex-wrap">
        {/* Assigned */}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-gold/80" />
          <span className="text-xs text-neutral">
            Assigned{' '}
            <span className="text-foreground font-medium tabular-nums">
              {formatCurrency(assigned)}
            </span>
            {totalPool > 0 && (
              <span className="text-neutral/60 ml-1">
                ({assignedPercent.toFixed(0)}%)
              </span>
            )}
          </span>
        </div>

        {/* Overspent */}
        {overspentTotal > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-danger/80" />
            <span className="text-xs text-neutral flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-danger" />
              Overspent{' '}
              <span className="text-danger font-medium tabular-nums">
                {formatCurrency(overspentTotal)}
              </span>
              <span className="text-neutral/60">
                ({overspentCount} {overspentCount === 1 ? 'category' : 'categories'})
              </span>
            </span>
          </div>
        )}

        {/* Available */}
        {readyToAssign > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-positive/60" />
            <span className="text-xs text-neutral">
              Available{' '}
              <span className="text-positive font-medium tabular-nums">
                {formatCurrency(readyToAssign)}
              </span>
              {totalPool > 0 && (
                <span className="text-neutral/60 ml-1">
                  ({availablePercent.toFixed(0)}%)
                </span>
              )}
            </span>
          </div>
        )}

        {/* Over-assigned warning */}
        {isOverAssigned && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-danger/40" />
            <span className="text-xs text-danger flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Over-assigned by{' '}
              <span className="font-medium tabular-nums">
                {formatCurrency(absReadyToAssign)}
              </span>
            </span>
          </div>
        )}

        {/* Fully assigned badge */}
        {readyToAssign === 0 && !isOverAssigned && (
          <div className="flex items-center gap-2">
            <PiggyBank className="w-3.5 h-3.5 text-gold" />
            <span className="text-xs text-gold font-medium">
              Every dollar has a job!
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
