import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';
import { ownsAllCategories } from '@/lib/profileOwnership';
import { calculateReadyToAssign, calculateGoalUnderFunded, getCategoryAvailableMap, getCategoryActivityMap, getMonthRange } from '@/lib/budgetHelpers';

interface CategoryWithGoal {
    id: string;
    name: string;
    goalType: string | null;
    goalTarget: number | null; // cents
    goalDueDate: Date | null;
    goalUnderFunded: number | null; // cents
    assigned: number;
    available: number;
}

function calculateMonthlyNeeded(
    category: CategoryWithGoal,
    currentMonth: string
): number {
    if (!category.goalType) return 0;
    if (category.goalType === 'DEBT' && !category.goalTarget && category.goalUnderFunded && category.goalUnderFunded > 0) {
        return category.goalUnderFunded;
    }
    return calculateGoalUnderFunded(
        category.goalType,
        category.goalTarget,
        category.goalDueDate,
        category.available,
        currentMonth,
        category.assigned,
    );
}

// POST - Auto-assign money to categories with goals
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const body = await request.json();
        const { month } = body;
        
        if (!month) {
            return NextResponse.json({ error: 'Month required (YYYY-MM format)' }, { status: 400 });
        }

        // Always calculate RTA from account balances - envelope totals
        const readyToAssign = await calculateReadyToAssign(profileId, month);
        
        if (readyToAssign <= 0) {
            return NextResponse.json({
                success: true,
                message: 'No money available to assign',
                assigned: 0,
                categories: [],
                readyToAssign: readyToAssign,
            });
        }

        // Get all categories with goals scoped to the active profile
        const categories = await prisma.category.findMany({
            where: {
                goalType: { not: null },
                isHidden: false,
                group: {
                    profileId,
                    isHidden: false,
                },
            },
            include: {
                monthlyData: {
                    where: { month },
                    take: 1,
                },
                group: {
                    select: { sortOrder: true },
                },
            },
            orderBy: [
                { group: { sortOrder: 'asc' } },
                { sortOrder: 'asc' },
            ],
        });

        const categoryIds = categories.map(c => c.id);
        const [availableMap, activityMap] = await Promise.all([
            getCategoryAvailableMap(categoryIds, month),
            getCategoryActivityMap(categoryIds, getMonthRange(month)),
        ]);

        const assignments: { categoryId: string; categoryName: string; amount: number }[] = [];
        let totalAssigned = 0;
        let remainingBudget = readyToAssign;

        for (const cat of categories) {
            if (remainingBudget <= 0) break;

            const existing = cat.monthlyData[0];
            const currentAssigned = existing?.assigned ?? 0;
            const currentAvailable = availableMap.get(cat.id) ?? 0;
            const currentActivity = activityMap.get(cat.id) ?? 0;

            const categoryWithGoal: CategoryWithGoal = {
                id: cat.id,
                name: cat.name,
                goalType: cat.goalType,
                goalTarget: cat.goalTarget,
                goalDueDate: cat.goalDueDate,
                goalUnderFunded: cat.goalUnderFunded,
                assigned: currentAssigned,
                available: currentAvailable,
            };

            const needed = calculateMonthlyNeeded(categoryWithGoal, month);
            
            if (needed <= 0) continue;
            
            // Assign up to what we have available
            const toAssign = Math.min(needed, remainingBudget);
            
            if (toAssign > 0) {
                const newAssigned = currentAssigned + toAssign;
                const newAvailable = currentAvailable + toAssign;
                
                // Update or create monthly budget record and cascade delta to future months
                await prisma.$transaction(async (tx) => {
                    await tx.monthlyBudget.upsert({
                        where: {
                            month_categoryId: { month, categoryId: cat.id },
                        },
                        create: {
                            month,
                            categoryId: cat.id,
                            assigned: newAssigned,
                            activity: currentActivity,
                            available: newAvailable,
                        },
                        update: {
                            assigned: newAssigned,
                            activity: currentActivity,
                            available: newAvailable,
                        },
                    });

                    await tx.monthlyBudget.updateMany({
                        where: { categoryId: cat.id, month: { gt: month } },
                        data: { available: { increment: toAssign } },
                    });
                });
                
                assignments.push({
                    categoryId: cat.id,
                    categoryName: cat.name,
                    amount: toAssign,
                });
                
                totalAssigned += toAssign;
                remainingBudget -= toAssign;
            }
        }

        // RTA is now always calculated — no need to store it

        return NextResponse.json({
            success: true,
            assigned: totalAssigned,
            remaining: remainingBudget,
            categories: assignments,
            message: `Assigned ${(totalAssigned / 100).toFixed(2)} to ${assignments.length} categories`,
        });
    } catch (error) {
        console.error('Auto-assign error:', error);
        return NextResponse.json(
            { error: 'Failed to auto-assign' },
            { status: 500 }
        );
    }
}

// GET - Preview what would be auto-assigned (without making changes)
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month');
        
        if (!month) {
            return NextResponse.json({ error: 'Month required' }, { status: 400 });
        }

        // Always calculate RTA from account balances - envelope totals
        const profileId = await getProfileId(request);
        const readyToAssign = await calculateReadyToAssign(profileId, month);
        
        // Get all categories with goals scoped to the active profile
        const categories = await prisma.category.findMany({
            where: {
                goalType: { not: null },
                isHidden: false,
                group: {
                    profileId,
                    isHidden: false,
                },
            },
            include: {
                monthlyData: {
                    where: { month },
                    take: 1,
                },
                group: {
                    select: { sortOrder: true, name: true },
                },
            },
            orderBy: [
                { group: { sortOrder: 'asc' } },
                { sortOrder: 'asc' },
            ],
        });

        const categoryIds = categories.map(c => c.id);
        const availableMap = await getCategoryAvailableMap(categoryIds, month);

        const preview: { 
            categoryId: string; 
            categoryName: string; 
            groupName: string;
            goalType: string;
            needed: number; 
            wouldAssign: number;
        }[] = [];
        
        let totalNeeded = 0;
        let totalWouldAssign = 0;
        let remainingBudget = readyToAssign;

        for (const cat of categories) {
            const existing = cat.monthlyData[0];
            const currentAssigned = existing?.assigned ?? 0;
            const currentAvailable = availableMap.get(cat.id) ?? 0;

            const categoryWithGoal: CategoryWithGoal = {
                id: cat.id,
                name: cat.name,
                goalType: cat.goalType,
                goalTarget: cat.goalTarget,
                goalDueDate: cat.goalDueDate,
                goalUnderFunded: cat.goalUnderFunded,
                assigned: currentAssigned,
                available: currentAvailable,
            };

            const needed = calculateMonthlyNeeded(categoryWithGoal, month);
            
            if (needed <= 0) continue;
            
            totalNeeded += needed;
            const wouldAssign = Math.min(needed, Math.max(0, remainingBudget));
            
            preview.push({
                categoryId: cat.id,
                categoryName: cat.name,
                groupName: cat.group.name,
                goalType: cat.goalType || '',
                needed,
                wouldAssign,
            });
            
            if (wouldAssign > 0) {
                totalWouldAssign += wouldAssign;
                remainingBudget -= wouldAssign;
            }
        }

        return NextResponse.json({
            readyToAssign,
            totalNeeded,
            totalWouldAssign,
            shortfall: Math.max(0, totalNeeded - readyToAssign),
            categories: preview,
        });
    } catch (error) {
        console.error('Auto-assign preview error:', error);
        return NextResponse.json(
            { error: 'Failed to preview auto-assign' },
            { status: 500 }
        );
    }
}

// DELETE - Undo a previous auto-assign operation
export async function DELETE(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const body = await request.json();
        const { month, categories } = body as {
            month: string;
            categories: { categoryId: string; amount: number }[];
        };

        if (!month || !categories?.length) {
            return NextResponse.json({ error: 'Month and categories required' }, { status: 400 });
        }

        if (categories.some(c => !Number.isInteger(c.amount))) {
            return NextResponse.json({ error: 'Amounts must be integer cents' }, { status: 400 });
        }

        // Never let a caller reverse assignments in another profile's categories.
        if (!(await ownsAllCategories(profileId, categories.map(c => c.categoryId)))) {
            return NextResponse.json({ error: 'One or more categories were not found' }, { status: 404 });
        }

        let totalReversed = 0;

        await prisma.$transaction(async (tx) => {
            for (const { categoryId, amount } of categories) {
                const existing = await tx.monthlyBudget.findUnique({
                    where: { month_categoryId: { month, categoryId } },
                });

                if (!existing) continue;

                await tx.monthlyBudget.update({
                    where: { month_categoryId: { month, categoryId } },
                    data: {
                        assigned: existing.assigned - amount,
                        available: existing.available - amount,
                    },
                });

                await tx.monthlyBudget.updateMany({
                    where: { categoryId, month: { gt: month } },
                    data: { available: { decrement: amount } },
                });

                totalReversed += amount;
            }
        });

        // RTA is now always calculated from account balances - envelope totals
        // Reversing envelope available above is sufficient; RTA auto-adjusts on next fetch

        return NextResponse.json({
            success: true,
            reversed: totalReversed,
            message: `Reversed ${(totalReversed / 100).toFixed(2)} from ${categories.length} categories`,
        });
    } catch (error) {
        console.error('Auto-assign undo error:', error);
        return NextResponse.json(
            { error: 'Failed to undo auto-assign' },
            { status: 500 }
        );
    }
}
