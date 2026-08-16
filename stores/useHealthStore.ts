import { create } from 'zustand';
import {
    scheduleMedicationReminder,
    scheduleAppointmentReminder,
    cancelNotification
} from '../utils/notifications';
import {
    Symptom, Medication, Measurement, Diagnosis, MoodLog,
    DietPlan, Investigation, Activity, SleepLog, FoodEntry,
    Document, Appointment, HCP, WaterLog
} from '../types';
import { emitRecordChange, isHydratingFromCloud } from '../utils/supabase/syncBridge';

/**
 * Health data store.
 *
 * Persistence architecture (v2 — cloud-first):
 *  - Supabase is the source of truth for all health records.
 *  - The sync engine hydrates this store from Supabase after sign-in.
 *  - Every mutation below is applied locally first (instant UI), then
 *    emitted through the sync bridge; the sync engine queues it and
 *    pushes it to Supabase (with offline retry).
 *  - The old AsyncStorage `persist` middleware was removed. Legacy local
 *    data is rescued once by `utils/supabase/legacyMigration.ts`, which
 *    reads the old `health-storage` key directly.
 */

interface HealthState {
    symptoms: Symptom[];
    addSymptom: (s: Symptom) => void;
    updateSymptom: (s: Symptom) => void;
    removeSymptom: (id: string) => void;

    medications: Medication[];
    addMedication: (m: Medication) => void;
    updateMedication: (m: Medication) => void;
    removeMedication: (id: string) => void;

    measurements: Measurement[];
    addMeasurement: (m: Measurement) => void;
    updateMeasurement: (m: Measurement) => void;
    removeMeasurement: (id: string) => void;

    diagnoses: Diagnosis[];
    addDiagnosis: (d: Diagnosis) => void;
    updateDiagnosis: (d: Diagnosis) => void;
    removeDiagnosis: (id: string) => void;

    moodLogs: MoodLog[];
    addMoodLog: (m: MoodLog) => void;
    updateMoodLog: (m: MoodLog) => void;
    removeMoodLog: (id: string) => void;

    dietPlans: DietPlan[];
    addDietPlan: (d: DietPlan) => void;
    removeDietPlan: (id: string) => void;

    investigations: Investigation[];
    addInvestigation: (i: Investigation) => void;
    updateInvestigation: (i: Investigation) => void;
    removeInvestigation: (id: string) => void;

    activities: Activity[];
    addActivity: (a: Activity) => void;
    updateActivity: (a: Activity) => void;
    removeActivity: (id: string) => void;

    sleepLogs: SleepLog[];
    addSleepLog: (s: SleepLog) => void;
    updateSleepLog: (s: SleepLog) => void;
    removeSleepLog: (id: string) => void;

    foodEntries: FoodEntry[];
    addFoodEntry: (f: FoodEntry) => void;
    updateFoodEntry: (f: FoodEntry) => void;
    removeFoodEntry: (id: string) => void;

    documents: Document[];
    addDocument: (d: Document) => void;
    removeDocument: (id: string) => void;

    appointments: Appointment[];
    addAppointment: (a: Appointment) => void;
    updateAppointment: (a: Appointment) => void;
    removeAppointment: (id: string) => void;

    hcps: HCP[];
    addHCP: (h: HCP) => void;
    removeHCP: (id: string) => void;

    waterLogs: WaterLog[];
    addWaterLog: (w: WaterLog) => void;
    removeWaterLog: (id: string) => void;
}

/** Emits an upsert unless we are hydrating from the cloud right now. */
function emitUpsert(collection: Parameters<typeof emitRecordChange>[0]['collection'], record: { id: string }) {
    if (isHydratingFromCloud()) return;
    emitRecordChange({ collection, kind: 'upsert', record: record as any });
}

function emitDelete(collection: Parameters<typeof emitRecordChange>[0]['collection'], id: string) {
    if (isHydratingFromCloud()) return;
    emitRecordChange({ collection, kind: 'delete', record: { id } });
}

export const useHealthStore = create<HealthState>()(
    (set) => ({
        symptoms: [],
        addSymptom: (s) => { set((state) => ({ symptoms: [...state.symptoms, s] })); emitUpsert('symptoms', s); },
        updateSymptom: (updated) => { set((state) => ({ symptoms: state.symptoms.map((s) => (s.id === updated.id ? updated : s)) })); emitUpsert('symptoms', updated); },
        removeSymptom: (id) => { set((state) => ({ symptoms: state.symptoms.filter((s) => s.id !== id) })); emitDelete('symptoms', id); },

        medications: [],
        addMedication: (m) => {
            scheduleMedicationReminder(m);
            set((state) => ({ medications: [...state.medications, m] }));
            emitUpsert('medications', m);
        },
        updateMedication: (updated) => {
            scheduleMedicationReminder(updated);
            set((state) => ({ medications: state.medications.map((m) => (m.id === updated.id ? updated : m)) }));
            emitUpsert('medications', updated);
        },
        removeMedication: (id) => {
            cancelNotification(id, 'med');
            set((state) => ({ medications: state.medications.filter((m) => m.id !== id) }));
            emitDelete('medications', id);
        },

        measurements: [],
        addMeasurement: (m) => { set((state) => ({ measurements: [...state.measurements, m] })); emitUpsert('measurements', m); },
        updateMeasurement: (updated) => { set((state) => ({ measurements: state.measurements.map((m) => (m.id === updated.id ? updated : m)) })); emitUpsert('measurements', updated); },
        removeMeasurement: (id) => { set((state) => ({ measurements: state.measurements.filter((m) => m.id !== id) })); emitDelete('measurements', id); },

        diagnoses: [],
        addDiagnosis: (d) => { set((state) => ({ diagnoses: [...state.diagnoses, d] })); emitUpsert('diagnoses', d); },
        updateDiagnosis: (updated) => { set((state) => ({ diagnoses: state.diagnoses.map((d) => (d.id === updated.id ? updated : d)) })); emitUpsert('diagnoses', updated); },
        removeDiagnosis: (id) => { set((state) => ({ diagnoses: state.diagnoses.filter((d) => d.id !== id) })); emitDelete('diagnoses', id); },

        moodLogs: [],
        addMoodLog: (m) => { set((state) => ({ moodLogs: [...state.moodLogs, m] })); emitUpsert('moodLogs', m); },
        updateMoodLog: (updated) => { set((state) => ({ moodLogs: state.moodLogs.map((m) => (m.id === updated.id ? updated : m)) })); emitUpsert('moodLogs', updated); },
        removeMoodLog: (id) => { set((state) => ({ moodLogs: state.moodLogs.filter((m) => m.id !== id) })); emitDelete('moodLogs', id); },

        dietPlans: [],
        addDietPlan: (d) => { set((state) => ({ dietPlans: [...state.dietPlans, d] })); emitUpsert('dietPlans', d); },
        removeDietPlan: (id) => { set((state) => ({ dietPlans: state.dietPlans.filter((d) => d.id !== id) })); emitDelete('dietPlans', id); },

        investigations: [],
        addInvestigation: (i) => { set((state) => ({ investigations: [...state.investigations, i] })); emitUpsert('investigations', i); },
        updateInvestigation: (updated) => { set((state) => ({ investigations: state.investigations.map((i) => (i.id === updated.id ? updated : i)) })); emitUpsert('investigations', updated); },
        removeInvestigation: (id) => { set((state) => ({ investigations: state.investigations.filter((i) => i.id !== id) })); emitDelete('investigations', id); },

        activities: [],
        addActivity: (a) => { set((state) => ({ activities: [...state.activities, a] })); emitUpsert('activities', a); },
        updateActivity: (updated) => { set((state) => ({ activities: state.activities.map((a) => (a.id === updated.id ? updated : a)) })); emitUpsert('activities', updated); },
        removeActivity: (id) => { set((state) => ({ activities: state.activities.filter((a) => a.id !== id) })); emitDelete('activities', id); },

        sleepLogs: [],
        addSleepLog: (s) => { set((state) => ({ sleepLogs: [...state.sleepLogs, s] })); emitUpsert('sleepLogs', s); },
        updateSleepLog: (updated) => { set((state) => ({ sleepLogs: state.sleepLogs.map((s) => (s.id === updated.id ? updated : s)) })); emitUpsert('sleepLogs', updated); },
        removeSleepLog: (id) => { set((state) => ({ sleepLogs: state.sleepLogs.filter((s) => s.id !== id) })); emitDelete('sleepLogs', id); },

        foodEntries: [],
        addFoodEntry: (f) => { set((state) => ({ foodEntries: [...state.foodEntries, f] })); emitUpsert('foodEntries', f); },
        updateFoodEntry: (updated) => { set((state) => ({ foodEntries: state.foodEntries.map((f) => (f.id === updated.id ? updated : f)) })); emitUpsert('foodEntries', updated); },
        removeFoodEntry: (id) => { set((state) => ({ foodEntries: state.foodEntries.filter((f) => f.id !== id) })); emitDelete('foodEntries', id); },

        documents: [],
        addDocument: (d) => { set((state) => ({ documents: [...state.documents, d] })); emitUpsert('documents', d); },
        removeDocument: (id) => { set((state) => ({ documents: state.documents.filter((d) => d.id !== id) })); emitDelete('documents', id); },

        appointments: [],
        addAppointment: (a) => {
            scheduleAppointmentReminder(a);
            set((state) => ({ appointments: [...state.appointments, a] }));
            emitUpsert('appointments', a);
        },
        updateAppointment: (updated) => {
            scheduleAppointmentReminder(updated);
            set((state) => ({ appointments: state.appointments.map((a) => (a.id === updated.id ? updated : a)) }));
            emitUpsert('appointments', updated);
        },
        removeAppointment: (id) => {
            cancelNotification(id, 'appt');
            set((state) => ({ appointments: state.appointments.filter((a) => a.id !== id) }));
            emitDelete('appointments', id);
        },

        hcps: [],
        addHCP: (h) => { set((state) => ({ hcps: [...state.hcps, h] })); emitUpsert('hcps', h); },
        removeHCP: (id) => { set((state) => ({ hcps: state.hcps.filter((h) => h.id !== id) })); emitDelete('hcps', id); },

        waterLogs: [],
        addWaterLog: (w) => { set((state) => ({ waterLogs: [...state.waterLogs, w] })); emitUpsert('waterLogs', w); },
        removeWaterLog: (id) => { set((state) => ({ waterLogs: state.waterLogs.filter((w) => w.id !== id) })); emitDelete('waterLogs', id); },
    })
);
