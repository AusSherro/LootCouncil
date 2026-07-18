import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { matchesRule } from '@/lib/ruleEngine';
import { findOwnedCategory, findOwnedRule } from '@/lib/profileOwnership';

// GET - List all transaction rules
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    try {
        const rules = await prisma.transactionRule.findMany({
            where: { profileId },
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
        const profileId = await getProfileId(request);
        const body = await request.json();
        
        // If applying rules to a transaction
        if (body.action === 'apply') {
            const { payee, memo, amount } = body;
            const result = await applyRules(profileId, payee, memo, amount);
            return NextResponse.json(result);
        }

        // Create a new rule
        const { name, matchField, matchType, matchValue, categoryId, payeeRename, memoTemplate, priority } = body;

        if (!name || !matchField || !matchType || !matchValue) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (categoryId && !(await findOwnedCategory(profileId, categoryId))) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
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
                profileId,
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
        const profileId = await getProfileId(request);
        const body = await request.json();
        const { id, name, matchField, matchType, matchValue, categoryId, payeeRename, memoTemplate, priority, isActive } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing rule ID' }, { status: 400 });
        }
        if (!(await findOwnedRule(profileId, id))) {
            return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
        }
        if (categoryId && !(await findOwnedCategory(profileId, categoryId))) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }

        // Whitelist allowed fields only
        const safeUpdates: Record<string, unknown> = {};
        if (name !== undefined) safeUpdates.name = name;
        if (matchField !== undefined) safeUpdates.matchField = matchField;
        if (matchType !== undefined) safeUpdates.matchType = matchType;
        if (matchValue !== undefined) safeUpdates.matchValue = matchValue;
        if (categoryId !== undefined) safeUpdates.categoryId = categoryId || null;
        if (payeeRename !== undefined) safeUpdates.payeeRename = payeeRename || null;
        if (memoTemplate !== undefined) safeUpdates.memoTemplate = memoTemplate || null;
        if (priority !== undefined) safeUpdates.priority = priority;
        if (isActive !== undefined) safeUpdates.isActive = isActive;

        const rule = await prisma.transactionRule.update({
            where: { id },
            data: safeUpdates,
        });

        return NextResponse.json({ rule });
    } catch (error) {
        console.error('Error updating transaction rule:', error);
        return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
    }
}

// DELETE - Remove a rule
export async function DELETE(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    try {
        if (!(await findOwnedRule(profileId, id))) {
            return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
        }
        await prisma.transactionRule.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting transaction rule:', error);
        return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
    }
}

// Helper: Apply all active rules to find a match
async function applyRules(profileId: string, payee: string | null, memo: string | null, amount: number) {
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
