import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHandler';
import { getProfileId } from '@/lib/profile';

// GET settings
export const GET = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);

    let settings = await prisma.settings.findFirst({
        where: { profileId },
    });

    // Create default settings if none exist for this profile
    if (!settings) {
        settings = await prisma.settings.create({
            data: {
                budgetName: 'My Budget',
                currency: 'AUD',
                dateFormat: 'DD/MM/YYYY',
                startOfWeek: 1,
                theme: 'finance',
                profileId,
            },
        });
    }

    return NextResponse.json(settings);
}, 'Fetch settings');

// PUT settings
export const PUT = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);
    const body = await request.json();

    // Find existing settings for this profile
    const existing = await prisma.settings.findFirst({
        where: { profileId },
    });

    let settings;
    if (existing) {
        settings = await prisma.settings.update({
            where: { id: existing.id },
            data: {
                budgetName: body.budgetName,
                currency: body.currency,
                dateFormat: body.dateFormat,
                startOfWeek: body.startOfWeek,
                theme: body.theme,
            },
        });
    } else {
        settings = await prisma.settings.create({
            data: {
                budgetName: body.budgetName || 'My Budget',
                currency: body.currency || 'AUD',
                dateFormat: body.dateFormat || 'DD/MM/YYYY',
                startOfWeek: body.startOfWeek ?? 1,
                theme: body.theme || 'finance',
                profileId,
            },
        });
    }

    return NextResponse.json(settings);
}, 'Save settings');
