import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody, requiredText } from '@/lib/validation';
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
const settingsSchema = z.object({
    budgetName: requiredText(100).optional(),
    currency: z.string().trim().min(3, 'must be a currency code').max(10).optional(),
    dateFormat: requiredText(20).optional(),
    startOfWeek: z.number().int().min(0).max(6).optional(),
    theme: requiredText(30).optional(),
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);
    const parsed = await parseBody(request, settingsSchema);
    if (!parsed.success) return parsed.response;
    const body = parsed.data;

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
