import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useCloudStore } from '../../stores/useCloudStore';
import { useHealthStore } from '../../stores/useHealthStore';
import { useUserStore } from '../../stores/useUserStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { useAiStore } from '../../stores/useAiStore';
import {
    restoreSession, onAuthStateChange, signOut as authSignOut,
} from './authService';
import {
    fetchAllHealthData, upsertRecord, deleteRecord, HealthDataSnapshot,
} from './healthService';
import {
    fetchProfile, fetchPreferences, fetchAiState,
    upsertProfile, upsertPreferences, upsertAiState,
} from './profileService';
import { clearResolvedUriCache } from './storageService';
import { hasLegacyLocalData, migrateLegacyDataToSupabase } from './legacyMigration';
import {
    onRecordChange, onScalarChange, RecordChange,
    setHydratingFromCloud,
} from './syncBridge';
import { describeSupabaseError, isOnline } from './client';
import { HealthCollection } from './mapping';

/**
 * Cloud synchronisation engine.
 *
 * Responsibilities:
 *  - restore the persisted Supabase session on launch
 *  - hydrate all stores from Supabase after sign-in (cloud = source of truth)
 *  - run the one-time legacy local-data migration
 *  - push every local record change to Supabase via a durable queue
 *  - track connectivity and retry queued changes when back online
 *  - reset local state on sign-out
 *
 * The UI never talks to Supabase directly; stores emit changes through
 * the sync bridge and this engine delivers them.
 */

const QUEUE_STORAGE_KEY = 'cloud-sync-queue-v1';
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

interface QueueEntry {
    collection: HealthCollection;
    kind: 'upsert' | 'delete';
    record: { id: string; [key: string]: unknown };
}

let initialized = false;
let queue: QueueEntry[] = [];
let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let online = true;
let unsubscribeBridge: (() => void) | null = null;
let unsubscribeScalars: (() => void) | null = null;
let unsubscribeAuth: (() => void) | null = null;
let unsubscribeNetInfo: (() => void) | null = null;

/* ------------------------------------------------------------- queue I/O */

async function persistQueue(): Promise<void> {
    try {
        await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
        useCloudStore.getState().setPendingCount(queue.length);
    } catch (err) {
        console.warn('[sync] queue persist failed:', err);
    }
}

async function loadQueue(): Promise<void> {
    try {
        const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
        queue = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(queue)) queue = [];
    } catch {
        queue = [];
    }
    useCloudStore.getState().setPendingCount(queue.length);
}

async function clearQueue(): Promise<void> {
    queue = [];
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    retryAttempt = 0;
    try { await AsyncStorage.removeItem(QUEUE_STORAGE_KEY); } catch { /* ignore */ }
    useCloudStore.getState().setPendingCount(0);
}

/**
 * Adds a change to the queue, collapsing redundant entries:
 * the latest change per (collection, id) wins — an upsert after a delete
 * resurrects the record, a delete after an upsert just drops the upsert.
 */
function enqueueChange(change: RecordChange): void {
    queue = queue.filter(
        (e) => !(e.collection === change.collection && e.record.id === change.record.id)
    );
    queue.push({ collection: change.collection, kind: change.kind, record: change.record });
    void persistQueue();
    void flushQueue();
}

/* ------------------------------------------------------------- queue flush */

async function flushQueue(): Promise<void> {
    const { userId, authStatus } = useCloudStore.getState();
    if (flushing || authStatus !== 'signedIn' || !userId) return;
    if (!queue.length) {
        useCloudStore.getState().setSyncStatus('synced');
        return;
    }

    if (!online || !(await isOnline())) {
        useCloudStore.getState().setSyncStatus('offline');
        return;
    }

    flushing = true;
    useCloudStore.getState().setSyncStatus('syncing');

    try {
        while (queue.length > 0) {
            const entry = queue[0];
            if (entry.kind === 'upsert') {
                await upsertRecord(entry.collection, entry.record as any, userId);
            } else {
                await deleteRecord(entry.collection, entry.record.id);
            }
            queue.shift();
            await persistQueue();
        }
        retryAttempt = 0;
        useCloudStore.getState().setSyncStatus('synced');
        useCloudStore.getState().setLastSynced(new Date().toISOString());
    } catch (err) {
        const message = describeSupabaseError(err, 'Sync failed. Your changes are saved on this device and will retry.');
        useCloudStore.getState().setSyncStatus('error', message);
        scheduleRetry();
    } finally {
        flushing = false;
    }
}

function scheduleRetry(): void {
    if (retryTimer) return;
    const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
        retryTimer = null;
        void flushQueue();
    }, delay);
}

/* ------------------------------------------------------------- hydration */

/**
 * Loads the user's cloud data into the stores. Called once per sign-in.
 *
 * IMPORTANT: a failed fetch returns null and we keep whatever the stores
 * already hold (local cache) — we never overwrite state with emptiness.
 */
async function hydrateFromCloud(userId: string): Promise<void> {
    useCloudStore.getState().setSyncStatus('loading');
    setHydratingFromCloud(true);

    try {
        // Health collections — the core restore step.
        const health = await fetchAllHealthData(userId) as HealthDataSnapshot | null;
        if (health) {
            useHealthStore.setState({ ...health });
        } else {
            useCloudStore.getState().setSyncStatus(
                'error',
                'Could not load your health data. Showing cached data if available — will retry.'
            );
        }

        // Profile + streaks.
        const profileData = await fetchProfile(userId);
        if (profileData) {
            useUserStore.setState({
                profile: profileData.profile,
                gamification: profileData.gamification,
            });
        }

        // Preferences (theme, language, notification sound).
        const prefs = await fetchPreferences(userId);
        if (prefs) {
            useThemeStore.setState({
                themePreference: (prefs.theme_preference as any) || 'system',
                notificationSound: (prefs.notification_sound as any) || 'default',
                language: (prefs.language as any) || 'en',
            });
        }

        // AI assistant state (never includes API keys).
        const aiState = await fetchAiState(userId);
        if (aiState && typeof aiState === 'object') {
            useAiStore.setState(aiState as any);
        }

        if (health) {
            useCloudStore.getState().setSyncStatus(queue.length ? 'syncing' : 'synced');
            useCloudStore.getState().setLastSynced(new Date().toISOString());
        }
    } finally {
        setHydratingFromCloud(false);
        // Anything queued while offline before hydration completes goes now.
        void flushQueue();
    }
}

/* ------------------------------------------------------- scalar debouncing */

const scalarTimers: Partial<Record<'profile' | 'preferences' | 'ai-state', ReturnType<typeof setTimeout>>> = {};

function pushProfileDebounced(): void {
    if (scalarTimers.profile) clearTimeout(scalarTimers.profile);
    scalarTimers.profile = setTimeout(async () => {
        const { userId, authStatus } = useCloudStore.getState();
        if (authStatus !== 'signedIn' || !userId) return;
        const { profile, gamification } = useUserStore.getState();
        if (!profile) return;
        try {
            await upsertProfile(profile, userId, gamification);
            useCloudStore.getState().setLastSynced(new Date().toISOString());
        } catch (err) {
            useCloudStore.getState().setSyncStatus(
                'error',
                describeSupabaseError(err, 'Could not save your profile. Will retry.')
            );
            pushProfileDebounced(); // simple retry
        }
    }, 800);
}

function pushPreferencesDebounced(): void {
    if (scalarTimers.preferences) clearTimeout(scalarTimers.preferences);
    scalarTimers.preferences = setTimeout(async () => {
        const { userId, authStatus } = useCloudStore.getState();
        if (authStatus !== 'signedIn' || !userId) return;
        const { themePreference, notificationSound, language } = useThemeStore.getState();
        try {
            await upsertPreferences(userId, {
                theme_preference: themePreference,
                notification_sound: notificationSound,
                language,
            });
        } catch (err) {
            console.warn('[sync] preferences push failed:', err);
        }
    }, 800);
}

function pushAiStateDebounced(): void {
    if (scalarTimers['ai-state']) clearTimeout(scalarTimers['ai-state']!);
    scalarTimers['ai-state'] = setTimeout(async () => {
        const { userId, authStatus } = useCloudStore.getState();
        if (authStatus !== 'signedIn' || !userId) return;
        const s = useAiStore.getState();
        // Only non-secret, user-meaningful fields are synced.
        const payload = {
            baseUrl: s.baseUrl,
            model: s.model,
            temperature: s.temperature,
            autoApprove: s.autoApprove,
            streamReplies: s.streamReplies,
            visionEnabled: s.visionEnabled,
            visionModel: s.visionModel,
            customPrompt: s.customPrompt,
            customPromptMode: s.customPromptMode,
            memory: s.memory,
            webSearchEnabled: s.webSearchEnabled,
            searchProvider: s.searchProvider,
            bubbles: s.bubbles.slice(-60),
            history: s.history.slice(-40),
        };
        try {
            await upsertAiState(userId, payload);
        } catch (err) {
            console.warn('[sync] ai state push failed:', err);
        }
    }, 2_000);
}

/* ------------------------------------------------------------- sign-out */

async function resetLocalState(): Promise<void> {
    setHydratingFromCloud(true);
    try {
        useHealthStore.setState({
            symptoms: [], medications: [], measurements: [], diagnoses: [],
            moodLogs: [], dietPlans: [], investigations: [], activities: [],
            sleepLogs: [], foodEntries: [], documents: [], appointments: [],
            hcps: [], waterLogs: [],
        });
        useUserStore.setState({ profile: null, gamification: { currentStreak: 0, longestStreak: 0 } });
        useAiStore.getState().clearChat();
        useAiStore.getState().clearPending();
    } finally {
        setHydratingFromCloud(false);
    }
    await clearQueue();
    clearResolvedUriCache();
}

/** Public sign-out: clears the Supabase session and all local user data. */
export async function signOutAndReset(): Promise<void> {
    try {
        await authSignOut();
    } catch (err) {
        console.warn('[sync] signOut error:', err);
    }
    await resetLocalState();
    useCloudStore.getState().setAuth('signedOut');
    useCloudStore.getState().setSyncStatus('idle');
}

/* ------------------------------------------------------------- lifecycle */

/**
 * Serializes session handling: restoreSession() and the INITIAL_SESSION
 * auth event can both fire at startup, and without this guard we would
 * hydrate (and migrate) twice concurrently. Concurrent calls for the
 * same user share one in-flight handling promise.
 */
let activeSessionHandling: { userId: string | null; promise: Promise<void> } | null = null;

function handleSession(userId: string | null, email: string | null): Promise<void> {
    if (activeSessionHandling && activeSessionHandling.userId === userId) {
        return activeSessionHandling.promise;
    }
    const promise = doHandleSession(userId, email).finally(() => {
        if (activeSessionHandling?.promise === promise) activeSessionHandling = null;
    });
    activeSessionHandling = { userId, promise };
    return promise;
}

async function doHandleSession(userId: string | null, email: string | null): Promise<void> {
    const cloud = useCloudStore.getState();

    if (!userId) {
        cloud.setAuth('signedOut');
        cloud.setSyncStatus('idle');
        return;
    }

    cloud.setAuth('signedIn', userId, email);

    // One-time legacy migration BEFORE the first hydration, so legacy
    // records land in the cloud and are then read back as canonical.
    if (await hasLegacyLocalData()) {
        cloud.setMigrating(true, 'Upgrading your local data to cloud backup…');
        const result = await migrateLegacyDataToSupabase(userId);
        if (result.status === 'failed') {
            cloud.setMigrating(false, result.error || 'Migration will retry on next launch.');
        } else {
            cloud.setMigrating(false);
        }
    }

    await loadQueue();
    await hydrateFromCloud(userId);
}

/**
 * Boots the sync engine. Safe to call multiple times — only the first
 * call does anything. Wire this into the root layout.
 */
export function initCloudSync(): void {
    if (initialized) return;
    initialized = true;

    // Record changes → queue → Supabase.
    unsubscribeBridge = onRecordChange((change) => {
        const { authStatus } = useCloudStore.getState();
        if (authStatus !== 'signedIn') return; // signed out: stay local-only
        enqueueChange(change);
    });

    // Profile / preferences / AI state pushes.
    unsubscribeScalars = onScalarChange((kind) => {
        const { authStatus } = useCloudStore.getState();
        if (authStatus !== 'signedIn') return;
        if (kind === 'profile') pushProfileDebounced();
        else if (kind === 'preferences') pushPreferencesDebounced();
        else pushAiStateDebounced();
    });

    // Connectivity tracking.
    unsubscribeNetInfo = NetInfo.addEventListener((state) => {
        const wasOnline = online;
        online = state.isConnected !== false;
        if (!online) {
            if (useCloudStore.getState().authStatus === 'signedIn' && queue.length > 0) {
                useCloudStore.getState().setSyncStatus('offline');
            }
        } else if (!wasOnline) {
            void flushQueue();
        }
    });

    // React to session lifecycle events (token refresh failures, sign-out
    // from another device, etc.).
    unsubscribeAuth = onAuthStateChange((session, user) => {
        const current = useCloudStore.getState();
        if (!session) {
            if (current.authStatus === 'signedIn') {
                void resetLocalState();
            }
            current.setAuth('signedOut');
            current.setSyncStatus('idle');
        } else if (current.authStatus !== 'signedIn' || current.userId !== user?.id) {
            void handleSession(user?.id ?? null, user?.email ?? null);
        }
    });

    // Restore the persisted session right away.
    void (async () => {
        const session = await restoreSession();
        await handleSession(session?.user?.id ?? null, session?.user?.email ?? null);
    })();
}

/** Tears down listeners (used in tests / hot reload). */
export function disposeCloudSync(): void {
    unsubscribeBridge?.(); unsubscribeBridge = null;
    unsubscribeScalars?.(); unsubscribeScalars = null;
    unsubscribeAuth?.(); unsubscribeAuth = null;
    unsubscribeNetInfo?.(); unsubscribeNetInfo = null;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    initialized = false;
}
