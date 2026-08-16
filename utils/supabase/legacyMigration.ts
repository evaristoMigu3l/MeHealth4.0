import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { bulkUpsertCollection, fetchAllHealthData } from './healthService';
import { hasMigrationCompleted, recordMigrationCompleted, upsertProfile } from './profileService';
import { uploadAvatar, uploadExamAttachment, isSupabaseStorageUri } from './storageService';
import { HealthCollection } from './mapping';

/**
 * One-time migration of legacy local-only data (Zustand AsyncStorage
 * persistence) into Supabase.
 *
 * Idempotency is guaranteed twice over:
 *  1. Server-side: `migrations_log` records completion per user, so a
 *     second run (even from another device) is a no-op.
 *  2. Data-level: every record is upserted on its client-generated id,
 *     so re-uploading the same records can never create duplicates.
 *
 * The legacy local data is only cleared AFTER the upload has been
 * verified by re-reading the counts from Supabase.
 */

const LEGACY_HEALTH_KEY = 'health-storage';
const LEGACY_USER_KEY = 'user-storage';
const MIGRATION_NAME = 'legacy-local-data-v1';

export interface MigrationResult {
    /** 'migrated' = data uploaded, 'skipped' = already done or nothing to migrate, 'failed' */
    status: 'migrated' | 'skipped' | 'failed';
    recordCount: number;
    error?: string;
}

/** True when the old Zustand persistence keys still hold data. */
export async function hasLegacyLocalData(): Promise<boolean> {
    try {
        const raw = await AsyncStorage.getItem(LEGACY_HEALTH_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        const state = parsed?.state;
        if (!state || typeof state !== 'object') return false;
        return Object.values(state).some((v) => Array.isArray(v) && v.length > 0);
    } catch {
        return false;
    }
}

/**
 * Runs the migration for the signed-in user.
 *
 * Steps: detect → check server-side flag → upload all collections →
 * verify counts → record completion → clear legacy keys.
 */
export async function migrateLegacyDataToSupabase(userId: string): Promise<MigrationResult> {
    try {
        // 1. Already done for this account?
        if (await hasMigrationCompleted(userId, MIGRATION_NAME)) {
            return { status: 'skipped', recordCount: 0 };
        }

        // 2. Read legacy state.
        const rawHealth = await AsyncStorage.getItem(LEGACY_HEALTH_KEY);
        const rawUser = await AsyncStorage.getItem(LEGACY_USER_KEY);

        const healthState = rawHealth ? JSON.parse(rawHealth)?.state : null;
        const userState = rawUser ? JSON.parse(rawUser)?.state : null;

        const collections = (Object.keys({
            symptoms: 1, medications: 1, measurements: 1, diagnoses: 1,
            moodLogs: 1, dietPlans: 1, investigations: 1, activities: 1,
            sleepLogs: 1, foodEntries: 1, documents: 1, appointments: 1,
            hcps: 1, waterLogs: 1,
        }) as HealthCollection[]);

        const toUpload: Partial<Record<HealthCollection, Array<{ id: string }>>> = {};
        let total = 0;

        if (healthState && typeof healthState === 'object') {
            for (const key of collections) {
                const list = healthState[key];
                if (Array.isArray(list) && list.length > 0) {
                    // Drop malformed rows without an id — they cannot be
                    // upserted safely and never had a stable identity.
                    const valid = list.filter((r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id);
                    if (valid.length) {
                        toUpload[key] = valid;
                        total += valid.length;
                    }
                }
            }
        }

        const legacyProfile = userState?.profile;
        const legacyGamification = userState?.gamification;

        if (total === 0 && !legacyProfile) {
            // Nothing to migrate — record completion so we never retry.
            await recordMigrationCompleted(userId, MIGRATION_NAME, 0);
            await clearLegacyKeys();
            return { status: 'skipped', recordCount: 0 };
        }

        // 2b. Upload local files (investigation attachments + profile
        //     avatar) to Supabase Storage and rewrite their references to
        //     portable supabase:// URIs, so they survive a device change.
        //     Failures are non-fatal: the record still migrates with its
        //     original (local) reference.
        await uploadLegacyFiles(userId, toUpload, legacyProfile);

        // 3. Upload every collection (upsert on id → duplicate-safe).
        for (const key of collections) {
            const records = toUpload[key];
            if (records?.length) {
                await bulkUpsertCollection(key, records, userId);
            }
        }

        // 4. Upload the legacy profile (only fills fields; never blanks
        //    a profile that already exists in the cloud).
        if (legacyProfile && typeof legacyProfile === 'object' && legacyProfile.name) {
            await upsertProfile(
                {
                    name: legacyProfile.name ?? '',
                    email: legacyProfile.email ?? '',
                    dob: legacyProfile.dob ?? '',
                    gender: legacyProfile.gender ?? 'Other',
                    ethnicity: legacyProfile.ethnicity ?? '',
                    avatarUri: typeof legacyProfile.avatarUri === 'string' ? legacyProfile.avatarUri : undefined,
                },
                userId,
                legacyGamification && typeof legacyGamification === 'object'
                    ? {
                        lastActiveDate: legacyGamification.lastActiveDate,
                        currentStreak: Number(legacyGamification.currentStreak) || 0,
                        longestStreak: Number(legacyGamification.longestStreak) || 0,
                    }
                    : undefined
            );
        }

        // 5. Verify: re-read from Supabase and confirm the counts landed.
        const cloud = await fetchAllHealthData(userId);
        if (!cloud) {
            return {
                status: 'failed',
                recordCount: total,
                error: 'Upload finished but verification failed. Your data was NOT removed from this device — the migration will retry on next sign-in.',
            };
        }
        const cloudCount = collections.reduce((sum, key) => sum + (cloud[key]?.length ?? 0), 0);
        if (cloudCount < total) {
            return {
                status: 'failed',
                recordCount: total,
                error: `Verification mismatch: expected ${total} records, found ${cloudCount} in the cloud. Local data kept; migration will retry.`,
            };
        }

        // 6. Mark complete server-side, then clear the legacy keys.
        await recordMigrationCompleted(userId, MIGRATION_NAME, total);
        await clearLegacyKeys();

        return { status: 'migrated', recordCount: total };
    } catch (err: any) {
        console.warn('[migration] legacy migration failed:', err);
        return {
            status: 'failed',
            recordCount: 0,
            error: err?.message || 'Migration failed. Local data was kept and the migration will retry on next sign-in.',
        };
    }
}

/** Removes the legacy persistence keys (only ever called after success). */
async function clearLegacyKeys(): Promise<void> {
    try {
        await AsyncStorage.multiRemove([LEGACY_HEALTH_KEY, LEGACY_USER_KEY]);
    } catch (err) {
        // Non-fatal: stale local copies are harmless now that the cloud
        // is the source of truth.
        console.warn('[migration] could not clear legacy keys:', err);
    }
}

/**
 * Uploads local files referenced by legacy records to Supabase Storage
 * and rewrites the in-memory references to portable supabase:// URIs
 * (mutates `toUpload` / `legacyProfile` in place before they are saved).
 *
 * Only files that still exist on disk are uploaded; missing files keep
 * their original reference (the UI already handles missing files
 * gracefully). Never throws — a failed upload must not block the data
 * migration itself.
 */
async function uploadLegacyFiles(
    userId: string,
    toUpload: Partial<Record<HealthCollection, Array<{ id: string }>>>,
    legacyProfile: any
): Promise<void> {
    // Investigation attachments.
    const investigations = toUpload.investigations as any[] | undefined;
    if (investigations?.length) {
        for (const inv of investigations) {
            if (!Array.isArray(inv.attachments)) continue;
            const rewritten: string[] = [];
            for (const att of inv.attachments) {
                if (typeof att !== 'string' || !att || isSupabaseStorageUri(att)) {
                    rewritten.push(att);
                    continue;
                }
                try {
                    const info = await FileSystem.getInfoAsync(att);
                    if (!info.exists) { rewritten.push(att); continue; }
                    rewritten.push(await uploadExamAttachment(userId, inv.id, att));
                } catch (err) {
                    console.warn('[migration] attachment upload failed:', err);
                    rewritten.push(att);
                }
            }
            inv.attachments = rewritten;
        }
    }

    // Symptom images.
    const symptoms = toUpload.symptoms as any[] | undefined;
    if (symptoms?.length) {
        for (const sym of symptoms) {
            if (!Array.isArray(sym.images)) continue;
            const rewritten: string[] = [];
            for (const img of sym.images) {
                if (typeof img !== 'string' || !img || isSupabaseStorageUri(img)) {
                    rewritten.push(img);
                    continue;
                }
                try {
                    const info = await FileSystem.getInfoAsync(img);
                    if (!info.exists) { rewritten.push(img); continue; }
                    rewritten.push(await uploadExamAttachment(userId, sym.id, img));
                } catch (err) {
                    console.warn('[migration] symptom image upload failed:', err);
                    rewritten.push(img);
                }
            }
            sym.images = rewritten;
        }
    }

    // Profile avatar.
    if (legacyProfile && typeof legacyProfile.avatarUri === 'string'
        && legacyProfile.avatarUri && !isSupabaseStorageUri(legacyProfile.avatarUri)) {
        try {
            const info = await FileSystem.getInfoAsync(legacyProfile.avatarUri);
            if (info.exists) {
                legacyProfile.avatarUri = await uploadAvatar(userId, legacyProfile.avatarUri);
            }
        } catch (err) {
            console.warn('[migration] avatar upload failed:', err);
        }
    }
}
