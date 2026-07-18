import prisma from '@/lib/prisma';

export function findOwnedAccount(profileId: string, id: string) {
    return prisma.account.findFirst({ where: { id, profileId } });
}

export function findOwnedCategory(profileId: string, id: string) {
    return prisma.category.findFirst({ where: { id, group: { profileId } } });
}

export function findOwnedCategoryGroup(profileId: string, id: string) {
    return prisma.categoryGroup.findFirst({ where: { id, profileId } });
}

export function findOwnedTransaction(profileId: string, id: string) {
    return prisma.transaction.findFirst({ where: { id, account: { profileId } } });
}

export function findOwnedPayee(profileId: string, id: string) {
    return prisma.payee.findFirst({ where: { id, profileId } });
}

export function findOwnedRule(profileId: string, id: string) {
    return prisma.transactionRule.findFirst({ where: { id, profileId } });
}

export function findOwnedScheduledTransaction(profileId: string, id: string) {
    return prisma.scheduledTransaction.findFirst({ where: { id, profileId } });
}

export function findOwnedTemplate(profileId: string, id: string) {
    return prisma.budgetTemplate.findFirst({ where: { id, profileId } });
}

export async function ownsAllCategories(profileId: string, ids: string[]): Promise<boolean> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return true;

    const count = await prisma.category.count({
        where: { id: { in: uniqueIds }, group: { profileId } },
    });
    return count === uniqueIds.length;
}

export async function ownsAllCategoryGroups(profileId: string, ids: string[]): Promise<boolean> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return true;

    const count = await prisma.categoryGroup.count({
        where: { id: { in: uniqueIds }, profileId },
    });
    return count === uniqueIds.length;
}