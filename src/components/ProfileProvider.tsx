'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface Profile {
    id: string;
    name: string;
    createdAt: string;
}

interface ProfileContextType {
    profiles: Profile[];
    activeProfile: Profile | null;
    loading: boolean;
    switchProfile: (profileId: string) => void;
    createProfile: (name: string) => Promise<Profile | null>;
    deleteProfile: (profileId: string) => Promise<boolean>;
    renameProfile: (profileId: string, name: string) => Promise<boolean>;
    refreshProfiles: () => Promise<Profile[]>;
}

const PROFILE_COOKIE = 'loot-council-profile';
const PROFILE_LS_KEY = 'loot-council-profile';

const ProfileContext = createContext<ProfileContextType>({
    profiles: [],
    activeProfile: null,
    loading: true,
    switchProfile: () => {},
    createProfile: async () => null,
    deleteProfile: async () => false,
    renameProfile: async () => false,
    refreshProfiles: async () => [],
});

export function useProfile() {
    return useContext(ProfileContext);
}

function setCookie(name: string, value: string) {
    document.cookie = `${name}=${value};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const activeProfile = profiles.find(p => p.id === activeProfileId) ?? null;

    const refreshProfiles = useCallback(async () => {
        try {
            const res = await fetch('/api/profiles');
            if (res.ok) {
                const data = await res.json();
                setProfiles(data.profiles);
                return data.profiles as Profile[];
            }
        } catch (error) {
            console.error('Failed to load profiles:', error);
        }
        return [];
    }, []);

    // Load profiles on mount
    useEffect(() => {
        async function init() {
            const loaded = await refreshProfiles();
            
            // Restore active profile from localStorage
            const stored = localStorage.getItem(PROFILE_LS_KEY);
            if (stored && loaded.some((p: Profile) => p.id === stored)) {
                setActiveProfileId(stored);
                setCookie(PROFILE_COOKIE, stored);
            } else if (loaded.length > 0) {
                // Default to first profile
                setActiveProfileId(loaded[0].id);
                setCookie(PROFILE_COOKIE, loaded[0].id);
                localStorage.setItem(PROFILE_LS_KEY, loaded[0].id);
            }
            
            setLoading(false);
        }
        init();
    }, [refreshProfiles]);

    const switchProfile = useCallback((profileId: string) => {
        setActiveProfileId(profileId);
        localStorage.setItem(PROFILE_LS_KEY, profileId);
        setCookie(PROFILE_COOKIE, profileId);
        // Reload the page to refresh all data with the new profile
        window.location.reload();
    }, []);

    const createProfile = useCallback(async (name: string): Promise<Profile | null> => {
        try {
            const res = await fetch('/api/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (res.ok) {
                const profile = await res.json();
                await refreshProfiles();
                return profile;
            }
        } catch (error) {
            console.error('Failed to create profile:', error);
        }
        return null;
    }, [refreshProfiles]);

    const deleteProfile = useCallback(async (profileId: string): Promise<boolean> => {
        try {
            const res = await fetch(`/api/profiles?id=${encodeURIComponent(profileId)}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                const remaining = await refreshProfiles();
                // If we deleted the active profile, switch to the first remaining one
                if (profileId === activeProfileId && remaining.length > 0) {
                    switchProfile(remaining[0].id);
                }
                return true;
            }
        } catch (error) {
            console.error('Failed to delete profile:', error);
        }
        return false;
    }, [activeProfileId, refreshProfiles, switchProfile]);

    const renameProfile = useCallback(async (profileId: string, name: string): Promise<boolean> => {
        try {
            const res = await fetch('/api/profiles', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: profileId, name }),
            });
            if (res.ok) {
                await refreshProfiles();
                return true;
            }
        } catch (error) {
            console.error('Failed to rename profile:', error);
        }
        return false;
    }, [refreshProfiles]);

    return (
        <ProfileContext.Provider
            value={{
                profiles,
                activeProfile,
                loading,
                switchProfile,
                createProfile,
                deleteProfile,
                renameProfile,
                refreshProfiles,
            }}
        >
            {children}
        </ProfileContext.Provider>
    );
}
