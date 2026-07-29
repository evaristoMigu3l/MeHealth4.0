import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../types';

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
    persist(
        (set, get) => ({
            profile: null,
            gamification: { currentStreak: 0, longestStreak: 0 },
            setProfile: (profile) => set({ profile }),
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
            }
        }),
        {
            name: 'user-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
