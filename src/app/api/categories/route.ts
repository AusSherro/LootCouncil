import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET all categories with groups
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const showHidden = searchParams.get('showHidden') === 'true';

    try {
        const categoryGroups = await prisma.categoryGroup.findMany({
            where: showHidden ? {} : { isHidden: false },
            include: {
                categories: {
                    where: showHidden ? {} : { isHidden: false },
                    orderBy: { sortOrder: 'asc' },
                },
            },
            orderBy: { sortOrder: 'asc' },
        });

        return NextResponse.json({ categoryGroups });
    } catch (error) {
        console.error('Error fetching categories:', error);
        return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }
}

// POST - Create a new category or category group
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { type, name, groupId } = body;

        if (type === 'group') {
            // Create a new category group
            const maxSortOrder = await prisma.categoryGroup.aggregate({
                _max: { sortOrder: true },
            });
            const newGroup = await prisma.categoryGroup.create({
                data: {
                    name,
                    sortOrder: (maxSortOrder._max.sortOrder || 0) + 1,
                    isHidden: false,
                },
            });
            return NextResponse.json({ group: newGroup });
        } else {
            // Create a new category
            if (!groupId) {
                return NextResponse.json({ error: 'groupId required for category' }, { status: 400 });
            }
            const maxSortOrder = await prisma.category.aggregate({
                _max: { sortOrder: true },
                where: { groupId },
            });
            const newCategory = await prisma.category.create({
                data: {
                    name,
                    groupId,
                    sortOrder: (maxSortOrder._max.sortOrder || 0) + 1,
                    isHidden: false,
                },
            });
            return NextResponse.json({ category: newCategory });
        }
    } catch (error) {
        console.error('Error creating category:', error);
        return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
    }
}

// PATCH - Update category or group (hide/unhide, rename, reorder, move)
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { type, id, updates } = body;

        if (type === 'group') {
            // Whitelist allowed fields for category groups
            const { name, isHidden, sortOrder } = updates ?? {};
            const safeUpdates: Record<string, unknown> = {};
            if (name !== undefined) safeUpdates.name = name;
            if (isHidden !== undefined) safeUpdates.isHidden = isHidden;
            if (sortOrder !== undefined) safeUpdates.sortOrder = sortOrder;

            const updated = await prisma.categoryGroup.update({
                where: { id },
                data: safeUpdates,
            });
            return NextResponse.json({ group: updated });
        } else {
            // Whitelist allowed fields for categories
            const { name, isHidden, sortOrder, groupId } = updates ?? {};
            const safeUpdates: Record<string, unknown> = {};
            if (name !== undefined) safeUpdates.name = name;
            if (isHidden !== undefined) safeUpdates.isHidden = isHidden;
            if (sortOrder !== undefined) safeUpdates.sortOrder = sortOrder;
            if (groupId !== undefined) safeUpdates.groupId = groupId;

            const updated = await prisma.category.update({
                where: { id },
                data: safeUpdates,
            });
            return NextResponse.json({ category: updated });
        }
    } catch (error) {
        console.error('Error updating category:', error);
        return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
    }
}

// DELETE - Permanently delete a category or group (only if no transactions)
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID required' }, { status: 400 });
        }

        if (type === 'group') {
            // Check if group exists
            const group = await prisma.categoryGroup.findUnique({ where: { id } });
            if (!group) {
                return NextResponse.json({ error: 'Category group not found' }, { status: 404 });
            }

            // Check if group has categories with transactions
            const categories = await prisma.category.findMany({
                where: { groupId: id },
                include: { transactions: { take: 1 } },
            });
            const hasTransactions = categories.some(c => c.transactions.length > 0);
            if (hasTransactions) {
                return NextResponse.json({ 
                    error: 'Cannot delete group with transactions. Hide it instead.' 
                }, { status: 400 });
            }
            await prisma.category.deleteMany({ where: { groupId: id } });
            await prisma.categoryGroup.delete({ where: { id } });
            return NextResponse.json({ success: true });
        } else {
            // Check if category exists
            const category = await prisma.category.findUnique({ where: { id } });
            if (!category) {
                return NextResponse.json({ error: 'Category not found' }, { status: 404 });
            }

            // Check if category has transactions
            const txCount = await prisma.transaction.count({ where: { categoryId: id } });
            if (txCount > 0) {
                return NextResponse.json({ 
                    error: 'Cannot delete category with transactions. Hide it instead.' 
                }, { status: 400 });
            }
            await prisma.monthlyBudget.deleteMany({ where: { categoryId: id } });
            await prisma.category.delete({ where: { id } });
            return NextResponse.json({ success: true });
        }
    } catch (error) {
        console.error('Error deleting category:', error);
        return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
    }
}

// Bulk reorder categories or groups
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { type, items, orders } = body; // items/orders: [{ id, sortOrder, groupId? }]
        const data = items || orders; // Support both field names

        if (!data || !Array.isArray(data)) {
            return NextResponse.json({ error: 'items or orders array required' }, { status: 400 });
        }

        if (type === 'groups') {
            await Promise.all(
                data.map((item: { id: string; sortOrder: number }) =>
                    prisma.categoryGroup.update({
                        where: { id: item.id },
                        data: { sortOrder: item.sortOrder },
                    })
                )
            );
        } else if (type === 'categories') {
            await Promise.all(
                data.map((item: { id: string; sortOrder: number; groupId?: string }) =>
                    prisma.category.update({
                        where: { id: item.id },
                        data: { 
                            sortOrder: item.sortOrder,
                            ...(item.groupId && { groupId: item.groupId }),
                        },
                    })
                )
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error reordering:', error);
        return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
    }
}
