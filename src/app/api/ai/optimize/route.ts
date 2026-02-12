import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { optimizeBudget } from '@/lib/openai';

// GET - Get budget optimization suggestions
export async function GET(request: NextRequest) {
    try {
        // Check if OpenAI API key is configured
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ 
                recommendations: [],
                message: 'AI budget optimization requires an OpenAI API key. Add OPENAI_API_KEY to your environment variables.',
                noApiKey: true,
            });
        }

        const { searchParams } = new URL(request.url);
        const savingsGoal = parseFloat(searchParams.get('savingsGoal') || '0.2'); // Default 20%
        const priorities = searchParams.get('priorities')?.split(',') || [];

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get current month's budgets
        const budgets = await prisma.monthlyBudget.findMany({
            where: { month: currentMonth },
            include: { category: true },
        });

        // Get actual spending per category this month
        const transactions = await prisma.transaction.findMany({
            where: {
                date: { gte: startOfMonth },
                amount: { lt: 0 },
            },
            include: { category: true },
        });

        const categorySpending = new Map<string, number>();
        transactions.forEach(t => {
            if (t.category) {
                categorySpending.set(t.category.id, (categorySpending.get(t.category.id) || 0) + Math.abs(t.amount));
            }
        });

        // Combine budget and spending data
        const categories = budgets.map(b => ({
            name: b.category.name,
            assigned: b.assigned,
            spent: categorySpending.get(b.categoryId) || 0,
        }));

        // Get income from accounts (positive inflows this month)
        const incomeTransactions = await prisma.transaction.findMany({
            where: {
                date: { gte: startOfMonth },
                amount: { gt: 0 },
            },
        });
        const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);

        // Generate AI recommendations
        const recommendations = await optimizeBudget({
            categories,
            totalIncome,
            savingsGoal,
            priorities,
        });

        // Calculate potential savings
        const currentTotal = categories.reduce((sum, c) => sum + c.assigned, 0);
        const suggestedTotal = recommendations.reduce(
            (sum, r) => sum + r.suggestedAmount,
            currentTotal - recommendations.reduce((sum, r) => sum + r.currentAmount, 0)
        );

        return NextResponse.json({
            recommendations,
            summary: {
                totalIncome,
                currentBudgeted: currentTotal,
                suggestedBudgeted: suggestedTotal,
                potentialSavings: currentTotal - suggestedTotal,
                savingsGoal,
            },
        });
    } catch (error) {
        console.error('AI optimization error:', error);
        return NextResponse.json({ error: 'Failed to optimize budget' }, { status: 500 });
    }
}

// POST - Apply optimization suggestions
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { recommendations } = body; // Array of { categoryName, suggestedAmount }

        if (!recommendations?.length) {
            return NextResponse.json({ error: 'No recommendations provided' }, { status: 400 });
        }

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        let updated = 0;

        for (const rec of recommendations) {
            const { categoryName, suggestedAmount } = rec;

            // Find category
            const category = await prisma.category.findFirst({
                where: { name: categoryName },
            });

            if (!category) continue;

            // Update or create monthly budget
            const existing = await prisma.monthlyBudget.findUnique({
                where: {
                    month_categoryId: {
                        month: currentMonth,
                        categoryId: category.id,
                    },
                },
            });

            if (existing) {
                await prisma.monthlyBudget.update({
                    where: { id: existing.id },
                    data: { assigned: suggestedAmount },
                });
            } else {
                await prisma.monthlyBudget.create({
                    data: {
                        categoryId: category.id,
                        month: currentMonth,
                        assigned: suggestedAmount,
                    },
                });
            }
            updated++;
        }

        return NextResponse.json({
            message: `Updated ${updated} budget allocations`,
            updated,
        });
    } catch (error) {
        console.error('Apply optimization error:', error);
        return NextResponse.json({ error: 'Failed to apply optimizations' }, { status: 500 });
    }
}
