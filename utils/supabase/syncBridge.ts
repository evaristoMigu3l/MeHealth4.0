import { HealthCollection } from './mapping';

/**
 * Tiny event bridge between the Zustand stores and the sync engine.
 *
 * Stores report record changes here (fire-and-forget); the sync engine
 * subscribes and pushes them to Supabase. Keeping this indirection means
 * stores never import the engine (no circular imports) and stay fully
 * synchronous for the UI.
 */

export type RecordChangeKind = 'upsert' | 'delete';

export interface RecordChange {
    collection: HealthCollection;
    kind: RecordChangeKind;
    /** Full record for upserts; only { id } is needed for deletes. */
    record: { id: string; [key: string]: unknown };
}

type Listener = (change: RecordChange) => void;

const listeners = new Set<Listener>();

export function onRecordChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Called by stores after every local mutation. Never throws. */
export function emitRecordChange(change: RecordChange): void {
    try {
        listeners.forEach((l) => l(change));
    } catch (err) {
        console.warn('[sync] bridge listener failed:', err);
    }
}

/* ---------------------------------------------------- profile/prefs events */

export type ScalarChangeKind = 'profile' | 'preferences' | 'ai-state';

type ScalarListener = (kind: ScalarChangeKind) => void;
const scalarListeners = new Set<ScalarListener>();

export function onScalarChange(listener: ScalarListener): () => void {
    scalarListeners.add(listener);
    return () => scalarListeners.delete(listener);
}

export function emitScalarChange(kind: ScalarChangeKind): void {
    try {
        scalarListeners.forEach((l) => l(kind));
    } catch (err) {
        console.warn('[sync] scalar listener failed:', err);
    }
}

/* --------------------------------------------------------- hydration guard */

/**
 * While the app hydrates stores from Supabase (initial load after
 * sign-in), store mutations must NOT be echoed back to the cloud —
 * that would push the freshly-loaded data as "new changes" and could
 * race with the load itself. The sync engine toggles this flag around
 * hydration; stores check it before emitting.
 */
let hydrating = false;

export function setHydratingFromCloud(value: boolean): void {
    hydrating = value;
}

export function isHydratingFromCloud(): boolean {
    return hydrating;
}
