import { useAiStore } from '../../stores/useAiStore';
import { MAX_TOOL_ROUNDS } from './config';
import { analyzeImage, GeminiError } from './geminiClient';
import { setLastImage } from './imageInput';
import { redact } from './secrets';
import { buildFinalSystemPrompt, jsonFallbackInstruction, visionPrompt } from './systemPrompt';
import { activeToolSchemas, getAnyTool, getTool, takeLastSources } from './tools';
import { chatCompletion, streamChatCompletion, ZenError } from './zenClient';
import { AgentTurnResult, ApiMessage, ApiToolCall, AttachedImage, ChatAction, PendingAction } from './types';

function newId(): string {
    return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

function parseArgs(raw: any): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    const text = String(raw).trim();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        // Some models wrap arguments in a fence or add trailing commas.
        const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').replace(/,\s*([}\]])/g, '$1').trim();
        return JSON.parse(cleaned);
    }
}

/**
 * Runs one tool call. Mutating calls are staged for review unless auto-approve
 * is on. Returns both the JSON string handed back to the model and the chip
 * shown in the chat.
 */
async function executeToolCall(name: string, rawArgs: any): Promise<{ toolContent: string; action?: ChatAction }> {
    const tool = getAnyTool(name);
    if (!tool) {
        return {
            toolContent: JSON.stringify({
                ok: false,
                error: `Unknown tool: ${name}`,
                hint: 'Use only the tool names listed in your instructions.',
            }),
        };
    }

    let args: Record<string, any>;
    try {
        args = parseArgs(rawArgs);
    } catch (e: any) {
        return {
            toolContent: JSON.stringify({
                ok: false,
                error: `Arguments were not valid JSON: ${e?.message || 'parse error'}`,
                hint: 'Send the arguments again as a single valid JSON object.',
            }),
        };
    }

    const autoApprove = useAiStore.getState().autoApprove;

    try {
        if (tool.mutating && !autoApprove) {
            const preview = tool.preview(args);
            const pending: PendingAction = {
                id: newId(),
                tool: tool.name,
                label: tool.label,
                preview,
                args,
                createdAt: new Date().toISOString(),
            };
            useAiStore.getState().addPending(pending);
            return {
                toolContent: JSON.stringify({ ok: true, status: 'staged_for_review', preview }),
                action: { tool: tool.name, label: tool.label, preview, status: 'staged', pendingId: pending.id },
            };
        }

        const preview = tool.mutating || tool.category === 'web' || tool.category === 'memory'
            ? tool.preview(args)
            : tool.label;
        const result = await tool.run(args);
        const isVisible = tool.mutating || tool.category === 'web' || tool.category === 'memory';
        return {
            toolContent: JSON.stringify({ ok: result.ok, message: result.message, data: result.data }),
            action: isVisible
                ? {
                    tool: tool.name,
                    label: tool.label,
                    preview,
                    status: tool.mutating
                        ? (result.ok ? 'saved' : 'failed')
                        : (result.ok ? 'info' : 'failed'),
                }
                : undefined,
        };
    } catch (e: any) {
        return {
            toolContent: JSON.stringify({
                ok: false,
                error: e?.message || 'Tool failed.',
                hint: 'Fix the arguments and call the tool again. Do not repeat a call that already succeeded.',
            }),
            action: { tool: tool.name, label: tool.label, preview: e?.message || 'Invalid data', status: 'failed' },
        };
    }
}

/** Extracts the JSON actions block used by models without tool support. */
function extractJsonActions(text: string): { actions: { tool: string; args: any }[]; cleanText: string } {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fence ? fence[1] : (text.match(/\{[\s\S]*"actions"[\s\S]*\}/)?.[0] || '');
    if (!candidate) return { actions: [], cleanText: text.trim() };
    try {
        const parsed = JSON.parse(candidate);
        const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
        const cleanText = (fence ? text.replace(fence[0], '') : text.replace(candidate, '')).trim();
        return { actions, cleanText };
    } catch {
        return { actions: [], cleanText: text.trim() };
    }
}

export interface RunOptions {
    onStatus?: (status: string) => void;
    /** A photo the user attached to this message. */
    image?: AttachedImage | null;
    /** Called with each streamed fragment of the final answer. */
    onDelta?: (chunk: string, full: string) => void;
}

/**
 * Sends the photo to Gemini and returns a plain-text description.
 *
 * The main text model has no eyes, so the description is injected into its
 * user message: from there on it can reason about the photo, log records and
 * ask follow-up questions through the analyze_image tool.
 */
async function describeImage(image: AttachedImage, userText: string): Promise<{ description?: string; error?: string }> {
    const store = useAiStore.getState();
    const model = store.visionModel;

    if (!model) {
        return { error: 'No image model is selected. Open AI Settings and pick a Gemini model.' };
    }

    try {
        const description = await analyzeImage({
            model,
            base64: image.base64,
            mimeType: image.mimeType,
            prompt: visionPrompt(userText),
        });
        return { description };
    } catch (e: any) {
        if (e instanceof GeminiError) return { error: e.message };
        return { error: redact(e?.message || 'The image could not be analysed.') };
    }
}

/**
 * Sends one user message, lets the model call tools until it is done, and
 * returns the final assistant text plus the chips describing what happened.
 */
export async function runAgentTurn(userText: string, opts: RunOptions = {}): Promise<AgentTurnResult> {
    const store = useAiStore.getState();
    const { baseUrl, model, temperature, autoApprove } = store;
    const webEnabled = store.webSearchEnabled;

    if (!model) {
        return { text: '', actions: [], error: 'No model selected yet. Open AI Settings and pick a model.' };
    }

    /* ---- image first: the text model needs words, not pixels ---- */
    let visionError: string | undefined;
    let composedText = userText;

    if (opts.image) {
        opts.onStatus?.('Looking at the image');
        // Kept in memory so analyze_image can ask about the same photo later.
        setLastImage(opts.image);

        const { description, error } = await describeImage(opts.image, userText);
        if (description) {
            composedText =
                (userText ? userText + '\n\n' : '')
                + '[The user attached a photo. This is what the image model saw:\n'
                + description
                + '\n\nUse this description as if you had seen the photo. '
                + 'Call analyze_image if you need a detail that is missing.]';
        } else {
            visionError = error;
            composedText =
                (userText ? userText + '\n\n' : '')
                + '[The user attached a photo but it could not be analysed: '
                + (error || 'unknown error')
                + '. Say so briefly and continue with the text only.]';
        }
    }

    const system: ApiMessage = { role: 'system', content: buildFinalSystemPrompt(autoApprove) };
    const messages: ApiMessage[] = [system, ...store.history, { role: 'user', content: composedText }];
    const actions: ChatAction[] = [];
    let useJsonFallback = store.toolsUnsupported;

    // Streaming is skipped in the JSON fallback, where the whole reply must be
    // parsed as one block before anything can be shown.
    const wantsStream = store.streamReplies && !!opts.onDelta;
    const visionAvailable = !!opts.image && !visionError;

    const persist = () => useAiStore.getState().setHistory(messages.filter((m) => m.role !== 'system'));

    try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            opts.onStatus?.(round === 0 ? 'Thinking' : 'Working');

            let reply: ApiMessage;

            if (useJsonFallback) {
                const withHint: ApiMessage[] = [
                    { role: 'system', content: `${system.content}\n\n${jsonFallbackInstruction()}` },
                    ...messages.slice(1),
                ];
                reply = await chatCompletion({ baseUrl, model, messages: withHint, temperature });
            } else {
                const request = {
                    baseUrl, model, messages, temperature,
                    tools: activeToolSchemas({ web: webEnabled, vision: visionAvailable }),
                };
                try {
                    reply = wantsStream
                        ? await streamChatCompletion(request, opts.onDelta)
                        : await chatCompletion(request);
                } catch (e) {
                    if (e instanceof ZenError && (e.code === 'TOOLS_UNSUPPORTED' || (e.code === 'HTTP' && /tool|function/i.test(e.message)))) {
                        useAiStore.getState().setToolsUnsupported(true);
                        useJsonFallback = true;
                        continue;
                    }
                    throw e;
                }
            }

            /* ---- JSON fallback path: no real tool_calls, parse the block ---- */
            if (useJsonFallback) {
                const text = reply.content || '';
                const { actions: parsed, cleanText } = extractJsonActions(text);
                for (const item of parsed) {
                    if (!item?.tool) continue;
                    opts.onStatus?.(item.tool.replace(/_/g, ' '));
                    const { action } = await executeToolCall(item.tool, item.args || {});
                    if (action) actions.push(action);
                }
                messages.push({ role: 'assistant', content: cleanText });
                persist();
                return { text: cleanText, actions, sources: takeLastSources() };
            }

            messages.push(reply);

            const toolCalls: ApiToolCall[] = reply.tool_calls || [];
            if (!toolCalls.length) {
                persist();
                return { text: (reply.content || '').trim(), actions, sources: takeLastSources() };
            }

            for (const call of toolCalls) {
                const name = call?.function?.name || 'unknown';
                opts.onStatus?.(name.replace(/_/g, ' '));
                const { toolContent, action } = await executeToolCall(name, call?.function?.arguments);
                if (action) actions.push(action);
                messages.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    name,
                    content: toolContent,
                });
            }
        }

        persist();
        return {
            text: 'I stopped after several steps to avoid looping. Check the review list for what was already staged.',
            actions,
        };
    } catch (e: any) {
        const message = e instanceof ZenError ? e.message : redact(e?.message || 'Something went wrong.');
        return { text: '', actions, error: message };
    }
}

/** Approves a staged action and writes it to the health record. */
export function approvePending(id: string): { ok: boolean; message: string } {
    const pending = useAiStore.getState().pending.find((p) => p.id === id);
    if (!pending) return { ok: false, message: 'This entry is no longer in the review list.' };
    // getAnyTool also covers update_record / delete_record, which are staged too.
    const tool = getAnyTool(pending.tool);
    if (!tool) return { ok: false, message: 'Unknown entry type.' };
    try {
        // Every staged (mutating) tool is synchronous; only web tools are async.
        const result = tool.run(pending.args) as { ok: boolean; message: string };
        if (result?.ok) useAiStore.getState().removePending(id);
        return result;
    } catch (e: any) {
        return { ok: false, message: e?.message || 'Could not save this entry.' };
    }
}

/** Approves everything in the review list, oldest first. */
export function approveAllPending(): { saved: number; failed: number } {
    const items = [...useAiStore.getState().pending];
    let saved = 0;
    let failed = 0;
    for (const item of items) {
        const result = approvePending(item.id);
        if (result.ok) saved++;
        else failed++;
    }
    return { saved, failed };
}

/** Recomputes the preview after the user edits a staged entry. */
export function previewFor(toolName: string, args: Record<string, any>): string {
    const tool = getAnyTool(toolName);
    if (!tool) return '';
    try {
        return tool.preview(args);
    } catch (e: any) {
        return e?.message || 'Incomplete entry';
    }
}
