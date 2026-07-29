import { REQUEST_TIMEOUT_MS } from './config';
import { getApiKey, redact } from './secrets';
import { ApiMessage, ApiToolCall, ZenModel } from './types';

export class ZenError extends Error {
    code: 'NO_API_KEY' | 'OFFLINE' | 'TIMEOUT' | 'AUTH' | 'MODEL' | 'RATE_LIMIT' | 'TOOLS_UNSUPPORTED' | 'HTTP' | 'PARSE';
    status?: number;
    constructor(code: ZenError['code'], message: string, status?: number) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

function classify(status: number, body: string): ZenError {
    const lower = body.toLowerCase();
    if (status === 401 || status === 403) return new ZenError('AUTH', 'Invalid or expired API key.', status);
    if (status === 429) return new ZenError('RATE_LIMIT', 'Rate limit or free quota reached for this model. Pick another model.', status);
    if (status === 404 || lower.includes('model not found') || lower.includes('unknown model')) {
        return new ZenError('MODEL', 'This model is not available anymore. Choose another one in AI Settings.', status);
    }
    if (lower.includes('tool') && (lower.includes('not supported') || lower.includes('unsupported') || lower.includes('does not support'))) {
        return new ZenError('TOOLS_UNSUPPORTED', 'The selected model does not support tools.', status);
    }
    return new ZenError('HTTP', redact(`Request failed (${status}): ${body.slice(0, 300)}`), status);
}

async function zenFetch(baseUrl: string, path: string, init: RequestInit = {}): Promise<any> {
    const key = await getApiKey();
    if (!key) throw new ZenError('NO_API_KEY', 'No API key saved yet.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
        res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
            ...init,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
                ...(init.headers || {}),
            },
        });
    } catch (e: any) {
        clearTimeout(timer);
        if (e?.name === 'AbortError') throw new ZenError('TIMEOUT', 'The model took too long to answer. Try again or pick a faster model.');
        throw new ZenError('OFFLINE', 'No internet connection. The rest of the app keeps working offline.');
    }
    clearTimeout(timer);

    const text = await res.text();
    if (!res.ok) throw classify(res.status, text);

    try {
        return JSON.parse(text);
    } catch {
        throw new ZenError('PARSE', redact(`Unexpected response: ${text.slice(0, 200)}`));
    }
}

export async function listModels(baseUrl: string): Promise<ZenModel[]> {
    const json = await zenFetch(baseUrl, '/models', { method: 'GET' });
    const raw: any[] = Array.isArray(json) ? json : json?.data || json?.models || [];
    return raw
        .map((m) => {
            const id = typeof m === 'string' ? m : m?.id || m?.name;
            if (!id) return null;
            const cost = typeof m === 'object' ? m?.cost || m?.pricing : undefined;
            const inputCost = cost ? Number(cost.input ?? cost.prompt ?? NaN) : NaN;
            const outputCost = cost ? Number(cost.output ?? cost.completion ?? NaN) : NaN;
            const free =
                /free/i.test(String(id)) ||
                (Number.isFinite(inputCost) && Number.isFinite(outputCost) && inputCost === 0 && outputCost === 0);
            return { id: String(id), name: typeof m === 'object' ? m?.name : undefined, free, raw: m } as ZenModel;
        })
        .filter(Boolean) as ZenModel[];
}

export interface CompletionOptions {
    baseUrl: string;
    model: string;
    messages: ApiMessage[];
    tools?: any[];
    temperature?: number;
    maxTokens?: number;
}

export async function chatCompletion(opts: CompletionOptions): Promise<ApiMessage> {
    const body: Record<string, any> = {
        model: opts.model,
        messages: opts.messages,
        stream: false,
        temperature: opts.temperature ?? 0.2,
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (opts.tools && opts.tools.length) {
        body.tools = opts.tools;
        body.tool_choice = 'auto';
    }

    const json = await zenFetch(opts.baseUrl, '/chat/completions', {
        method: 'POST',
        body: JSON.stringify(body),
    });

    const message = json?.choices?.[0]?.message;
    if (!message) throw new ZenError('PARSE', 'The model returned an empty answer.');
    return message as ApiMessage;
}

/* ---------------------------------------------------------------- streaming */

/**
 * Streams one completion.
 *
 * React Native's fetch has no readable `response.body`, so server-sent events
 * are read through XMLHttpRequest progress events instead: on every progress
 * tick the already-received part of `responseText` is diffed and the new SSE
 * lines are parsed. This needs no polyfill and works in Expo Go and in a
 * release APK.
 *
 * Both plain content and tool-call deltas are accumulated, so a streamed turn
 * can still call tools. The resolved message has the exact same shape as the
 * non-streaming one.
 */
export async function streamChatCompletion(
    opts: CompletionOptions,
    onDelta?: (chunk: string, full: string) => void
): Promise<ApiMessage> {
    const key = await getApiKey();
    if (!key) throw new ZenError('NO_API_KEY', 'No API key saved yet.');

    const body: Record<string, any> = {
        model: opts.model,
        messages: opts.messages,
        stream: true,
        temperature: opts.temperature ?? 0.2,
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (opts.tools && opts.tools.length) {
        body.tools = opts.tools;
        body.tool_choice = 'auto';
    }

    const url = opts.baseUrl.replace(/\/$/, '') + '/chat/completions';

    return new Promise<ApiMessage>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let seen = 0;             // characters of responseText already parsed
        let pending = '';         // partial SSE line carried across ticks
        let content = '';
        let finished = false;
        const toolCalls: ApiToolCall[] = [];

        const finish = (fn: () => void) => {
            if (finished) return;
            finished = true;
            fn();
        };

        /** Merges one delta object into the accumulated message. */
        const applyDelta = (delta: any) => {
            if (!delta) return;

            if (typeof delta.content === 'string' && delta.content) {
                content += delta.content;
                onDelta?.(delta.content, content);
            }

            // Tool calls arrive in fragments identified by their index.
            const calls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
            for (const part of calls) {
                const index = typeof part?.index === 'number' ? part.index : 0;
                if (!toolCalls[index]) {
                    toolCalls[index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                }
                const target = toolCalls[index];
                if (part?.id) target.id = part.id;
                if (part?.function?.name) target.function.name += part.function.name;
                if (typeof part?.function?.arguments === 'string') {
                    target.function.arguments += part.function.arguments;
                }
            }
        };

        const handleLine = (line: string) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) return;
            if (!trimmed.startsWith('data:')) return;

            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') return;

            try {
                const json = JSON.parse(payload);
                // Some gateways report errors inside the stream itself.
                if (json?.error) {
                    const message = json.error?.message || 'The model reported an error mid-stream.';
                    finish(() => {
                        xhr.abort();
                        reject(new ZenError('HTTP', redact(String(message))));
                    });
                    return;
                }
                applyDelta(json?.choices?.[0]?.delta);
            } catch {
                // A chunk can split a JSON object; it is retried as `pending`.
            }
        };

        const drain = () => {
            const text = xhr.responseText || '';
            if (text.length <= seen) return;

            pending += text.slice(seen);
            seen = text.length;

            const lines = pending.split('\n');
            // The last piece may be incomplete, so it waits for the next tick.
            pending = lines.pop() || '';
            for (const line of lines) handleLine(line);
        };

        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'text/event-stream');
        xhr.setRequestHeader('Authorization', 'Bearer ' + key);
        xhr.timeout = REQUEST_TIMEOUT_MS;

        xhr.onprogress = () => {
            if (xhr.status && xhr.status >= 400) return; // handled in onload
            drain();
        };

        xhr.onload = () => {
            if (xhr.status >= 400) {
                finish(() => reject(classify(xhr.status, xhr.responseText || '')));
                return;
            }

            drain();
            if (pending) handleLine(pending);

            const message: ApiMessage = { role: 'assistant', content };
            const calls = toolCalls.filter((c) => c && c.function?.name);
            if (calls.length) {
                message.tool_calls = calls.map((c, i) => ({
                    ...c,
                    id: c.id || 'call_' + i,
                }));
            }

            if (!content && !message.tool_calls) {
                finish(() => reject(new ZenError('PARSE', 'The model returned an empty answer.')));
                return;
            }

            finish(() => resolve(message));
        };

        xhr.onerror = () => {
            finish(() => reject(new ZenError('OFFLINE', 'No internet connection. The rest of the app keeps working offline.')));
        };

        xhr.ontimeout = () => {
            finish(() => reject(new ZenError('TIMEOUT', 'The model took too long to answer. Try again or pick a faster model.')));
        };

        try {
            xhr.send(JSON.stringify(body));
        } catch (e: any) {
            finish(() => reject(new ZenError('HTTP', redact(e?.message || 'The request could not be sent.'))));
        }
    });
}

/** Cheap round-trip used by the "Test connection" button. */
export async function testConnection(baseUrl: string, model: string): Promise<string> {
    const msg = await chatCompletion({
        baseUrl,
        model,
        messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
        maxTokens: 8,
    });
    return (msg.content || '').trim() || 'OK';
}
