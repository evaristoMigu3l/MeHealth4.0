import { supabase } from './client';
import {
    HEALTH_TABLES, HealthCollection,
    symptomToDb, symptomFromDb,
    medicationToDb, medicationFromDb,
    measurementToDb, measurementFromDb,
    diagnosisToDb, diagnosisFromDb,
    moodLogToDb, moodLogFromDb,
    dietPlanToDb, dietPlanFromDb,
    investigationToDb, investigationFromDb,
    activityToDb, activityFromDb,
    sleepLogToDb, sleepLogFromDb,
    foodEntryToDb, foodEntryFromDb,
    documentToDb, documentFromDb,
    appointmentToDb, appointmentFromDb,
    hcpToDb, hcpFromDb,
    waterLogToDb, waterLogFromDb,
} from './mapping';
import {
    Activity, Appointment, Diagnosis, DietPlan, Document, FoodEntry, HCP,
    Investigation, Measurement, Medication, MoodLog, SleepLog, Symptom, WaterLog,
} from '../../types';

/**
 * Data-access layer for all user-owned health records.
 *
 * UI → Zustand stores → this service → Supabase → PostgreSQL.
 *
 * Every write is an UPSERT keyed on the client-generated record id, so
 * retrying a failed write (or re-running the legacy migration) can never
 * create duplicates. RLS guarantees a user can only ever touch rows
 * where user_id = auth.uid().
 */

type AnyRecord = { id: string };

/**
 * The service dispatches over a UNION of table names at runtime. The
 * generated Database types cannot narrow a dynamic union into one
 * concrete query builder, so dynamic table access goes through this
 * helper. The per-entity mapping layer (mapping.ts) remains fully
 * typed; only the generic dispatch boundary is loosened.
 */
function fromTable(table: string): any {
    return supabase.from(table as any);
}

const MAPPERS: {
    [K in HealthCollection]: {
        toDb: (record: any, userId: string) => Record<string, unknown>;
        fromDb: (row: any) => any;
    };
} = {
    symptoms: { toDb: symptomToDb, fromDb: symptomFromDb },
    medications: { toDb: medicationToDb, fromDb: medicationFromDb },
    measurements: { toDb: measurementToDb, fromDb: measurementFromDb },
    diagnoses: { toDb: diagnosisToDb, fromDb: diagnosisFromDb },
    moodLogs: { toDb: moodLogToDb, fromDb: moodLogFromDb },
    dietPlans: { toDb: dietPlanToDb, fromDb: dietPlanFromDb },
    investigations: { toDb: investigationToDb, fromDb: investigationFromDb },
    activities: { toDb: activityToDb, fromDb: activityFromDb },
    sleepLogs: { toDb: sleepLogToDb, fromDb: sleepLogFromDb },
    foodEntries: { toDb: foodEntryToDb, fromDb: foodEntryFromDb },
    documents: { toDb: documentToDb, fromDb: documentFromDb },
    appointments: { toDb: appointmentToDb, fromDb: appointmentFromDb },
    hcps: { toDb: hcpToDb, fromDb: hcpFromDb },
    waterLogs: { toDb: waterLogToDb, fromDb: waterLogFromDb },
};

/**
 * Fetches every collection for the signed-in user in one round-trip per
 * table. This is the "restore application state" step after login.
 *
 * Returns null when the request fails — callers must NOT treat a failure
 * as "the user has no data" (that would let a network blip wipe the UI).
 */
export async function fetchAllHealthData(userId: string): Promise<Record<HealthCollection, AnyRecord[]> | null> {
    const collections = Object.keys(HEALTH_TABLES) as HealthCollection[];

    const results = await Promise.all(
        collections.map(async (collection) => {
            const table = HEALTH_TABLES[collection];
            const { data, error } = await fromTable(table)
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            return [collection, (data ?? []).map(MAPPERS[collection].fromDb)] as const;
        })
    ).catch(() => null);

    if (!results) return null;
    return Object.fromEntries(results) as Record<HealthCollection, AnyRecord[]>;
}

/** Fetches a single collection (used for targeted refreshes). */
export async function fetchCollection<K extends HealthCollection>(
    collection: K,
    userId: string
): Promise<AnyRecord[] | null> {
    const table = HEALTH_TABLES[collection];
    const { data, error } = await fromTable(table)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
    if (error) {
        console.warn(`[supabase] fetch ${table} failed:`, error.message);
        return null;
    }
    return (data ?? []).map(MAPPERS[collection].fromDb);
}

/**
 * Creates or updates one record in Supabase (upsert on id).
 * Throws on failure so the caller can surface the error and keep the
 * record flagged as unsynced.
 */
export async function upsertRecord(collection: HealthCollection, record: AnyRecord, userId: string): Promise<void> {
    const table = HEALTH_TABLES[collection];
    const row = MAPPERS[collection].toDb(record, userId);
    const { error } = await fromTable(table)
        .upsert(row, { onConflict: 'id' });
    if (error) throw error;
}

/** Deletes one record from Supabase. Throws on failure. */
export async function deleteRecord(collection: HealthCollection, id: string): Promise<void> {
    const table = HEALTH_TABLES[collection];
    const { error } = await fromTable(table)
        .delete()
        .eq('id', id);
    if (error) throw error;
}

/**
 * Bulk upsert used by the legacy-data migration. Chunked to stay well
 * under PostgREST payload limits. Returns the number of rows written.
 */
export async function bulkUpsertCollection(
    collection: HealthCollection,
    records: AnyRecord[],
    userId: string,
    chunkSize = 100
): Promise<number> {
    if (!records.length) return 0;
    const table = HEALTH_TABLES[collection];
    let written = 0;

    for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize).map((r) => MAPPERS[collection].toDb(r, userId));
        const { error } = await fromTable(table)
            .upsert(chunk, { onConflict: 'id' });
        if (error) throw error;
        written += chunk.length;
    }
    return written;
}

/* ------------------------------------------------------------------ types */

export type HealthDataSnapshot = {
    symptoms: Symptom[];
    medications: Medication[];
    measurements: Measurement[];
    diagnoses: Diagnosis[];
    moodLogs: MoodLog[];
    dietPlans: DietPlan[];
    investigations: Investigation[];
    activities: Activity[];
    sleepLogs: SleepLog[];
    foodEntries: FoodEntry[];
    documents: Document[];
    appointments: Appointment[];
    hcps: HCP[];
    waterLogs: WaterLog[];
};
