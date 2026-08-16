import { supabase } from './client';
import { profileFromDb, profileToDb, ProfileRow } from './mapping';
import { UserProfile } from '../../types';
import { Json } from '../../types/supabase';

/**
 * Data-access layer for the user profile, gamification streaks,
 * app preferences and AI assistant state.
 */

/* ---------------------------------------------------------------- profile */

export async function fetchProfile(userId: string): Promise<{
    profile: UserProfile;
    gamification: { lastActiveDate?: string; currentStreak: number; longestStreak: number };
} | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        console.warn('[supabase] fetch profile failed:', error.message);
        return null;
    }
    if (!data) return null;
    return profileFromDb(data as ProfileRow);
}

/**
 * Upserts the profile row. The profiles row is auto-created by a DB
 * trigger on signup, so upsert covers both first-save and updates.
 */
export async function upsertProfile(
    profile: UserProfile,
    userId: string,
    gamification?: { lastActiveDate?: string; currentStreak: number; longestStreak: number }
): Promise<void> {
    const row = profileToDb(profile, userId, gamification);
    const { error } = await supabase
        .from('profiles')
        .upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
}

/* ------------------------------------------------------------ preferences */

export interface PreferencesRow {
    theme_preference: string;
    notification_sound: string;
    language: string;
}

export async function fetchPreferences(userId: string): Promise<PreferencesRow | null> {
    const { data, error } = await supabase
        .from('user_preferences')
        .select('theme_preference, notification_sound, language')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        console.warn('[supabase] fetch preferences failed:', error.message);
        return null;
    }
    return (data as PreferencesRow | null) ?? null;
}

export async function upsertPreferences(
    userId: string,
    prefs: { theme_preference: string; notification_sound: string; language: string }
): Promise<void> {
    const { error } = await supabase
        .from('user_preferences')
        .upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' });
    if (error) throw error;
}

/* --------------------------------------------------------------- ai state */

/**
 * The AI assistant's non-secret state (model choice, custom prompt,
 * memory notes, chat bubbles) is synced as a single JSON blob. API keys
 * are NEVER included — they stay in expo-secure-store on each device.
 */
export async function fetchAiState(userId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
        .from('ai_state')
        .select('state')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        console.warn('[supabase] fetch ai_state failed:', error.message);
        return null;
    }
    if (!data?.state || typeof data.state !== 'object') return null;
    return data.state as Record<string, unknown>;
}

export async function upsertAiState(userId: string, state: Record<string, unknown>): Promise<void> {
    const { error } = await supabase
        .from('ai_state')
        .upsert({ user_id: userId, state: state as Json }, { onConflict: 'user_id' });
    if (error) throw error;
}

/* --------------------------------------------------------- migrations log */

/**
 * Server-side record of completed data migrations. Makes the legacy
 * local-data migration idempotent even across devices/reinstalls.
 */
export async function hasMigrationCompleted(userId: string, name: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('migrations_log')
        .select('name')
        .eq('user_id', userId)
        .eq('name', name)
        .maybeSingle();
    if (error) {
        console.warn('[supabase] migration check failed:', error.message);
        return false;
    }
    return Boolean(data);
}

export async function recordMigrationCompleted(
    userId: string,
    name: string,
    recordCount: number
): Promise<void> {
    const { error } = await supabase
        .from('migrations_log')
        .upsert({ user_id: userId, name, record_count: recordCount }, { onConflict: 'user_id,name' });
    if (error) throw error;
}
