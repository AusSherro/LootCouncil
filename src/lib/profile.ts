import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';

const PROFILE_COOKIE = 'loot-council-profile';

/**
 * Get the active profile ID from the request cookie or query param.
 * Falls back to the first profile in the database.
 */
export async function getProfileId(request?: NextRequest): Promise<string> {
    // 1. Check query param (highest priority for API calls)
    if (request) {
        const { searchParams } = new URL(request.url);
        const qp = searchParams.get('profileId');
        if (qp) return qp;
    }

    // 2. Check cookie
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(PROFILE_COOKIE)?.value;
    if (cookieValue) return cookieValue;

    // 3. Fallback: get first profile from DB
    const first = await prisma.profile.findFirst({ orderBy: { createdAt: 'asc' } });
    return first?.id ?? '';
}
