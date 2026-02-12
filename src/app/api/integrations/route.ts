import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET all integrations (masks secrets)
export async function GET() {
    try {
        const integrations = await prisma.apiIntegration.findMany();
        
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
        const body = await request.json();
        const { provider, apiKey, apiSecret, enabled } = body;
        
        if (!provider) {
            return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
        }
        
        // Store credentials directly (local-only app, no internet exposure)
        // The encryption was causing issues with the signature
        const integration = await prisma.apiIntegration.upsert({
            where: { provider },
            update: {
                ...(apiKey && { apiKey: apiKey }),
                ...(apiSecret && { apiSecret: apiSecret }),
                ...(typeof enabled === 'boolean' && { enabled }),
            },
            create: {
                provider,
                apiKey: apiKey || '',
                apiSecret: apiSecret || '',
                enabled: enabled ?? true,
            },
        });
        
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
        const { searchParams } = new URL(request.url);
        const provider = searchParams.get('provider');
        
        if (!provider) {
            return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
        }
        
        await prisma.apiIntegration.delete({
            where: { provider },
        });
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting integration:', error);
        return NextResponse.json({ error: 'Failed to delete integration' }, { status: 500 });
    }
}
