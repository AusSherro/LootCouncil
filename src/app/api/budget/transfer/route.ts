import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { calculateActivity, getCategoryAvailableMap } from '@/lib/budgetHelpers';

// POST - Transfer funds between budget categories (or to/from Ready to Assign)
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const body = await request.json();
        const { fromCategoryId, toCategoryId, amount, month } = body;

        if (!amount || !month) {
            return NextResponse.json(
                { error: 'Missing required fields: amount, month' },
                { status: 400 }
            );
        }

        if (!fromCategoryId && !toCategoryId) {
            return NextResponse.json(
                { error: 'At least one of fromCategoryId or toCategoryId must be specified' },
                { status: 400 }
            );
        }

        if (fromCategoryId && toCategoryId && fromCategoryId === toCategoryId) {
            return NextResponse.json(
                { error: 'Cannot transfer to the same category' },
                { status: 400 }
            );
        }

        const amountCents = Math.round(amount * 100);
        if (amountCents <= 0) {
            return NextResponse.json(
                { error: 'Transfer amount must be positive' },
                { status: 400 }
            );
        }

        // Case 1: Category → Ready to Assign (reduce category assignment)
        if (fromCategoryId && !toCategoryId) {
            // SEC-5: scope lookup to the active profile so cross-profile IDs 404.
            const category = await prisma.category.findFirst({
                where: { id: fromCategoryId, group: { profileId } },
                select: { id: true },
            });
            if (!category) {
                return NextResponse.json({ error: 'Category not found' }, { status: 404 });
            }

            const [budget, activity, currentAvailableMap] = await Promise.all([
                prisma.monthlyBudget.findUnique({
                    where: { month_categoryId: { month, categoryId: fromCategoryId } },
                }),
                calculateActivity(fromCategoryId, month),
                getCategoryAvailableMap([fromCategoryId], month),
            ]);

            const oldAssigned = budget?.assigned ?? 0;
            const newAssigned = oldAssigned - amountCents;
            const available = (currentAvailableMap.get(fromCategoryId) ?? 0) - amountCents;

            await prisma.$transaction(async (tx) => {
                await tx.monthlyBudget.upsert({
                    where: { month_categoryId: { month, categoryId: fromCategoryId } },
                    create: { month, categoryId: fromCategoryId, assigned: newAssigned, activity, available },
                    update: { assigned: newAssigned, activity, available },
                });

                await tx.monthlyBudget.updateMany({
                    where: { categoryId: fromCategoryId, month: { gt: month } },
                    data: { available: { decrement: amountCents } },
                });
            });

            // RTA auto-adjusts since it's calculated from account balances - envelope totals

            return NextResponse.json({
                success: true,
                from: { categoryId: fromCategoryId, assigned: newAssigned, available },
                to: { readyToAssign: true },
                transferred: amountCents,
            });
        }

        // Case 2: Ready to Assign → Category (increase category assignment)
        if (!fromCategoryId && toCategoryId) {
            // SEC-5: scope lookup to the active profile so cross-profile IDs 404.
            const category = await prisma.category.findFirst({
                where: { id: toCategoryId, group: { profileId } },
                select: { id: true },
            });
            if (!category) {
                return NextResponse.json({ error: 'Category not found' }, { status: 404 });
            }

            const [budget, activity, currentAvailableMap] = await Promise.all([
                prisma.monthlyBudget.findUnique({
                    where: { month_categoryId: { month, categoryId: toCategoryId } },
                }),
                calculateActivity(toCategoryId, month),
                getCategoryAvailableMap([toCategoryId], month),
            ]);

            const oldAssigned = budget?.assigned ?? 0;
            const newAssigned = oldAssigned + amountCents;
            const available = (currentAvailableMap.get(toCategoryId) ?? 0) + amountCents;

            await prisma.$transaction(async (tx) => {
                await tx.monthlyBudget.upsert({
                    where: { month_categoryId: { month, categoryId: toCategoryId } },
                    create: { month, categoryId: toCategoryId, assigned: newAssigned, activity, available },
                    update: { assigned: newAssigned, activity, available },
                });

                await tx.monthlyBudget.updateMany({
                    where: { categoryId: toCategoryId, month: { gt: month } },
                    data: { available: { increment: amountCents } },
                });
            });

            // RTA auto-adjusts since it's calculated from account balances - envelope totals

            return NextResponse.json({
                success: true,
                from: { readyToAssign: true },
                to: { categoryId: toCategoryId, assigned: newAssigned, available },
                transferred: amountCents,
            });
        }

        // Case 3: Category → Category (original behavior)
        // SEC-5: scope both lookups to the active profile so cross-profile IDs 404.
        const [fromCategory, toCategory] = await Promise.all([
            prisma.category.findFirst({
                where: { id: fromCategoryId, group: { profileId } },
                select: { id: true },
            }),
            prisma.category.findFirst({
                where: { id: toCategoryId, group: { profileId } },
                select: { id: true },
            }),
        ]);

        if (!fromCategory || !toCategory) {
            return NextResponse.json(
                { error: 'One or both categories not found' },
                { status: 404 }
            );
        }

        // Get current assignments, activities, and availables
        const [fromBudget, toBudget, fromActivity, toActivity, availableMap] = await Promise.all([
            prisma.monthlyBudget.findUnique({
                where: { month_categoryId: { month, categoryId: fromCategoryId } },
            }),
            prisma.monthlyBudget.findUnique({
                where: { month_categoryId: { month, categoryId: toCategoryId } },
            }),
            calculateActivity(fromCategoryId, month),
            calculateActivity(toCategoryId, month),
            getCategoryAvailableMap([fromCategoryId, toCategoryId], month),
        ]);

        const fromAssigned = fromBudget?.assigned ?? 0;
        const toAssigned = toBudget?.assigned ?? 0;

        const newFromAssigned = fromAssigned - amountCents;
        const newToAssigned = toAssigned + amountCents;

        const fromAvailable = (availableMap.get(fromCategoryId) ?? 0) - amountCents;
        const toAvailable = (availableMap.get(toCategoryId) ?? 0) + amountCents;

        // Atomically update both categories in a transaction and cascade to future months
        await prisma.$transaction(async (tx) => {
            await tx.monthlyBudget.upsert({
                where: { month_categoryId: { month, categoryId: fromCategoryId } },
                create: {
                    month,
                    categoryId: fromCategoryId,
                    assigned: newFromAssigned,
                    activity: fromActivity,
                    available: fromAvailable,
                },
                update: {
                    assigned: newFromAssigned,
                    activity: fromActivity,
                    available: fromAvailable,
                },
            });
            await tx.monthlyBudget.upsert({
                where: { month_categoryId: { month, categoryId: toCategoryId } },
                create: {
                    month,
                    categoryId: toCategoryId,
                    assigned: newToAssigned,
                    activity: toActivity,
                    available: toAvailable,
                },
                update: {
                    assigned: newToAssigned,
                    activity: toActivity,
                    available: toAvailable,
                },
            });

            await tx.monthlyBudget.updateMany({
                where: { categoryId: fromCategoryId, month: { gt: month } },
                data: { available: { decrement: amountCents } },
            });
            await tx.monthlyBudget.updateMany({
                where: { categoryId: toCategoryId, month: { gt: month } },
                data: { available: { increment: amountCents } },
            });
        });

        return NextResponse.json({
            success: true,
            from: { categoryId: fromCategoryId, assigned: newFromAssigned, available: fromAvailable },
            to: { categoryId: toCategoryId, assigned: newToAssigned, available: toAvailable },
            transferred: amountCents,
        });
    } catch (error) {
        console.error('Error transferring budget funds:', error);
        return NextResponse.json({ error: 'Failed to transfer funds' }, { status: 500 });
    }
}
