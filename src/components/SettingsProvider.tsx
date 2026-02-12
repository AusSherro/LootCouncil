'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';

interface Settings {
    id: string;
    budgetName: string;
    currency: string;
    dateFormat: string;
    startOfWeek: number;
    theme: string;
}

interface SettingsContextType {
    settings: Settings | null;
    loading: boolean;
    updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
}

const defaultSettings: Settings = {
    id: 'default',
    budgetName: 'My Realm',
    currency: 'AUD',
    dateFormat: 'DD/MM/YYYY',
    startOfWeek: 1,
    theme: 'dungeon',
};

const SettingsContext = createContext<SettingsContextType>({
    settings: defaultSettings,
    loading: true,
    updateSettings: async () => {},
});

export function useSettings() {
    return useContext(SettingsContext);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    // Load settings on mount
    useEffect(() => {
        async function loadSettings() {
            try {
                const res = await fetch('/api/settings');
                if (res.ok) {
                    const data = await res.json();
                    setSettings(data);
                    applyTheme(data.theme);
                } else {
                    setSettings(defaultSettings);
                    applyTheme(defaultSettings.theme);
                }
            } catch (error) {
                console.error('Failed to load settings:', error);
                setSettings(defaultSettings);
                applyTheme(defaultSettings.theme);
            } finally {
                setLoading(false);
            }
        }
        loadSettings();
    }, []);

    // Apply theme to document
    const applyTheme = (theme: string) => {
        const root = document.documentElement;
        
        // Remove all theme classes
        root.classList.remove('theme-dungeon', 'theme-forest', 'theme-ocean', 'theme-crimson', 'theme-royal');
        
        // Add new theme class
        root.classList.add(`theme-${theme}`);
        
        // Also store in localStorage for instant load on next visit
        localStorage.setItem('loot-council-theme', theme);
    };

    const updateSettings = async (newSettings: Partial<Settings>) => {
        if (!settings) return;

        const merged = { ...settings, ...newSettings };
        
        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(merged),
            });

            if (res.ok) {
                const data = await res.json();
                setSettings(data);
                
                if (newSettings.theme) {
                    applyTheme(newSettings.theme);
                }
            } else {
                showToast('Failed to save settings. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            showToast('Failed to save settings. Please try again.', 'error');
        }
    };

    return (
        <SettingsContext.Provider value={{ settings, loading, updateSettings }}>
            {children}
        </SettingsContext.Provider>
    );
}
