import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateInsights } from '@/lib/openai';

// GET - Generate spending insights
export async function GET() {
    try {        // Check if OpenAI API key is configured
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ 
                insights: [{
                    type: 'tip',
                    title: 'AI Insights Unavailable',
                    description: 'Add an OPENAI_API_KEY to your environment variables to unlock AI-powered spending insights and personalized recommendations.',
                    emoji: '🔮'
                }],
                noApiKey: true,
            });
        }
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // Get current month transactions
        const currentMonthTx = await prisma.transaction.findMany({
            where: {
                date: { gte: startOfMonth },
            },
            include: { category: true },
        });

        // Get last month transactions
        const lastMonthTx = await prisma.transaction.findMany({
            where: {
                date: { gte: startOfLastMonth, lte: endOfLastMonth },
            },
            include: { category: true },
        });

        // Calculate category spending for current month (EXCLUDE Uncategorized)
        const currentCatSpending = new Map<string, number>();
        let totalSpent = 0;
        let totalIncome = 0;

        currentMonthTx.forEach(t => {
            if (t.amount < 0) {
                // Only include if has a category
                if (t.category) {
                    currentCatSpending.set(t.category.name, (currentCatSpending.get(t.category.name) || 0) + Math.abs(t.amount));
                }
                totalSpent += Math.abs(t.amount);
            } else {
                totalIncome += t.amount;
            }
        });

        // Calculate category spending for last month (EXCLUDE Uncategorized)
        const lastCatSpending = new Map<string, number>();
        lastMonthTx.forEach(t => {
            if (t.amount < 0 && t.category) {
                lastCatSpending.set(t.category.name, (lastCatSpending.get(t.category.name) || 0) + Math.abs(t.amount));
            }
        });

        const currentMonth = Array.from(currentCatSpending.entries())
            .map(([category, amount]) => ({ category, amount }))
            .sort((a, b) => b.amount - a.amount);

        const previousMonth = Array.from(lastCatSpending.entries())
            .map(([category, amount]) => ({ category, amount }))
            .sort((a, b) => b.amount - a.amount);

        // Find unusual transactions (outliers)
        const avgTransaction = totalSpent / Math.max(currentMonthTx.filter(t => t.amount < 0).length, 1);
        const unusualTransactions = currentMonthTx
            .filter(t => t.amount < 0 && Math.abs(t.amount) > avgTransaction * 3)
            .map(t => ({ payee: t.payee || 'Unknown', amount: t.amount }))
            .slice(0, 5);

        // Calculate savings rate
        const savingsRate = totalIncome > 0 ? (totalIncome - totalSpent) / totalIncome : 0;

        // Generate AI insights
        const insights = await generateInsights({
            currentMonth,
            previousMonth,
            totalSpent,
            totalIncome,
            savingsRate,
            unusualTransactions,
        });

        return NextResponse.json({
            insights,
            summary: {
                totalSpent,
                totalIncome,
                savingsRate,
                topCategory: currentMonth[0]?.category || 'None',
            },
        });
    } catch (error) {
        console.error('AI insights error:', error);
        return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
    }
}
