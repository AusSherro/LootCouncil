import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface CategoryWithGoal {
    id: string;
    name: string;
    goalType: string | null;
    goalTarget: number | null; // cents
    goalDueDate: Date | null;
    goalUnderFunded: number | null; // cents
    monthlyData: {
        assigned: number;
        available: number;
    } | null;
}

function calculateMonthlyNeeded(
    category: CategoryWithGoal,
    currentMonth: string
): number {
    if (!category.goalType || !category.goalTarget) return 0;
    
    const currentAvailable = category.monthlyData?.available ?? 0;
    const currentAssigned = category.monthlyData?.assigned ?? 0;
    
    switch (category.goalType) {
        case 'TB': // Target Balance - just need to reach the target
            // How much more do we need to reach target?
            const neededForTB = Math.max(0, category.goalTarget - currentAvailable);
            return neededForTB;
            
        case 'TBD': // Target by Date - spread remaining over months
            if (!category.goalDueDate) {
                // No date, treat like TB
                return Math.max(0, category.goalTarget - currentAvailable);
            }
            
            // Calculate months remaining
            const [currentYear, currentMonthNum] = currentMonth.split('-').map(Number);
            const dueYear = category.goalDueDate.getFullYear();
            const dueMonth = category.goalDueDate.getMonth() + 1;
            
            const monthsRemaining = (dueYear - currentYear) * 12 + (dueMonth - currentMonthNum);
            
            if (monthsRemaining <= 0) {
                // Past due, need full amount
                return Math.max(0, category.goalTarget - currentAvailable);
            }
            
            // Amount still needed total
            const amountNeeded = Math.max(0, category.goalTarget - currentAvailable);
            // Spread over remaining months (including current)
            const monthlyAmount = Math.ceil(amountNeeded / monthsRemaining);
            return monthlyAmount;
            
        case 'MF': // Monthly Funding - assign target each month
            // How much more to reach target this month?
            const neededForMF = Math.max(0, category.goalTarget - currentAssigned);
            return neededForMF;
            
        case 'NEED': // Needed for Spending
            // Use the goalUnderFunded if available (from YNAB)
            if (category.goalUnderFunded !== null && category.goalUnderFunded > 0) {
                return category.goalUnderFunded;
            }
            // Otherwise calculate based on target vs assigned
            return Math.max(0, category.goalTarget - currentAssigned);
            
        case 'DEBT': // Debt payoff - usually just minimum payment
            // Just fund what's underfunded
            if (category.goalUnderFunded !== null && category.goalUnderFunded > 0) {
                return category.goalUnderFunded;
            }
            return 0;
            
        default:
            return 0;
    }
}

// Helper: Check if a category group is an "Inflow" type
function isInflowGroup(groupName: string): boolean {
    const lowerName = groupName.toLowerCase();
    return lowerName === 'inflow' || lowerName.includes('ready to assign');
}

// Helper: Check if a category group is the YNAB "Hidden Categories" system group
function isHiddenCategoriesGroup(groupName: string): boolean {
    const lowerName = groupName.toLowerCase();
    return lowerName === 'hidden categories';
}

// POST - Auto-assign money to categories with goals
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { month } = body;
        
        if (!month) {
            return NextResponse.json({ error: 'Month required (YYYY-MM format)' }, { status: 400 });
        }

        // Calculate Ready to Assign the SAME way as the budget page
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        let readyToAssign: number;
        
        if (settings && settings.toBeBudgeted !== undefined && settings.toBeBudgeted !== 0) {
            // Use YNAB's authoritative value
            readyToAssign = settings.toBeBudgeted;
        } else {
            // Fallback: Calculate from account balances - total available in envelopes
            // This matches the budget page calculation exactly
            const accounts = await prisma.account.findMany({
                where: { onBudget: true },
            });
            const activeAccounts = accounts.filter(acc => (acc as { closed?: boolean }).closed !== true);
            const totalBalance = activeAccounts.reduce((sum, acc) => sum + acc.balance, 0);
            
            // Get all category groups to identify inflow/hidden
            const categoryGroups = await prisma.categoryGroup.findMany({
                where: { isHidden: false },
                include: {
                    categories: {
                        where: { isHidden: false },
                        include: {
                            monthlyData: {
                                where: { month },
                                take: 1,
                            },
                        },
                    },
                },
            });
            
            // Sum available from non-inflow, non-hidden categories
            let totalAvailable = 0;
            for (const group of categoryGroups) {
                if (isInflowGroup(group.name) || isHiddenCategoriesGroup(group.name)) continue;
                for (const cat of group.categories) {
                    const available = cat.monthlyData[0]?.available ?? 0;
                    totalAvailable += available;
                }
            }
            
            readyToAssign = totalBalance - totalAvailable;
        }
        
        if (readyToAssign <= 0) {
            return NextResponse.json({
                success: true,
                message: 'No money available to assign',
                assigned: 0,
                categories: [],
                readyToAssign: readyToAssign,
            });
        }

        // Get all categories with goals
        const categories = await prisma.category.findMany({
            where: {
                goalType: { not: null },
                isHidden: false,
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

        const assignments: { categoryId: string; categoryName: string; amount: number }[] = [];
        let totalAssigned = 0;
        let remainingBudget = readyToAssign;

        for (const cat of categories) {
            if (remainingBudget <= 0) break;

            const categoryWithGoal: CategoryWithGoal = {
                id: cat.id,
                name: cat.name,
                goalType: cat.goalType,
                goalTarget: cat.goalTarget,
                goalDueDate: cat.goalDueDate,
                goalUnderFunded: cat.goalUnderFunded,
                monthlyData: cat.monthlyData[0] ?? null,
            };

            const needed = calculateMonthlyNeeded(categoryWithGoal, month);
            
            if (needed <= 0) continue;
            
            // Assign up to what we have available
            const toAssign = Math.min(needed, remainingBudget);
            
            if (toAssign > 0) {
                // Get current assigned amount
                const existing = cat.monthlyData[0];
                const newAssigned = (existing?.assigned ?? 0) + toAssign;
                const newAvailable = (existing?.available ?? 0) + toAssign;
                
                // Update or create monthly budget record
                await prisma.monthlyBudget.upsert({
                    where: {
                        month_categoryId: { month, categoryId: cat.id },
                    },
                    create: {
                        month,
                        categoryId: cat.id,
                        assigned: toAssign,
                        activity: 0,
                        available: toAssign,
                    },
                    update: {
                        assigned: newAssigned,
                        available: newAvailable,
                    },
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

        // Update Ready to Assign in settings
        await prisma.settings.upsert({
            where: { id: 'default' },
            create: { 
                id: 'default',
                toBeBudgeted: readyToAssign - totalAssigned,
            },
            update: {
                toBeBudgeted: readyToAssign - totalAssigned,
            },
        });

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
            { error: 'Failed to auto-assign', details: String(error) },
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

        // Get current Ready to Assign
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const readyToAssign = settings?.toBeBudgeted ?? 0;
        
        // Get all categories with goals
        const categories = await prisma.category.findMany({
            where: {
                goalType: { not: null },
                isHidden: false,
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
            const categoryWithGoal: CategoryWithGoal = {
                id: cat.id,
                name: cat.name,
                goalType: cat.goalType,
                goalTarget: cat.goalTarget,
                goalDueDate: cat.goalDueDate,
                goalUnderFunded: cat.goalUnderFunded,
                monthlyData: cat.monthlyData[0] ?? null,
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
            { error: 'Failed to preview auto-assign', details: String(error) },
            { status: 500 }
        );
    }
}
