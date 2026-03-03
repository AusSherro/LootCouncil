import OpenAI from 'openai';

// Initialize OpenAI client with API key guard
if (!process.env.OPENAI_API_KEY) {
    console.warn('[Loot Council] OPENAI_API_KEY not set — AI features (categorization, advisor, insights) will be unavailable.');
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
});

export interface SpendingInsight {
    type: 'warning' | 'success' | 'tip' | 'trend';
    title: string;
    description: string;
    emoji: string;
}

export interface BudgetRecommendation {
    categoryName: string;
    currentAmount: number;
    suggestedAmount: number;
    reasoning: string;
}

// Financial advisor chat
export async function chatWithAdvisor(
    message: string,
    context: {
        netWorth: number;
        monthlyIncome: number;
        monthlyExpenses: number;
        topCategories: { name: string; amount: number }[];
        recentTransactions: { payee: string; amount: number; category: string }[];
    }
): Promise<string> {
    const systemPrompt = `You are the Loot Council Wizard, a wise and friendly financial advisor in a budgeting app. You speak with a fun fantasy RPG flair while giving practical financial advice.

User's Financial Stats:
- Net Worth: $${(context.netWorth / 100).toLocaleString()}
- Monthly Income: $${(context.monthlyIncome / 100).toLocaleString()}
- Monthly Expenses: $${(context.monthlyExpenses / 100).toLocaleString()}
- Top Spending Categories: ${context.topCategories.map(c => `${c.name}: $${(c.amount / 100).toFixed(0)}`).join(', ')}
- Recent Transactions: ${context.recentTransactions.slice(0, 5).map(t => `${t.payee}: $${(Math.abs(t.amount) / 100).toFixed(2)}`).join(', ')}

Guidelines:
- Be encouraging and supportive
- Give specific, actionable advice based on their data
- Keep responses concise but helpful (2-3 paragraphs max)
- If they ask something unrelated to finance, gently redirect
- Celebrate their wins!`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message },
            ],
            temperature: 0.7,
            max_tokens: 500,
        });

        return response.choices[0]?.message?.content || "The crystal ball is cloudy... try again, adventurer!";
    } catch (error) {
        console.error('OpenAI chat error:', error);
        return "Alas, the magic fades... The wizard needs a moment to recover. (API error)";
    }
}

// Generate spending insights
export async function generateInsights(context: {
    currentMonth: { category: string; amount: number }[];
    previousMonth: { category: string; amount: number }[];
    totalSpent: number;
    totalIncome: number;
    savingsRate: number;
    unusualTransactions: { payee: string; amount: number }[];
}): Promise<SpendingInsight[]> {
    const prompt = `Analyze this user's spending and generate 3-5 actionable insights.

Current Month Spending:
${context.currentMonth.map(c => `- ${c.category}: $${(c.amount / 100).toFixed(0)}`).join('\n')}

Previous Month Spending:
${context.previousMonth.map(c => `- ${c.category}: $${(c.amount / 100).toFixed(0)}`).join('\n')}

Stats:
- Total spent this month: $${(context.totalSpent / 100).toFixed(0)}
- Total income: $${(context.totalIncome / 100).toFixed(0)}
- Savings rate: ${(context.savingsRate * 100).toFixed(1)}%
- Unusual transactions: ${context.unusualTransactions.map(t => `${t.payee}: $${(Math.abs(t.amount) / 100).toFixed(0)}`).join(', ') || 'None'}

Generate insights as JSON array:
[{
    "type": "warning|success|tip|trend",
    "title": "Short title",
    "description": "2-3 sentence insight with specific advice",
    "emoji": "relevant emoji"
}, ...]

Types:
- warning: overspending, concerning trends
- success: good habits, improvements
- tip: actionable suggestions
- trend: interesting patterns`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 800,
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('No valid JSON array');
    } catch (error) {
        console.error('OpenAI insights error:', error);
        return [];
    }
}

// Budget optimization suggestions
export async function optimizeBudget(context: {
    categories: { name: string; assigned: number; spent: number }[];
    totalIncome: number;
    savingsGoal: number;
    priorities: string[];
}): Promise<BudgetRecommendation[]> {
    const prompt = `You are a budget optimization AI. Suggest optimal budget allocations.

Current Budget:
${context.categories.map(c => `- ${c.name}: Assigned $${(c.assigned / 100).toFixed(0)}, Spent $${(c.spent / 100).toFixed(0)}`).join('\n')}

Context:
- Monthly income: $${(context.totalIncome / 100).toFixed(0)}
- Savings goal: ${(context.savingsGoal * 100).toFixed(0)}% of income
- User priorities: ${context.priorities.join(', ') || 'None specified'}

Suggest optimized amounts. Consider:
- 50/30/20 rule (needs/wants/savings)
- Categories that are over/under-utilized
- Realistic adjustments (not drastic changes)

Respond with JSON array:
[{
    "categoryName": "Category",
    "currentAmount": 10000,
    "suggestedAmount": 8000,
    "reasoning": "Brief explanation"
}, ...]

Amounts in cents. Only include categories that should change.`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 800,
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('No valid JSON array');
    } catch (error) {
        console.error('OpenAI budget optimization error:', error);
        return [];
    }
}
