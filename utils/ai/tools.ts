import { useHealthStore } from '../../stores/useHealthStore';
import { useUserStore } from '../../stores/useUserStore';
import {
    Activity, Appointment, Diagnosis, FoodEntry, Investigation, Measurement,
    Medication, MoodLog, SleepLog, Symptom, WaterLog,
} from '../../types';
import { ToolResult, ToolSpec } from './types';

/* ------------------------------------------------------------------ helpers */

function newId(): string {
    return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function reqStr(args: any, key: string): string {
    const v = args?.[key];
    if (typeof v !== 'string' || !v.trim()) throw new Error(`Missing required text field: ${key}`);
    return v.trim();
}

function optStr(args: any, key: string): string | undefined {
    const v = args?.[key];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function num(args: any, key: string, fallback?: number): number {
    const v = args?.[key];
    const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required number field: ${key}`);
}

/** Accepts ISO date or datetime; anything unparseable falls back to now. */
function toIso(value: any, fallback?: string): string {
    if (typeof value === 'string' && value.trim()) {
        const raw = value.trim();
        const candidate = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw;
        const d = new Date(candidate);
        if (!isNaN(d.getTime())) return d.toISOString();
    }
    return fallback ?? new Date().toISOString();
}

function pick<T extends string>(value: any, allowed: readonly T[], fallback: T): T {
    if (typeof value === 'string') {
        const hit = allowed.find((a) => a.toLowerCase() === value.trim().toLowerCase());
        if (hit) return hit;
    }
    return fallback;
}

function shortDate(iso: string): string {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function intensityLabel(value: number): Symptom['intensityLabel'] {
    if (value < 25) return 'Mild';
    if (value < 50) return 'Moderate';
    if (value < 75) return 'Severe';
    return 'Very Severe';
}

function ok(message: string, data?: any): ToolResult {
    return { ok: true, message, data };
}

function obj(properties: Record<string, any>, required: string[] = []): Record<string, any> {
    return { type: 'object', properties, required, additionalProperties: false };
}

const S = (description: string) => ({ type: 'string', description });
const N = (description: string) => ({ type: 'number', description });
const WHEN = 'Local date-time in ISO-8601 (YYYY-MM-DDTHH:mm:ss). Use the current date-time from your instructions to resolve words like today, yesterday or this morning. Omit for right now.';

/* -------------------------------------------------------------- write tools */

const logSymptom: ToolSpec = {
    name: 'log_symptom',
    label: 'Symptom',
    mutating: true,
    description: 'Record one symptom the user reports. Call once per distinct symptom.',
    parameters: obj({
        name: S('Symptom name, e.g. headache, dizziness, nausea.'),
        intensity: N('Severity from 0 to 100. Mild<25, Moderate<50, Severe<75, Very Severe>=75. Default 50.'),
        place: S('Body part or place where it is felt, if mentioned.'),
        duration: S('How long it lasted, e.g. 2 hours, all morning.'),
        notes: S('Any extra detail the user gave, in their own words.'),
        date_started: S(WHEN),
    }, ['name']),
    preview: (a) => {
        const i = Math.round(num(a, 'intensity', 50));
        const place = optStr(a, 'place');
        return `${reqStr(a, 'name')} - intensity ${i} (${intensityLabel(i)})${place ? ` - ${place}` : ''} - ${shortDate(toIso(a.date_started))}`;
    },
    run: (a) => {
        const intensity = Math.max(0, Math.min(100, Math.round(num(a, 'intensity', 50))));
        const entry: Symptom = {
            id: newId(),
            name: reqStr(a, 'name'),
            intensity,
            intensityLabel: intensityLabel(intensity),
            dateStarted: toIso(a.date_started),
            duration: optStr(a, 'duration'),
            notes: optStr(a, 'notes'),
            place: optStr(a, 'place'),
        };
        useHealthStore.getState().addSymptom(entry);
        return ok(`Symptom ${entry.name} saved.`, { id: entry.id });
    },
};

const logMeasurement: ToolSpec = {
    name: 'log_measurement',
    label: 'Measurement',
    mutating: true,
    description: 'Record a body measurement or vital sign: weight, height, blood pressure, heart rate, temperature, blood sugar, oxygen saturation, waist and similar.',
    parameters: obj({
        type: S('What was measured, e.g. Weight, Blood Pressure, Heart Rate, Temperature, Blood Sugar, Oxygen Saturation.'),
        reading: S('The value. Use 120/80 style text for blood pressure, otherwise a plain number as text.'),
        unit: S('Unit of the reading, e.g. kg, cm, mmHg, bpm, C, mg/dL, %.'),
        date_time: S(WHEN),
        notes: S('Extra context, e.g. after climbing stairs.'),
    }, ['type', 'reading', 'unit']),
    preview: (a) => `${reqStr(a, 'type')}: ${reqStr(a, 'reading')} ${reqStr(a, 'unit')} - ${shortDate(toIso(a.date_time))}`,
    run: (a) => {
        const rawReading = reqStr(a, 'reading');
        const asNumber = Number(rawReading.replace(',', '.'));
        const entry: Measurement = {
            id: newId(),
            type: reqStr(a, 'type'),
            unit: reqStr(a, 'unit'),
            reading: Number.isFinite(asNumber) && !rawReading.includes('/') ? asNumber : rawReading,
            dateTime: toIso(a.date_time),
            notes: optStr(a, 'notes'),
        };
        useHealthStore.getState().addMeasurement(entry);
        return ok(`${entry.type} measurement saved.`, { id: entry.id });
    },
};

const logMood: ToolSpec = {
    name: 'log_mood',
    label: 'Mood',
    mutating: true,
    description: 'Record how the user feels emotionally.',
    parameters: obj({
        feeling: S('One of Angry, Anxious, Bored, Happy, Sad, Neutral, or another single word if none fits.'),
        emoji: S('A single emoji matching the feeling.'),
        notes: S('Why they feel this way, in their own words.'),
        date_time: S(WHEN),
    }, ['feeling']),
    preview: (a) => `${optStr(a, 'emoji') || ''} ${reqStr(a, 'feeling')} - ${shortDate(toIso(a.date_time))}`.trim(),
    run: (a) => {
        const entry: MoodLog = {
            id: newId(),
            dateTime: toIso(a.date_time),
            feeling: reqStr(a, 'feeling'),
            emoji: optStr(a, 'emoji'),
            notes: optStr(a, 'notes'),
        };
        useHealthStore.getState().addMoodLog(entry);
        return ok(`Mood ${entry.feeling} saved.`, { id: entry.id });
    },
};

const logSleep: ToolSpec = {
    name: 'log_sleep',
    label: 'Sleep',
    mutating: true,
    description: 'Record a sleep session in hours.',
    parameters: obj({
        hours: N('Total hours slept, decimals allowed such as 6.5.'),
        quality: S('One of Poor, Fair, Good, Excellent. Default Fair.'),
        date_time: S(`Date the sleep belongs to. ${WHEN}`),
        notes: S('Extra detail, e.g. woke up three times.'),
    }, ['hours']),
    preview: (a) => `${num(a, 'hours')}h - ${pick(a.quality, ['Poor', 'Fair', 'Good', 'Excellent'] as const, 'Fair')} - ${shortDate(toIso(a.date_time))}`,
    run: (a) => {
        const entry: SleepLog = {
            id: newId(),
            dateTime: toIso(a.date_time),
            hours: num(a, 'hours'),
            quality: pick(a.quality, ['Poor', 'Fair', 'Good', 'Excellent'] as const, 'Fair'),
            notes: optStr(a, 'notes'),
        };
        useHealthStore.getState().addSleepLog(entry);
        return ok(`Sleep of ${entry.hours}h saved.`, { id: entry.id });
    },
};

const logFood: ToolSpec = {
    name: 'log_food',
    label: 'Food',
    mutating: true,
    description: 'Record a meal, snack or drink with calories. Call once per meal. If several foods were eaten in the same meal, combine them in the name and sum the calories.',
    parameters: obj({
        name: S('What was eaten, e.g. rice, beans and grilled chicken.'),
        calories: N('Best estimate of total kcal. Estimate from typical portions when the user does not say.'),
        meal_type: S('One of Breakfast, Lunch, Dinner, Snack.'),
        date_time: S(WHEN),
        notes: S('Portion detail or how it was prepared.'),
    }, ['name', 'calories']),
    preview: (a) => `${pick(a.meal_type, ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const, 'Snack')}: ${reqStr(a, 'name')} - about ${Math.round(num(a, 'calories'))} kcal - ${shortDate(toIso(a.date_time))}`,
    run: (a) => {
        const entry: FoodEntry = {
            id: newId(),
            name: reqStr(a, 'name'),
            calories: Math.round(num(a, 'calories')),
            dateTime: toIso(a.date_time),
            type: pick(a.meal_type, ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const, 'Snack'),
            notes: optStr(a, 'notes'),
        };
        useHealthStore.getState().addFoodEntry(entry);
        return ok(`Food ${entry.name} saved with ${entry.calories} kcal.`, { id: entry.id });
    },
};

const logWater: ToolSpec = {
    name: 'log_water',
    label: 'Water',
    mutating: true,
    description: 'Record water intake in millilitres. A glass is 250 ml, a bottle is usually 500 ml.',
    parameters: obj({
        amount_ml: N('Amount in millilitres.'),
        date_time: S(WHEN),
    }, ['amount_ml']),
    preview: (a) => `${Math.round(num(a, 'amount_ml'))} ml - ${shortDate(toIso(a.date_time))}`,
    run: (a) => {
        const entry: WaterLog = {
            id: newId(),
            dateTime: toIso(a.date_time),
            amount: Math.round(num(a, 'amount_ml')),
        };
        useHealthStore.getState().addWaterLog(entry);
        return ok(`${entry.amount} ml of water saved.`, { id: entry.id });
    },
};

const logActivity: ToolSpec = {
    name: 'log_activity',
    label: 'Activity',
    mutating: true,
    description: 'Record physical or daily-living activity with its duration.',
    parameters: obj({
        specific_activity: S('What was done, e.g. walking, football, cleaning the house, studying.'),
        category: S('One of Basic Activities, Cognitive, Daily Living, Endurance.'),
        duration_minutes: N('Total duration in minutes.'),
        date_time: S(WHEN),
        notes: S('Extra detail such as intensity or place.'),
    }, ['specific_activity', 'duration_minutes']),
    preview: (a) => `${reqStr(a, 'specific_activity')} - ${Math.round(num(a, 'duration_minutes'))} min - ${shortDate(toIso(a.date_time))}`,
    run: (a) => {
        const total = Math.max(0, Math.round(num(a, 'duration_minutes')));
        const entry: Activity = {
            id: newId(),
            category: pick(a.category, ['Basic Activities', 'Cognitive', 'Daily Living', 'Endurance'] as const, 'Basic Activities'),
            specificActivity: reqStr(a, 'specific_activity'),
            dateTime: toIso(a.date_time),
            durationHours: Math.floor(total / 60),
            durationMinutes: total % 60,
            notes: optStr(a, 'notes'),
        };
        useHealthStore.getState().addActivity(entry);
        return ok(`Activity ${entry.specificActivity} saved.`, { id: entry.id });
    },
};

const addMedication: ToolSpec = {
    name: 'add_medication',
    label: 'Medication',
    mutating: true,
    description: 'Add a NEW medication or supplement to the medication list, with its schedule. Do not use this to record that a dose was taken; use mark_medication_taken for that.',
    parameters: obj({
        name: S('Medication name, e.g. Metformin.'),
        dose_amount: N('Dose per intake as a number, e.g. 500.'),
        dosage_unit: S('One of mg, unit, piece, puffs, breaths.'),
        preparation: S('One of Tablet, Liquid, Capsule, Inhaler, Injection, Patch, Powder, Topical, Drop, Gummies, Implant.'),
        times_per_day: N('How many times per day it is taken.'),
        times: { type: 'array', items: { type: 'string' }, description: 'Intake times in 24h HH:mm, one per daily intake, e.g. 08:00 and 20:00.' },
        frequency: S('One of Daily, Specific Days of the Week, Days Interval, As Required.'),
        start_date: S('Start date as YYYY-MM-DD. Defaults to today.'),
        end_date: S('End date as YYYY-MM-DD, if the treatment has a defined end.'),
        target_condition: S('What it treats, if mentioned.'),
        notes: S('Extra instructions such as after meals.'),
        reminders_enabled: { type: 'boolean', description: 'Whether to schedule reminder notifications. Default true for daily medication.' },
    }, ['name', 'dose_amount', 'dosage_unit']),
    preview: (a) => {
        const times: string[] = Array.isArray(a.times) ? a.times : [];
        const perDay = Math.round(num(a, 'times_per_day', times.length || 1));
        return `${reqStr(a, 'name')} ${num(a, 'dose_amount')}${optStr(a, 'dosage_unit') || 'mg'} - ${perDay}x/day${times.length ? ` at ${times.join(', ')}` : ''}`;
    },
    run: (a) => {
        const dose = num(a, 'dose_amount');
        const rawTimes: string[] = Array.isArray(a.times) ? a.times.filter((t: any) => typeof t === 'string') : [];
        const timesPerDay = Math.max(1, Math.round(num(a, 'times_per_day', rawTimes.length || 1)));
        const defaults = ['08:00', '14:00', '20:00', '22:00'];
        const schedule = Array.from({ length: timesPerDay }).map((_, i) => ({
            time: rawTimes[i] || defaults[i] || '08:00',
            dosage: dose,
        }));
        const frequency = pick(a.frequency, ['Daily', 'Specific Days of the Week', 'Days Interval', 'As Required'] as const, 'Daily');
        const entry: Medication = {
            id: newId(),
            name: reqStr(a, 'name'),
            preparation: optStr(a, 'preparation') || 'Tablet',
            dosageUnit: pick(a.dosage_unit, ['mg', 'unit', 'piece', 'puffs', 'breaths'] as const, 'mg'),
            startDate: toIso(a.start_date),
            endDate: a.end_date ? toIso(a.end_date) : undefined,
            frequency,
            timesPerDay,
            schedule,
            notes: optStr(a, 'notes'),
            status: frequency === 'As Required' ? 'As Required' : 'Current',
            targetCondition: optStr(a, 'target_condition'),
            adherenceLog: [],
            remindersEnabled: typeof a.reminders_enabled === 'boolean' ? a.reminders_enabled : frequency === 'Daily',
        };
        useHealthStore.getState().addMedication(entry);
        return ok(`Medication ${entry.name} added with ${timesPerDay} daily intake(s).`, { id: entry.id });
    },
};

const markMedicationTaken: ToolSpec = {
    name: 'mark_medication_taken',
    label: 'Dose taken',
    mutating: true,
    description: 'Record that an existing medication dose was actually taken. The medication must already exist; call list_medications first if unsure of the exact name.',
    parameters: obj({
        medication_name: S('Name of an existing medication.'),
        date_time: S(WHEN),
    }, ['medication_name']),
    preview: (a) => `${reqStr(a, 'medication_name')} taken at ${shortDate(toIso(a.date_time))}`,
    run: (a) => {
        const wanted = reqStr(a, 'medication_name').toLowerCase();
        const store = useHealthStore.getState();
        const med =
            store.medications.find((m) => m.name.toLowerCase() === wanted) ||
            store.medications.find((m) => m.name.toLowerCase().includes(wanted) || wanted.includes(m.name.toLowerCase()));
        if (!med) {
            const existing = store.medications.map((m) => m.name).join(', ') || 'none';
            return {
                ok: false,
                message: `No medication named ${a.medication_name} exists. Existing medications: ${existing}. Ask the user whether to add it with add_medication.`,
            };
        }
        const when = toIso(a.date_time);
        store.updateMedication({ ...med, adherenceLog: [...(med.adherenceLog || []), when] });
        return ok(`Marked ${med.name} as taken at ${shortDate(when)}.`, { id: med.id });
    },
};

const addAppointment: ToolSpec = {
    name: 'add_appointment',
    label: 'Appointment',
    mutating: true,
    description: 'Schedule a medical appointment. A reminder notification is scheduled automatically.',
    parameters: obj({
        date_time: S('Appointment date and time in ISO-8601. Required.'),
        location: S('Where it happens, e.g. clinic or hospital name.'),
        type: S('One of In Person, Virtual, Telephone.'),
        doctor_name: S('Name of the doctor or health professional.'),
        duration_minutes: N('Expected duration in minutes. Default 30.'),
        reason: S('Reason for the visit.'),
    }, ['date_time']),
    preview: (a) => {
        const doctor = optStr(a, 'doctor_name');
        return `${shortDate(toIso(a.date_time))} - ${optStr(a, 'location') || 'no location'}${doctor ? ` - ${doctor}` : ''}`;
    },
    run: (a) => {
        const entry: Appointment = {
            id: newId(),
            dateTime: toIso(a.date_time),
            location: optStr(a, 'location') || '',
            type: pick(a.type, ['In Person', 'Virtual', 'Telephone'] as const, 'In Person'),
            doctorName: optStr(a, 'doctor_name'),
            durationMinutes: Math.round(num(a, 'duration_minutes', 30)),
            reminder: '1 hour before',
            reason: optStr(a, 'reason'),
            recurrence: 'None',
        };
        useHealthStore.getState().addAppointment(entry);
        return ok(`Appointment on ${shortDate(entry.dateTime)} saved.`, { id: entry.id });
    },
};

const addDiagnosis: ToolSpec = {
    name: 'add_diagnosis',
    label: 'Diagnosis',
    mutating: true,
    description: 'Record a diagnosis that a health professional has already given to the user. Never invent or infer a diagnosis yourself.',
    parameters: obj({
        condition: S('Name of the condition as told by the professional.'),
        date_of_diagnosis: S('Date as YYYY-MM-DD. Defaults to today.'),
        status: S('One of Active, Resolved, Recurring. Default Active.'),
        treatment: S('Treatment prescribed, if mentioned.'),
    }, ['condition']),
    preview: (a) => `${reqStr(a, 'condition')} - ${pick(a.status, ['Active', 'Resolved', 'Recurring'] as const, 'Active')} - ${new Date(toIso(a.date_of_diagnosis)).toLocaleDateString()}`,
    run: (a) => {
        const entry: Diagnosis = {
            id: newId(),
            condition: reqStr(a, 'condition'),
            dateOfDiagnosis: toIso(a.date_of_diagnosis),
            status: pick(a.status, ['Active', 'Resolved', 'Recurring'] as const, 'Active'),
            treatment: optStr(a, 'treatment'),
        };
        useHealthStore.getState().addDiagnosis(entry);
        return ok(`Diagnosis ${entry.condition} saved.`, { id: entry.id });
    },
};

const addInvestigation: ToolSpec = {
    name: 'add_investigation',
    label: 'Exam',
    mutating: true,
    description: 'Record a lab test, exam or investigation, either scheduled or already completed with a result.',
    parameters: obj({
        type: S('Exam or test name, e.g. Full Blood Count, Chest X-ray, Malaria test.'),
        date_time: S(WHEN),
        status: S('One of Scheduled, Completed, Pending. Default Completed when a result is given, otherwise Scheduled.'),
        result: S('The result, exactly as reported.'),
        notes: S('Extra context.'),
    }, ['type']),
    preview: (a) => {
        const result = optStr(a, 'result');
        const status = optStr(a, 'status') || (result ? 'Completed' : 'Scheduled');
        return `${reqStr(a, 'type')} - ${status}${result ? ` - ${result}` : ''}`;
    },
    run: (a) => {
        const entry: Investigation = {
            id: newId(),
            type: reqStr(a, 'type'),
            dateTime: toIso(a.date_time),
            status: pick(a.status, ['Scheduled', 'Completed', 'Pending'] as const, optStr(a, 'result') ? 'Completed' : 'Scheduled'),
            result: optStr(a, 'result'),
            notes: optStr(a, 'notes'),
        };
        useHealthStore.getState().addInvestigation(entry);
        return ok(`Exam ${entry.type} saved.`, { id: entry.id });
    },
};

/* --------------------------------------------------------------- read tools */

const listMedications: ToolSpec = {
    name: 'list_medications',
    label: 'Medications',
    mutating: false,
    description: 'List the medications the user already has, with schedules. Use before marking a dose as taken.',
    parameters: obj({}),
    preview: () => 'List medications',
    run: () => {
        const meds = useHealthStore.getState().medications.map((m) => ({
            name: m.name,
            status: m.status,
            dosageUnit: m.dosageUnit,
            timesPerDay: m.timesPerDay,
            schedule: m.schedule,
            targetCondition: m.targetCondition,
            dosesLogged: (m.adherenceLog || []).length,
        }));
        return ok(meds.length ? `${meds.length} medication(s).` : 'No medications recorded.', meds);
    },
};

const RECORD_TYPES = ['symptoms', 'measurements', 'moods', 'sleep', 'food', 'water', 'activities', 'medications', 'appointments', 'diagnoses', 'investigations'] as const;
type RecordType = typeof RECORD_TYPES[number];

function recordsOf(type: RecordType): { id: string; when: string; summary: string }[] {
    const s = useHealthStore.getState();
    switch (type) {
        case 'symptoms':
            return s.symptoms.map((x) => ({ id: x.id, when: x.dateStarted, summary: `${x.name} (${x.intensityLabel}, ${x.intensity})${x.place ? ` at ${x.place}` : ''}${x.notes ? ` - ${x.notes}` : ''}` }));
        case 'measurements':
            return s.measurements.map((x) => ({ id: x.id, when: x.dateTime, summary: `${x.type}: ${x.reading} ${x.unit}` }));
        case 'moods':
            return s.moodLogs.map((x) => ({ id: x.id, when: x.dateTime, summary: `${x.feeling}${x.notes ? ` - ${x.notes}` : ''}` }));
        case 'sleep':
            return s.sleepLogs.map((x) => ({ id: x.id, when: x.dateTime, summary: `${x.hours}h (${x.quality})` }));
        case 'food':
            return s.foodEntries.map((x) => ({ id: x.id, when: x.dateTime, summary: `${x.type}: ${x.name} - ${x.calories} kcal` }));
        case 'water':
            return s.waterLogs.map((x) => ({ id: x.id, when: x.dateTime, summary: `${x.amount} ml` }));
        case 'activities':
            return s.activities.map((x) => ({ id: x.id, when: x.dateTime, summary: `${x.specificActivity} - ${x.durationHours}h${x.durationMinutes}m` }));
        case 'medications':
            return s.medications.map((x) => ({ id: x.id, when: x.startDate, summary: `${x.name} ${x.timesPerDay}x/day (${x.status})` }));
        case 'appointments':
            return s.appointments.map((x) => ({ id: x.id, when: x.dateTime, summary: `${x.doctorName || 'Appointment'} at ${x.location || 'n/a'}${x.reason ? ` - ${x.reason}` : ''}` }));
        case 'diagnoses':
            return s.diagnoses.map((x) => ({ id: x.id, when: x.dateOfDiagnosis, summary: `${x.condition} (${x.status})` }));
        case 'investigations':
            return s.investigations.map((x) => ({ id: x.id, when: x.dateTime, summary: `${x.type} (${x.status})${x.result ? ` - ${x.result}` : ''}` }));
        default:
            return [];
    }
}

const queryLogs: ToolSpec = {
    name: 'query_logs',
    label: 'History',
    mutating: false,
    description: 'Read existing health records to answer questions about history, trends, or what was already logged.',
    parameters: obj({
        type: { type: 'string', enum: RECORD_TYPES as unknown as string[], description: 'Which kind of record to read.' },
        from: S('Only records on or after this date (YYYY-MM-DD).'),
        to: S('Only records on or before this date (YYYY-MM-DD).'),
        limit: N('Maximum number of records to return, newest first. Default 20.'),
    }, ['type']),
    preview: (a) => `Read ${a?.type}`,
    run: (a) => {
        const type = pick(a.type, RECORD_TYPES, 'symptoms');
        const from = a.from ? new Date(toIso(a.from)).getTime() : -Infinity;
        const to = a.to ? new Date(toIso(a.to)).getTime() + 86400000 : Infinity;
        const limit = Math.max(1, Math.min(100, Math.round(num(a, 'limit', 20))));
        const rows = recordsOf(type)
            .filter((r) => {
                const t = new Date(r.when).getTime();
                return Number.isFinite(t) ? t >= from && t <= to : true;
            })
            .sort((x, y) => new Date(y.when).getTime() - new Date(x.when).getTime())
            .slice(0, limit)
            .map((r) => ({ id: r.id, when: r.when, what: r.summary }));
        return ok(
            rows.length
                ? `${rows.length} ${type} record(s). Use the id with update_record or delete_record.`
                : `No ${type} records in that range.`,
            rows
        );
    },
};

const getTodaySummary: ToolSpec = {
    name: 'get_today_summary',
    label: 'Today',
    mutating: false,
    description: 'Get a compact summary of everything logged today plus profile basics. Useful to spot what is still missing.',
    parameters: obj({}),
    preview: () => 'Read summary of today',
    run: () => {
        const s = useHealthStore.getState();
        const profile = useUserStore.getState().profile;
        const today = new Date().toISOString().slice(0, 10);
        const isToday = (iso: string) => typeof iso === 'string' && iso.slice(0, 10) === today;
        const summary = {
            profile: profile ? { name: profile.name, dob: profile.dob, gender: profile.gender } : null,
            today: {
                symptoms: s.symptoms.filter((x) => isToday(x.dateStarted)).map((x) => `${x.name} (${x.intensityLabel})`),
                measurements: s.measurements.filter((x) => isToday(x.dateTime)).map((x) => `${x.type} ${x.reading}${x.unit}`),
                moods: s.moodLogs.filter((x) => isToday(x.dateTime)).map((x) => x.feeling),
                sleepHours: s.sleepLogs.filter((x) => isToday(x.dateTime)).reduce((sum, x) => sum + x.hours, 0),
                calories: s.foodEntries.filter((x) => isToday(x.dateTime)).reduce((sum, x) => sum + x.calories, 0),
                waterMl: s.waterLogs.filter((x) => isToday(x.dateTime)).reduce((sum, x) => sum + x.amount, 0),
                activityMinutes: s.activities.filter((x) => isToday(x.dateTime)).reduce((sum, x) => sum + x.durationHours * 60 + x.durationMinutes, 0),
                dosesTaken: s.medications.reduce((sum, m) => sum + (m.adherenceLog || []).filter(isToday).length, 0),
            },
            totals: {
                symptoms: s.symptoms.length,
                medications: s.medications.length,
                measurements: s.measurements.length,
                appointments: s.appointments.length,
            },
        };
        return ok('Summary of today.', summary);
    },
};

/* ----------------------------------------------------------------- registry */

export const TOOLS: ToolSpec[] = [
    logSymptom,
    logMeasurement,
    logMood,
    logSleep,
    logFood,
    logWater,
    logActivity,
    addMedication,
    markMedicationTaken,
    addAppointment,
    addDiagnosis,
    addInvestigation,
    listMedications,
    queryLogs,
    getTodaySummary,
];

export function getTool(name: string): ToolSpec | undefined {
    return TOOLS.find((t) => t.name === name);
}

/** OpenAI-compatible tool schema array sent to the model. */
export function toolSchemas(): any[] {
    return TOOLS.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
}

/** Compact list used by the JSON fallback for models without tool support. */
export function toolsAsText(): string {
    return TOOLS.map((t) => {
        const props = Object.keys(t.parameters?.properties || {}).join(', ');
        const required = (t.parameters?.required || []).join(', ');
        return `- ${t.name}(${props})${required ? ` [required: ${required}]` : ''}: ${t.description}`;
    }).join('\n');
}

/* ------------------------------------------------ web search and memory tools */

import { useAiStore } from '../../stores/useAiStore';
import { forgetFact, memoryLines, rememberFact } from './memory';
import { readWebPage, SearchError, webSearch } from './webSearch';

/** Results of the last search, so the chat can show source chips. */
let lastSources: Array<{ title: string; url: string; snippet: string }> = [];

export function takeLastSources() {
    const sources = lastSources;
    lastSources = [];
    return sources;
}

const webSearchTool: ToolSpec = {
    name: 'web_search',
    category: 'web',
    mutating: false,
    label: 'Web search',
    description:
        'Search the public web when you do not know something, need current information, or need to check a fact. '
        + 'Never include the user personal health details in the query - search the general topic only. '
        + 'Always tell the user the answer came from the web and name the sources.',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Short search query, general topic only.' },
        },
        required: ['query'],
    },
    preview: (a: any) => 'Search the web for "' + (a?.query || '') + '"',
    run: async (a: any) => {
        const provider = useAiStore.getState().searchProvider;
        try {
            const results = await webSearch(reqStr(a, 'query'), provider);
            lastSources = lastSources.concat(results).slice(-8);
            const text = results
                .map((r, i) => (i + 1) + '. ' + r.title + '\n   ' + r.url + '\n   ' + r.snippet)
                .join('\n');
            return ok('Web results for "' + a.query + '":\n' + text, { results });
        } catch (e: any) {
            if (e instanceof SearchError) return { ok: false, message: e.message };
            return { ok: false, message: 'The web search failed: ' + (e?.message || 'unknown error') };
        }
    },
};

const openPageTool: ToolSpec = {
    name: 'read_web_page',
    category: 'web',
    mutating: false,
    label: 'Read page',
    description:
        'Open one URL from a previous web_search result and read its text, when the snippet is not enough. '
        + 'Use at most one or two pages per answer.',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'Full URL taken from a search result.' },
        },
        required: ['url'],
    },
    preview: (a: any) => 'Read ' + (a?.url || ''),
    run: async (a: any) => {
        try {
            const page = await readWebPage(reqStr(a, 'url'));
            lastSources = lastSources.concat([{ title: page.title, url: page.url, snippet: '' }]).slice(-8);
            return ok('Page: ' + page.title + '\n' + page.url + '\n\n' + page.text, { url: page.url });
        } catch (e: any) {
            if (e instanceof SearchError) return { ok: false, message: e.message };
            return { ok: false, message: 'Could not read that page: ' + (e?.message || 'unknown error') };
        }
    },
};

const rememberTool: ToolSpec = {
    name: 'remember',
    category: 'memory',
    mutating: false,
    label: 'Memory',
    description:
        'Save a durable fact or preference to long term memory, so it is available in every future chat. '
        + 'Use it when the user says remember this, or states a lasting fact (allergy, target, routine, tone preference). '
        + 'Keep each note to one short sentence. Do not save one-off events - those belong in the health log.',
    parameters: {
        type: 'object',
        properties: {
            fact: { type: 'string', description: 'One short sentence to remember.' },
        },
        required: ['fact'],
    },
    preview: (a: any) => 'Remember: ' + (a?.fact || ''),
    run: (a: any) => {
        const result = rememberFact(reqStr(a, 'fact'));
        if (!result.added) return { ok: false, message: result.reason || 'Not saved.' };
        return ok('Saved to memory (' + result.total + ' notes). Tell the user it was remembered.', result);
    },
};

const forgetTool: ToolSpec = {
    name: 'forget',
    category: 'memory',
    mutating: false,
    label: 'Memory',
    description: 'Remove memory notes that contain the given text. Use only when the user asks you to forget something.',
    parameters: {
        type: 'object',
        properties: {
            match: { type: 'string', description: 'Text contained in the note(s) to remove.' },
        },
        required: ['match'],
    },
    preview: (a: any) => 'Forget notes matching "' + (a?.match || '') + '"',
    run: (a: any) => {
        const result = forgetFact(reqStr(a, 'match'));
        if (!result.removed) return { ok: false, message: 'Nothing in memory matched that.' };
        return ok('Removed ' + result.removed + ' memory note(s). ' + result.total + ' remain.', result);
    },
};

const listMemoryTool: ToolSpec = {
    name: 'list_memory',
    category: 'memory',
    mutating: false,
    label: 'Memory',
    description: 'List everything currently stored in long term memory.',
    parameters: { type: 'object', properties: {} },
    preview: () => 'Read memory',
    run: () => {
        const lines = memoryLines();
        if (!lines.length) return ok('Memory is empty.', { lines: [] });
        return ok('Memory notes:\n' + lines.map((l) => '- ' + l).join('\n'), { lines });
    },
};

/* --------------------------------------------- correcting and deleting records */

import { analyzeImage, GeminiError } from './geminiClient';
import { getLastImage } from './imageInput';

/**
 * How each record type is read, changed and removed.
 * `fields` lists the keys the model is allowed to change, which keeps it from
 * inventing structure or breaking a Medication schedule.
 */
interface RecordAccess {
    list: () => any[];
    update?: (record: any) => void;
    remove: (id: string) => void;
    fields: string[];
    describe: (record: any) => string;
}

function recordAccess(type: RecordType): RecordAccess {
    const s = () => useHealthStore.getState();
    switch (type) {
        case 'symptoms':
            return {
                list: () => s().symptoms,
                update: (r) => s().updateSymptom(r),
                remove: (id) => s().removeSymptom(id),
                fields: ['name', 'intensity', 'dateStarted', 'duration', 'notes', 'place'],
                describe: (r) => `${r.name} (${r.intensityLabel}, ${r.intensity})`,
            };
        case 'measurements':
            return {
                list: () => s().measurements,
                update: (r) => s().updateMeasurement(r),
                remove: (id) => s().removeMeasurement(id),
                fields: ['type', 'subType', 'reading', 'unit', 'dateTime', 'notes'],
                describe: (r) => `${r.type}: ${r.reading} ${r.unit}`,
            };
        case 'moods':
            return {
                list: () => s().moodLogs,
                update: (r) => s().updateMoodLog(r),
                remove: (id) => s().removeMoodLog(id),
                fields: ['feeling', 'emoji', 'dateTime', 'notes'],
                describe: (r) => String(r.feeling),
            };
        case 'sleep':
            return {
                list: () => s().sleepLogs,
                update: (r) => s().updateSleepLog(r),
                remove: (id) => s().removeSleepLog(id),
                fields: ['hours', 'quality', 'dateTime', 'notes'],
                describe: (r) => `${r.hours}h (${r.quality})`,
            };
        case 'food':
            return {
                list: () => s().foodEntries,
                update: (r) => s().updateFoodEntry(r),
                remove: (id) => s().removeFoodEntry(id),
                fields: ['name', 'calories', 'type', 'dateTime', 'notes'],
                describe: (r) => `${r.type}: ${r.name} - ${r.calories} kcal`,
            };
        case 'water':
            return {
                list: () => s().waterLogs,
                // The store has no updateWaterLog, so a correction is delete + log again.
                remove: (id) => s().removeWaterLog(id),
                fields: [],
                describe: (r) => `${r.amount} ml`,
            };
        case 'activities':
            return {
                list: () => s().activities,
                update: (r) => s().updateActivity(r),
                remove: (id) => s().removeActivity(id),
                fields: ['category', 'specificActivity', 'durationHours', 'durationMinutes', 'dateTime', 'notes'],
                describe: (r) => `${r.specificActivity} - ${r.durationHours}h${r.durationMinutes}m`,
            };
        case 'medications':
            return {
                list: () => s().medications,
                update: (r) => s().updateMedication(r),
                remove: (id) => s().removeMedication(id),
                fields: ['name', 'status', 'targetCondition', 'notes', 'endDate', 'remindersEnabled'],
                describe: (r) => `${r.name} (${r.status})`,
            };
        case 'appointments':
            return {
                list: () => s().appointments,
                update: (r) => s().updateAppointment(r),
                remove: (id) => s().removeAppointment(id),
                fields: ['dateTime', 'location', 'type', 'doctorName', 'durationMinutes', 'reason', 'reminder'],
                describe: (r) => `${r.doctorName || 'Appointment'} at ${r.location || 'n/a'}`,
            };
        case 'diagnoses':
            return {
                list: () => s().diagnoses,
                update: (r) => s().updateDiagnosis(r),
                remove: (id) => s().removeDiagnosis(id),
                fields: ['condition', 'dateOfDiagnosis', 'status', 'treatment'],
                describe: (r) => `${r.condition} (${r.status})`,
            };
        case 'investigations':
            return {
                list: () => s().investigations,
                update: (r) => s().updateInvestigation(r),
                remove: (id) => s().removeInvestigation(id),
                fields: ['type', 'dateTime', 'status', 'result', 'notes'],
                describe: (r) => `${r.type} (${r.status})`,
            };
        default:
            return { list: () => [], remove: () => undefined, fields: [], describe: () => 'record' };
    }
}

/**
 * Finds one record by id, or by a text match against its summary when the
 * model did not carry the id over. Returns a clear error when the match is
 * ambiguous, so nothing is changed by accident.
 */
function resolveRecord(type: RecordType, args: any): { record?: any; error?: string; candidates?: any[] } {
    const access = recordAccess(type);
    const all = access.list();
    if (!all.length) return { error: `There are no ${type} records at all.` };

    const id = optStr(args, 'id');
    if (id) {
        const byId = all.find((r) => String(r.id) === id);
        if (byId) return { record: byId };
        // Fall through to a text match: some models paraphrase the id.
    }

    const match = optStr(args, 'match');
    if (match) {
        const needle = match.toLowerCase();
        const rows = recordsOf(type).filter((r) => r.summary.toLowerCase().includes(needle));
        if (rows.length === 1) {
            const found = all.find((r) => String(r.id) === rows[0].id);
            if (found) return { record: found };
        }
        if (rows.length > 1) {
            return {
                error: `${rows.length} ${type} records match "${match}". Call query_logs first and use the exact id.`,
                candidates: rows.slice(0, 8),
            };
        }
        return { error: `No ${type} record matches "${match}".` };
    }

    return { error: `Provide the id of the ${type} record to change. Call query_logs first to get it.` };
}

const updateRecord: ToolSpec = {
    name: 'update_record',
    label: 'Correction',
    mutating: true,
    description:
        'Correct an existing health record. Call query_logs first to get the record id. '
        + 'Only send the fields that change; everything else is kept. '
        + 'Water logs cannot be corrected - delete the entry and log it again instead.',
    parameters: obj({
        type: { type: 'string', enum: RECORD_TYPES as unknown as string[], description: 'Which kind of record to correct.' },
        id: S('Exact id of the record, as returned by query_logs.'),
        match: S('Only if the id is unknown: text contained in the record, e.g. the symptom name.'),
        changes: {
            type: 'object',
            description: 'Object with only the fields to change, e.g. {"intensity": 70} or {"notes": "worse at night"}.',
        },
    }, ['type', 'changes']),
    preview: (a) => {
        const type = pick(a?.type, RECORD_TYPES, 'symptoms');
        const found = resolveRecord(type, a);
        if (found.error || !found.record) return found.error || 'Record not found';
        const access = recordAccess(type);
        const changes = a?.changes && typeof a.changes === 'object' ? a.changes : {};
        const allowed = Object.keys(changes).filter((k) => access.fields.includes(k));
        if (!allowed.length) return `Nothing to change on ${access.describe(found.record)}`;
        const parts = allowed.map((k) => `${k}: ${String(found.record[k] ?? 'empty')} -> ${String(changes[k])}`);
        return `${access.describe(found.record)} | ${parts.join(', ')}`;
    },
    run: (a) => {
        const type = pick(a?.type, RECORD_TYPES, 'symptoms');
        const access = recordAccess(type);

        if (!access.update) {
            return { ok: false, message: `${type} records cannot be edited. Delete the entry and log it again.` };
        }

        const found = resolveRecord(type, a);
        if (found.error || !found.record) {
            return { ok: false, message: found.error || 'Record not found.', data: found.candidates };
        }

        const changes = a?.changes && typeof a.changes === 'object' ? a.changes : {};
        const applied: Record<string, any> = {};
        const rejected: string[] = [];

        for (const key of Object.keys(changes)) {
            if (!access.fields.includes(key)) {
                rejected.push(key);
                continue;
            }
            applied[key] = changes[key];
        }

        if (!Object.keys(applied).length) {
            return {
                ok: false,
                message: `None of those fields can be changed on a ${type} record. Allowed: ${access.fields.join(', ') || 'none'}.`,
            };
        }

        const updated: any = { ...found.record, ...applied };

        // Dates are normalised, and a symptom label always follows its intensity.
        if (typeof applied.dateTime === 'string') updated.dateTime = toIso(applied.dateTime);
        if (typeof applied.dateStarted === 'string') updated.dateStarted = toIso(applied.dateStarted);
        if (typeof applied.dateOfDiagnosis === 'string') updated.dateOfDiagnosis = toIso(applied.dateOfDiagnosis);
        if (type === 'symptoms' && applied.intensity !== undefined) {
            const value = Math.max(0, Math.min(100, Math.round(Number(applied.intensity))));
            updated.intensity = value;
            updated.intensityLabel = intensityLabel(value);
        }

        access.update(updated);

        const note = rejected.length ? ` Ignored: ${rejected.join(', ')}.` : '';
        return ok(`Updated ${type}: ${access.describe(updated)}.${note}`, { id: updated.id, applied });
    },
};

const deleteRecord: ToolSpec = {
    name: 'delete_record',
    label: 'Deletion',
    mutating: true,
    description:
        'Delete an existing health record, for example a duplicate or something logged by mistake. '
        + 'Call query_logs first to get the record id. Deleting is permanent, so never guess which record the user meant.',
    parameters: obj({
        type: { type: 'string', enum: RECORD_TYPES as unknown as string[], description: 'Which kind of record to delete.' },
        id: S('Exact id of the record, as returned by query_logs.'),
        match: S('Only if the id is unknown: text contained in the record.'),
    }, ['type']),
    preview: (a) => {
        const type = pick(a?.type, RECORD_TYPES, 'symptoms');
        const found = resolveRecord(type, a);
        if (found.error || !found.record) return found.error || 'Record not found';
        const access = recordAccess(type);
        const when = found.record.dateTime || found.record.dateStarted || found.record.dateOfDiagnosis;
        return `Delete ${type}: ${access.describe(found.record)}${when ? ` (${shortDate(when)})` : ''}`;
    },
    run: (a) => {
        const type = pick(a?.type, RECORD_TYPES, 'symptoms');
        const access = recordAccess(type);
        const found = resolveRecord(type, a);
        if (found.error || !found.record) {
            return { ok: false, message: found.error || 'Record not found.', data: found.candidates };
        }

        const label = access.describe(found.record);
        access.remove(String(found.record.id));
        return ok(`Deleted ${type}: ${label}.`, { id: found.record.id });
    },
};

export const RECORD_EDIT_TOOLS: ToolSpec[] = [updateRecord, deleteRecord];

/* ------------------------------------------------------ image understanding */

const analyzeImageTool: ToolSpec = {
    name: 'analyze_image',
    category: 'vision',
    mutating: false,
    label: 'Image',
    description:
        'Ask a follow-up question about the photo the user attached in this conversation. '
        + 'The photo was already described to you when it was sent, so use this only when you need a detail that was not covered, '
        + 'such as text on a medicine box, a number on a lab report, or the exact colour of a rash.',
    parameters: {
        type: 'object',
        properties: {
            question: { type: 'string', description: 'The specific question to ask about the photo.' },
        },
        required: ['question'],
    },
    preview: (a: any) => 'Look again at the photo: ' + (a?.question || ''),
    run: async (a: any) => {
        const image = getLastImage();
        if (!image) {
            return { ok: false, message: 'There is no photo in this conversation. Ask the user to attach one.' };
        }

        const model = useAiStore.getState().visionModel;
        if (!model) {
            return { ok: false, message: 'No vision model is selected. The user can pick one in AI Settings.' };
        }

        try {
            const answer = await analyzeImage({
                model,
                base64: image.base64,
                mimeType: image.mimeType,
                prompt: reqStr(a, 'question'),
            });
            return ok('About the photo: ' + answer, { answer });
        } catch (e: any) {
            if (e instanceof GeminiError) return { ok: false, message: e.message };
            return { ok: false, message: 'The image could not be analysed: ' + (e?.message || 'unknown error') };
        }
    },
};

export const VISION_TOOLS: ToolSpec[] = [analyzeImageTool];

export const WEB_TOOLS: ToolSpec[] = [webSearchTool, openPageTool];
export const MEMORY_TOOLS: ToolSpec[] = [rememberTool, forgetTool, listMemoryTool];

/**
 * Health tools and record editing are always on, memory too. Web tools appear
 * only when the user enabled search, and the vision tool only while a photo is
 * present in the conversation and a vision model is configured.
 */
export function activeTools(options?: { web?: boolean; vision?: boolean }): ToolSpec[] {
    let list = TOOLS.concat(RECORD_EDIT_TOOLS, MEMORY_TOOLS);
    if (options?.web) list = list.concat(WEB_TOOLS);
    if (options?.vision) list = list.concat(VISION_TOOLS);
    return list;
}

export function getAnyTool(name: string): ToolSpec | undefined {
    return TOOLS.concat(RECORD_EDIT_TOOLS, MEMORY_TOOLS, WEB_TOOLS, VISION_TOOLS).find((t) => t.name === name);
}

export function activeToolSchemas(options?: { web?: boolean; vision?: boolean }): any[] {
    return activeTools(options).map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
}

export function activeToolsAsText(options?: { web?: boolean; vision?: boolean }): string {
    return activeTools(options)
        .map((t) => {
            const props = Object.keys(t.parameters?.properties || {}).join(', ');
            const required = (t.parameters?.required || []).join(', ');
            return '- ' + t.name + '(' + props + ')' + (required ? ' [required: ' + required + ']' : '') + ': ' + t.description;
        })
        .join('\n');
}
