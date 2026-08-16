import { supabase } from './client';
import type { Session, User } from '@supabase/supabase-js';

/**
 * Authentication layer over Supabase Auth (email + password).
 *
 * Sessions persist across app launches via expo-secure-store (see
 * client.ts). Expired tokens are refreshed automatically by
 * supabase-js; if a refresh fails the session listener emits null and
 * the app routes back to the sign-in screen.
 */

export interface AuthResult {
    ok: boolean;
    /** User-presentable error message when ok === false. */
    error?: string;
    /** True when signup succeeded but the user must confirm their email first. */
    needsEmailConfirmation?: boolean;
    user?: User | null;
}

/** Maps GoTrue error messages to friendly, actionable text. */
function friendlyAuthError(message: string): string {
    const m = message.toLowerCase();
    if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
    if (m.includes('already registered') || m.includes('already been registered'))
        return 'An account with this email already exists. Try signing in instead.';
    if (m.includes('password should be at least')) return 'Password must be at least 6 characters.';
    if (m.includes('email not confirmed')) return 'Please confirm your email before signing in.';
    if (m.includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.';
    if (m.includes('fetch failed') || m.includes('network')) return 'Network error. Check your connection and try again.';
    return message;
}

export async function signUpWithEmail(
    email: string,
    password: string,
    fullName: string
): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: fullName.trim() } },
    });
    if (error) return { ok: false, error: friendlyAuthError(error.message) };

    // With email confirmation enabled, session is null until the user
    // clicks the link in their inbox.
    const needsEmailConfirmation = !data.session;
    return { ok: true, needsEmailConfirmation, user: data.user };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
    });
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true, user: data.user };
}

export async function signOut(): Promise<void> {
    await supabase.auth.signOut();
}

/** Restores the persisted session on app launch. Never throws. */
export async function restoreSession(): Promise<Session | null> {
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            console.warn('[auth] getSession failed:', error.message);
            return null;
        }
        return data.session;
    } catch (err) {
        console.warn('[auth] getSession threw:', err);
        return null;
    }
}

/** Sends a password-recovery email. */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true };
}

/** Subscribes to auth state changes. Returns the unsubscribe function. */
export function onAuthStateChange(callback: (session: Session | null, user: User | null) => void) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        callback(session, session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
}
