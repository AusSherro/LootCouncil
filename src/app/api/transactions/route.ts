import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET all transactions
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const includeRunningBalance = searchParams.get('runningBalance') === 'true';

    try {
        const where: {
            accountId?: string;
            date?: { gte?: Date; lte?: Date };
        } = {};
        
        if (accountId) {
            where.accountId = accountId;
        }
        
        if (startDate || endDate) {
            where.date = {};
            if (startDate) {
                where.date.gte = new Date(startDate);
            }
            if (endDate) {
                where.date.lte = new Date(endDate);
            }
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
    } catch (error) {
        console.error('Error fetching transactions:', error);
        return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
    }
}

// POST create new transaction
export async function POST(request: NextRequest) {
    try {
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
    } catch (error) {
        console.error('Error creating transaction:', error);
        return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
    }
}

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
export async function PUT(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 });
    }

    try {
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
    } catch (error) {
        console.error('Error updating transaction:', error);
        return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
    }
}

// DELETE transaction
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 });
    }

    try {
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
    } catch (error) {
        console.error('Error deleting transaction:', error);
        return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
    }
}
