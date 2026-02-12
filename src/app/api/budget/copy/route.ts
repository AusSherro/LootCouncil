import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST - Copy budget from one month to another
export async function POST(request: NextRequest) {
    try {
        const { sourceMonth, targetMonth } = await request.json();

        if (!sourceMonth || !targetMonth) {
            return NextResponse.json({ error: 'Missing source or target month' }, { status: 400 });
        }

        // Get source month's budgets
        const sourceBudgets = await prisma.monthlyBudget.findMany({
            where: { month: sourceMonth },
        });

        if (sourceBudgets.length === 0) {
            return NextResponse.json({ 
                error: 'No budgets found in source month',
                copied: 0 
            }, { status: 400 });
        }

        // Upsert each budget to target month
        let copied = 0;
        for (const budget of sourceBudgets) {
            await prisma.monthlyBudget.upsert({
                where: {
                    month_categoryId: {
                        categoryId: budget.categoryId,
                        month: targetMonth,
                    },
                },
                update: { assigned: budget.assigned },
                create: {
                    categoryId: budget.categoryId,
                    month: targetMonth,
                    assigned: budget.assigned,
                },
            });
            copied++;
        }

        return NextResponse.json({
            success: true,
            copied,
            message: `Copied ${copied} budget assignments from ${sourceMonth} to ${targetMonth}`,
        });
    } catch (error) {
        console.error('Copy budget error:', error);
        return NextResponse.json({ error: 'Failed to copy budget' }, { status: 500 });
    }
}
