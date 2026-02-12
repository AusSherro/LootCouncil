import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface BackupData {
    exportVersion: string;
    exportedAt: string;
    app: string;
    data: {
        accounts: unknown[];
        categoryGroups: unknown[];
        categories: unknown[];
        transactions: unknown[];
        monthlyBudgets: unknown[];
        payees: unknown[];
        transfers: unknown[];
        assets: unknown[];
        exchangeRates: unknown[];
        settings: unknown;
    };
}

// POST - Restore from backup JSON
export async function POST(request: NextRequest) {
    try {
        const backup: BackupData = await request.json();

        // Validate backup structure
        if (!backup.exportVersion || !backup.data) {
            return NextResponse.json(
                { error: 'Invalid backup file format' },
                { status: 400 }
            );
        }

        if (backup.app !== 'Loot Council') {
            return NextResponse.json(
                { error: 'This backup was not created by Loot Council' },
                { status: 400 }
            );
        }

        const { data } = backup;
        const stats = {
            accounts: 0,
            categories: 0,
            transactions: 0,
            assets: 0,
            restored: true,
        };

        // Clear existing data in reverse dependency order
        await prisma.$transaction([
            prisma.subTransaction.deleteMany(),
            prisma.transaction.deleteMany(),
            prisma.monthlyBudget.deleteMany(),
            prisma.category.deleteMany(),
            prisma.categoryGroup.deleteMany(),
            prisma.account.deleteMany(),
            prisma.payee.deleteMany(),
            prisma.transfer.deleteMany(),
            prisma.assetLot.deleteMany(),
            prisma.asset.deleteMany(),
            prisma.exchangeRate.deleteMany(),
        ]);

        // Restore category groups
        if (data.categoryGroups?.length) {
            for (const group of data.categoryGroups as { id: string; name: string; sortOrder?: number; isHidden?: boolean }[]) {
                await prisma.categoryGroup.create({
                    data: {
                        id: group.id,
                        name: group.name,
                        sortOrder: group.sortOrder || 0,
                        isHidden: group.isHidden || false,
                    },
                });
            }
        }

        // Restore categories
        if (data.categories?.length) {
            for (const cat of data.categories as { 
                id: string; 
                name: string; 
                groupId: string;
                goalType?: string;
                goalTarget?: number;
                goalDueDate?: string;
                sortOrder?: number;
                isHidden?: boolean;
                rolloverType?: string;
                goalPercentageComplete?: number;
                goalUnderFunded?: number;
                goalOverallFunded?: number;
                goalOverallLeft?: number;
            }[]) {
                await prisma.category.create({
                    data: {
                        id: cat.id,
                        name: cat.name,
                        groupId: cat.groupId,
                        goalType: cat.goalType,
                        goalTarget: cat.goalTarget,
                        goalDueDate: cat.goalDueDate ? new Date(cat.goalDueDate) : null,
                        sortOrder: cat.sortOrder || 0,
                        isHidden: cat.isHidden || false,
                        rolloverType: cat.rolloverType || 'available',
                        goalPercentageComplete: cat.goalPercentageComplete,
                        goalUnderFunded: cat.goalUnderFunded,
                        goalOverallFunded: cat.goalOverallFunded,
                        goalOverallLeft: cat.goalOverallLeft,
                    },
                });
                stats.categories++;
            }
        }

        // Restore accounts
        if (data.accounts?.length) {
            for (const acc of data.accounts as {
                id: string;
                name: string;
                type: string;
                onBudget?: boolean;
                balance?: number;
                clearedBalance?: number;
                closed?: boolean;
                lastReconciled?: string;
            }[]) {
                await prisma.account.create({
                    data: {
                        id: acc.id,
                        name: acc.name,
                        type: acc.type,
                        onBudget: acc.onBudget ?? true,
                        balance: acc.balance || 0,
                        clearedBalance: acc.clearedBalance || 0,
                        closed: acc.closed || false,
                        lastReconciled: acc.lastReconciled ? new Date(acc.lastReconciled) : null,
                    },
                });
                stats.accounts++;
            }
        }

        // Restore transactions
        if (data.transactions?.length) {
            for (const t of data.transactions as {
                id: string;
                date: string;
                amount: number;
                payee?: string;
                memo?: string;
                accountId: string;
                categoryId?: string;
                cleared?: boolean;
                approved?: boolean;
                isReconciled?: boolean;
                isSplit?: boolean;
                transferId?: string;
            }[]) {
                await prisma.transaction.create({
                    data: {
                        id: t.id,
                        date: new Date(t.date),
                        amount: t.amount,
                        payee: t.payee,
                        memo: t.memo,
                        accountId: t.accountId,
                        categoryId: t.categoryId,
                        cleared: t.cleared || false,
                        approved: t.approved ?? true,
                        isReconciled: t.isReconciled || false,
                        isSplit: t.isSplit || false,
                        transferId: t.transferId,
                    },
                });
                stats.transactions++;
            }
        }

        // Restore monthly budgets
        if (data.monthlyBudgets?.length) {
            for (const mb of data.monthlyBudgets as {
                id: string;
                month: string;
                categoryId: string;
                assigned?: number;
                activity?: number;
                available?: number;
            }[]) {
                await prisma.monthlyBudget.create({
                    data: {
                        id: mb.id,
                        month: mb.month,
                        categoryId: mb.categoryId,
                        assigned: mb.assigned || 0,
                        activity: mb.activity || 0,
                        available: mb.available || 0,
                    },
                });
            }
        }

        // Restore payees
        if (data.payees?.length) {
            for (const p of data.payees as {
                id: string;
                name: string;
                ynabId?: string;
                transferAccountId?: string;
            }[]) {
                await prisma.payee.create({
                    data: {
                        id: p.id,
                        name: p.name,
                        ynabId: p.ynabId,
                        transferAccountId: p.transferAccountId,
                    },
                });
            }
        }

        // Restore transfers
        if (data.transfers?.length) {
            for (const t of data.transfers as {
                id: string;
                amount: number;
                date: string;
                memo?: string;
                sourceAccountId: string;
                destinationAccountId: string;
                sourceTransactionId?: string;
                destTransactionId?: string;
            }[]) {
                await prisma.transfer.create({
                    data: {
                        id: t.id,
                        amount: t.amount,
                        date: new Date(t.date),
                        memo: t.memo,
                        sourceAccountId: t.sourceAccountId,
                        destinationAccountId: t.destinationAccountId,
                        sourceTransactionId: t.sourceTransactionId,
                        destTransactionId: t.destTransactionId,
                    },
                });
            }
        }

        // Restore assets
        if (data.assets?.length) {
            for (const a of data.assets as {
                id: string;
                symbol: string;
                name: string;
                assetClass: string;
                currency?: string;
                quantity?: number;
                costBasis?: number;
                currentPrice?: number;
                isManual?: boolean;
                annualDividend?: number;
                dividendYield?: number;
                stakingYield?: number;
            }[]) {
                await prisma.asset.create({
                    data: {
                        id: a.id,
                        symbol: a.symbol,
                        name: a.name,
                        assetClass: a.assetClass,
                        currency: a.currency || 'AUD',
                        quantity: a.quantity || 1,
                        costBasis: a.costBasis || 0,
                        currentPrice: a.currentPrice || 0,
                        isManual: a.isManual || false,
                        annualDividend: a.annualDividend || 0,
                        dividendYield: a.dividendYield || 0,
                        stakingYield: a.stakingYield || 0,
                    },
                });
                stats.assets++;
            }
        }

        // Restore exchange rates
        if (data.exchangeRates?.length) {
            for (const er of data.exchangeRates as {
                id: string;
                fromCurrency: string;
                toCurrency: string;
                rate: number;
                lastUpdated?: string;
            }[]) {
                await prisma.exchangeRate.create({
                    data: {
                        id: er.id,
                        fromCurrency: er.fromCurrency,
                        toCurrency: er.toCurrency,
                        rate: er.rate,
                        lastUpdated: er.lastUpdated ? new Date(er.lastUpdated) : new Date(),
                    },
                });
            }
        }

        // Restore settings (but preserve theme)
        if (data.settings) {
            const s = data.settings as {
                budgetName?: string;
                currency?: string;
                dateFormat?: string;
                startOfWeek?: number;
                toBeBudgeted?: number;
            };
            
            // Get existing theme  
            const existing = await prisma.settings.findUnique({ where: { id: 'default' } });
            
            await prisma.settings.upsert({
                where: { id: 'default' },
                create: {
                    id: 'default',
                    budgetName: s.budgetName || 'My Realm',
                    currency: s.currency || 'AUD',
                    dateFormat: s.dateFormat || 'DD/MM/YYYY',
                    startOfWeek: s.startOfWeek || 1,
                    toBeBudgeted: s.toBeBudgeted || 0,
                    theme: existing?.theme || 'dungeon',
                },
                update: {
                    budgetName: s.budgetName || 'My Realm',
                    currency: s.currency || 'AUD',
                    dateFormat: s.dateFormat || 'DD/MM/YYYY',
                    startOfWeek: s.startOfWeek || 1,
                    toBeBudgeted: s.toBeBudgeted || 0,
                },
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Backup restored successfully',
            stats,
            restoredFrom: backup.exportedAt,
        });
    } catch (error) {
        console.error('Restore error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: `Failed to restore backup: ${message}` }, { status: 500 });
    }
}
