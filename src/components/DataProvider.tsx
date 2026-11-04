'use client';

import { useEffect, useRef } from 'react';
import { SWRConfig } from 'swr';
import { useProfile } from '@/components/ProfileProvider';
import { apiFetcher, revalidateApi } from '@/lib/useApi';

/**
 * Refetch every cached API read when the active profile changes. Data is
 * profile-scoped via a cookie, so the URL alone does not identify the profile.
 */
function ProfileRevalidator() {
    const { activeProfile } = useProfile();
    const profileId = activeProfile?.id ?? null;
    const previous = useRef<string | null>(null);

    useEffect(() => {
        if (previous.current !== null && profileId !== null && previous.current !== profileId) {
            void revalidateApi();
        }
        if (profileId !== null) previous.current = profileId;
    }, [profileId]);

    return null;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
    return (
        <SWRConfig
            value={{
                fetcher: apiFetcher,
                // Match the previous behaviour: data refreshes on mount and after
                // mutations, not every time the window regains focus.
                revalidateOnFocus: false,
                shouldRetryOnError: false,
            }}
        >
            <ProfileRevalidator />
            {children}
        </SWRConfig>
    );
}
