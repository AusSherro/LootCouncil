import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function DELETE() {
    try {
        // Delete in order of dependency (children first)
        await prisma.subTransaction.deleteMany();
        await prisma.budgetTemplateItem.deleteMany();
        await prisma.budgetTemplate.deleteMany();
        await prisma.transactionRule.deleteMany();
        await prisma.scheduledTransaction.deleteMany();
        await prisma.transfer.deleteMany();
        await prisma.transaction.deleteMany();
        await prisma.monthlyBudget.deleteMany();
        await prisma.payee.deleteMany();
        await prisma.asset.deleteMany();
        await prisma.category.deleteMany();
        await prisma.categoryGroup.deleteMany();
        await prisma.account.deleteMany();
        await prisma.exchangeRate.deleteMany();
        await prisma.apiIntegration.deleteMany();

        // Reset settings toBeBudgeted
        await prisma.settings.updateMany({
            data: { toBeBudgeted: 0 },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error resetting data:', error);
        return NextResponse.json({ error: 'Failed to reset data' }, { status: 500 });
    }
}
