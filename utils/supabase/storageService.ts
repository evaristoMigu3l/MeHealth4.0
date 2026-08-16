import { supabase } from './client';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * File storage layer (Supabase Storage, private buckets).
 *
 * Buckets (both private, RLS-scoped to the owner's folder):
 *  - avatars          → {userId}/avatar.<ext>
 *  - exam-attachments → {userId}/{recordId}/{timestamp}_{filename}
 *
 * The database stores portable references in the form
 * `supabase://<bucket>/<path>`. At render time those references are
 * resolved to short-lived signed URLs (see resolveStorageUri) and cached
 * locally, so files keep working across devices.
 */

export const SUPABASE_URI_PREFIX = 'supabase://';

const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export function isSupabaseStorageUri(uri?: string | null): boolean {
    return typeof uri === 'string' && uri.startsWith(SUPABASE_URI_PREFIX);
}

/** Splits supabase://bucket/path into its parts. Returns null when invalid. */
function parseStorageUri(uri: string): { bucket: string; path: string } | null {
    if (!isSupabaseStorageUri(uri)) return null;
    const rest = uri.slice(SUPABASE_URI_PREFIX.length);
    const slash = rest.indexOf('/');
    if (slash <= 0 || slash === rest.length - 1) return null;
    return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
}

/**
 * Resolves a supabase:// reference to a signed URL that <Image> and file
 * viewers can load. Non-supabase URIs are returned unchanged. Results are
 * cached until shortly before expiry.
 */
export async function resolveStorageUri(uri: string): Promise<string> {
    const parsed = parseStorageUri(uri);
    if (!parsed) return uri;

    const cached = signedUrlCache.get(uri);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

    const { data, error } = await supabase.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
        console.warn('[supabase] signed URL failed for', uri, error?.message);
        throw error ?? new Error('Could not resolve file');
    }

    signedUrlCache.set(uri, {
        url: data.signedUrl,
        expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    });
    return data.signedUrl;
}

/** Clears the signed-URL cache (e.g. on sign-out). */
export function clearResolvedUriCache(): void {
    signedUrlCache.clear();
}

/* ---------------------------------------------------------------- avatars */

/**
 * Uploads a local image file as the user's avatar. Returns the portable
 * supabase:// reference to store in profiles.avatar_url.
 */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
    const ext = (localUri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${userId}/avatar.${ext}`;

    const blob = await uriToBlob(localUri);
    const { error } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
    if (error) throw error;

    return `${SUPABASE_URI_PREFIX}avatars/${path}`;
}

/* ------------------------------------------------------- exam attachments */

/**
 * Uploads one exam attachment. Returns the portable supabase:// reference
 * to store in investigations.attachments.
 */
export async function uploadExamAttachment(
    userId: string,
    investigationId: string,
    localUri: string,
    fileName?: string
): Promise<string> {
    const safeName = (fileName || decodeURIComponent(localUri).split('/').pop() || 'attachment')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${userId}/${investigationId}/${Date.now()}_${safeName}`;

    const blob = await uriToBlob(localUri);
    const { error } = await supabase.storage
        .from('exam-attachments')
        .upload(path, blob, { upsert: true });
    if (error) throw error;

    return `${SUPABASE_URI_PREFIX}exam-attachments/${path}`;
}

/**
 * Downloads a supabase:// file into the app's persistent document
 * directory and returns the local file URI. Used to make attachments
 * openable/shareable offline.
 */
export async function downloadToLocal(uri: string, destDir: string): Promise<string> {
    const parsed = parseStorageUri(uri);
    if (!parsed) throw new Error('Not a Supabase storage URI');

    const signedUrl = await resolveStorageUri(uri);
    const fileName = decodeURIComponent(parsed.path).split('/').pop() || 'download';
    const dest = `${destDir}${fileName}`;

    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists) return dest; // already downloaded

    await FileSystem.downloadAsync(signedUrl, dest);
    return dest;
}

/* ---------------------------------------------------------------- helpers */

/**
 * Converts a local file URI to a Blob for upload. Works on both Android
 * and iOS with expo-file-system's legacy API.
 */
async function uriToBlob(uri: string): Promise<Blob> {
    // content:// and file:// URIs can be fetched via RN's fetch on modern
    // React Native (0.81 supports blob responses for local URIs).
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`Could not read file for upload (${response.status})`);
    return response.blob();
}
