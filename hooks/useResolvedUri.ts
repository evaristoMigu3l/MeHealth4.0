import { useEffect, useState } from 'react';
import { isSupabaseStorageUri, resolveStorageUri } from '../utils/supabase/storageService';

/**
 * Resolves a stored URI for display.
 *
 *  - `supabase://bucket/path` references are exchanged for a short-lived
 *    signed URL (cached in the storage service).
 *  - Any other URI (local file://, content://, http) is returned as-is.
 *
 * Returns the original URI immediately while resolving, so local images
 * never flash blank; the signed URL replaces it when ready.
 */
export function useResolvedUri(uri?: string | null): string | undefined {
    const [resolved, setResolved] = useState<string | undefined>(uri ?? undefined);

    useEffect(() => {
        let cancelled = false;

        if (!uri) {
            setResolved(undefined);
            return;
        }

        if (!isSupabaseStorageUri(uri)) {
            setResolved(uri);
            return;
        }

        // Keep showing the previous value (or the raw uri) until resolved.
        resolveStorageUri(uri)
            .then((signed) => { if (!cancelled) setResolved(signed); })
            .catch(() => { if (!cancelled) setResolved(uri); });

        return () => { cancelled = true; };
    }, [uri]);

    return resolved;
}
