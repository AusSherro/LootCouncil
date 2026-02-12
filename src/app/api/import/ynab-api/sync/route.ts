import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const YNAB_API_BASE = 'https://api.ynab.com/v1';

interface YNABDeltaAccount {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  balance: number;
  cleared_balance: number;
  deleted: boolean;
}

interface YNABDeltaCategory {
  id: string;
  category_group_id: string;
  name: string;
  hidden: boolean;
  budgeted: number;
  activity: number;
  balance: number;
  deleted: boolean;
  goal_type: string | null;
  goal_target: number | null;
  goal_target_month: string | null;
  goal_percentage_complete: number | null;
  goal_under_funded: number | null;
  goal_overall_funded: number | null;
  goal_overall_left: number | null;
  goal_cadence: number | null;
  goal_cadence_frequency: number | null;
  goal_day: number | null;
}

interface YNABDeltaCategoryGroup {
  id: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
}

interface YNABDeltaTransaction {
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
  deleted: boolean;
  subtransactions: YNABSubTransaction[];
}

interface YNABSubTransaction {
  id: string;
  transaction_id: string;
  amount: number;
  memo: string | null;
  category_id: string | null;
  deleted: boolean;
}

interface YNABDeltaPayee {
  id: string;
  name: string;
  transfer_account_id: string | null;
  deleted: boolean;
}

// Helper: Fetch with YNAB auth
async function ynabFetch(path: string, token: string) {
  const res = await fetch(`${YNAB_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { detail: res.statusText } }));
    throw new Error(`YNAB API error (${res.status}): ${error?.error?.detail || res.statusText}`);
  }
  return res.json();
}

// GET - Check sync status
export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = await (prisma.settings as any).findUnique({ where: { id: 'default' } });

    return NextResponse.json({
      hasSynced: !!settings?.lastYnabSync,
      lastSync: settings?.lastYnabSync || null,
      budgetId: settings?.ynabBudgetId || null,
      serverKnowledge: settings?.ynabServerKnowledge || 0,
    });
  } catch (error) {
    console.error('Sync status error:', error);
    return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 });
  }
}

// POST - Perform delta sync
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    // Get stored sync state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = await (prisma.settings as any).findUnique({ where: { id: 'default' } });

    if (!settings?.ynabBudgetId) {
      return NextResponse.json(
        { error: 'No YNAB budget configured. Please do a full import first.' },
        { status: 400 }
      );
    }

    const budgetId = settings.ynabBudgetId;
    const lastKnowledge = settings.ynabServerKnowledge || 0;

    const stats = {
      accounts: { created: 0, updated: 0, deleted: 0 },
      categoryGroups: { created: 0, updated: 0, deleted: 0 },
      categories: { created: 0, updated: 0, deleted: 0 },
      transactions: { created: 0, updated: 0, deleted: 0 },
      payees: { created: 0, updated: 0, deleted: 0 },
      monthlyBudgets: 0,
    };

    let newServerKnowledge = lastKnowledge;

    // ==========================================
    // 1. Delta sync ACCOUNTS
    // ==========================================
    console.log(`[Delta Sync] Fetching accounts delta (knowledge: ${lastKnowledge})`);
    const accountsData = await ynabFetch(
      `/budgets/${budgetId}/accounts?last_knowledge_of_server=${lastKnowledge}`,
      token
    );
    const deltaAccounts = accountsData.data.accounts as YNABDeltaAccount[];
    newServerKnowledge = Math.max(newServerKnowledge, accountsData.data.server_knowledge);
    console.log(`[Delta Sync] Got ${deltaAccounts.length} changed accounts`);

    for (const acc of deltaAccounts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (prisma.account as any).findFirst({ where: { ynabId: acc.id } });

      if (acc.deleted) {
        if (existing) {
          // Don't hard-delete accounts with transactions — just mark closed
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.account as any).update({
            where: { id: existing.id },
            data: { closed: true },
          });
          stats.accounts.deleted++;
        }
        continue;
      }

      if (existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.account as any).update({
          where: { id: existing.id },
          data: {
            name: acc.name,
            type: acc.type.toLowerCase().replace('_', ''),
            onBudget: acc.on_budget,
            balance: Math.round(acc.balance / 10),
            clearedBalance: Math.round(acc.cleared_balance / 10),
            closed: acc.closed,
          },
        });
        stats.accounts.updated++;
      } else {
        // Also check by name for accounts created before delta sync was added
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const byName = await (prisma.account as any).findFirst({ where: { name: acc.name } });
        if (byName) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.account as any).update({
            where: { id: byName.id },
            data: {
              ynabId: acc.id,
              type: acc.type.toLowerCase().replace('_', ''),
              onBudget: acc.on_budget,
              balance: Math.round(acc.balance / 10),
              clearedBalance: Math.round(acc.cleared_balance / 10),
              closed: acc.closed,
            },
          });
          stats.accounts.updated++;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.account as any).create({
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
          stats.accounts.created++;
        }
      }
    }

    // Build account lookup map (ynabId -> our id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allAccounts = await (prisma.account as any).findMany({
      where: { ynabId: { not: null } },
      select: { id: true, ynabId: true },
    });
    const accountMap = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of allAccounts) accountMap.set(a.ynabId!, a.id);

    // ==========================================
    // 2. Delta sync CATEGORY GROUPS
    // ==========================================
    console.log(`[Delta Sync] Fetching category groups delta`);
    const groupsData = await ynabFetch(
      `/budgets/${budgetId}/categories?last_knowledge_of_server=${lastKnowledge}`,
      token
    );
    const deltaGroups = groupsData.data.category_groups as (YNABDeltaCategoryGroup & { categories: YNABDeltaCategory[] })[];
    newServerKnowledge = Math.max(newServerKnowledge, groupsData.data.server_knowledge);

    const categoryGroupMap = new Map<string, string>();
    const categoryMap = new Map<string, string>();

    // First pass: sync groups
    let groupSortOrder = 0;
    for (const group of deltaGroups) {
      if (group.name === 'Internal Master Category') continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingGroup = await (prisma.categoryGroup as any).findFirst({ where: { ynabId: group.id } });

      if (group.deleted) {
        if (existingGroup) {
          // Delete group and its categories cascade
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.categoryGroup as any).delete({ where: { id: existingGroup.id } });
          stats.categoryGroups.deleted++;
        }
        continue;
      }

      if (existingGroup) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.categoryGroup as any).update({
          where: { id: existingGroup.id },
          data: { name: group.name, isHidden: group.hidden },
        });
        categoryGroupMap.set(group.id, existingGroup.id);
        stats.categoryGroups.updated++;
      } else {
        // Check by name for pre-delta records
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const byName = await (prisma.categoryGroup as any).findFirst({ where: { name: group.name } });
        if (byName) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.categoryGroup as any).update({
            where: { id: byName.id },
            data: { ynabId: group.id, isHidden: group.hidden },
          });
          categoryGroupMap.set(group.id, byName.id);
          stats.categoryGroups.updated++;
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
          stats.categoryGroups.created++;
        }
      }

      // Second pass: sync categories within each group
      for (const cat of group.categories || []) {
        const groupId = categoryGroupMap.get(group.id);
        if (!groupId) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingCat = await (prisma.category as any).findFirst({ where: { ynabId: cat.id } });

        if (cat.deleted) {
          if (existingCat) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma.category as any).delete({ where: { id: existingCat.id } });
            stats.categories.deleted++;
          }
          continue;
        }

        const catData = {
          name: cat.name,
          isHidden: cat.hidden,
          goalType: cat.goal_type,
          goalTarget: cat.goal_target ? Math.round(cat.goal_target / 10) : null,
          goalDueDate: cat.goal_target_month ? new Date(cat.goal_target_month) : null,
          goalPercentageComplete: cat.goal_percentage_complete,
          goalUnderFunded: cat.goal_under_funded ? Math.round(cat.goal_under_funded / 10) : null,
          goalOverallFunded: cat.goal_overall_funded ? Math.round(cat.goal_overall_funded / 10) : null,
          goalOverallLeft: cat.goal_overall_left ? Math.round(cat.goal_overall_left / 10) : null,
          goalCadence: cat.goal_cadence,
          goalCadenceFrequency: cat.goal_cadence_frequency,
          goalDay: cat.goal_day,
        };

        if (existingCat) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.category as any).update({
            where: { id: existingCat.id },
            data: { ...catData, groupId },
          });
          categoryMap.set(cat.id, existingCat.id);
          stats.categories.updated++;
        } else {
          // Check by name + group for pre-delta records
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const byName = await (prisma.category as any).findFirst({
            where: { name: cat.name, groupId },
          });
          if (byName) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma.category as any).update({
              where: { id: byName.id },
              data: { ...catData, ynabId: cat.id },
            });
            categoryMap.set(cat.id, byName.id);
            stats.categories.updated++;
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const created = await (prisma.category as any).create({
              data: {
                ...catData,
                groupId,
                sortOrder: 0,
                ynabId: cat.id,
              },
            });
            categoryMap.set(cat.id, created.id);
            stats.categories.created++;
          }
        }
      }
    }

    // Build full category map for transactions (need ALL categories, not just changed ones)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allCategories: any[] = await (prisma.category as any).findMany({
      where: { ynabId: { not: null } },
      select: { id: true, ynabId: true },
    });
    for (const c of allCategories) {
      if (c.ynabId) categoryMap.set(c.ynabId, c.id);
    }

    // ==========================================
    // 3. Delta sync PAYEES
    // ==========================================
    console.log(`[Delta Sync] Fetching payees delta`);
    const payeesData = await ynabFetch(
      `/budgets/${budgetId}/payees?last_knowledge_of_server=${lastKnowledge}`,
      token
    );
    const deltaPayees = payeesData.data.payees as YNABDeltaPayee[];
    newServerKnowledge = Math.max(newServerKnowledge, payeesData.data.server_knowledge);
    console.log(`[Delta Sync] Got ${deltaPayees.length} changed payees`);

    const payeeNameMap = new Map<string, string>(); // ynabId -> name

    for (const payee of deltaPayees) {
      payeeNameMap.set(payee.id, payee.name);

      if (payee.deleted) {
        const existing = await prisma.payee.findFirst({ where: { ynabId: payee.id } });
        if (existing) {
          await prisma.payee.delete({ where: { id: existing.id } });
          stats.payees.deleted++;
        }
        continue;
      }

      const transferAccId = payee.transfer_account_id ? accountMap.get(payee.transfer_account_id) : null;
      const existing = await prisma.payee.findFirst({ where: { ynabId: payee.id } });

      if (existing) {
        await prisma.payee.update({
          where: { id: existing.id },
          data: {
            name: payee.name,
            transferAccountId: transferAccId,
          },
        });
        stats.payees.updated++;
      } else {
        // Check by name for pre-delta records
        const byName = await prisma.payee.findFirst({ where: { name: payee.name } });
        if (byName) {
          await prisma.payee.update({
            where: { id: byName.id },
            data: { ynabId: payee.id, transferAccountId: transferAccId },
          });
          stats.payees.updated++;
        } else {
          await prisma.payee.create({
            data: {
              name: payee.name,
              ynabId: payee.id,
              transferAccountId: transferAccId,
            },
          });
          stats.payees.created++;
        }
      }
    }

    // Build full payee name map for transactions
    const allPayees = await prisma.payee.findMany({
      where: { ynabId: { not: null } },
      select: { ynabId: true, name: true },
    });
    for (const p of allPayees) {
      if (p.ynabId) payeeNameMap.set(p.ynabId, p.name);
    }

    // ==========================================
    // 4. Delta sync TRANSACTIONS
    // ==========================================
    console.log(`[Delta Sync] Fetching transactions delta (knowledge: ${lastKnowledge})`);
    const txData = await ynabFetch(
      `/budgets/${budgetId}/transactions?last_knowledge_of_server=${lastKnowledge}`,
      token
    );
    const deltaTransactions = txData.data.transactions as YNABDeltaTransaction[];
    newServerKnowledge = Math.max(newServerKnowledge, txData.data.server_knowledge);
    console.log(`[Delta Sync] Got ${deltaTransactions.length} changed transactions`);

    for (const tx of deltaTransactions) {
      const accountId = accountMap.get(tx.account_id);
      if (!accountId) continue;

      const categoryId = tx.category_id ? categoryMap.get(tx.category_id) : null;
      const payeeName = tx.payee_name || (tx.payee_id ? payeeNameMap.get(tx.payee_id) : null) || null;
      const amountCents = Math.round(tx.amount / 10);

      // Look up by ynabId first
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (prisma.transaction as any).findFirst({ where: { ynabId: tx.id } });

      if (tx.deleted) {
        if (existing) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.transaction as any).delete({ where: { id: existing.id } });
          stats.transactions.deleted++;
        }
        continue;
      }

      const txDataObj = {
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
        isSplit: tx.subtransactions && tx.subtransactions.length > 0,
      };

      if (existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.transaction as any).update({
          where: { id: existing.id },
          data: txDataObj,
        });
        stats.transactions.updated++;
      } else {
        // For first delta sync after migration, try matching by date+amount+account
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const byLegacy = await (prisma.transaction as any).findFirst({
          where: {
            accountId,
            date: new Date(tx.date),
            amount: amountCents,
            ynabId: null,
          },
        });

        if (byLegacy) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.transaction as any).update({
            where: { id: byLegacy.id },
            data: { ...txDataObj, ynabId: tx.id },
          });
          stats.transactions.updated++;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.transaction as any).create({
            data: { ...txDataObj, ynabId: tx.id },
          });
          stats.transactions.created++;
        }
      }

      // Handle subtransactions
      if (tx.subtransactions && tx.subtransactions.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parentTx = await (prisma.transaction as any).findFirst({ where: { ynabId: tx.id } });
        if (parentTx) {
          // Delete existing subtransactions and recreate
          await prisma.subTransaction.deleteMany({ where: { transactionId: parentTx.id } });
          for (const sub of tx.subtransactions) {
            if (sub.deleted) continue;
            const subCategoryId = sub.category_id ? categoryMap.get(sub.category_id) : null;
            await prisma.subTransaction.create({
              data: {
                transactionId: parentTx.id,
                amount: Math.round(sub.amount / 10),
                memo: sub.memo,
                categoryId: subCategoryId || null,
              },
            });
          }
        }
      }
    }

    // ==========================================
    // 5. Refresh current month's budget data
    // ==========================================
    console.log(`[Delta Sync] Refreshing current month budget data`);
    const currentMonth = new Date().toISOString().slice(0, 7);
    // Also refresh previous month (in case of late edits)
    const prevDate = new Date();
    prevDate.setMonth(prevDate.getMonth() - 1);
    const prevMonth = prevDate.toISOString().slice(0, 7);

    for (const monthStr of [prevMonth, currentMonth]) {
      try {
        const monthData = await ynabFetch(
          `/budgets/${budgetId}/months/${monthStr}-01`,
          token
        );
        const month = monthData.data.month;

        for (const cat of month.categories || []) {
          const catId = categoryMap.get(cat.id);
          if (!catId) continue;

          await prisma.monthlyBudget.upsert({
            where: {
              month_categoryId: { month: monthStr, categoryId: catId },
            },
            create: {
              month: monthStr,
              categoryId: catId,
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
          stats.monthlyBudgets++;
        }

        // Update "Ready to Assign" from current month
        if (monthStr === currentMonth) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.settings as any).update({
            where: { id: 'default' },
            data: {
              toBeBudgeted: Math.round(month.to_be_budgeted / 10),
            },
          });
        }
      } catch (err) {
        console.error(`[Delta Sync] Failed to fetch month ${monthStr}:`, err);
      }
    }

    // ==========================================
    // 6. Update sync state
    // ==========================================
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.settings as any).update({
      where: { id: 'default' },
      data: {
        lastYnabSync: new Date(),
        ynabServerKnowledge: newServerKnowledge,
      },
    });

    console.log(`[Delta Sync] Complete. New server_knowledge: ${newServerKnowledge}`);
    console.log(`[Delta Sync] Stats:`, JSON.stringify(stats));

    return NextResponse.json({
      success: true,
      serverKnowledge: newServerKnowledge,
      stats,
    });
  } catch (error) {
    console.error('Delta sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Delta sync failed', details: errorMessage }, { status: 500 });
  }
}
