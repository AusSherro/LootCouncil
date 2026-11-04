import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { actionOf, boundedText, centsAmount, idString, monthKey, parseBody, parseWith, readJsonBody, requiredText } from '@/lib/validation';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { findOwnedTemplate, ownsAllCategories } from '@/lib/profileOwnership';
import { getCategoryAvailableMap, getCategoryActivityMap, getMonthRange } from '@/lib/budgetHelpers';

// GET - List all budget templates
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    try {
        const templates = await prisma.budgetTemplate.findMany({
            where: { profileId },
            include: {
                items: {
                    include: {
                        // We can't directly include category, so we'll fetch separately
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        // Enrich with category names
        const categoryIds = [...new Set(templates.flatMap(t => t.items.map(i => i.categoryId)))];
        const categories = await prisma.category.findMany({
            where: { id: { in: categoryIds }, group: { profileId } },
            select: { id: true, name: true },
        });
        const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

        const enriched = templates.map(t => ({
            ...t,
            items: t.items.map(i => ({
                ...i,
                categoryName: categoryMap[i.categoryId] || 'Unknown',
            })),
            totalAmount: t.items.reduce((sum, i) => sum + i.amount, 0),
        }));

        return NextResponse.json({ templates: enriched });
    } catch (error) {
        console.error('Error fetching budget templates:', error);
        return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }
}

// Template item amounts are integer cents (the budget page's values).
const templateItems = z
    .array(z.object({ categoryId: idString, amount: centsAmount }))
    .max(1000, 'Too many template items');
const templateName = requiredText(100);
const templateDescription = boundedText(500).nullish();

const applyTemplateSchema = z.object({
    action: z.literal('apply'),
    templateId: idString,
    month: monthKey,
});

const saveFromMonthSchema = z.object({
    action: z.literal('saveFromMonth'),
    name: templateName,
    description: templateDescription,
    month: monthKey,
});

const createTemplateSchema = z.object({
    name: templateName,
    description: templateDescription,
    items: templateItems.optional(),
});

const updateTemplateSchema = z.object({
    id: idString,
    name: templateName.optional(),
    description: templateDescription,
    items: templateItems.optional(),
});

// POST - Create a new template OR apply a template to a month
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const raw = await readJsonBody(request);
        if (!raw.success) return raw.response;
        const action = actionOf(raw.data);

        // Apply template to a month
        if (action === 'apply') {
            const parsed = parseWith(applyTemplateSchema, raw.data);
            if (!parsed.success) return parsed.response;
            const { templateId, month } = parsed.data;

            const template = await prisma.budgetTemplate.findFirst({
                where: { id: templateId, profileId },
                include: { items: true },
            });

            if (!template) {
                return NextResponse.json({ error: 'Template not found' }, { status: 404 });
            }

            if (!(await ownsAllCategories(profileId, template.items.map(item => item.categoryId)))) {
                return NextResponse.json({ error: 'Template contains unavailable categories' }, { status: 400 });
            }

            // `available` must be recomputed as currentAvailable + assignmentDelta,
            // and changes must cascade forward to subsequent months.
            const templateCategoryIds = template.items.map(item => item.categoryId);
            const [existingBudgets, activityMap, currentAvailableMap] = await Promise.all([
                prisma.monthlyBudget.findMany({
                    where: { month, categoryId: { in: templateCategoryIds } },
                    select: { categoryId: true, assigned: true },
                }),
                getCategoryActivityMap(templateCategoryIds, getMonthRange(month)),
                getCategoryAvailableMap(templateCategoryIds, month),
            ]);
            const existingMap = new Map(existingBudgets.map(b => [b.categoryId, b.assigned]));

            await prisma.$transaction(async (tx) => {
                for (const item of template.items) {
                    const activity = activityMap.get(item.categoryId) ?? 0;
                    const existingAssigned = existingMap.get(item.categoryId) ?? 0;
                    const assignmentDelta = item.amount - existingAssigned;
                    const available = (currentAvailableMap.get(item.categoryId) ?? 0) + assignmentDelta;

                    await tx.monthlyBudget.upsert({
                        where: { month_categoryId: { month, categoryId: item.categoryId } },
                        create: {
                            month,
                            categoryId: item.categoryId,
                            assigned: item.amount,
                            activity,
                            available,
                        },
                        update: {
                            assigned: item.amount,
                            activity,
                            available,
                        },
                    });

                    if (assignmentDelta !== 0) {
                        await tx.monthlyBudget.updateMany({
                            where: { categoryId: item.categoryId, month: { gt: month } },
                            data: { available: { increment: assignmentDelta } },
                        });
                    }
                }
            });

            return NextResponse.json({ success: true, applied: template.items.length });
        }

        // Save current month as template
        if (action === 'saveFromMonth') {
            const parsed = parseWith(saveFromMonthSchema, raw.data);
            if (!parsed.success) return parsed.response;
            const { name, description, month } = parsed.data;

            // Get all monthly budgets for this month
            const monthlyBudgets = await prisma.monthlyBudget.findMany({
                where: { month, assigned: { gt: 0 }, category: { group: { profileId } } },
            });

            if (monthlyBudgets.length === 0) {
                return NextResponse.json({ error: 'No budgets found for this month' }, { status: 400 });
            }

            const template = await prisma.budgetTemplate.create({
                data: {
                    name,
                    description: description || null,
                    profileId,
                    items: {
                        create: monthlyBudgets.map(mb => ({
                            categoryId: mb.categoryId,
                            amount: mb.assigned,
                        })),
                    },
                },
                include: { items: true },
            });

            return NextResponse.json({ template });
        }

        // Create a new template manually
        const parsed = parseWith(createTemplateSchema, raw.data);
        if (!parsed.success) return parsed.response;
        const { name, description, items } = parsed.data;

        const itemList = items ?? [];
        if (!(await ownsAllCategories(profileId, itemList.map(item => item.categoryId)))) {
            return NextResponse.json({ error: 'One or more categories were not found' }, { status: 404 });
        }

        const template = await prisma.budgetTemplate.create({
            data: {
                name,
                description: description || null,
                profileId,
                items: itemList.length > 0 ? {
                    create: itemList.map(item => ({
                        categoryId: item.categoryId,
                        amount: item.amount,
                    })),
                } : undefined,
            },
            include: { items: true },
        });

        return NextResponse.json({ template });
    } catch (error) {
        console.error('Error creating budget template:', error);
        return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
    }
}

// PATCH - Update a template
export async function PATCH(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const parsed = await parseBody(request, updateTemplateSchema);
        if (!parsed.success) return parsed.response;
        const { id, name, description, items } = parsed.data;
        if (!(await findOwnedTemplate(profileId, id))) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        if (items && !(await ownsAllCategories(profileId, items.map(item => item.categoryId)))) {
            return NextResponse.json({ error: 'One or more categories were not found' }, { status: 404 });
        }

        const template = await prisma.$transaction(async tx => {
            const updated = await tx.budgetTemplate.update({
                where: { id },
                data: {
                    name: name || undefined,
                    description: description !== undefined ? description : undefined,
                },
            });

            if (items) {
                await tx.budgetTemplateItem.deleteMany({ where: { templateId: id } });
                await tx.budgetTemplateItem.createMany({
                    data: items.map(item => ({
                        templateId: id,
                        categoryId: item.categoryId,
                        amount: item.amount,
                    })),
                });
            }

            return updated;
        });

        return NextResponse.json({ template });
    } catch (error) {
        console.error('Error updating budget template:', error);
        return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
    }
}

// DELETE - Remove a template
export async function DELETE(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    try {
        if (!(await findOwnedTemplate(profileId, id))) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        await prisma.budgetTemplate.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting budget template:', error);
        return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
    }
}
