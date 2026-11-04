import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import {
    findOwnedCategory,
    findOwnedCategoryGroup,
    ownsAllCategories,
    ownsAllCategoryGroups,
} from '@/lib/profileOwnership';
import { z } from 'zod';
import { boundedText, centsAmount, idString, isoDate, parseBody, requiredText } from '@/lib/validation';

const sortOrder = z.number().int().min(0).max(1_000_000);
const smallInt = z.number().int().min(0).max(10_000);

const createCategorySchema = z.object({
    type: z.enum(['group', 'category']).optional(),
    name: requiredText(100),
    groupId: idString.optional(),
});

const updateCategorySchema = z.object({
    type: z.enum(['group', 'category']).optional(),
    id: idString,
    updates: z.object({
        name: requiredText(100).optional(),
        isHidden: z.boolean().optional(),
        sortOrder: sortOrder.optional(),
        groupId: idString.optional(),
        goalType: boundedText(20).nullish(),
        goalTarget: centsAmount.nullish(),
        goalDueDate: z.preprocess(value => (value === '' ? null : value), isoDate.nullable()).optional(),
        goalPercentageComplete: z.number().int().min(0).max(100).nullish(),
        goalUnderFunded: centsAmount.nullish(),
        goalOverallFunded: centsAmount.nullish(),
        goalOverallLeft: centsAmount.nullish(),
        goalCadence: smallInt.nullish(),
        goalCadenceFrequency: smallInt.nullish(),
    }).default({}),
});

const reorderItem = z.object({
    id: idString,
    sortOrder,
    groupId: idString.optional(),
});

const reorderSchema = z.object({
    type: z.enum(['groups', 'categories']),
    items: z.array(reorderItem).max(10_000).optional(),
    orders: z.array(reorderItem).max(10_000).optional(),
}).refine(body => body.items || body.orders, { message: 'items or orders array required' });

// GET all categories with groups
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const showHidden = searchParams.get('showHidden') === 'true';

    try {
        const categoryGroups = await prisma.categoryGroup.findMany({
            where: showHidden ? { profileId } : { isHidden: false, profileId },
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
        const profileId = await getProfileId(request);
        const parsed = await parseBody(request, createCategorySchema);
        if (!parsed.success) return parsed.response;
        const { type, name, groupId } = parsed.data;

        if (type === 'group') {
            // Create a new category group
            const maxSortOrder = await prisma.categoryGroup.aggregate({
                _max: { sortOrder: true },
                where: { profileId },
            });
            const newGroup = await prisma.categoryGroup.create({
                data: {
                    name,
                    sortOrder: (maxSortOrder._max.sortOrder || 0) + 1,
                    isHidden: false,
                    profileId,
                },
            });
            return NextResponse.json({ group: newGroup });
        } else {
            // Create a new category
            if (!groupId) {
                return NextResponse.json({ error: 'groupId required for category' }, { status: 400 });
            }
            if (!(await findOwnedCategoryGroup(profileId, groupId))) {
                return NextResponse.json({ error: 'Category group not found' }, { status: 404 });
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
        const profileId = await getProfileId(request);
        const parsed = await parseBody(request, updateCategorySchema);
        if (!parsed.success) return parsed.response;
        const { type, id, updates } = parsed.data;

        if (type === 'group') {
            if (!(await findOwnedCategoryGroup(profileId, id))) {
                return NextResponse.json({ error: 'Category group not found' }, { status: 404 });
            }
            // Whitelist allowed fields for category groups
            const { name, isHidden, sortOrder } = updates;
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
            if (!(await findOwnedCategory(profileId, id))) {
                return NextResponse.json({ error: 'Category not found' }, { status: 404 });
            }
            // Whitelist allowed fields for categories
            const { name, isHidden, sortOrder, groupId,
                goalType, goalTarget, goalDueDate,
                goalPercentageComplete, goalUnderFunded,
                goalOverallFunded, goalOverallLeft,
                goalCadence, goalCadenceFrequency,
            } = updates;
            const safeUpdates: Record<string, unknown> = {};
            if (name !== undefined) safeUpdates.name = name;
            if (isHidden !== undefined) safeUpdates.isHidden = isHidden;
            if (sortOrder !== undefined) safeUpdates.sortOrder = sortOrder;
            if (groupId !== undefined) {
                if (!(await findOwnedCategoryGroup(profileId, groupId))) {
                    return NextResponse.json({ error: 'Category group not found' }, { status: 404 });
                }
                safeUpdates.groupId = groupId;
            }
            // Goal fields
            if (goalType !== undefined) safeUpdates.goalType = goalType;
            if (goalTarget !== undefined) safeUpdates.goalTarget = goalTarget;
            if (goalDueDate !== undefined) safeUpdates.goalDueDate = goalDueDate;
            if (goalPercentageComplete !== undefined) safeUpdates.goalPercentageComplete = goalPercentageComplete;
            if (goalUnderFunded !== undefined) safeUpdates.goalUnderFunded = goalUnderFunded;
            if (goalOverallFunded !== undefined) safeUpdates.goalOverallFunded = goalOverallFunded;
            if (goalOverallLeft !== undefined) safeUpdates.goalOverallLeft = goalOverallLeft;
            if (goalCadence !== undefined) safeUpdates.goalCadence = goalCadence;
            if (goalCadenceFrequency !== undefined) safeUpdates.goalCadenceFrequency = goalCadenceFrequency;

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
        const profileId = await getProfileId(request);
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID required' }, { status: 400 });
        }

        if (type === 'group') {
            // Check if group exists
            const group = await findOwnedCategoryGroup(profileId, id);
            if (!group) {
                return NextResponse.json({ error: 'Category group not found' }, { status: 404 });
            }

            // Check if group has categories with transactions or split sub-transactions
            const categories = await prisma.category.findMany({
                where: { groupId: id },
                include: {
                    transactions: { take: 1 },
                    subTransactions: { take: 1 },
                },
            });
            const hasTransactions = categories.some(
                c => c.transactions.length > 0 || c.subTransactions.length > 0
            );
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
            const category = await findOwnedCategory(profileId, id);
            if (!category) {
                return NextResponse.json({ error: 'Category not found' }, { status: 404 });
            }

            // Check if category has transactions or split sub-transactions
            const [txCount, subTxCount] = await Promise.all([
                prisma.transaction.count({ where: { categoryId: id } }),
                prisma.subTransaction.count({ where: { categoryId: id } }),
            ]);
            if (txCount > 0 || subTxCount > 0) {
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
        const profileId = await getProfileId(request);
        const parsed = await parseBody(request, reorderSchema);
        if (!parsed.success) return parsed.response;
        const { type, items, orders } = parsed.data;
        const data = items ?? orders ?? []; // Support both field names

        if (type === 'groups') {
            if (!(await ownsAllCategoryGroups(profileId, data.map(item => item.id)))) {
                return NextResponse.json({ error: 'One or more category groups were not found' }, { status: 404 });
            }
            await Promise.all(
                data.map(item =>
                    prisma.categoryGroup.update({
                        where: { id: item.id },
                        data: { sortOrder: item.sortOrder },
                    })
                )
            );
        } else if (type === 'categories') {
            if (!(await ownsAllCategories(profileId, data.map(item => item.id)))) {
                return NextResponse.json({ error: 'One or more categories were not found' }, { status: 404 });
            }
            const destinationGroupIds = data
                .map(item => item.groupId)
                .filter((groupId): groupId is string => Boolean(groupId));
            if (!(await ownsAllCategoryGroups(profileId, destinationGroupIds))) {
                return NextResponse.json({ error: 'One or more destination groups were not found' }, { status: 404 });
            }
            await Promise.all(
                data.map(item =>
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
