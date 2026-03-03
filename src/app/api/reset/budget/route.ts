import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';

// DELETE - Clear only budget/YNAB data, preserve investments & integrations
export async function DELETE(request: NextRequest) {
    const profileId = await getProfileId(request);
    try {
        // Delete budget-related data in dependency order (children first) - scoped to profile
        await prisma.subTransaction.deleteMany({ where: { transaction: { account: { profileId } } } });
        await prisma.budgetTemplateItem.deleteMany({ where: { template: { profileId } } });
        await prisma.budgetTemplate.deleteMany({ where: { profileId } });
        await prisma.transactionRule.deleteMany({ where: { profileId } });
        await prisma.scheduledTransaction.deleteMany({ where: { profileId } });
        await prisma.transfer.deleteMany({ where: { profileId } });
        await prisma.transaction.deleteMany({ where: { account: { profileId } } });
        await prisma.monthlyBudget.deleteMany({ where: { category: { group: { profileId } } } });
        await prisma.payee.deleteMany({ where: { profileId } });
        await prisma.category.deleteMany({ where: { group: { profileId } } });
        await prisma.categoryGroup.deleteMany({ where: { profileId } });
        await prisma.account.deleteMany({ where: { profileId } });

        // Reset YNAB sync state but keep other settings
        await prisma.settings.updateMany({
            where: { profileId },
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
