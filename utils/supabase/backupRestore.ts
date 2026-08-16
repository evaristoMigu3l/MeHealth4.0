import { useHealthStore } from '../../stores/useHealthStore';
import { useUserStore } from '../../stores/useUserStore';
import { emitRecordChange, isHydratingFromCloud, setHydratingFromCloud } from './syncBridge';
import { HealthCollection } from './mapping';

/**
 * Restores an app backup (JSON produced by "Export App Backup") into the
 * stores AND pushes every restored record to Supabase.
 *
 * Semantics: MERGE, not destructive replace. Each backup record is
 * upserted by id (backup wins on conflict); records that exist in the
 * cloud but not in the backup are left untouched. This is deliberate —
 * with the cloud as source of truth, silently deleting cloud records
 * during an import would be dangerous.
 *
 * Returns the number of records restored.
 */

const HEALTH_COLLECTIONS: HealthCollection[] = [
    'symptoms', 'medications', 'measurements', 'diagnoses', 'moodLogs',
    'dietPlans', 'investigations', 'activities', 'sleepLogs', 'foodEntries',
    'documents', 'appointments', 'hcps', 'waterLogs',
];

/** Store state key for each collection (identical for this app). */
const STORE_KEYS: Record<HealthCollection, string> = {
    symptoms: 'symptoms', medications: 'medications', measurements: 'measurements',
    diagnoses: 'diagnoses', moodLogs: 'moodLogs', dietPlans: 'dietPlans',
    investigations: 'investigations', activities: 'activities', sleepLogs: 'sleepLogs',
    foodEntries: 'foodEntries', documents: 'documents', appointments: 'appointments',
    hcps: 'hcps', waterLogs: 'waterLogs',
};

export interface RestoreResult {
    recordCount: number;
    profileRestored: boolean;
}

export function restoreBackupIntoStores(parsed: any): RestoreResult {
    if (!parsed || typeof parsed !== 'object' || !parsed.health) {
        throw new Error('Invalid backup file.');
    }

    const backupHealth = parsed.health;
    const backupUser = parsed.user;
    let recordCount = 0;

    // Build merged collections: existing records + backup records (backup wins by id).
    const healthState = useHealthStore.getState() as any;
    const merged: Record<string, any[]> = {};

    for (const collection of HEALTH_COLLECTIONS) {
        const storeKey = STORE_KEYS[collection];
        const existing: any[] = Array.isArray(healthState[storeKey]) ? healthState[storeKey] : [];
        const incoming: any[] = Array.isArray(backupHealth[storeKey]) ? backupHealth[storeKey] : [];

        const byId = new Map<string, any>();
        for (const r of existing) if (r && typeof r.id === 'string') byId.set(r.id, r);
        for (const r of incoming) {
            if (r && typeof r === 'object' && typeof r.id === 'string' && r.id) {
                byId.set(r.id, r);
                recordCount += 1;
            }
        }
        merged[storeKey] = Array.from(byId.values());
    }

    // Apply to the store in one shot, then emit upserts for the restored
    // records so the sync engine pushes them to Supabase.
    setHydratingFromCloud(true);
    try {
        useHealthStore.setState(merged as any);
    } finally {
        setHydratingFromCloud(false);
    }

    for (const collection of HEALTH_COLLECTIONS) {
        const storeKey = STORE_KEYS[collection];
        const incoming: any[] = Array.isArray(backupHealth[storeKey]) ? backupHealth[storeKey] : [];
        for (const r of incoming) {
            if (r && typeof r === 'object' && typeof r.id === 'string' && r.id) {
                emitRecordChange({ collection, kind: 'upsert', record: r });
            }
        }
    }

    // Profile restore.
    let profileRestored = false;
    const backupProfile = backupUser?.profile;
    if (backupProfile && typeof backupProfile === 'object' && backupProfile.name) {
        useUserStore.getState().setProfile({
            name: backupProfile.name,
            email: backupProfile.email ?? '',
            dob: backupProfile.dob ?? '',
            gender: backupProfile.gender ?? 'Other',
            ethnicity: backupProfile.ethnicity ?? '',
            avatarUri: typeof backupProfile.avatarUri === 'string' ? backupProfile.avatarUri : undefined,
        });
        profileRestored = true;
    }

    return { recordCount, profileRestored };
}
