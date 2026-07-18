import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { findOwnedTemplate, ownsAllCategories } from '@/lib/profileOwnership';

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

// POST - Create a new template OR apply a template to a month
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const body = await request.json();

        // Apply template to a month
        if (body.action === 'apply') {
            const { templateId, month } = body;
            if (!templateId || !month) {
                return NextResponse.json({ error: 'Missing templateId or month' }, { status: 400 });
            }

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

            await prisma.$transaction(template.items.map(item =>
                prisma.monthlyBudget.upsert({
                    where: { month_categoryId: { month, categoryId: item.categoryId } },
                    create: {
                        month,
                        categoryId: item.categoryId,
                        assigned: item.amount,
                        activity: 0,
                        available: item.amount,
                    },
                    update: {
                        assigned: item.amount,
                        // Recalculate available based on previous balance
                    },
                })
            ));

            return NextResponse.json({ success: true, applied: template.items.length });
        }

        // Save current month as template
        if (body.action === 'saveFromMonth') {
            const { name, description, month } = body;
            if (!name || !month) {
                return NextResponse.json({ error: 'Missing name or month' }, { status: 400 });
            }

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
        const { name, description, items } = body;
        if (!name) {
            return NextResponse.json({ error: 'Missing template name' }, { status: 400 });
        }

        const itemList = Array.isArray(items) ? items : [];
        if (!(await ownsAllCategories(profileId, itemList.map((item: { categoryId: string }) => item.categoryId)))) {
            return NextResponse.json({ error: 'One or more categories were not found' }, { status: 404 });
        }

        const template = await prisma.budgetTemplate.create({
            data: {
                name,
                description: description || null,
                profileId,
                items: itemList.length > 0 ? {
                    create: itemList.map((item: { categoryId: string; amount: number }) => ({
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
        const body = await request.json();
        const { id, name, description, items } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing template ID' }, { status: 400 });
        }
        if (!(await findOwnedTemplate(profileId, id))) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        if (items && !(await ownsAllCategories(profileId, items.map((item: { categoryId: string }) => item.categoryId)))) {
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
                    data: items.map((item: { categoryId: string; amount: number }) => ({
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
