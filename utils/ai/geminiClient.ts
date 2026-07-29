import {
    FALLBACK_VISION_MODELS,
    GEMINI_API_VERSION,
    GEMINI_BASE_URL,
    VISION_DESCRIPTION_CHARS,
    VISION_TIMEOUT_MS,
} from './config';
import { getGeminiKey, redactAll } from './secrets';
import { VisionModel } from './types';

/**
 * Minimal Gemini REST client for image understanding.
 *
 * The official @google/genai SDK is deliberately not used: it targets Node and
 * pulls in a file-upload flow that is pointless here, because a phone photo is
 * small enough to send inline as base64 in a single request. Two plain fetch
 * calls cover everything the app needs and keep the bundle small.
 *
 * The key travels in the x-goog-api-key header, never in the URL, so it cannot
 * leak into logs or error messages.
 */

export class GeminiError extends Error {
    code: 'NO_API_KEY' | 'OFFLINE' | 'TIMEOUT' | 'AUTH' | 'MODEL' | 'RATE_LIMIT' | 'TOO_LARGE' | 'BLOCKED' | 'HTTP' | 'PARSE';
    status?: number;

    constructor(code: GeminiError['code'], message: string, status?: number) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

/** Turns an HTTP failure into a message the user can actually act on. */
function classify(status: number, body: string): GeminiError {
    const safe = redactAll(body).slice(0, 300);

    if (status === 400 && /API key not valid/i.test(body)) {
        return new GeminiError('AUTH', 'That Gemini API key is not valid. Check it in AI Settings.', status);
    }
    if (status === 401 || status === 403) {
        return new GeminiError('AUTH', 'Gemini refused the API key. Create a new one at Google AI Studio and save it again.', status);
    }
    if (status === 404) {
        return new GeminiError('MODEL', 'That image model does not exist any more. Pick another one in AI Settings.', status);
    }
    if (status === 413) {
        return new GeminiError('TOO_LARGE', 'The photo is too large for this model. Take it again at a lower resolution.', status);
    }
    if (status === 429) {
        return new GeminiError('RATE_LIMIT', 'The free Gemini quota is used up for now. Wait a few minutes and try again.', status);
    }
    if (status >= 500) {
        return new GeminiError('HTTP', 'Gemini is having trouble right now. Try again in a moment.', status);
    }
    return new GeminiError('HTTP', 'Gemini returned an error (' + status + '). ' + safe, status);
}

/** Base URLs are built by concatenation, never by interpolation. */
const MODELS_PATH = '/models';

function apiRoot(): string {
    const base = GEMINI_BASE_URL.replace(/\/$/, '');
    return base + '/' + GEMINI_API_VERSION;
}

/** fetch with an abort timeout and uniform network error handling. */
async function geminiFetch(url: string, init: RequestInit, key: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': key,
                ...(init.headers || {}),
            },
        });
    } catch (e: any) {
        if (e?.name === 'AbortError') {
            throw new GeminiError('TIMEOUT', 'The image analysis took too long. Try again, or pick a faster flash model.');
        }
        throw new GeminiError('OFFLINE', 'No internet connection, so the photo cannot be analysed. Everything else in the app still works offline.');
    } finally {
        clearTimeout(timer);
    }
}

/* ------------------------------------------------------------------ models */

/**
 * Lists the models this key can use, keeping only those that can answer a
 * generateContent request. Google renames and retires models regularly, which
 * is exactly why the list is fetched instead of hard-coded.
 */
export async function listVisionModels(): Promise<VisionModel[]> {
    const key = await getGeminiKey();
    if (!key) throw new GeminiError('NO_API_KEY', 'Save a Gemini API key first.');

    const response = await geminiFetch(apiRoot() + MODELS_PATH + '?pageSize=100', { method: 'GET' }, key);

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw classify(response.status, body);
    }

    let json: any;
    try {
        json = await response.json();
    } catch {
        throw new GeminiError('PARSE', 'Gemini sent an answer that could not be read.');
    }

    const raw = Array.isArray(json?.models) ? json.models : [];

    const models: VisionModel[] = raw
        .filter((m: any) => {
            const methods = Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
            return methods.includes('generateContent');
        })
        .map((m: any) => {
            // Names come back as "models/gemini-2.0-flash"; only the id is needed.
            const id = String(m?.name || '').replace(/^models\//, '');
            return {
                id,
                name: m?.displayName || id,
                description: m?.description,
                // Flash and flash-lite models are the ones inside the free tier.
                free: /flash/i.test(id),
            };
        })
        .filter((m: VisionModel) => m.id && !/embedding|aqa|imagen|veo|tts/i.test(m.id));

    if (!models.length) {
        return FALLBACK_VISION_MODELS.map((id) => ({ id, name: id, free: /flash/i.test(id) }));
    }

    // Newest first, so the current flash model surfaces at the top.
    return models.sort((a, b) => b.id.localeCompare(a.id));
}

/* ----------------------------------------------------------------- analysis */

export interface AnalyzeImageInput {
    model: string;
    /** Raw base64, without the data: prefix. */
    base64: string;
    mimeType: string;
    prompt: string;
}

/**
 * Sends one photo plus one question and returns the plain text answer.
 *
 * The image is sent inline (inline_data), so there is no upload step and
 * nothing is stored on Google's side beyond the request itself.
 */
export async function analyzeImage(input: AnalyzeImageInput): Promise<string> {
    const key = await getGeminiKey();
    if (!key) {
        throw new GeminiError('NO_API_KEY', 'No Gemini API key saved yet. Add one in AI Settings to analyse photos.');
    }

    const model = input.model.replace(/^models\//, '').trim();
    if (!model) {
        throw new GeminiError('MODEL', 'No image model is selected. Pick one in AI Settings.');
    }

    const body = {
        contents: [
            {
                role: 'user',
                parts: [
                    { text: input.prompt },
                    {
                        inline_data: {
                            mime_type: input.mimeType || 'image/jpeg',
                            data: input.base64,
                        },
                    },
                ],
            },
        ],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
        },
    };

    const url = apiRoot() + MODELS_PATH + '/' + model + ':generateContent';
    const response = await geminiFetch(url, { method: 'POST', body: JSON.stringify(body) }, key);

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw classify(response.status, text);
    }

    let json: any;
    try {
        json = await response.json();
    } catch {
        throw new GeminiError('PARSE', 'Gemini sent an answer that could not be read.');
    }

    // A safety filter can block the answer, which is not an HTTP error.
    const blockReason = json?.promptFeedback?.blockReason;
    if (blockReason) {
        throw new GeminiError('BLOCKED', 'Gemini refused to describe this photo (' + String(blockReason).toLowerCase() + ').');
    }

    const candidate = json?.candidates?.[0];
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts
        .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim();

    if (!text) {
        if (candidate?.finishReason === 'SAFETY') {
            throw new GeminiError('BLOCKED', 'Gemini blocked its own answer about this photo for safety reasons.');
        }
        throw new GeminiError('PARSE', 'Gemini did not describe the photo. Try another photo or another model.');
    }

    // Long descriptions are trimmed so they cannot flood the text model context.
    return text.length > VISION_DESCRIPTION_CHARS
        ? text.slice(0, VISION_DESCRIPTION_CHARS) + '...'
        : text;
}

/** Round-trip used by the "Test" button next to the Gemini key. */
export async function testVisionConnection(model: string): Promise<string> {
    // A 1x1 transparent PNG: enough to prove the key, model and route work.
    const PIXEL =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AH9uYQmAAAAAElFTkSuQmCC';

    const answer = await analyzeImage({
        model,
        base64: PIXEL,
        mimeType: 'image/png',
        prompt: 'Reply with the single word OK.',
    });

    return answer.slice(0, 80);
}
