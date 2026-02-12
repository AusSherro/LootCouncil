import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Export all data as JSON
export async function GET() {
    try {
        // Fetch all data from the database
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
            prisma.account.findMany(),
            prisma.categoryGroup.findMany(),
            prisma.category.findMany(),
            prisma.transaction.findMany({
                orderBy: { date: 'desc' },
            }),
            prisma.monthlyBudget.findMany(),
            prisma.payee.findMany(),
            prisma.transfer.findMany(),
            prisma.asset.findMany(),
            prisma.exchangeRate.findMany(),
            prisma.settings.findUnique({ where: { id: 'default' } }),
            // Don't export API keys for security
            prisma.apiIntegration.findMany({
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
