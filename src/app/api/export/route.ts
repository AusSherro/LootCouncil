import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';

// GET - Export all data as JSON
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    try {
        // Fetch all data for this profile
        const [
            accounts,
            categoryGroups,
            categories,
            transactions,
            monthlyBudgets,
            payees,
            transfers,
            assets,
            exchangeRates,
            settings,
            apiIntegrations,
        ] = await Promise.all([
            prisma.account.findMany({ where: { profileId } }),
            prisma.categoryGroup.findMany({ where: { profileId } }),
            prisma.category.findMany({ where: { group: { profileId } } }),
            prisma.transaction.findMany({
                where: { account: { profileId } },
                orderBy: { date: 'desc' },
            }),
            prisma.monthlyBudget.findMany({ where: { category: { group: { profileId } } } }),
            prisma.payee.findMany({ where: { profileId } }),
            prisma.transfer.findMany({ where: { profileId } }),
            prisma.asset.findMany({ where: { profileId } }),
            prisma.exchangeRate.findMany(),
            prisma.settings.findFirst({ where: { profileId } }),
            prisma.apiIntegration.findMany({
                where: { profileId },
                select: { id: true, provider: true, enabled: true, lastSynced: true },
            }),
        ]);

        const exportData = {
            exportVersion: '1.0',
            exportedAt: new Date().toISOString(),
            app: 'Loot Council',
            data: {
                accounts,
                categoryGroups,
                categories,
                transactions,
                monthlyBudgets,
                payees,
                transfers,
                assets,
                exchangeRates,
                settings: settings ? {
                    ...settings,
                    // Don't include any sensitive data
                } : null,
                // Only export integration metadata, not credentials
                integrations: apiIntegrations,
            },
            stats: {
                accountCount: accounts.length,
                categoryCount: categories.length,
                transactionCount: transactions.length,
                assetCount: assets.length,
            },
        };

        // Return as downloadable JSON file
        return new NextResponse(JSON.stringify(exportData, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="loot-council-backup-${new Date().toISOString().split('T')[0]}.json"`,
            },
        });
    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
    }
}
