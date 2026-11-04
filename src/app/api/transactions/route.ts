import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHandler';
import { getProfileId } from '@/lib/profile';
import { matchesRule } from '@/lib/ruleEngine';
import { RECONCILIATION_ADJUSTMENT_PAYEE } from '@/lib/budgetUtils';
import { applyCategoryActivityDelta } from '@/lib/budgetHelpers';
import { findOwnedAccount, findOwnedCategory, findOwnedTransaction } from '@/lib/profileOwnership';

function parseBoundedInteger(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function parseDate(value: string | null): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// GET all transactions
export const GET = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const categoryId = searchParams.get('categoryId');
    const cleared = searchParams.get('cleared');
    const query = searchParams.get('q');
    const limit = parseBoundedInteger(searchParams.get('limit'), 100, 1, 500);
    const offset = parseBoundedInteger(searchParams.get('offset'), 0, 0, 1_000_000);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const minAmount = searchParams.get('minAmount');
    const maxAmount = searchParams.get('maxAmount');
    const hideReconciliationAdjustments = searchParams.get('hideReconciliationAdjustments') === 'true';
    const includeRunningBalance = searchParams.get('runningBalance') === 'true';

    const where: Prisma.TransactionWhereInput = { account: { profileId } };
    const andFilters: Prisma.TransactionWhereInput[] = [];
        
        if (accountId) {
            where.accountId = accountId;
        }

        if (categoryId) {
            where.categoryId = categoryId;
        }

        if (cleared === 'true') {
            where.cleared = true;
        } else if (cleared === 'false') {
            where.cleared = false;
        }
        
        const parsedStartDate = parseDate(startDate);
        const parsedEndDate = parseDate(endDate);
        if ((startDate && !parsedStartDate) || (endDate && !parsedEndDate)) {
            return NextResponse.json({ error: 'Invalid date filter' }, { status: 400 });
        }

        if (parsedStartDate || parsedEndDate) {
            const dateFilter: Prisma.DateTimeFilter = {};
            if (parsedStartDate) {
                dateFilter.gte = parsedStartDate;
            }
            if (parsedEndDate) {
                dateFilter.lte = parsedEndDate;
            }
            where.date = dateFilter;
        }

        if (query) {
            andFilters.push({
                OR: [
                    { payee: { contains: query } },
                    { memo: { contains: query } },
                    { category: { is: { name: { contains: query } } } },
                ],
            });
        }

        if (hideReconciliationAdjustments) {
            andFilters.push({
                NOT: {
                    // Matches the actual payee created by /api/reconcile.
                    payee: { contains: RECONCILIATION_ADJUSTMENT_PAYEE },
                },
            });
        }

        if (minAmount) {
            const minAmountCents = Math.round(parseFloat(minAmount) * 100);
            if (!Number.isNaN(minAmountCents)) {
                andFilters.push({
                    OR: [
                        { amount: { gte: minAmountCents } },
                        { amount: { lte: -minAmountCents } },
                    ],
                });
            }
        }

        if (maxAmount) {
            const maxAmountCents = Math.round(parseFloat(maxAmount) * 100);
            if (!Number.isNaN(maxAmountCents)) {
                andFilters.push({
                    AND: [
                        { amount: { lte: maxAmountCents } },
                        { amount: { gte: -maxAmountCents } },
                    ],
                });
            }
        }

        if (andFilters.length > 0) {
            where.AND = andFilters;
        }

    const transactions = await prisma.transaction.findMany({
            where,
            include: {
                account: { select: { id: true, name: true } },
                category: { select: { id: true, name: true } },
                subTransactions: {
                    include: {
                        category: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
            take: limit,
            skip: offset,
        });

    const total = await prisma.transaction.count({ where });

        // Calculate running balance if requested and filtering by account
    if (includeRunningBalance && accountId && transactions.length > 0) {
        const account = await findOwnedAccount(profileId, accountId);
        if (account) {
            const transactionIds = transactions.map(transaction => transaction.id);
            const runningBalances = await prisma.$queryRaw<Array<{ id: string; runningBalance: number | bigint }>>(Prisma.sql`
                WITH running_balances AS (
                    SELECT
                        id,
                        SUM(amount) OVER (
                            ORDER BY date ASC, createdAt ASC, id ASC
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                        ) AS runningBalance
                    FROM "Transaction"
                    WHERE accountId = ${accountId}
                )
                SELECT id, runningBalance
                FROM running_balances
                WHERE id IN (${Prisma.join(transactionIds)})
            `);
            const balanceMap = new Map(
                runningBalances.map(row => [row.id, Number(row.runningBalance)])
            );

            // Add running balance to each transaction
            const transactionsWithBalance = transactions.map(t => ({
                ...t,
                runningBalance: balanceMap.get(t.id) || 0,
            }));

            return NextResponse.json({ transactions: transactionsWithBalance, total });
        }
    }

    return NextResponse.json({ transactions, total });
}, 'Fetch transactions');

// POST create new transaction
export const POST = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);
    const body = await request.json();
    const { date, amount, accountId, cleared, applyRules } = body;
    let { payee, memo, categoryId } = body;

    // Validate required fields
    if (!date || amount === undefined || !accountId) {
        return NextResponse.json(
            { error: 'Missing required fields: date, amount, accountId' },
            { status: 400 }
        );
    }

    const parsedDate = parseDate(typeof date === 'string' ? date : null);
    if (!parsedDate) {
        return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    // Validate input lengths and types
    if (typeof amount !== 'number' || !isFinite(amount) || Math.abs(amount) > 999999999) {
        return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    if (payee && (typeof payee !== 'string' || payee.length > 200)) {
        return NextResponse.json({ error: 'Payee too long (max 200 characters)' }, { status: 400 });
    }
    if (memo && (typeof memo !== 'string' || memo.length > 500)) {
        return NextResponse.json({ error: 'Memo too long (max 500 characters)' }, { status: 400 });
    }

    const account = await findOwnedAccount(profileId, accountId);
    if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Apply transaction rules if requested and no category set
    if (applyRules !== false && !categoryId) {
        const rules = await prisma.transactionRule.findMany({
            where: { isActive: true, profileId },
            orderBy: { priority: 'desc' },
        });

        for (const rule of rules) {
            let valueToMatch = '';
            switch (rule.matchField) {
                case 'payee':
                    valueToMatch = payee || '';
                    break;
                case 'memo':
                    valueToMatch = memo || '';
                    break;
                case 'amount':
                    valueToMatch = String(amount);
                    break;
            }

            if (matchesRule(valueToMatch, rule.matchType, rule.matchValue)) {
                if (rule.categoryId) categoryId = rule.categoryId;
                if (rule.payeeRename) payee = rule.payeeRename;
                if (rule.memoTemplate) memo = rule.memoTemplate;
                break;
            }
        }
    }

    if (categoryId && !(await findOwnedCategory(profileId, categoryId))) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const amountCents = Math.round(amount * 100);

    // Use a transaction to ensure atomicity of balance updates
    const transaction = await prisma.$transaction(async (tx) => {
        const created = await tx.transaction.create({
            data: {
                date: parsedDate,
                amount: amountCents,
                payee: payee || null,
                memo: memo || null,
                accountId,
                categoryId: categoryId || null,
                cleared: cleared ?? false,
                approved: true,
            },
            include: {
                account: { select: { id: true, name: true } },
                category: { select: { id: true, name: true } },
            },
        });

        await tx.account.update({
            where: { id: accountId },
            data: {
                balance: { increment: amountCents },
                clearedBalance: cleared ? { increment: amountCents } : undefined,
            },
        });

        if (created.categoryId) {
            await applyCategoryActivityDelta(
                tx,
                created.categoryId,
                created.date.toISOString().slice(0, 7),
                created.amount,
            );
        }

        return created;
    });

    return NextResponse.json(transaction, { status: 201 });
}, 'Create transaction');

// PUT update transaction
export const PUT = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 });
    }

    const body = await request.json();
    const { date, amount, payee, memo, accountId, categoryId, cleared } = body;

    // Get existing transaction to calculate balance difference
    const existing = await findOwnedTransaction(profileId, id);

    if (!existing) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    if (!accountId || !(await findOwnedAccount(profileId, accountId))) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
    if (categoryId && existing.isSplit) {
        return NextResponse.json(
            { error: 'Cannot categorise a split transaction. Remove the split first.' },
            { status: 400 }
        );
    }
    if (categoryId && !(await findOwnedCategory(profileId, categoryId))) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    let newAmountCents = existing.amount;
    if (amount !== undefined) {
        const parsedAmount = Math.round(Number(amount) * 100);
        if (!Number.isFinite(parsedAmount) || Math.abs(Number(amount)) > 999999999) {
            return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
        }
        newAmountCents = parsedAmount;
    }

    let parsedDate: Date | undefined;
    if (date !== undefined) {
        parsedDate = new Date(date);
        if (Number.isNaN(parsedDate.getTime())) {
            return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
        }
    }

    const amountDiff = newAmountCents - existing.amount;
    if (existing.isSplit && amountDiff !== 0) {
        return NextResponse.json(
            { error: 'Cannot change the total amount of a split transaction without updating its splits.' },
            { status: 400 }
        );
    }

    // Use a transaction to ensure atomicity of balance updates
    const transaction = await prisma.$transaction(async (tx) => {
        const nowCleared = cleared ?? existing.cleared;
        const updated = await tx.transaction.update({
            where: { id },
            data: {
                date: parsedDate,
                amount: newAmountCents,
                payee: payee !== undefined ? (payee || null) : existing.payee,
                memo: memo !== undefined ? (memo || null) : existing.memo,
                accountId,
                categoryId: categoryId !== undefined ? (categoryId || null) : existing.categoryId,
                cleared: nowCleared,
            },
            include: {
                account: { select: { id: true, name: true } },
                category: { select: { id: true, name: true } },
            },
        });

        const oldMonth = existing.date.toISOString().slice(0, 7);
        const newMonth = updated.date.toISOString().slice(0, 7);

        if (existing.isSplit && oldMonth !== newMonth) {
            const splits = await tx.subTransaction.findMany({
                where: { transactionId: id },
                select: { categoryId: true, amount: true },
            });
            for (const split of splits) {
                if (split.categoryId) {
                    await applyCategoryActivityDelta(tx, split.categoryId, oldMonth, -split.amount);
                    await applyCategoryActivityDelta(tx, split.categoryId, newMonth, split.amount);
                }
            }
        }

        if (existing.categoryId) {
            await applyCategoryActivityDelta(
                tx,
                existing.categoryId,
                oldMonth,
                -existing.amount,
            );
        }
        if (updated.categoryId) {
            await applyCategoryActivityDelta(
                tx,
                updated.categoryId,
                newMonth,
                updated.amount,
            );
        }

        if (accountId === existing.accountId) {
            // Calculate cleared balance adjustment based on old and new cleared state
            const wasCleared = existing.cleared;
            let clearedDelta = 0;
            if (wasCleared && nowCleared) {
                // Was cleared, still cleared — adjust by amount difference
                clearedDelta = amountDiff;
            } else if (!wasCleared && nowCleared) {
                // Became cleared — add full new amount
                clearedDelta = newAmountCents;
            } else if (wasCleared && !nowCleared) {
                // Became uncleared — remove old amount
                clearedDelta = -existing.amount;
            }
            // !wasCleared && !nowCleared → no change

            await tx.account.update({
                where: { id: accountId },
                data: {
                    balance: { increment: amountDiff },
                    clearedBalance: clearedDelta !== 0 ? { increment: clearedDelta } : undefined,
                },
            });
        } else {
            await tx.account.update({
                where: { id: existing.accountId },
                data: {
                    balance: { decrement: existing.amount },
                    clearedBalance: existing.cleared ? { decrement: existing.amount } : undefined,
                },
            });
            await tx.account.update({
                where: { id: accountId },
                data: {
                    balance: { increment: newAmountCents },
                    clearedBalance: nowCleared ? { increment: newAmountCents } : undefined,
                },
            });
        }

        return updated;
    });

    return NextResponse.json(transaction);
}, 'Update transaction');

// DELETE transaction
export const DELETE = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 });
    }

    // Get existing transaction to reverse balance
    const existing = await findOwnedTransaction(profileId, id);

    if (!existing) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const subTransactions = existing.isSplit
        ? await prisma.subTransaction.findMany({
            where: { transactionId: id },
            select: { categoryId: true, amount: true },
        })
        : [];

    // Use a transaction to ensure atomicity of balance updates
    await prisma.$transaction(async (tx) => {
        // If this transaction is part of a transfer, also delete the sibling leg and Transfer row
        if (existing.transferId) {
            const siblingLegs = await tx.transaction.findMany({
                where: {
                    transferId: existing.transferId,
                    id: { not: id },
                    account: { profileId },
                },
            });
            for (const sibling of siblingLegs) {
                await tx.transaction.delete({ where: { id: sibling.id } });
                await tx.account.update({
                    where: { id: sibling.accountId },
                    data: {
                        balance: { decrement: sibling.amount },
                        clearedBalance: sibling.cleared ? { decrement: sibling.amount } : undefined,
                    },
                });
            }
            await tx.transfer.deleteMany({
                where: { id: existing.transferId, profileId },
            });
        }

        await tx.transaction.delete({
            where: { id },
        });

        if (existing.categoryId) {
            await applyCategoryActivityDelta(
                tx,
                existing.categoryId,
                existing.date.toISOString().slice(0, 7),
                -existing.amount,
            );
        }
        for (const split of subTransactions) {
            if (split.categoryId) {
                await applyCategoryActivityDelta(
                    tx,
                    split.categoryId,
                    existing.date.toISOString().slice(0, 7),
                    -split.amount,
                );
            }
        }

        await tx.account.update({
            where: { id: existing.accountId },
            data: {
                balance: { decrement: existing.amount },
                clearedBalance: existing.cleared ? { decrement: existing.amount } : undefined,
            },
        });
    });

    return NextResponse.json({ success: true });
}, 'Delete transaction');
