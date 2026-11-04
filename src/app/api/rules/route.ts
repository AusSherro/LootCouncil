import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { findMatchingRule } from '@/lib/ruleEngine';
import { findOwnedCategory, findOwnedRule } from '@/lib/profileOwnership';
import { z } from 'zod';
import { boundedText, idString, moneyAmount, nullableId, parseBody, parseWith, requiredText } from '@/lib/validation';

const matchField = z.enum(['payee', 'memo', 'amount']);
// 'exact' is what the rules settings form sends for "Exact Match"; the rule
// engine only knows 'equals'. Both are accepted here so existing forms keep working.
const matchType = z.enum(['contains', 'equals', 'exact', 'startsWith', 'endsWith', 'regex']);
// Not trimmed: leading/trailing spaces are meaningful in a "contains" match.
const matchValue = z.string().min(1, 'is required').max(200, 'must be at most 200 characters');
const priority = z.number().int().min(-1000).max(1000);

const createRuleSchema = z.object({
    name: requiredText(100),
    matchField,
    matchType,
    matchValue,
    categoryId: nullableId.optional(),
    payeeRename: boundedText(200).nullish(),
    memoTemplate: boundedText(500).nullish(),
    priority: priority.nullish(),
});

const applyRulesSchema = z.object({
    action: z.literal('apply'),
    payee: boundedText(200).nullish(),
    memo: boundedText(500).nullish(),
    amount: moneyAmount,
});

const updateRuleSchema = z.object({
    id: idString,
    name: requiredText(100).optional(),
    matchField: matchField.optional(),
    matchType: matchType.optional(),
    matchValue: matchValue.optional(),
    categoryId: nullableId.optional(),
    payeeRename: boundedText(200).nullish(),
    memoTemplate: boundedText(500).nullish(),
    priority: priority.optional(),
    isActive: z.boolean().optional(),
});

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
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid request: body must be valid JSON' }, { status: 400 });
        }

        // If applying rules to a transaction
        if ((body as { action?: unknown } | null)?.action === 'apply') {
            const applyParsed = parseWith(applyRulesSchema, body);
            if (!applyParsed.success) return applyParsed.response;
            const { payee, memo, amount } = applyParsed.data;
            const result = await applyRules(profileId, payee ?? null, memo ?? null, amount);
            return NextResponse.json(result);
        }

        // Create a new rule
        const parsed = parseWith(createRuleSchema, body);
        if (!parsed.success) return parsed.response;
        const { name, matchField, matchType, matchValue, categoryId, payeeRename, memoTemplate, priority } = parsed.data;

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
                priority: priority ?? 0,
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
        const parsed = await parseBody(request, updateRuleSchema);
        if (!parsed.success) return parsed.response;
        const { id, name, matchField, matchType, matchValue, categoryId, payeeRename, memoTemplate, priority, isActive } = parsed.data;
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
        if (categoryId !== undefined) safeUpdates.categoryId = categoryId;
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

    const rule = findMatchingRule(rules, { payee, memo, amount });
    if (!rule) return { matched: false };

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
