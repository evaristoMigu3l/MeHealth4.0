// OpenCode Zen is an OpenAI-compatible gateway.
// Docs: https://opencode.ai/docs/zen/
export const DEFAULT_BASE_URL = 'https://opencode.ai/zen/v1';

// Fallback list used only when /models cannot be reached.
// Zen rotates its free models often, so the picker always prefers the live list.
export const FALLBACK_MODELS = [
    'big-pickle',
    'grok-code',
    'qwen3-coder',
    'minimax-m2',
];

export const MAX_TOOL_ROUNDS = 6;
export const REQUEST_TIMEOUT_MS = 90000;
export const MAX_HISTORY_MESSAGES = 40;

export const SECURE_KEY_STORE_KEY = 'opencode_zen_api_key';

/* ------------------------------------------------- web search and memory */

/** Keystore entry for the optional web-search provider key. */
export const SEARCH_KEY_STORE_KEY = 'ai_search_api_key';

export type SearchProvider = 'duckduckgo' | 'tavily' | 'brave';

export const SEARCH_PROVIDERS: Array<{
    id: SearchProvider;
    label: string;
    needsKey: boolean;
    hint: string;
}> = [
        {
            id: 'duckduckgo',
            label: 'DuckDuckGo',
            needsKey: false,
            hint: 'No key, no account. Good for quick facts, shallower results.',
        },
        {
            id: 'tavily',
            label: 'Tavily',
            needsKey: true,
            hint: 'Free tier with an API key. Best quality for questions.',
        },
        {
            id: 'brave',
            label: 'Brave Search',
            needsKey: true,
            hint: 'Free tier with an API key. Good general web results.',
        },
    ];

/** Hard caps so a search never floods the model context. */
export const SEARCH_MAX_RESULTS = 5;
export const SEARCH_SNIPPET_CHARS = 400;
export const PAGE_TEXT_CHARS = 3500;
export const SEARCH_TIMEOUT_MS = 20000;

/** Memory limits. Kept small because it is sent with every single request. */
export const MEMORY_MAX_CHARS = 4000;
export const MEMORY_MAX_FACTS = 60;

/* ------------------------------------------------ Gemini image understanding */

// Google AI Studio (Gemini API). Images are sent as inline base64 data, which
// needs no upload step and no extra dependency.
// Docs: https://ai.google.dev/gemini-api/docs/image-understanding
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
export const GEMINI_API_VERSION = 'v1beta';

/** Keystore entry for the Gemini key. Separate from the Zen key. */
export const GEMINI_KEY_STORE_KEY = 'gemini_api_key';

// Used only when the live model list cannot be reached.
export const FALLBACK_VISION_MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
];

export const DEFAULT_VISION_MODEL = 'gemini-2.0-flash';

/**
 * Inline base64 has a hard request ceiling on the Gemini API (about 20 MB for
 * the whole request). Phone photos are far smaller once compressed, but the
 * limit is enforced before sending so the user gets a clear message instead of
 * an opaque 400.
 */
export const VISION_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Longest edge after resizing, before base64 encoding. */
export const VISION_MAX_DIMENSION = 1280;
export const VISION_JPEG_QUALITY = 0.6;
export const VISION_TIMEOUT_MS = 60000;
/** Vision descriptions are trimmed before being handed to the text model. */
export const VISION_DESCRIPTION_CHARS = 2000;

/* ---------------------------------------------------------------- streaming */

/** Streaming is read through XHR progress events, so it needs no polyfill. */
export const STREAM_ENABLED_BY_DEFAULT = false;
