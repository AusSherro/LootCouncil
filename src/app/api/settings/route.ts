import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET settings
export async function GET() {
    try {
        let settings = await prisma.settings.findUnique({
            where: { id: 'default' },
        });

        // Create default settings if none exist
        if (!settings) {
            settings = await prisma.settings.create({
                data: {
                    id: 'default',
                    budgetName: 'My Realm',
                    currency: 'AUD',
                    dateFormat: 'DD/MM/YYYY',
                    startOfWeek: 1,
                    theme: 'dungeon',
                },
            });
        }

        return NextResponse.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        return NextResponse.json(
            { error: 'Failed to fetch settings' },
            { status: 500 }
        );
    }
}

// PUT settings
export async function PUT(request: Request) {
    try {
        const body = await request.json();

        const settings = await prisma.settings.upsert({
            where: { id: 'default' },
            update: {
                budgetName: body.budgetName,
                currency: body.currency,
                dateFormat: body.dateFormat,
                startOfWeek: body.startOfWeek,
                theme: body.theme,
            },
            create: {
                id: 'default',
                budgetName: body.budgetName || 'My Realm',
                currency: body.currency || 'AUD',
                dateFormat: body.dateFormat || 'DD/MM/YYYY',
                startOfWeek: body.startOfWeek ?? 1,
                theme: body.theme || 'dungeon',
            },
        });

        return NextResponse.json(settings);
    } catch (error) {
        console.error('Error saving settings:', error);
        return NextResponse.json(
            { error: 'Failed to save settings' },
            { status: 500 }
        );
    }
}
