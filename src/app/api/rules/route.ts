import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - List all transaction rules
export async function GET() {
    try {
        const rules = await prisma.transactionRule.findMany({
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        });
        return NextResponse.json({ rules });
    } catch (error) {
        console.error('Error fetching transaction rules:', error);
        return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
    }
}

// POST - Create a new rule OR apply rules to a transaction
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        
        // If applying rules to a transaction
        if (body.action === 'apply') {
            const { payee, memo, amount } = body;
            const result = await applyRules(payee, memo, amount);
            return NextResponse.json(result);
        }

        // Create a new rule
        const { name, matchField, matchType, matchValue, categoryId, payeeRename, memoTemplate, priority } = body;

        if (!name || !matchField || !matchType || !matchValue) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const rule = await prisma.transactionRule.create({
            data: {
                name,
                matchField,
                matchType,
                matchValue,
                categoryId: categoryId || null,
                payeeRename: payeeRename || null,
                memoTemplate: memoTemplate || null,
                priority: priority || 0,
            },
        });

        return NextResponse.json({ rule });
    } catch (error) {
        console.error('Error creating transaction rule:', error);
        return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
    }
}

// PATCH - Update an existing rule
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing rule ID' }, { status: 400 });
        }

        const rule = await prisma.transactionRule.update({
            where: { id },
            data: updates,
        });

        return NextResponse.json({ rule });
    } catch (error) {
        console.error('Error updating transaction rule:', error);
        return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
    }
}

// DELETE - Remove a rule
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    try {
        await prisma.transactionRule.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting transaction rule:', error);
        return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
    }
}

// Helper: Apply all active rules to find a match
async function applyRules(payee: string | null, memo: string | null, amount: number) {
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

        if (isMatch(valueToMatch, rule.matchType, rule.matchValue)) {
            // Found a matching rule
            return {
                matched: true,
                rule: {
                    id: rule.id,
                    name: rule.name,
                    categoryId: rule.categoryId,
                    payeeRename: rule.payeeRename,
                    memoTemplate: rule.memoTemplate,
                },
            };
        }
    }

    return { matched: false };
}

function isMatch(value: string, matchType: string, matchValue: string): boolean {
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
                const regex = new RegExp(matchValue, 'i');
                return regex.test(value);
            } catch {
                return false;
            }
        default:
            return false;
    }
}
