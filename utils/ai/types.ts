export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ApiToolCall {
    id: string;
    type?: 'function';
    function: { name: string; arguments: string };
}

/** Wire format sent to / received from the Zen API. */
export interface ApiMessage {
    role: ChatRole;
    content?: string | null;
    tool_calls?: ApiToolCall[];
    tool_call_id?: string;
    name?: string;
}

export interface ZenModel {
    id: string;
    name?: string;
    free?: boolean;
    raw?: any;
}

/** A mutating tool call waiting for the user's approval. */
export interface PendingAction {
    id: string;
    tool: string;
    label: string;      // e.g. 'Symptom'
    preview: string;    // human readable summary
    args: Record<string, any>;
    createdAt: string;
}

export interface ChatAction {
    tool: string;
    label: string;
    preview: string;
    status: 'staged' | 'saved' | 'failed' | 'info';
    pendingId?: string;
}

/** A bubble rendered in the chat screen. */
export interface ChatBubble {
    id: string;
    role: 'user' | 'assistant' | 'error';
    text: string;
    createdAt: string;
    actions?: ChatAction[];
    /** Web pages the assistant consulted for this reply. */
    sources?: WebResult[];
    /** Local uri of a photo the user attached to this message. */
    imageUri?: string;
    /** True while tokens are still streaming into this bubble. */
    streaming?: boolean;
}

export interface ToolResult {
    ok: boolean;
    message: string;
    data?: any;
}

export type ToolCategory = 'health' | 'web' | 'memory' | 'vision';

export interface ToolSpec {
    name: string;
    description: string;
    parameters: Record<string, any>;
    /** Health tools are always on; web tools only when the user enables search. */
    category?: ToolCategory;
    /** Mutating tools are staged for review unless auto-approve is on. */
    mutating: boolean;
    /** Short human label used on review cards. */
    label: string;
    /** Human readable one-liner describing what will be written. */
    preview: (args: any) => string;
    /** Performs the actual work (write to the health store, or a read query). */
    run: (args: any) => ToolResult | Promise<ToolResult>;
}

/** One web result handed to the model and shown as a source chip. */
export interface WebResult {
    title: string;
    url: string;
    snippet: string;
}

export interface AgentTurnResult {
    text: string;
    actions: ChatAction[];
    error?: string;
    sources?: WebResult[];
}

/* --------------------------------------------------- image understanding */

/** A Gemini model able to accept an image. */
export interface VisionModel {
    id: string;
    name?: string;
    description?: string;
    free?: boolean;
}

/** A photo picked by the user, held in memory only for the current turn. */
export interface AttachedImage {
    /** Local file uri, used for the thumbnail and for saving to a record. */
    uri: string;
    base64: string;
    mimeType: string;
    width?: number;
    height?: number;
    /** Approximate decoded size, used to refuse oversized photos early. */
    bytes: number;
}
