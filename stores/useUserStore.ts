import { create } from 'zustand';
import { UserProfile } from '../types';
import { emitScalarChange, isHydratingFromCloud } from '../utils/supabase/syncBridge';

/**
 * User profile + gamification store.
 *
 * Persistence architecture (v2 — cloud-first):
 *  - The profile row lives in Supabase (`profiles` table, one row per user).
 *  - The sync engine hydrates this store after sign-in and pushes every
 *    `setProfile` / streak update back to the cloud (debounced).
 *  - The old AsyncStorage `persist` middleware was removed; the legacy
 *    `user-storage` key is rescued once by `legacyMigration.ts`.
 */

interface UserState {
    profile: UserProfile | null;
    gamification: {
        lastActiveDate?: string;
        currentStreak: number;
        longestStreak: number;
    };
    setProfile: (profile: UserProfile) => void;
    clearProfile: () => void;
    updateStreak: () => void;
}

export const useUserStore = create<UserState>()(
    (set, get) => ({
        profile: null,
        gamification: { currentStreak: 0, longestStreak: 0 },
        setProfile: (profile) => {
            set({ profile });
            if (!isHydratingFromCloud()) emitScalarChange('profile');
        },
        clearProfile: () => set({ profile: null }),
        updateStreak: () => {
            const gamification = get().gamification || { currentStreak: 0, longestStreak: 0 };

            const today = new Date().toISOString().split('T')[0];
            const lastActive = gamification.lastActiveDate;

            if (lastActive === today) return; // Already checked in today

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            let currentStreak = gamification.currentStreak || 0;
            let longestStreak = gamification.longestStreak || 0;

            if (lastActive === yesterdayStr) {
                currentStreak += 1;
            } else {
                currentStreak = 1;
            }

            if (currentStreak > longestStreak) longestStreak = currentStreak;

            set({
                gamification: {
                    lastActiveDate: today,
                    currentStreak,
                    longestStreak
                }
            });
            if (!isHydratingFromCloud()) emitScalarChange('profile');
        }
    })
);
