import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { chatWithAdvisor } from '@/lib/openai';

// POST - Chat with financial advisor
export async function POST(request: NextRequest) {
    try {
        // Check if OpenAI API key is configured
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({
                response: "Greetings, adventurer! The Wizard's crystal ball requires an OpenAI API key to function. Add OPENAI_API_KEY to your environment variables to unlock AI-powered insights!",
                context: { noApiKey: true },
            });
        }

        const body = await request.json();
        const { message } = body;

        if (!message?.trim()) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // Gather context for the AI
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get accounts for net worth
        const accounts = await prisma.account.findMany();
        const netWorth = accounts.reduce((sum, a) => sum + a.balance, 0);

        // Get this month's transactions
        const monthlyTransactions = await prisma.transaction.findMany({
            where: {
                date: { gte: startOfMonth },
            },
            include: { category: true },
        });

        // Calculate income and expenses
        const monthlyIncome = monthlyTransactions
            .filter(t => t.amount > 0)
            .reduce((sum, t) => sum + t.amount, 0);
        
        const monthlyExpenses = monthlyTransactions
            .filter(t => t.amount < 0)
            .reduce((sum, t) => sum + Math.abs(t.amount), 0);

        // Top categories by spending (EXCLUDE Uncategorized)
        const categorySpending = new Map<string, number>();
        monthlyTransactions
            .filter(t => t.amount < 0 && t.category) // Must have category
            .forEach(t => {
                categorySpending.set(t.category!.name, (categorySpending.get(t.category!.name) || 0) + Math.abs(t.amount));
            });
        
        const topCategories = Array.from(categorySpending.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, amount]) => ({ name, amount }));

        // Recent transactions (show category or Uncategorized for display)
        const recentTransactions = monthlyTransactions
            .slice(-10)
            .map(t => ({
                payee: t.payee || 'Unknown',
                amount: t.amount,
                category: t.category?.name || 'Uncategorized',
            }));

        // Chat with advisor
        const response = await chatWithAdvisor(message, {
            netWorth,
            monthlyIncome,
            monthlyExpenses,
            topCategories,
            recentTransactions,
        });

        return NextResponse.json({
            response,
            context: {
                netWorth,
                monthlyIncome,
                monthlyExpenses,
                topCategories: topCategories.slice(0, 3),
            },
        });
    } catch (error) {
        console.error('AI chat error:', error);
        return NextResponse.json({ error: 'Failed to get advisor response' }, { status: 500 });
    }
}
