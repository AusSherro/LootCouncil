import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const YNAB_API_BASE = 'https://api.ynab.com/v1';

interface YNABAccount {
    id: string;
    name: string;
    type: string;
    on_budget: boolean;
    closed: boolean;
    balance: number;
    cleared_balance: number;
}

interface YNABCategory {
    id: string;
    category_group_id: string;
    name: string;
    hidden: boolean;
    budgeted: number;
    activity: number;
    balance: number;
    goal_type: string | null;
    goal_target: number | null;
    goal_target_month: string | null;
    // Additional goal progress fields
    goal_percentage_complete: number | null;
    goal_under_funded: number | null;
    goal_overall_funded: number | null;
    goal_overall_left: number | null;
    goal_cadence: number | null;
    goal_cadence_frequency: number | null;
    goal_day: number | null;
}

interface YNABPayee {
    id: string;
    name: string;
    transfer_account_id: string | null;
    deleted: boolean;
}

interface YNABCategoryGroup {
    id: string;
    name: string;
    hidden: boolean;
    categories: YNABCategory[];
}

interface YNABTransaction {
    id: string;
    date: string;
    amount: number;
    payee_id: string | null;
    payee_name: string | null;
    memo: string | null;
    account_id: string;
    category_id: string | null;
    cleared: string;
    approved: boolean;
    transfer_account_id: string | null;
}

interface YNABBudgetMonth {
    month: string;
    to_be_budgeted: number;
    categories: YNABCategory[];
}

// GET - Fetch budgets list from YNAB
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.json({ error: 'YNAB API token required' }, { status: 400 });
    }

    try {
        const res = await fetch(`${YNAB_API_BASE}/budgets`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            const error = await res.json();
            return NextResponse.json({ error: 'YNAB API error', details: error }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            budgets: data.data.budgets.map((b: any) => ({
                id: b.id,
                name: b.name,
                lastModified: b.last_modified_on,
            })),
        });
    } catch (error) {
        console.error('YNAB API error:', error);
        return NextResponse.json({ error: 'Failed to fetch YNAB budgets' }, { status: 500 });
    }
}

// POST - Import a specific budget from YNAB
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { token, budgetId } = body;

        if (!token || !budgetId) {
            return NextResponse.json({ error: 'Token and budgetId required' }, { status: 400 });
        }

        // Fetch full budget data
        const budgetRes = await fetch(`${YNAB_API_BASE}/budgets/${budgetId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!budgetRes.ok) {
            const error = await budgetRes.json();
            return NextResponse.json({ error: 'YNAB API error', details: error }, { status: budgetRes.status });
        }

        const budgetData = await budgetRes.json();
        const budget = budgetData.data.budget;

        // Maps for ID translation (YNAB ID -> Our ID)
        const accountMap = new Map<string, string>();
        const categoryGroupMap = new Map<string, string>();
        const categoryMap = new Map<string, string>();

        let accountCount = 0;
        let categoryCount = 0;
        let transactionCount = 0;
        let serverKnowledge = 0; // Track for delta sync

        // 1. Import Accounts
        for (const acc of budget.accounts as YNABAccount[]) {
            // Check by ynabId first, then by name
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existing = await (prisma.account as any).findFirst({ where: { ynabId: acc.id } })
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                || await (prisma.account as any).findFirst({ where: { name: acc.name } });
            if (existing) {
                accountMap.set(acc.id, existing.id);
                // Update balance + set ynabId for delta sync
                // YNAB uses milliunits (1000 = $1), convert to cents (divide by 10)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (prisma.account as any).update({
                    where: { id: existing.id },
                    data: {
                        balance: Math.round(acc.balance / 10),
                        clearedBalance: Math.round(acc.cleared_balance / 10),
                        closed: acc.closed,
                        ynabId: acc.id,
                    },
                });
            } else {
                // YNAB uses milliunits (1000 = $1), convert to cents (divide by 10)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const created = await (prisma.account as any).create({
                    data: {
                        name: acc.name,
                        type: acc.type.toLowerCase().replace('_', ''),
                        onBudget: acc.on_budget,
                        balance: Math.round(acc.balance / 10),
                        clearedBalance: Math.round(acc.cleared_balance / 10),
                        closed: acc.closed,
                        ynabId: acc.id,
                    },
                });
                accountMap.set(acc.id, created.id);
                accountCount++;
            }
        }

        // 2. Import Category Groups and Categories
        // YNAB API returns flat list of categories with category_group_id reference
        let groupSortOrder = 0;
        
        // First, create all groups
        for (const group of budget.category_groups as YNABCategoryGroup[]) {
            // Skip internal YNAB groups
            if (group.name === 'Internal Master Category') continue;

            // Check by ynabId first, then by name
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existingGroup = await (prisma.categoryGroup as any).findFirst({ where: { ynabId: group.id } })
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                || await (prisma.categoryGroup as any).findFirst({ where: { name: group.name } });

            if (existingGroup) {
                categoryGroupMap.set(group.id, existingGroup.id);
                // Update ynabId for delta sync
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (prisma.categoryGroup as any).update({
                    where: { id: existingGroup.id },
                    data: { ynabId: group.id },
                });
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const created = await (prisma.categoryGroup as any).create({
                    data: {
                        name: group.name,
                        sortOrder: groupSortOrder++,
                        isHidden: group.hidden,
                        ynabId: group.id,
                    },
                });
                categoryGroupMap.set(group.id, created.id);
            }
        }

        // Then import categories from the flat list
        // YNAB returns categories at budget.categories (flat list) with category_group_id
        const allCategories = budget.categories as YNABCategory[];
        console.log(`Found ${allCategories?.length || 0} categories to import`);
        
        // Log first few categories to debug
        if (allCategories && allCategories.length > 0) {
            console.log('First 3 categories:', allCategories.slice(0, 3).map(c => ({
                id: c.id,
                name: c.name,
                group: c.category_group_id
            })));
        }
        
        // Group categories by their group for sort ordering
        const catsByGroup = new Map<string, number>();
        
        for (const cat of allCategories || []) {
            const groupId = categoryGroupMap.get(cat.category_group_id);
            if (!groupId) {
                console.log(`Skipping category ${cat.name} - no group found for ${cat.category_group_id}`);
                continue;
            }

            const sortOrder = catsByGroup.get(groupId) || 0;
            catsByGroup.set(groupId, sortOrder + 1);

            // Check by ynabId first, then by name+group
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existingCat = await (prisma.category as any).findFirst({ where: { ynabId: cat.id } })
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                || await (prisma.category as any).findFirst({ where: { name: cat.name, groupId } });

            if (existingCat) {
                categoryMap.set(cat.id, existingCat.id);
                // Update existing categories with goal info + ynabId for delta sync
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (prisma.category as any).update({
                    where: { id: existingCat.id },
                    data: {
                        isHidden: cat.hidden,
                        goalType: cat.goal_type,
                        goalTarget: cat.goal_target ? Math.round(cat.goal_target / 10) : null,
                        goalDueDate: cat.goal_target_month ? new Date(cat.goal_target_month) : null,
                        goalCadence: cat.goal_cadence,
                        goalCadenceFrequency: cat.goal_cadence_frequency,
                        goalDay: cat.goal_day,
                        ynabId: cat.id,
                    },
                });
                console.log(`Mapped existing category: ${cat.name} (YNAB: ${cat.id} -> DB: ${existingCat.id})`);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const created = await (prisma.category as any).create({
                    data: {
                        name: cat.name,
                        groupId,
                        sortOrder,
                        isHidden: cat.hidden,
                        goalType: cat.goal_type,
                        goalTarget: cat.goal_target ? Math.round(cat.goal_target / 10) : null,
                        goalDueDate: cat.goal_target_month ? new Date(cat.goal_target_month) : null,
                        goalCadence: cat.goal_cadence,
                        goalCadenceFrequency: cat.goal_cadence_frequency,
                        goalDay: cat.goal_day,
                        ynabId: cat.id,
                    },
                });
                categoryMap.set(cat.id, created.id);
                categoryCount++;
                console.log(`Created category: ${cat.name} (YNAB: ${cat.id} -> DB: ${created.id})`);
            }
        }

        // 3. Import Payees
        const payeeMap = new Map<string, string>(); // YNAB ID -> our DB ID
        const payeeNameMap = new Map<string, string>(); // YNAB ID -> payee name
        let payeeCount = 0;
        
        const payeesRes = await fetch(`${YNAB_API_BASE}/budgets/${budgetId}/payees`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (payeesRes.ok) {
            const payeesData = await payeesRes.json();
            const payees = payeesData.data.payees as YNABPayee[];
            // Capture server_knowledge for delta sync
            if (payeesData.data?.server_knowledge) {
                serverKnowledge = Math.max(serverKnowledge, payeesData.data.server_knowledge);
            }
            console.log(`Found ${payees.length} payees to import`);

            for (const payee of payees) {
                if (payee.deleted) continue;
                
                // Store the name mapping for transaction import
                payeeNameMap.set(payee.id, payee.name);
                
                // Skip transfer payees (they reference accounts, not actual payees)
                // But store the mapping for linking transfers later
                const transferAccId = payee.transfer_account_id ? accountMap.get(payee.transfer_account_id) : null;

                const existing = await prisma.payee.findFirst({
                    where: { name: payee.name },
                });

                if (existing) {
                    payeeMap.set(payee.id, existing.id);
                    // Update with YNAB ID if not set
                    if (!existing.ynabId) {
                        await prisma.payee.update({
                            where: { id: existing.id },
                            data: { 
                                ynabId: payee.id,
                                transferAccountId: transferAccId,
                            },
                        });
                    }
                } else {
                    const created = await prisma.payee.create({
                        data: {
                            name: payee.name,
                            ynabId: payee.id,
                            transferAccountId: transferAccId,
                        },
                    });
                    payeeMap.set(payee.id, created.id);
                    payeeCount++;
                }
            }
            console.log(`Imported ${payeeCount} new payees, ${payeeNameMap.size} names mapped`);
        }

        // 4. Import ALL Transactions using dedicated endpoint
        // The budget.transactions only includes recent transactions, so we use the transactions endpoint
        console.log('Fetching ALL transactions from YNAB...');
        const transactionsRes = await fetch(
            `${YNAB_API_BASE}/budgets/${budgetId}/transactions`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        // Capture server_knowledge for delta sync
        if (transactionsRes.ok) {
            const txJson = await transactionsRes.clone().json();
            if (txJson.data?.server_knowledge) {
                serverKnowledge = Math.max(serverKnowledge, txJson.data.server_knowledge);
            }
        }

        if (transactionsRes.ok) {
            const transactionsData = await transactionsRes.json();
            const allTransactions = transactionsData.data.transactions as YNABTransaction[];
            console.log(`YNAB returned ${allTransactions.length} total transactions`);

            for (const tx of allTransactions) {
                const accountId = accountMap.get(tx.account_id);
                if (!accountId) continue;

                const categoryId = tx.category_id ? categoryMap.get(tx.category_id) : null;
                
                // Get payee name - use payee_name if available, otherwise look up from payee map
                const payeeName = tx.payee_name || (tx.payee_id ? payeeNameMap.get(tx.payee_id) : null) || null;

                // Check if transaction already exists (by date + amount + account)
                const amountCents = Math.round(tx.amount / 10);
                // Check by ynabId first, then by date+amount+account
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const existing = await (prisma.transaction as any).findFirst({ where: { ynabId: tx.id } })
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    || await (prisma.transaction as any).findFirst({
                        where: {
                            accountId,
                            date: new Date(tx.date),
                            amount: amountCents,
                        },
                    });

                if (!existing) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (prisma.transaction as any).create({
                        data: {
                            date: new Date(tx.date),
                            amount: amountCents,
                            payee: payeeName,
                            memo: tx.memo,
                            accountId,
                            categoryId: categoryId || null,
                            cleared: tx.cleared === 'cleared' || tx.cleared === 'reconciled',
                            isReconciled: tx.cleared === 'reconciled',
                            approved: tx.approved,
                            transferId: tx.transfer_account_id,
                            ynabId: tx.id,
                        },
                    });
                    transactionCount++;
                } else if (!existing.ynabId) {
                    // Backfill ynabId on existing transactions for delta sync
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (prisma.transaction as any).update({
                        where: { id: existing.id },
                        data: { ynabId: tx.id },
                    });
                }
            }
            console.log(`Imported ${transactionCount} new transactions`);
        } else {
            console.error('Failed to fetch transactions:', await transactionsRes.text());
        }

        // 5. Import Monthly Budget data
        // Fetch budget months for proper rollover data
        const monthsRes = await fetch(`${YNAB_API_BASE}/budgets/${budgetId}/months`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        let monthlyUpdates = 0;
        let unmatchedCategoryCount = 0;
        let matchedCategoryCount = 0;

        if (monthsRes.ok) {
            const monthsData = await monthsRes.json();
            const months = monthsData.data.months as { month: string }[];

            console.log(`YNAB returned ${months.length} months total`);
            console.log('First 5 months from YNAB:', months.slice(0, 5).map(m => m.month));
            console.log('Last 5 months from YNAB:', months.slice(-5).map(m => m.month));

            // Import ALL months from YNAB, not just recent ones
            const sortedMonths = [...months].sort((a, b) => b.month.localeCompare(a.month));
            console.log(`Importing ALL ${sortedMonths.length} months of budget data`);
            console.log(`Category map has ${categoryMap.size} entries`);

            const unmatchedCategories = new Set<string>();
            const matchedCategories = new Set<string>();
            
            for (const monthInfo of sortedMonths) {
                const monthDetailRes = await fetch(
                    `${YNAB_API_BASE}/budgets/${budgetId}/months/${monthInfo.month}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                if (!monthDetailRes.ok) continue;

                const monthDetail = await monthDetailRes.json();
                const monthData = monthDetail.data.month as YNABBudgetMonth;
                const monthStr = monthData.month.slice(0, 7); // "2026-02-01" -> "2026-02"
                
                // Log first month's categories for debugging
                if (monthInfo === sortedMonths[0] && monthData.categories?.length > 0) {
                    console.log(`First month (${monthStr}) has ${monthData.categories.length} categories`);
                    console.log('First 5 month categories with budget data:', monthData.categories.slice(0, 5).map(c => ({
                        id: c.id,
                        name: c.name,
                        budgeted: c.budgeted,
                        activity: c.activity,
                        balance: c.balance,
                        budgetedDollars: c.budgeted / 1000,
                    })));
                }

                for (const cat of monthData.categories) {
                    const categoryId = categoryMap.get(cat.id);
                    if (!categoryId) {
                        // This is expected for internal categories like "Ready to Assign"
                        if (!unmatchedCategories.has(cat.id)) {
                            unmatchedCategories.add(cat.id);
                            console.log(`Month category not found in map: ${cat.name} (id: ${cat.id})`);
                        }
                        continue;
                    }
                    matchedCategories.add(cat.id);

                    // YNAB uses milliunits, convert to cents (divide by 10)
                    await prisma.monthlyBudget.upsert({
                        where: {
                            month_categoryId: { month: monthStr, categoryId },
                        },
                        create: {
                            month: monthStr,
                            categoryId,
                            assigned: Math.round(cat.budgeted / 10),
                            activity: Math.round(cat.activity / 10),
                            available: Math.round(cat.balance / 10),
                        },
                        update: {
                            assigned: Math.round(cat.budgeted / 10),
                            activity: Math.round(cat.activity / 10),
                            available: Math.round(cat.balance / 10),
                        },
                    });
                    
                    // For the most recent month, update category goal progress fields
                    if (monthInfo === sortedMonths[0]) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await (prisma.category as any).update({
                            where: { id: categoryId },
                            data: {
                                goalPercentageComplete: cat.goal_percentage_complete,
                                goalUnderFunded: cat.goal_under_funded ? Math.round(cat.goal_under_funded / 10) : null,
                                goalOverallFunded: cat.goal_overall_funded ? Math.round(cat.goal_overall_funded / 10) : null,
                                goalOverallLeft: cat.goal_overall_left ? Math.round(cat.goal_overall_left / 10) : null,
                            },
                        });
                    }
                    
                    monthlyUpdates++;
                }
            }
            console.log(`Created/updated ${monthlyUpdates} monthly budget records`);
            console.log(`Matched ${matchedCategories.size} unique categories, unmatched: ${unmatchedCategories.size}`);
            matchedCategoryCount = matchedCategories.size;
            unmatchedCategoryCount = unmatchedCategories.size;
        }

        // 5. Store the "Ready to Assign" from YNAB for current month
        // This is available in the budget settings
        const currentMonth = new Date().toISOString().slice(0, 7);
        const currentMonthRes = await fetch(
            `${YNAB_API_BASE}/budgets/${budgetId}/months/${currentMonth}-01`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        let toBeBudgeted = 0;
        if (currentMonthRes.ok) {
            const currentMonthData = await currentMonthRes.json();
            toBeBudgeted = currentMonthData.data.month.to_be_budgeted;
            
            // Store in settings for the budget page to use
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma.settings as any).upsert({
                where: { id: 'default' },
                create: { 
                    id: 'default',
                    toBeBudgeted: Math.round(toBeBudgeted / 10), // milliunits to cents
                    lastYnabSync: new Date(),
                    ynabBudgetId: budgetId,
                    ynabServerKnowledge: serverKnowledge,
                },
                update: {
                    toBeBudgeted: Math.round(toBeBudgeted / 10),
                    lastYnabSync: new Date(),
                    ynabBudgetId: budgetId,
                    ynabServerKnowledge: serverKnowledge,
                },
            });
        }

        return NextResponse.json({
            success: true,
            accounts: accountCount,
            categories: categoryCount,
            payees: payeeCount,
            transactions: transactionCount,
            toBeBudgeted: toBeBudgeted / 1000, // Convert milliunits to dollars
            debug: {
                categoryMapSize: categoryMap.size,
                monthlyBudgetRecords: monthlyUpdates,
                matchedCategories: matchedCategoryCount,
                unmatchedCategories: unmatchedCategoryCount,
            }
        });
    } catch (error) {
        console.error('YNAB import error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: 'Failed to import from YNAB', details: errorMessage }, { status: 500 });
    }
}
