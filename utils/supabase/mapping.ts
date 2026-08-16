import { Json } from '../../types/supabase';
import {
    Activity, Appointment, Diagnosis, DietPlan, Document, FoodEntry, HCP,
    Investigation, Measurement, Medication, MoodLog, SleepLog, Symptom,
    UserProfile, WaterLog,
} from '../../types';

/**
 * Mapping layer between the app's camelCase domain types and the
 * Supabase snake_case table rows.
 *
 * Every health collection the app tracks maps 1:1 to a table. Record
 * primary keys stay as TEXT (the app generates them client-side), which
 * makes upserts naturally idempotent — re-sending the same record can
 * never create a duplicate.
 */

/** App store collection key → Supabase table name. */
export const HEALTH_TABLES = {
    symptoms: 'symptoms',
    medications: 'medications',
    measurements: 'measurements',
    diagnoses: 'diagnoses',
    moodLogs: 'mood_logs',
    dietPlans: 'diet_plans',
    investigations: 'investigations',
    activities: 'activities',
    sleepLogs: 'sleep_logs',
    foodEntries: 'food_entries',
    documents: 'documents',
    appointments: 'appointments',
    hcps: 'hcps',
    waterLogs: 'water_logs',
} as const;

export type HealthCollection = keyof typeof HEALTH_TABLES;
export type HealthTableName = (typeof HEALTH_TABLES)[HealthCollection];

/* ------------------------------------------------------------------ jsonb */

const toJson = (value: unknown): Json => (value ?? []) as Json;

const fromJsonArray = (value: Json | null | undefined): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/* --------------------------------------------------------------- symptoms */

export function symptomToDb(s: Symptom, userId: string) {
    return {
        id: s.id,
        user_id: userId,
        name: s.name,
        intensity: s.intensity,
        intensity_label: s.intensityLabel,
        date_started: s.dateStarted ?? null,
        duration: s.duration ?? null,
        notes: s.notes ?? null,
        place: s.place ?? null,
        images: toJson(s.images ?? []),
    };
}

export function symptomFromDb(row: any): Symptom {
    return {
        id: row.id,
        name: row.name,
        intensity: row.intensity,
        intensityLabel: row.intensity_label,
        dateStarted: row.date_started ?? new Date().toISOString(),
        duration: row.duration ?? undefined,
        notes: row.notes ?? undefined,
        place: row.place ?? undefined,
        images: fromJsonArray(row.images),
    };
}

/* ------------------------------------------------------------ medications */

export function medicationToDb(m: Medication, userId: string) {
    return {
        id: m.id,
        user_id: userId,
        name: m.name,
        preparation: m.preparation,
        formulation: m.formulation ?? null,
        dosage_unit: m.dosageUnit,
        start_date: m.startDate ?? null,
        end_date: m.endDate ?? null,
        frequency: m.frequency,
        times_per_day: m.timesPerDay,
        schedule: toJson(m.schedule ?? []),
        display_name: m.displayName ?? null,
        notes: m.notes ?? null,
        status: m.status,
        self_prescribed: m.selfPrescribed ?? null,
        target_condition: m.targetCondition ?? null,
        location: m.location ?? null,
        type: m.type ?? null,
        color: m.color ?? null,
        adherence_log: toJson(m.adherenceLog ?? []),
        reminders_enabled: m.remindersEnabled ?? null,
    };
}

export function medicationFromDb(row: any): Medication {
    return {
        id: row.id,
        name: row.name,
        preparation: row.preparation,
        formulation: row.formulation ?? undefined,
        dosageUnit: row.dosage_unit as Medication['dosageUnit'],
        startDate: row.start_date ?? new Date().toISOString(),
        endDate: row.end_date ?? undefined,
        frequency: row.frequency as Medication['frequency'],
        timesPerDay: row.times_per_day,
        schedule: Array.isArray(row.schedule) ? (row.schedule as Medication['schedule']) : [],
        displayName: row.display_name ?? undefined,
        notes: row.notes ?? undefined,
        status: row.status as Medication['status'],
        selfPrescribed: row.self_prescribed ?? undefined,
        targetCondition: row.target_condition ?? undefined,
        location: row.location ?? undefined,
        type: row.type ?? undefined,
        color: row.color ?? undefined,
        adherenceLog: fromJsonArray(row.adherence_log),
        remindersEnabled: row.reminders_enabled ?? undefined,
    };
}

/* ------------------------------------------------------------ measurements */

/**
 * The app stores readings as number OR string ('120/80' for blood
 * pressure); the DB column is text. Round-trip: stringify on the way
 * down, restore plain numbers on the way back up.
 */
const readingToDb = (reading: number | string): string => String(reading);

const readingFromDb = (reading: string | null): number | string => {
    if (reading == null) return 0;
    return /^-?\d+(\.\d+)?$/.test(reading) ? Number(reading) : reading;
};

export function measurementToDb(m: Measurement, userId: string) {
    return {
        id: m.id,
        user_id: userId,
        type: m.type,
        unit: m.unit,
        reading: readingToDb(m.reading),
        date_time: m.dateTime ?? null,
        notes: m.notes ?? null,
        sub_type: m.subType ?? null,
    };
}

export function measurementFromDb(row: any): Measurement {
    return {
        id: row.id,
        type: row.type,
        unit: row.unit,
        reading: readingFromDb(row.reading),
        dateTime: row.date_time ?? new Date().toISOString(),
        notes: row.notes ?? undefined,
        subType: row.sub_type ?? undefined,
    };
}

/* -------------------------------------------------------------- diagnoses */

export function diagnosisToDb(d: Diagnosis, userId: string) {
    return {
        id: d.id,
        user_id: userId,
        condition: d.condition,
        date_of_diagnosis: d.dateOfDiagnosis ?? null,
        status: d.status,
        treatment: d.treatment ?? null,
        linked_appointment_ids: toJson(d.linkedAppointmentIds ?? []),
    };
}

export function diagnosisFromDb(row: any): Diagnosis {
    return {
        id: row.id,
        condition: row.condition,
        dateOfDiagnosis: row.date_of_diagnosis ?? new Date().toISOString(),
        status: row.status as Diagnosis['status'],
        treatment: row.treatment ?? undefined,
        linkedAppointmentIds: fromJsonArray(row.linked_appointment_ids),
    };
}

/* --------------------------------------------------------------- mood logs */

export function moodLogToDb(m: MoodLog, userId: string) {
    return {
        id: m.id,
        user_id: userId,
        date_time: m.dateTime ?? null,
        feeling: m.feeling,
        emoji: m.emoji ?? null,
        notes: m.notes ?? null,
    };
}

export function moodLogFromDb(row: any): MoodLog {
    return {
        id: row.id,
        dateTime: row.date_time ?? new Date().toISOString(),
        feeling: row.feeling,
        emoji: row.emoji ?? undefined,
        notes: row.notes ?? undefined,
    };
}

/* -------------------------------------------------------------- diet plans */

export function dietPlanToDb(d: DietPlan, userId: string) {
    return {
        id: d.id,
        user_id: userId,
        type: d.type,
        start_date: d.startDate ?? null,
        end_date: d.endDate ?? null,
        notes: d.notes ?? null,
    };
}

export function dietPlanFromDb(row: any): DietPlan {
    return {
        id: row.id,
        type: row.type,
        startDate: row.start_date ?? new Date().toISOString(),
        endDate: row.end_date ?? undefined,
        notes: row.notes ?? undefined,
    };
}

/* ---------------------------------------------------------- investigations */

export function investigationToDb(i: Investigation, userId: string) {
    return {
        id: i.id,
        user_id: userId,
        type: i.type,
        date_time: i.dateTime ?? null,
        notes: i.notes ?? null,
        result: i.result ?? null,
        status: i.status,
        linked_appointment_id: i.linkedAppointmentId ?? null,
        linked_medication_id: i.linkedMedicationId ?? null,
        attachments: toJson(i.attachments ?? []),
    };
}

export function investigationFromDb(row: any): Investigation {
    return {
        id: row.id,
        type: row.type,
        dateTime: row.date_time ?? new Date().toISOString(),
        notes: row.notes ?? undefined,
        result: row.result ?? undefined,
        status: row.status as Investigation['status'],
        linkedAppointmentId: row.linked_appointment_id ?? undefined,
        linkedMedicationId: row.linked_medication_id ?? undefined,
        attachments: fromJsonArray(row.attachments),
    };
}

/* -------------------------------------------------------------- activities */

export function activityToDb(a: Activity, userId: string) {
    return {
        id: a.id,
        user_id: userId,
        category: a.category,
        specific_activity: a.specificActivity,
        date_time: a.dateTime ?? null,
        duration_hours: a.durationHours,
        duration_minutes: a.durationMinutes,
        notes: a.notes ?? null,
    };
}

export function activityFromDb(row: any): Activity {
    return {
        id: row.id,
        category: row.category,
        specificActivity: row.specific_activity,
        dateTime: row.date_time ?? new Date().toISOString(),
        durationHours: row.duration_hours,
        durationMinutes: row.duration_minutes,
        notes: row.notes ?? undefined,
    };
}

/* --------------------------------------------------------------- sleep logs */

export function sleepLogToDb(s: SleepLog, userId: string) {
    return {
        id: s.id,
        user_id: userId,
        date_time: s.dateTime ?? null,
        hours: s.hours,
        quality: s.quality,
        notes: s.notes ?? null,
    };
}

export function sleepLogFromDb(row: any): SleepLog {
    return {
        id: row.id,
        dateTime: row.date_time ?? new Date().toISOString(),
        hours: row.hours,
        quality: row.quality as SleepLog['quality'],
        notes: row.notes ?? undefined,
    };
}

/* ------------------------------------------------------------- food entries */

export function foodEntryToDb(f: FoodEntry, userId: string) {
    return {
        id: f.id,
        user_id: userId,
        name: f.name,
        calories: f.calories,
        date_time: f.dateTime ?? null,
        type: f.type,
        notes: f.notes ?? null,
    };
}

export function foodEntryFromDb(row: any): FoodEntry {
    return {
        id: row.id,
        name: row.name,
        calories: row.calories,
        dateTime: row.date_time ?? new Date().toISOString(),
        type: row.type,
        notes: row.notes ?? undefined,
    };
}

/* --------------------------------------------------------------- documents */

export function documentToDb(d: Document, userId: string) {
    return {
        id: d.id,
        user_id: userId,
        name: d.name,
        type: d.type,
        date_time: d.dateTime ?? null,
        notes: d.notes ?? null,
        uri: d.uri ?? null,
    };
}

export function documentFromDb(row: any): Document {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        dateTime: row.date_time ?? new Date().toISOString(),
        notes: row.notes ?? undefined,
        uri: row.uri ?? undefined,
    };
}

/* ------------------------------------------------------------- appointments */

export function appointmentToDb(a: Appointment, userId: string) {
    return {
        id: a.id,
        user_id: userId,
        date_time: a.dateTime ?? null,
        location: a.location,
        type: a.type,
        hcp_id: a.hcpId ?? null,
        doctor_name: a.doctorName ?? null,
        duration_minutes: a.durationMinutes,
        reminder: a.reminder,
        reason: a.reason ?? null,
        recurrence: a.recurrence ?? null,
        linked_exam_ids: toJson(a.linkedExamIds ?? []),
    };
}

export function appointmentFromDb(row: any): Appointment {
    return {
        id: row.id,
        dateTime: row.date_time ?? new Date().toISOString(),
        location: row.location,
        type: row.type as Appointment['type'],
        hcpId: row.hcp_id ?? undefined,
        doctorName: row.doctor_name ?? undefined,
        durationMinutes: row.duration_minutes,
        reminder: row.reminder,
        reason: row.reason ?? undefined,
        recurrence: (row.recurrence ?? undefined) as Appointment['recurrence'],
        linkedExamIds: fromJsonArray(row.linked_exam_ids),
    };
}

/* ------------------------------------------------------------------- hcps */

export function hcpToDb(h: HCP, userId: string) {
    return {
        id: h.id,
        user_id: userId,
        first_name: h.firstName,
        last_name: h.lastName,
        location_name: h.locationName,
        role: h.role,
        contact_details: h.contactDetails ?? null,
    };
}

export function hcpFromDb(row: any): HCP {
    return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        locationName: row.location_name,
        role: row.role,
        contactDetails: row.contact_details ?? undefined,
    };
}

/* --------------------------------------------------------------- water logs */

export function waterLogToDb(w: WaterLog, userId: string) {
    return {
        id: w.id,
        user_id: userId,
        date_time: w.dateTime ?? null,
        amount: w.amount,
    };
}

export function waterLogFromDb(row: any): WaterLog {
    return {
        id: row.id,
        dateTime: row.date_time ?? new Date().toISOString(),
        amount: row.amount,
    };
}

/* ----------------------------------------------------------------- profile */

export interface ProfileRow {
    user_id: string;
    name: string;
    email: string;
    dob: string;
    gender: string;
    ethnicity: string;
    avatar_url: string | null;
    last_active_date: string | null;
    current_streak: number;
    longest_streak: number;
}

export function profileToDb(profile: UserProfile, userId: string, gamification?: {
    lastActiveDate?: string;
    currentStreak: number;
    longestStreak: number;
}) {
    return {
        user_id: userId,
        name: profile.name,
        email: profile.email,
        dob: profile.dob,
        gender: profile.gender,
        ethnicity: profile.ethnicity,
        avatar_url: profile.avatarUri ?? null,
        last_active_date: gamification?.lastActiveDate ?? profile.lastActiveDate ?? null,
        current_streak: gamification?.currentStreak ?? profile.currentStreak ?? 0,
        longest_streak: gamification?.longestStreak ?? profile.longestStreak ?? 0,
    };
}

export function profileFromDb(row: ProfileRow): {
    profile: UserProfile;
    gamification: { lastActiveDate?: string; currentStreak: number; longestStreak: number };
} {
    return {
        profile: {
            name: row.name,
            email: row.email,
            dob: row.dob,
            gender: (row.gender as UserProfile['gender']) || 'Other',
            ethnicity: row.ethnicity,
            avatarUri: row.avatar_url ?? undefined,
        },
        gamification: {
            lastActiveDate: row.last_active_date ?? undefined,
            currentStreak: row.current_streak ?? 0,
            longestStreak: row.longest_streak ?? 0,
        },
    };
}
