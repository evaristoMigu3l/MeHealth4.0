import { create } from 'zustand';

/**
 * Cloud authentication & synchronisation status.
 *
 * Deliberately NOT persisted — auth state is restored from the Supabase
 * session on every launch, and sync status is always recomputed live.
 */

export type AuthStatus =
    | 'initializing'   // restoring persisted session
    | 'signedOut'      // no session → show auth screen
    | 'signedIn';      // session active

export type SyncStatus =
    | 'idle'           // nothing happening
    | 'loading'        // initial cloud load after sign-in
    | 'synced'         // last sync succeeded, queue empty
    | 'syncing'        // pushes in flight / retrying queue
    | 'offline'        // no connectivity; changes queued locally
    | 'error';         // last sync failed (user-visible feedback shown)

interface CloudState {
    authStatus: AuthStatus;
    userId: string | null;
    userEmail: string | null;
    syncStatus: SyncStatus;
    lastSyncedAt: string | null;
    lastError: string | null;
    pendingCount: number;
    /** True while the one-time legacy migration is running. */
    migrating: boolean;
    migrationMessage: string | null;

    setAuth: (status: AuthStatus, userId?: string | null, userEmail?: string | null) => void;
    setSyncStatus: (status: SyncStatus, error?: string | null) => void;
    setLastSynced: (iso: string) => void;
    setPendingCount: (count: number) => void;
    setMigrating: (migrating: boolean, message?: string | null) => void;
    clearError: () => void;
}

export const useCloudStore = create<CloudState>()((set) => ({
    authStatus: 'initializing',
    userId: null,
    userEmail: null,
    syncStatus: 'idle',
    lastSyncedAt: null,
    lastError: null,
    pendingCount: 0,
    migrating: false,
    migrationMessage: null,

    setAuth: (authStatus, userId = null, userEmail = null) =>
        set({ authStatus, userId, userEmail }),
    setSyncStatus: (syncStatus, error = null) =>
        set((state) => ({ syncStatus, lastError: error ?? state.lastError })),
    setLastSynced: (iso) => set({ lastSyncedAt: iso }),
    setPendingCount: (pendingCount) => set({ pendingCount }),
    setMigrating: (migrating, migrationMessage = null) => set({ migrating, migrationMessage }),
    clearError: () => set({ lastError: null }),
}));
