import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// DELETE - Clear only budget/YNAB data, preserve investments & integrations
export async function DELETE() {
    try {
        // Delete budget-related data in dependency order (children first)
        await prisma.subTransaction.deleteMany();
        await prisma.budgetTemplateItem.deleteMany();
        await prisma.budgetTemplate.deleteMany();
        await prisma.transactionRule.deleteMany();
        await prisma.scheduledTransaction.deleteMany();
        await prisma.transfer.deleteMany();
        await prisma.transaction.deleteMany();
        await prisma.monthlyBudget.deleteMany();
        await prisma.payee.deleteMany();
        await prisma.category.deleteMany();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.categoryGroup as any).deleteMany();
        await prisma.account.deleteMany();

        // Reset YNAB sync state but keep other settings
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.settings as any).updateMany({
            data: {
                toBeBudgeted: 0,
                lastYnabSync: null,
                ynabBudgetId: null,
                ynabServerKnowledge: 0,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error clearing budget data:', error);
        return NextResponse.json({ error: 'Failed to clear budget data' }, { status: 500 });
    }
}
