import { create } from 'zustand';
import { emitScalarChange, isHydratingFromCloud } from '../utils/supabase/syncBridge';

/**
 * Theme / notification / language preferences.
 *
 * Persistence architecture (v2 — cloud-first):
 *  - Preferences are stored in the Supabase `user_preferences` table and
 *    restored on sign-in, so a new device picks up the same theme,
 *    language and notification sound.
 *  - Until the first hydration completes the app uses the defaults
 *    ('system' theme, 'en', default sound); the cloud row then wins.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type NotificationSound = 'default' | 'bell.ogg' | 'chime.ogg' | 'digital.ogg' | 'hurt_again.mp3' | 'your_power.mp3';
export type AppLanguage = 'en' | 'pt';

interface ThemeState {
    themePreference: ThemePreference;
    setThemePreference: (preference: ThemePreference) => void;
    notificationSound: NotificationSound;
    setNotificationSound: (sound: NotificationSound) => void;
    language: AppLanguage;
    setLanguage: (lang: AppLanguage) => void;
}

function pushIfNotHydrating() {
    if (!isHydratingFromCloud()) emitScalarChange('preferences');
}

export const useThemeStore = create<ThemeState>()(
    (set) => ({
        themePreference: 'system',
        setThemePreference: (preference) => { set({ themePreference: preference }); pushIfNotHydrating(); },
        notificationSound: 'default',
        setNotificationSound: (sound) => { set({ notificationSound: sound }); pushIfNotHydrating(); },
        language: 'en',
        setLanguage: (lang) => { set({ language: lang }); pushIfNotHydrating(); },
    })
);
