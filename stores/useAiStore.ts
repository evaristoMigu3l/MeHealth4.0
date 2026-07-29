import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    DEFAULT_BASE_URL,
    DEFAULT_VISION_MODEL,
    MAX_HISTORY_MESSAGES,
    SearchProvider,
    STREAM_ENABLED_BY_DEFAULT,
} from '../utils/ai/config';
import { ApiMessage, ChatBubble, PendingAction, VisionModel, ZenModel } from '../utils/ai/types';

/** Bumped whenever the persisted shape changes. See `migrate` below. */
export const AI_STORE_VERSION = 1;

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

export const useAiStore = create<AiState>()(
    persist(
        (set) => ({
            baseUrl: DEFAULT_BASE_URL,
            setBaseUrl: (url) => set({ baseUrl: url.trim() || DEFAULT_BASE_URL }),
            model: '',
            setModel: (model) => set({ model: model.trim(), toolsUnsupported: false }),
            temperature: 0.2,
            setTemperature: (value) => set({ temperature: value }),
            autoApprove: false,
            setAutoApprove: (value) => set({ autoApprove: value }),
            hasKey: false,
            setHasKey: (value) => set({ hasKey: value }),
            toolsUnsupported: false,
            setToolsUnsupported: (value) => set({ toolsUnsupported: value }),

            streamReplies: STREAM_ENABLED_BY_DEFAULT,
            setStreamReplies: (value) => set({ streamReplies: value }),

            visionEnabled: false,
            setVisionEnabled: (value) => set({ visionEnabled: value }),
            visionModel: DEFAULT_VISION_MODEL,
            setVisionModel: (model) => set({ visionModel: model.trim() }),
            hasGeminiKeySaved: false,
            setHasGeminiKeySaved: (value) => set({ hasGeminiKeySaved: value }),
            visionModels: [],
            visionModelsFetchedAt: undefined,
            setVisionModels: (models) => set({ visionModels: models, visionModelsFetchedAt: new Date().toISOString() }),

            customPrompt: '',
            setCustomPrompt: (value) => set({ customPrompt: value }),
            customPromptMode: 'append',
            setCustomPromptMode: (value) => set({ customPromptMode: value }),

            memory: '',
            setMemory: (value) => set({ memory: value }),

            webSearchEnabled: false,
            setWebSearchEnabled: (value) => set({ webSearchEnabled: value }),
            searchProvider: 'duckduckgo',
            setSearchProvider: (value) => set({ searchProvider: value }),
            hasSearchKeySaved: false,
            setHasSearchKeySaved: (value) => set({ hasSearchKeySaved: value }),

            models: [],
            modelsFetchedAt: undefined,
            setModels: (models) => set({ models, modelsFetchedAt: new Date().toISOString() }),

            bubbles: [],
            addBubble: (bubble) => set((state) => ({ bubbles: [...state.bubbles, bubble] })),
            patchBubble: (id, patch) => set((state) => ({
                bubbles: state.bubbles.map((b) => (b.id === id ? { ...b, ...patch } : b)),
            })),
            clearChat: () => set({ bubbles: [], history: [] }),

            history: [],
            setHistory: (history) => set({ history: history.slice(-MAX_HISTORY_MESSAGES) }),

            pending: [],
            addPending: (action) => set((state) => ({ pending: [...state.pending, action] })),
            updatePending: (id, args, preview) => set((state) => ({
                pending: state.pending.map((p) => (p.id === id ? { ...p, args, preview } : p)),
            })),
            removePending: (id) => set((state) => ({ pending: state.pending.filter((p) => p.id !== id) })),
            clearPending: () => set({ pending: [] }),
        }),
        {
            name: 'ai-storage',
            storage: createJSONStorage(() => AsyncStorage),
            version: AI_STORE_VERSION,
            /**
             * Runs when the stored version is older than AI_STORE_VERSION.
             * Only add defaults or reshape data here; never throw, because a
             * failed migration would drop the whole saved state.
             */
            migrate: (persisted: any, fromVersion: number) => {
                const state = { ...(persisted || {}) };

                // v0 (no version field) -> v1: streaming and vision were added.
                if (fromVersion < 1) {
                    if (typeof state.streamReplies !== 'boolean') state.streamReplies = STREAM_ENABLED_BY_DEFAULT;
                    if (typeof state.visionEnabled !== 'boolean') state.visionEnabled = false;
                    if (typeof state.visionModel !== 'string' || !state.visionModel) state.visionModel = DEFAULT_VISION_MODEL;
                    if (!Array.isArray(state.visionModels)) state.visionModels = [];
                    if (typeof state.memory !== 'string') state.memory = '';
                    if (typeof state.webSearchEnabled !== 'boolean') state.webSearchEnabled = false;
                    if (typeof state.searchProvider !== 'string') state.searchProvider = 'duckduckgo';
                }

                return state;
            },
            // The API key is intentionally NOT part of this state; it lives in SecureStore.
            partialize: (state) => ({
                baseUrl: state.baseUrl,
                model: state.model,
                temperature: state.temperature,
                autoApprove: state.autoApprove,
                streamReplies: state.streamReplies,
                visionEnabled: state.visionEnabled,
                visionModel: state.visionModel,
                visionModels: state.visionModels,
                visionModelsFetchedAt: state.visionModelsFetchedAt,
                customPrompt: state.customPrompt,
                customPromptMode: state.customPromptMode,
                memory: state.memory,
                webSearchEnabled: state.webSearchEnabled,
                searchProvider: state.searchProvider,
                models: state.models,
                modelsFetchedAt: state.modelsFetchedAt,
                bubbles: state.bubbles.slice(-60),
                history: state.history.slice(-MAX_HISTORY_MESSAGES),
                pending: state.pending,
            }) as any,
        }
    )
);
