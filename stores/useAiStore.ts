import { create } from 'zustand';
import {
    DEFAULT_BASE_URL,
    DEFAULT_VISION_MODEL,
    MAX_HISTORY_MESSAGES,
    SearchProvider,
    STREAM_ENABLED_BY_DEFAULT,
} from '../utils/ai/config';
import { ApiMessage, ChatBubble, PendingAction, VisionModel, ZenModel } from '../utils/ai/types';
import { emitScalarChange, isHydratingFromCloud } from '../utils/supabase/syncBridge';

/**
 * AI assistant store.
 *
 * Persistence architecture (v2 — cloud-first):
 *  - Non-secret assistant state (model choice, custom prompt, memory
 *    notes, chat bubbles, history) is synced to the Supabase `ai_state`
 *    table as a single JSON blob and restored on sign-in.
 *  - API keys are NEVER synced — they stay in expo-secure-store on each
 *    device (see utils/ai/secrets.ts).
 *  - The old AsyncStorage `persist` middleware was removed; the legacy
 *    `ai-storage` key is left in place as a harmless leftover (it is not
 *    part of the health-data migration and contains no irreplaceable
 *    data — chat history is re-synced from the cloud).
 */

interface AiState {
    // connection
    baseUrl: string;
    setBaseUrl: (url: string) => void;
    model: string;
    setModel: (model: string) => void;
    temperature: number;
    setTemperature: (value: number) => void;
    autoApprove: boolean;
    setAutoApprove: (value: boolean) => void;
    hasKey: boolean;
    setHasKey: (value: boolean) => void;
    toolsUnsupported: boolean;
    setToolsUnsupported: (value: boolean) => void;

    // replies arrive token by token instead of all at once
    streamReplies: boolean;
    setStreamReplies: (value: boolean) => void;

    // image understanding (Gemini, separate key and model from the text model)
    visionEnabled: boolean;
    setVisionEnabled: (value: boolean) => void;
    visionModel: string;
    setVisionModel: (model: string) => void;
    hasGeminiKeySaved: boolean;
    setHasGeminiKeySaved: (value: boolean) => void;
    visionModels: VisionModel[];
    visionModelsFetchedAt?: string;
    setVisionModels: (models: VisionModel[]) => void;

    // user-defined behaviour
    customPrompt: string;
    setCustomPrompt: (value: string) => void;
    customPromptMode: 'append' | 'replace';
    setCustomPromptMode: (value: 'append' | 'replace') => void;

    // long term memory (plain text, one note per line, always in context)
    memory: string;
    setMemory: (value: string) => void;

    // web search
    webSearchEnabled: boolean;
    setWebSearchEnabled: (value: boolean) => void;
    searchProvider: SearchProvider;
    setSearchProvider: (value: SearchProvider) => void;
    hasSearchKeySaved: boolean;
    setHasSearchKeySaved: (value: boolean) => void;

    // model catalogue
    models: ZenModel[];
    modelsFetchedAt?: string;
    setModels: (models: ZenModel[]) => void;

    // chat
    bubbles: ChatBubble[];
    addBubble: (bubble: ChatBubble) => void;
    patchBubble: (id: string, patch: Partial<ChatBubble>) => void;
    clearChat: () => void;

    // raw wire history kept for model context
    history: ApiMessage[];
    setHistory: (history: ApiMessage[]) => void;

    // review queue
    pending: PendingAction[];
    addPending: (action: PendingAction) => void;
    updatePending: (id: string, args: Record<string, any>, preview: string) => void;
    removePending: (id: string) => void;
    clearPending: () => void;
}

/** Emits an ai-state sync unless we are hydrating from the cloud. */
function pushAiState() {
    if (!isHydratingFromCloud()) emitScalarChange('ai-state');
}

export const useAiStore = create<AiState>()(
    (set) => ({
        baseUrl: DEFAULT_BASE_URL,
        setBaseUrl: (url) => { set({ baseUrl: url.trim() || DEFAULT_BASE_URL }); pushAiState(); },
        model: '',
        setModel: (model) => { set({ model: model.trim(), toolsUnsupported: false }); pushAiState(); },
        temperature: 0.2,
        setTemperature: (value) => { set({ temperature: value }); pushAiState(); },
        autoApprove: false,
        setAutoApprove: (value) => { set({ autoApprove: value }); pushAiState(); },
        hasKey: false,
        setHasKey: (value) => set({ hasKey: value }),
        toolsUnsupported: false,
        setToolsUnsupported: (value) => set({ toolsUnsupported: value }),

        streamReplies: STREAM_ENABLED_BY_DEFAULT,
        setStreamReplies: (value) => { set({ streamReplies: value }); pushAiState(); },

        visionEnabled: false,
        setVisionEnabled: (value) => { set({ visionEnabled: value }); pushAiState(); },
        visionModel: DEFAULT_VISION_MODEL,
        setVisionModel: (model) => { set({ visionModel: model.trim() }); pushAiState(); },
        hasGeminiKeySaved: false,
        setHasGeminiKeySaved: (value) => set({ hasGeminiKeySaved: value }),
        visionModels: [],
        visionModelsFetchedAt: undefined,
        setVisionModels: (models) => set({ visionModels: models, visionModelsFetchedAt: new Date().toISOString() }),

        customPrompt: '',
        setCustomPrompt: (value) => { set({ customPrompt: value }); pushAiState(); },
        customPromptMode: 'append',
        setCustomPromptMode: (value) => { set({ customPromptMode: value }); pushAiState(); },

        memory: '',
        setMemory: (value) => { set({ memory: value }); pushAiState(); },

        webSearchEnabled: false,
        setWebSearchEnabled: (value) => { set({ webSearchEnabled: value }); pushAiState(); },
        searchProvider: 'duckduckgo',
        setSearchProvider: (value) => { set({ searchProvider: value }); pushAiState(); },
        hasSearchKeySaved: false,
        setHasSearchKeySaved: (value) => set({ hasSearchKeySaved: value }),

        models: [],
        modelsFetchedAt: undefined,
        setModels: (models) => set({ models, modelsFetchedAt: new Date().toISOString() }),

        bubbles: [],
        addBubble: (bubble) => { set((state) => ({ bubbles: [...state.bubbles, bubble] })); pushAiState(); },
        patchBubble: (id, patch) => set((state) => ({
            bubbles: state.bubbles.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        })),
        clearChat: () => { set({ bubbles: [], history: [] }); pushAiState(); },

        history: [],
        setHistory: (history) => { set({ history: history.slice(-MAX_HISTORY_MESSAGES) }); pushAiState(); },

        pending: [],
        addPending: (action) => set((state) => ({ pending: [...state.pending, action] })),
        updatePending: (id, args, preview) => set((state) => ({
            pending: state.pending.map((p) => (p.id === id ? { ...p, args, preview } : p)),
        })),
        removePending: (id) => set((state) => ({ pending: state.pending.filter((p) => p.id !== id) })),
        clearPending: () => set({ pending: [] }),
    })
);
