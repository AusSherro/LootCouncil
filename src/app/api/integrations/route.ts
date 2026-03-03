import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getProfileId } from '@/lib/profile';

// GET all integrations (masks secrets)
export async function GET(request: NextRequest) {
    const profileId = await getProfileId(request);
    try {
        const integrations = await prisma.apiIntegration.findMany({
            where: { profileId },
        });
        
        // Return with masked secrets
        const masked = integrations.map(i => ({
            id: i.id,
            provider: i.provider,
            apiKey: i.apiKey ? '••••' + i.apiKey.slice(-4) : null,
            enabled: i.enabled,
            lastSynced: i.lastSynced,
        }));
        
        return NextResponse.json({ integrations: masked });
    } catch (error) {
        console.error('Error fetching integrations:', error);
        return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 });
    }
}

// POST create or update an integration
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const body = await request.json();
        const { provider, apiKey, apiSecret, enabled } = body;
        
        if (!provider) {
            return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
        }
        
        // Find existing for this provider + profile
        const existing = await prisma.apiIntegration.findFirst({
            where: { provider, profileId },
        });

        let integration;
        if (existing) {
            integration = await prisma.apiIntegration.update({
                where: { id: existing.id },
                data: {
                    ...(apiKey && { apiKey }),
                    ...(apiSecret && { apiSecret }),
                    ...(typeof enabled === 'boolean' && { enabled }),
                },
            });
        } else {
            integration = await prisma.apiIntegration.create({
                data: {
                    provider,
                    apiKey: apiKey || '',
                    apiSecret: apiSecret || '',
                    enabled: enabled ?? true,
                    profileId,
                },
            });
        }
        
        return NextResponse.json({ 
            success: true, 
            integration: {
                id: integration.id,
                provider: integration.provider,
                enabled: integration.enabled,
            }
        });
    } catch (error) {
        console.error('Error saving integration:', error);
        return NextResponse.json({ error: 'Failed to save integration' }, { status: 500 });
    }
}

// DELETE an integration
export async function DELETE(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        const { searchParams } = new URL(request.url);
        const provider = searchParams.get('provider');
        
        if (!provider) {
            return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
        }
        
        const existing = await prisma.apiIntegration.findFirst({
            where: { provider, profileId },
        });
        
        if (existing) {
            await prisma.apiIntegration.delete({
                where: { id: existing.id },
            });
        }
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting integration:', error);
        return NextResponse.json({ error: 'Failed to delete integration' }, { status: 500 });
    }
}
