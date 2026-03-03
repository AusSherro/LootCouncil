import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHandler';
import { getProfileId } from '@/lib/profile';

// GET all transactions
export const GET = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const categoryId = searchParams.get('categoryId');
    const cleared = searchParams.get('cleared');
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
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
        
        if (startDate || endDate) {
            const dateFilter: Prisma.DateTimeFilter = {};
            if (startDate) {
                dateFilter.gte = new Date(startDate);
            }
            if (endDate) {
                dateFilter.lte = new Date(endDate);
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
                    payee: { contains: 'reconciliation balance adjustment' },
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
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            take: limit,
            skip: offset,
        });

    const total = await prisma.transaction.count({ where });

        // Calculate running balance if requested and filtering by account
    if (includeRunningBalance && accountId) {
        const account = await prisma.account.findUnique({ where: { id: accountId } });
        if (account) {
            // Get all transactions for this account to calculate running balance
            const allTransactions = await prisma.transaction.findMany({
                where: { accountId },
                orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
                select: { id: true, amount: true },
            });

            // Build running balance map
            let runningBalance = 0;
            const balanceMap = new Map<string, number>();
            for (const t of allTransactions) {
                runningBalance += t.amount;
                balanceMap.set(t.id, runningBalance);
            }

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

    // Apply transaction rules if requested and no category set
    if (applyRules !== false && !categoryId) {
        const rules = await prisma.transactionRule.findMany({
            where: { isActive: true },
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

    const amountCents = Math.round(amount * 100);

    // Use a transaction to ensure atomicity of balance updates
    const transaction = await prisma.$transaction(async (tx) => {
        const created = await tx.transaction.create({
            data: {
                date: new Date(date),
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

        return created;
    });

    return NextResponse.json(transaction, { status: 201 });
}, 'Create transaction');

// Helper function for rule matching
function matchesRule(value: string, matchType: string, matchValue: string): boolean {
    const lowerValue = value.toLowerCase();
    const lowerMatch = matchValue.toLowerCase();

    switch (matchType) {
        case 'equals':
            return lowerValue === lowerMatch;
        case 'contains':
            return lowerValue.includes(lowerMatch);
        case 'startsWith':
            return lowerValue.startsWith(lowerMatch);
        case 'endsWith':
            return lowerValue.endsWith(lowerMatch);
        case 'regex':
            try {
                // Guard against ReDoS: reject overly long or catastrophic patterns
                if (matchValue.length > 200) return false;
                // Detect nested quantifiers like (a+)+, (a*)*  — classic ReDoS vectors
                if (/([+*?}])\s*\)\s*[+*?{]/.test(matchValue)) return false;
                const regex = new RegExp(matchValue, 'i');
                return regex.test(value);
            } catch {
                return false;
            }
        default:
            return false;
    }
}

// PUT update transaction
export const PUT = withErrorHandler(async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 });
    }

    const body = await request.json();
    const { date, amount, payee, memo, accountId, categoryId, cleared } = body;

    // Get existing transaction to calculate balance difference
    const existing = await prisma.transaction.findUnique({
        where: { id },
    });

    if (!existing) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const newAmountCents = Math.round(amount * 100);
    const amountDiff = newAmountCents - existing.amount;

    // Use a transaction to ensure atomicity of balance updates
    const transaction = await prisma.$transaction(async (tx) => {
        const updated = await tx.transaction.update({
            where: { id },
            data: {
                date: date ? new Date(date) : undefined,
                amount: newAmountCents,
                payee: payee || null,
                memo: memo || null,
                accountId,
                categoryId: categoryId || null,
                cleared: cleared ?? existing.cleared,
            },
            include: {
                account: { select: { id: true, name: true } },
                category: { select: { id: true, name: true } },
            },
        });

        if (accountId === existing.accountId) {
            await tx.account.update({
                where: { id: accountId },
                data: {
                    balance: { increment: amountDiff },
                    clearedBalance: cleared ? { increment: amountDiff } : undefined,
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
                    clearedBalance: cleared ? { increment: newAmountCents } : undefined,
                },
            });
        }

        return updated;
    });

    return NextResponse.json(transaction);
}, 'Update transaction');

// DELETE transaction
export const DELETE = withErrorHandler(async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 });
    }

    // Get existing transaction to reverse balance
    const existing = await prisma.transaction.findUnique({
        where: { id },
    });

    if (!existing) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Use a transaction to ensure atomicity of balance updates
    await prisma.$transaction(async (tx) => {
        await tx.transaction.delete({
            where: { id },
        });

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
