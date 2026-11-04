import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';

interface BackupData {
    exportVersion: string;
    exportedAt: string;
    app: string;
    data: {
        accounts?: unknown[];
        categoryGroups?: unknown[];
        categories?: unknown[];
        transactions?: unknown[];
        subTransactions?: unknown[];
        monthlyBudgets?: unknown[];
        payees?: unknown[];
        transfers?: unknown[];
        assets?: unknown[];
        assetLots?: unknown[];
        allocationTargets?: unknown[];
        fireSettings?: unknown;
        scheduledTransactions?: unknown[];
        transactionRules?: unknown[];
        budgetTemplates?: unknown[];
        exchangeRates?: unknown[];
        settings?: unknown;
    };
}

// POST - Restore from backup JSON
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
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

        await prisma.$transaction(async (tx) => {
            // Clear existing data for this profile in reverse dependency order
            await tx.subTransaction.deleteMany({ where: { transaction: { account: { profileId } } } });
            await tx.transaction.deleteMany({ where: { account: { profileId } } });
            await tx.monthlyBudget.deleteMany({ where: { category: { group: { profileId } } } });
            await tx.budgetTemplateItem.deleteMany({ where: { template: { profileId } } });
            await tx.budgetTemplate.deleteMany({ where: { profileId } });
            await tx.scheduledTransaction.deleteMany({ where: { profileId } });
            await tx.transactionRule.deleteMany({ where: { profileId } });
            await tx.category.deleteMany({ where: { group: { profileId } } });
            await tx.categoryGroup.deleteMany({ where: { profileId } });
            await tx.account.deleteMany({ where: { profileId } });
            await tx.payee.deleteMany({ where: { profileId } });
            await tx.transfer.deleteMany({ where: { profileId } });
            await tx.assetLot.deleteMany({ where: { asset: { profileId } } });
            await tx.asset.deleteMany({ where: { profileId } });
            await tx.allocationTarget.deleteMany({ where: { profileId } });
            await tx.fireSettings.deleteMany({ where: { profileId } });

            const groupIdMap = new Map<string, string>();
            const categoryIdMap = new Map<string, string>();
            const accountIdMap = new Map<string, string>();
            const transactionIdMap = new Map<string, string>();
            const transferIdMap = new Map<string, string>();
            const assetIdMap = new Map<string, string>();

            // Restore category groups
            if (data.categoryGroups?.length) {
                for (const group of data.categoryGroups as { id: string; name: string; sortOrder?: number; isHidden?: boolean; ynabId?: string }[]) {
                    const created = await tx.categoryGroup.create({
                        data: {
                            name: group.name,
                            sortOrder: group.sortOrder || 0,
                            isHidden: group.isHidden || false,
                            ynabId: group.ynabId || null,
                            profileId,
                        },
                    });
                    groupIdMap.set(group.id, created.id);
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
                    rolloverCap?: number;
                    ynabId?: string;
                    goalPercentageComplete?: number;
                    goalUnderFunded?: number;
                    goalOverallFunded?: number;
                    goalOverallLeft?: number;
                    goalCadence?: number;
                    goalCadenceFrequency?: number;
                    goalDay?: number;
                }[]) {
                    const mappedGroupId = groupIdMap.get(cat.groupId);
                    if (!mappedGroupId) continue;

                    const created = await tx.category.create({
                        data: {
                            name: cat.name,
                            groupId: mappedGroupId,
                            goalType: cat.goalType ?? null,
                            goalTarget: cat.goalTarget ?? null,
                            goalDueDate: cat.goalDueDate ? new Date(cat.goalDueDate) : null,
                            sortOrder: cat.sortOrder || 0,
                            isHidden: cat.isHidden || false,
                            rolloverType: cat.rolloverType || 'available',
                            rolloverCap: cat.rolloverCap ?? null,
                            ynabId: cat.ynabId ?? null,
                            goalPercentageComplete: cat.goalPercentageComplete ?? null,
                            goalUnderFunded: cat.goalUnderFunded ?? null,
                            goalOverallFunded: cat.goalOverallFunded ?? null,
                            goalOverallLeft: cat.goalOverallLeft ?? null,
                            goalCadence: cat.goalCadence ?? null,
                            goalCadenceFrequency: cat.goalCadenceFrequency ?? null,
                            goalDay: cat.goalDay ?? null,
                        },
                    });
                    categoryIdMap.set(cat.id, created.id);
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
                    ynabId?: string;
                }[]) {
                    const created = await tx.account.create({
                        data: {
                            name: acc.name,
                            type: acc.type,
                            onBudget: acc.onBudget ?? true,
                            balance: acc.balance || 0,
                            clearedBalance: acc.clearedBalance || 0,
                            closed: acc.closed || false,
                            lastReconciled: acc.lastReconciled ? new Date(acc.lastReconciled) : null,
                            ynabId: acc.ynabId ?? null,
                            profileId,
                        },
                    });
                    accountIdMap.set(acc.id, created.id);
                    stats.accounts++;
                }

                // Second pass for linkedAccountId on credit cards
                for (const acc of data.accounts as { id: string; linkedAccountId?: string }[]) {
                    if (acc.linkedAccountId) {
                        const newAccId = accountIdMap.get(acc.id);
                        const newLinkedId = accountIdMap.get(acc.linkedAccountId);
                        if (newAccId && newLinkedId) {
                            await tx.account.update({
                                where: { id: newAccId },
                                data: { linkedAccountId: newLinkedId },
                            });
                        }
                    }
                }
            }

            // Restore transfers first so transferIdMap is populated for transactions
            if (data.transfers?.length) {
                for (const t of data.transfers as {
                    id: string;
                    amount: number;
                    date: string;
                    memo?: string;
                    sourceAccountId: string;
                    destinationAccountId: string;
                }[]) {
                    const mappedSource = accountIdMap.get(t.sourceAccountId) || t.sourceAccountId;
                    const mappedDest = accountIdMap.get(t.destinationAccountId) || t.destinationAccountId;
                    const created = await tx.transfer.create({
                        data: {
                            amount: t.amount,
                            date: new Date(t.date),
                            memo: t.memo ?? null,
                            sourceAccountId: mappedSource,
                            destinationAccountId: mappedDest,
                            profileId,
                        },
                    });
                    transferIdMap.set(t.id, created.id);
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
                    ynabId?: string;
                    subTransactions?: { categoryId?: string; amount: number; memo?: string }[];
                }[]) {
                    const mappedAccountId = accountIdMap.get(t.accountId);
                    if (!mappedAccountId) continue;
                    const mappedCategoryId = t.categoryId ? (categoryIdMap.get(t.categoryId) ?? null) : null;
                    const mappedTransferId = t.transferId ? (transferIdMap.get(t.transferId) ?? t.transferId) : null;

                    const created = await tx.transaction.create({
                        data: {
                            date: new Date(t.date),
                            amount: t.amount,
                            payee: t.payee ?? null,
                            memo: t.memo ?? null,
                            accountId: mappedAccountId,
                            categoryId: mappedCategoryId,
                            cleared: t.cleared || false,
                            approved: t.approved ?? true,
                            isReconciled: t.isReconciled || false,
                            isSplit: t.isSplit || false,
                            transferId: mappedTransferId,
                            ynabId: t.ynabId ?? null,
                        },
                    });
                    transactionIdMap.set(t.id, created.id);
                    stats.transactions++;

                    // If subTransactions were embedded inside the transaction object
                    if (t.subTransactions?.length && !data.subTransactions?.length) {
                        for (const sub of t.subTransactions) {
                            await tx.subTransaction.create({
                                data: {
                                    transactionId: created.id,
                                    categoryId: sub.categoryId ? (categoryIdMap.get(sub.categoryId) ?? null) : null,
                                    amount: sub.amount,
                                    memo: sub.memo ?? null,
                                },
                            });
                        }
                    }
                }
            }

            // Update transfer sourceTransactionId / destTransactionId links
            if (data.transfers?.length) {
                for (const t of data.transfers as {
                    id: string;
                    sourceTransactionId?: string;
                    destTransactionId?: string;
                }[]) {
                    const newTransferId = transferIdMap.get(t.id);
                    if (!newTransferId) continue;
                    const newSourceTxId = t.sourceTransactionId ? (transactionIdMap.get(t.sourceTransactionId) ?? null) : null;
                    const newDestTxId = t.destTransactionId ? (transactionIdMap.get(t.destTransactionId) ?? null) : null;
                    if (newSourceTxId || newDestTxId) {
                        await tx.transfer.update({
                            where: { id: newTransferId },
                            data: {
                                sourceTransactionId: newSourceTxId,
                                destTransactionId: newDestTxId,
                            },
                        });
                    }
                }
            }

            // Restore subTransactions
            if (data.subTransactions?.length) {
                for (const sub of data.subTransactions as {
                    transactionId: string;
                    categoryId?: string;
                    amount: number;
                    memo?: string;
                }[]) {
                    const mappedTxId = transactionIdMap.get(sub.transactionId);
                    if (!mappedTxId) continue;
                    const mappedCatId = sub.categoryId ? (categoryIdMap.get(sub.categoryId) ?? null) : null;
                    await tx.subTransaction.create({
                        data: {
                            transactionId: mappedTxId,
                            categoryId: mappedCatId,
                            amount: sub.amount,
                            memo: sub.memo ?? null,
                        },
                    });
                }
            }

            // Restore monthly budgets
            if (data.monthlyBudgets?.length) {
                for (const mb of data.monthlyBudgets as {
                    month: string;
                    categoryId: string;
                    assigned?: number;
                    activity?: number;
                    available?: number;
                }[]) {
                    const mappedCatId = categoryIdMap.get(mb.categoryId);
                    if (!mappedCatId) continue;
                    await tx.monthlyBudget.upsert({
                        where: {
                            month_categoryId: { month: mb.month, categoryId: mappedCatId },
                        },
                        create: {
                            month: mb.month,
                            categoryId: mappedCatId,
                            assigned: mb.assigned || 0,
                            activity: mb.activity || 0,
                            available: mb.available || 0,
                        },
                        update: {
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
                    name: string;
                    ynabId?: string;
                    transferAccountId?: string;
                }[]) {
                    const mappedTransferAccId = p.transferAccountId
                        ? (accountIdMap.get(p.transferAccountId) ?? null)
                        : null;
                    await tx.payee.upsert({
                        where: {
                            profileId_name: { profileId, name: p.name },
                        },
                        create: {
                            name: p.name,
                            ynabId: p.ynabId ?? null,
                            transferAccountId: mappedTransferAccId,
                            profileId,
                        },
                        update: {
                            ynabId: p.ynabId ?? null,
                            transferAccountId: mappedTransferAccId,
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
                    const created = await tx.asset.create({
                        data: {
                            symbol: a.symbol,
                            name: a.name,
                            assetClass: a.assetClass,
                            currency: a.currency || 'AUD',
                            quantity: a.quantity ?? 1,
                            costBasis: a.costBasis || 0,
                            currentPrice: a.currentPrice || 0,
                            isManual: a.isManual || false,
                            annualDividend: a.annualDividend || 0,
                            dividendYield: a.dividendYield || 0,
                            stakingYield: a.stakingYield || 0,
                            profileId,
                        },
                    });
                    assetIdMap.set(a.id, created.id);
                    stats.assets++;
                }
            }

            // Restore asset lots
            if (data.assetLots?.length) {
                for (const lot of data.assetLots as {
                    assetId: string;
                    purchaseDate: string;
                    units: number;
                    unitPrice: number;
                    totalCost: number;
                    brokerage?: number;
                    soldUnits?: number;
                    soldDate?: string;
                    salePrice?: number;
                    saleTotal?: number;
                    capitalGain?: number;
                    cgtDiscount?: boolean;
                }[]) {
                    const mappedAssetId = assetIdMap.get(lot.assetId);
                    if (!mappedAssetId) continue;
                    await tx.assetLot.create({
                        data: {
                            assetId: mappedAssetId,
                            purchaseDate: new Date(lot.purchaseDate),
                            units: lot.units,
                            unitPrice: lot.unitPrice,
                            totalCost: lot.totalCost,
                            brokerage: lot.brokerage || 0,
                            soldUnits: lot.soldUnits || 0,
                            soldDate: lot.soldDate ? new Date(lot.soldDate) : null,
                            salePrice: lot.salePrice ?? null,
                            saleTotal: lot.saleTotal ?? null,
                            capitalGain: lot.capitalGain ?? null,
                            cgtDiscount: lot.cgtDiscount || false,
                        },
                    });
                }
            }

            // Restore allocation targets
            if (data.allocationTargets?.length) {
                for (const target of data.allocationTargets as {
                    assetClass: string;
                    targetPct: number;
                    priority?: number;
                }[]) {
                    await tx.allocationTarget.create({
                        data: {
                            assetClass: target.assetClass,
                            targetPct: target.targetPct,
                            priority: target.priority || 0,
                            profileId,
                        },
                    });
                }
            }

            // Restore FIRE settings
            if (data.fireSettings) {
                const fs = data.fireSettings as {
                    yearOfBirth?: number;
                    retirementAge?: number;
                    preservationAge?: number;
                    annualExpenses?: number;
                    withdrawalRate?: number;
                    inflationRate?: number;
                    expectedReturn?: number;
                    annualSuperContrib?: number;
                    employerContribRate?: number;
                    fireNumber?: number;
                    coastFireNumber?: number;
                };
                await tx.fireSettings.create({
                    data: {
                        yearOfBirth: fs.yearOfBirth ?? 1990,
                        retirementAge: fs.retirementAge ?? 60,
                        preservationAge: fs.preservationAge ?? 60,
                        annualExpenses: fs.annualExpenses ?? 0,
                        withdrawalRate: fs.withdrawalRate ?? 0.04,
                        inflationRate: fs.inflationRate ?? 0.025,
                        expectedReturn: fs.expectedReturn ?? 0.07,
                        annualSuperContrib: fs.annualSuperContrib ?? 0,
                        employerContribRate: fs.employerContribRate ?? 0.115,
                        fireNumber: fs.fireNumber ?? 0,
                        coastFireNumber: fs.coastFireNumber ?? 0,
                        profileId,
                    },
                });
            }

            // Restore scheduled transactions
            if (data.scheduledTransactions?.length) {
                for (const st of data.scheduledTransactions as {
                    name: string;
                    amount: number;
                    payee?: string;
                    memo?: string;
                    accountId: string;
                    categoryId?: string;
                    frequency: string;
                    nextDueDate: string;
                    dayOfMonth?: number;
                    dayOfWeek?: number;
                    endDate?: string;
                    autoCreate?: boolean;
                    reminderDays?: number;
                    lastCreated?: string;
                    isActive?: boolean;
                }[]) {
                    const mappedAccountId = accountIdMap.get(st.accountId);
                    if (!mappedAccountId) continue;
                    const mappedCatId = st.categoryId ? (categoryIdMap.get(st.categoryId) ?? null) : null;
                    await tx.scheduledTransaction.create({
                        data: {
                            name: st.name,
                            amount: st.amount,
                            payee: st.payee ?? null,
                            memo: st.memo ?? null,
                            accountId: mappedAccountId,
                            categoryId: mappedCatId,
                            frequency: st.frequency,
                            nextDueDate: new Date(st.nextDueDate),
                            dayOfMonth: st.dayOfMonth ?? null,
                            dayOfWeek: st.dayOfWeek ?? null,
                            endDate: st.endDate ? new Date(st.endDate) : null,
                            autoCreate: st.autoCreate || false,
                            reminderDays: st.reminderDays ?? 3,
                            lastCreated: st.lastCreated ? new Date(st.lastCreated) : null,
                            isActive: st.isActive ?? true,
                            profileId,
                        },
                    });
                }
            }

            // Restore transaction rules
            if (data.transactionRules?.length) {
                for (const rule of data.transactionRules as {
                    name: string;
                    matchField: string;
                    matchType: string;
                    matchValue: string;
                    categoryId?: string;
                    payeeRename?: string;
                    memoTemplate?: string;
                    priority?: number;
                    isActive?: boolean;
                }[]) {
                    const mappedCatId = rule.categoryId ? (categoryIdMap.get(rule.categoryId) ?? null) : null;
                    await tx.transactionRule.create({
                        data: {
                            name: rule.name,
                            matchField: rule.matchField,
                            matchType: rule.matchType,
                            matchValue: rule.matchValue,
                            categoryId: mappedCatId,
                            payeeRename: rule.payeeRename ?? null,
                            memoTemplate: rule.memoTemplate ?? null,
                            priority: rule.priority || 0,
                            isActive: rule.isActive ?? true,
                            profileId,
                        },
                    });
                }
            }

            // Restore budget templates
            if (data.budgetTemplates?.length) {
                for (const tpl of data.budgetTemplates as {
                    name: string;
                    description?: string;
                    items?: { categoryId: string; amount: number }[];
                }[]) {
                    const createdTpl = await tx.budgetTemplate.create({
                        data: {
                            name: tpl.name,
                            description: tpl.description ?? null,
                            profileId,
                        },
                    });
                    if (tpl.items?.length) {
                        for (const item of tpl.items) {
                            const mappedCatId = categoryIdMap.get(item.categoryId);
                            if (!mappedCatId) continue;
                            await tx.budgetTemplateItem.create({
                                data: {
                                    templateId: createdTpl.id,
                                    categoryId: mappedCatId,
                                    amount: item.amount,
                                },
                            });
                        }
                    }
                }
            }

            // Restore exchange rates using upsert on [fromCurrency, toCurrency]
            if (data.exchangeRates?.length) {
                for (const er of data.exchangeRates as {
                    fromCurrency: string;
                    toCurrency: string;
                    rate: number;
                    lastUpdated?: string;
                }[]) {
                    if (!er.fromCurrency || !er.toCurrency) continue;
                    await tx.exchangeRate.upsert({
                        where: {
                            fromCurrency_toCurrency: {
                                fromCurrency: er.fromCurrency,
                                toCurrency: er.toCurrency,
                            },
                        },
                        create: {
                            fromCurrency: er.fromCurrency,
                            toCurrency: er.toCurrency,
                            rate: er.rate,
                            lastUpdated: er.lastUpdated ? new Date(er.lastUpdated) : new Date(),
                        },
                        update: {
                            rate: er.rate,
                            lastUpdated: er.lastUpdated ? new Date(er.lastUpdated) : new Date(),
                        },
                    });
                }
            }

            // Restore settings for the active profile (preserving theme)
            if (data.settings) {
                const s = data.settings as {
                    budgetName?: string;
                    currency?: string;
                    dateFormat?: string;
                    startOfWeek?: number;
                    toBeBudgeted?: number;
                    theme?: string;
                };

                const existing = await tx.settings.findFirst({ where: { profileId } });
                if (existing) {
                    await tx.settings.update({
                        where: { id: existing.id },
                        data: {
                            budgetName: s.budgetName || existing.budgetName || 'My Realm',
                            currency: s.currency || existing.currency || 'AUD',
                            dateFormat: s.dateFormat || existing.dateFormat || 'DD/MM/YYYY',
                            startOfWeek: s.startOfWeek ?? existing.startOfWeek ?? 1,
                            toBeBudgeted: s.toBeBudgeted ?? 0,
                        },
                    });
                } else {
                    await tx.settings.create({
                        data: {
                            profileId,
                            budgetName: s.budgetName || 'My Realm',
                            currency: s.currency || 'AUD',
                            dateFormat: s.dateFormat || 'DD/MM/YYYY',
                            startOfWeek: s.startOfWeek ?? 1,
                            toBeBudgeted: s.toBeBudgeted ?? 0,
                            theme: s.theme || 'finance',
                        },
                    });
                }
            }
        });

        return NextResponse.json({
            success: true,
            message: 'Backup restored successfully',
            stats,
            restoredFrom: backup.exportedAt,
        });
    } catch (error) {
        console.error('Restore error:', error);
        return NextResponse.json({ error: 'Failed to restore backup' }, { status: 500 });
    }
}
