import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Database } from '../../types/supabase';

/**
 * Supabase client configuration.
 *
 * Only client-safe credentials are used here:
 *  - EXPO_PUBLIC_SUPABASE_URL              → project URL
 *  - EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY  → publishable/anon key
 *
 * The service-role key and any database secret must NEVER be bundled
 * into the app. All data access is governed by Row Level Security.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    // Fail fast and loudly — a silent misconfiguration would look like
    // "data disappeared" to the user.
    throw new Error(
        'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in your .env file.'
    );
}

/**
 * Auth tokens live in the device keychain/keystore (expo-secure-store),
 * not in plain AsyncStorage.
 */
const ExpoSecureStoreAdapter = {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

/**
 * True when the app has the minimum configuration to talk to Supabase.
 * Kept as a function so callers never cache a stale value.
 */
export function isSupabaseConfigured(): boolean {
    return Boolean(supabaseUrl && supabaseKey);
}

/**
 * Best-effort connectivity probe. Used to distinguish "offline" from
 * "Supabase error" in user-facing messages. Never throws.
 */
export async function isOnline(): Promise<boolean> {
    try {
        const NetInfo = await import('@react-native-community/netinfo');
        const state = await NetInfo.default.fetch();
        return state.isConnected !== false;
    } catch {
        // If NetInfo itself fails, assume online and let the real
        // request surface the actual error.
        return true;
    }
}

/**
 * Normalises a Supabase error into a short, user-presentable message.
 * Keeps technical detail in the console for debugging.
 */
export function describeSupabaseError(error: unknown, fallback = 'Something went wrong.'): string {
    const anyErr = error as { message?: string; code?: string } | null;
    const message = anyErr?.message || fallback;
    console.warn('[supabase] operation failed:', error);

    if (anyErr?.code === 'PGRST301' || /jwt|token/i.test(message)) {
        return 'Your session expired. Please sign in again.';
    }
    if (/fetch failed|network|timeout|ECONN/i.test(message)) {
        return 'Network error. Check your internet connection and try again.';
    }
    if (anyErr?.code === '23505') {
        return 'That record already exists.';
    }
    if (anyErr?.code === '23503') {
        return 'Related record not found. Refresh and try again.';
    }
    return message;
}
