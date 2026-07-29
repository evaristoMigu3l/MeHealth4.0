import * as SecureStore from 'expo-secure-store';
import { SECURE_KEY_STORE_KEY } from './config';

// The API key never touches AsyncStorage, Zustand persist, logs or exports.
// It lives only in the OS keystore and in memory while a request is in flight.

let cached: string | null = null;

export async function getApiKey(): Promise<string | null> {
    if (cached) return cached;
    try {
        const value = await SecureStore.getItemAsync(SECURE_KEY_STORE_KEY);
        cached = value && value.trim() ? value.trim() : null;
        return cached;
    } catch {
        return null;
    }
}

export async function setApiKey(key: string): Promise<void> {
    const clean = key.trim();
    cached = clean || null;
    if (!clean) {
        await SecureStore.deleteItemAsync(SECURE_KEY_STORE_KEY);
        return;
    }
    await SecureStore.setItemAsync(SECURE_KEY_STORE_KEY, clean);
}

export async function clearApiKey(): Promise<void> {
    cached = null;
    try {
        await SecureStore.deleteItemAsync(SECURE_KEY_STORE_KEY);
    } catch {
        // ignore
    }
}

export async function hasApiKey(): Promise<boolean> {
    return !!(await getApiKey());
}

/** Removes anything that looks like a bearer token from an error string. */
export function redact(input: string): string {
    let out = input;
    if (cached) out = out.split(cached).join('***');
    return out.replace(/(sk|oc|zen)[-_a-zA-Z0-9]{12,}/g, '***');
}

/* --------------------------------------------- optional web-search key */

import { SEARCH_KEY_STORE_KEY } from './config';

let cachedSearchKey: string | null = null;

export async function getSearchKey(): Promise<string | null> {
    if (cachedSearchKey) return cachedSearchKey;
    try {
        const value = await SecureStore.getItemAsync(SEARCH_KEY_STORE_KEY);
        cachedSearchKey = value && value.trim() ? value.trim() : null;
        return cachedSearchKey;
    } catch {
        return null;
    }
}

export async function setSearchKey(key: string): Promise<void> {
    const clean = key.trim();
    cachedSearchKey = clean || null;
    if (!clean) {
        await SecureStore.deleteItemAsync(SEARCH_KEY_STORE_KEY);
        return;
    }
    await SecureStore.setItemAsync(SEARCH_KEY_STORE_KEY, clean);
}

export async function hasSearchKey(): Promise<boolean> {
    return !!(await getSearchKey());
}

/** Search key value held in memory, used by the search client. */
export function peekSearchKey(): string | null {
    return cachedSearchKey;
}

/* ------------------------------------------- Gemini key for image understanding */

import { GEMINI_KEY_STORE_KEY } from './config';

let cachedGeminiKey: string | null = null;

export async function getGeminiKey(): Promise<string | null> {
    if (cachedGeminiKey) return cachedGeminiKey;
    try {
        const value = await SecureStore.getItemAsync(GEMINI_KEY_STORE_KEY);
        cachedGeminiKey = value && value.trim() ? value.trim() : null;
        return cachedGeminiKey;
    } catch {
        return null;
    }
}

export async function setGeminiKey(key: string): Promise<void> {
    const clean = key.trim();
    cachedGeminiKey = clean || null;
    if (!clean) {
        await SecureStore.deleteItemAsync(GEMINI_KEY_STORE_KEY);
        return;
    }
    await SecureStore.setItemAsync(GEMINI_KEY_STORE_KEY, clean);
}

export async function hasGeminiKey(): Promise<boolean> {
    return !!(await getGeminiKey());
}

/** Gemini key held in memory, used by the vision client. */
export function peekGeminiKey(): string | null {
    return cachedGeminiKey;
}

/** Hides every saved key, whichever service it belongs to. */
export function redactAll(input: string): string {
    let out = redact(input);
    if (cachedSearchKey) out = out.split(cachedSearchKey).join('***');
    if (cachedGeminiKey) out = out.split(cachedGeminiKey).join('***');
    // Google keys have a recognisable shape.
    return out.replace(/AIza[0-9A-Za-z_-]{10,}/g, '***');
}
