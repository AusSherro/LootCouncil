import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { idString, parseBody, requiredText } from '@/lib/validation';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHandler';

// GET all profiles
export const GET = withErrorHandler(async () => {
    const profiles = await prisma.profile.findMany({
        orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ profiles });
}, 'Fetch profiles');

const profileName = requiredText(100);
const createProfileSchema = z.object({ name: profileName });
const renameProfileSchema = z.object({ id: idString, name: profileName });

// POST create new profile
export const POST = withErrorHandler(async (request: NextRequest) => {
    const parsed = await parseBody(request, createProfileSchema);
    if (!parsed.success) return parsed.response;
    const { name } = parsed.data;

    const profile = await prisma.profile.create({
        data: { name },
    });

    // Create default settings for the new profile
    await prisma.settings.create({
        data: {
            budgetName: 'My Budget',
            currency: 'AUD',
            dateFormat: 'DD/MM/YYYY',
            startOfWeek: 1,
            theme: 'finance',
            profileId: profile.id,
        },
    });

    return NextResponse.json(profile, { status: 201 });
}, 'Create profile');

// DELETE a profile
export const DELETE = withErrorHandler(async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    // Don't allow deleting the last profile
    const count = await prisma.profile.count();
    if (count <= 1) {
        return NextResponse.json(
            { error: 'Cannot delete the last profile' },
            { status: 400 }
        );
    }

    // Delete all profile data in order (respecting foreign keys)
    await prisma.$transaction([
        prisma.subTransaction.deleteMany({
            where: { transaction: { account: { profileId: id } } },
        }),
        prisma.monthlyBudget.deleteMany({
            where: { category: { group: { profileId: id } } },
        }),
        prisma.transaction.deleteMany({
            where: { account: { profileId: id } },
        }),
        prisma.category.deleteMany({
            where: { group: { profileId: id } },
        }),
        prisma.categoryGroup.deleteMany({ where: { profileId: id } }),
        prisma.account.deleteMany({ where: { profileId: id } }),
        prisma.payee.deleteMany({ where: { profileId: id } }),
        prisma.transfer.deleteMany({ where: { profileId: id } }),
        prisma.assetLot.deleteMany({
            where: { asset: { profileId: id } },
        }),
        prisma.asset.deleteMany({ where: { profileId: id } }),
        prisma.allocationTarget.deleteMany({ where: { profileId: id } }),
        prisma.fireSettings.deleteMany({ where: { profileId: id } }),
        prisma.scheduledTransaction.deleteMany({ where: { profileId: id } }),
        prisma.transactionRule.deleteMany({ where: { profileId: id } }),
        prisma.budgetTemplateItem.deleteMany({
            where: { template: { profileId: id } },
        }),
        prisma.budgetTemplate.deleteMany({ where: { profileId: id } }),
        prisma.settings.deleteMany({ where: { profileId: id } }),
        prisma.apiIntegration.deleteMany({ where: { profileId: id } }),
        prisma.profile.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
}, 'Delete profile');

// PATCH rename a profile
export const PATCH = withErrorHandler(async (request: NextRequest) => {
    const parsed = await parseBody(request, renameProfileSchema);
    if (!parsed.success) return parsed.response;
    const { id, name } = parsed.data;

    const profile = await prisma.profile.update({
        where: { id },
        data: { name },
    });

    return NextResponse.json(profile);
}, 'Update profile');
