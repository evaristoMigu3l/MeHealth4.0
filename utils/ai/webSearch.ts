import {
    PAGE_TEXT_CHARS, SEARCH_MAX_RESULTS, SEARCH_SNIPPET_CHARS,
    SEARCH_TIMEOUT_MS, SearchProvider,
} from './config';
import { getSearchKey } from './secrets';
import { WebResult } from './types';

/**
 * Web search for the assistant.
 *
 * Nothing here runs unless the user turns the globe on in the chat.
 * Only the query string leaves the phone - never health records.
 */

const DDG_API = 'https://api.duckduckgo.com/';
const DDG_HTML = 'https://html.duckduckgo.com/html/';
const BRAVE_API = 'https://api.search.brave.com/res/v1/web/search';
const TAVILY_API = 'https://api.tavily.com/search';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

export class SearchError extends Error {
    code: 'NO_KEY' | 'OFFLINE' | 'TIMEOUT' | 'HTTP' | 'EMPTY';
    constructor(code: SearchError['code'], message: string) {
        super(message);
        this.code = code;
    }
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (e: any) {
        if (e?.name === 'AbortError') throw new SearchError('TIMEOUT', 'The web search timed out.');
        throw new SearchError('OFFLINE', 'No internet connection for the web search.');
    } finally {
        clearTimeout(timer);
    }
}

function stripHtml(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function clamp(text: string, max: number): string {
    const clean = (text || '').trim();
    return clean.length > max ? clean.slice(0, max) + '...' : clean;
}

/* ------------------------------------------------------------ DuckDuckGo */

/** Keyless: instant answers plus the lite HTML result list. */
async function searchDuckDuckGo(query: string): Promise<WebResult[]> {
    const results: WebResult[] = [];

    try {
        const url = DDG_API + '?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1';
        const response = await fetchWithTimeout(url);
        if (response.ok) {
            const data: any = await response.json();
            if (data?.AbstractText) {
                results.push({
                    title: data.Heading || query,
                    url: data.AbstractURL || 'https://duckduckgo.com',
                    snippet: clamp(data.AbstractText, SEARCH_SNIPPET_CHARS),
                });
            }
            for (const topic of (data?.RelatedTopics || []).slice(0, 3)) {
                if (topic?.Text && topic?.FirstURL) {
                    results.push({
                        title: clamp(String(topic.Text).split(' - ')[0], 90),
                        url: topic.FirstURL,
                        snippet: clamp(topic.Text, SEARCH_SNIPPET_CHARS),
                    });
                }
            }
        }
    } catch {
        // fall through to the HTML list
    }

    if (results.length < SEARCH_MAX_RESULTS) {
        try {
            const response = await fetchWithTimeout(DDG_HTML + '?q=' + encodeURIComponent(query), {
                headers: { 'User-Agent': UA, Accept: 'text/html' },
            });
            if (response.ok) {
                const html = await response.text();
                const snippets: string[] = [];
                const snippetPattern = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
                let snippetMatch: RegExpExecArray | null;
                while ((snippetMatch = snippetPattern.exec(html))) snippets.push(stripHtml(snippetMatch[1]));

                const linkPattern = /class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
                let linkMatch: RegExpExecArray | null;
                let index = 0;
                while ((linkMatch = linkPattern.exec(html)) && results.length < SEARCH_MAX_RESULTS) {
                    let href = linkMatch[1];
                    const redirect = href.match(/uddg=([^&]+)/);
                    if (redirect) href = decodeURIComponent(redirect[1]);
                    if (href.indexOf('//') === 0) href = 'https:' + href;
                    results.push({
                        title: clamp(stripHtml(linkMatch[2]), 110),
                        url: href,
                        snippet: clamp(snippets[index] || '', SEARCH_SNIPPET_CHARS),
                    });
                    index++;
                }
            }
        } catch {
            // keep whatever we already have
        }
    }

    return results.slice(0, SEARCH_MAX_RESULTS);
}

/* ----------------------------------------------------------------- Tavily */

async function searchTavily(query: string, key: string): Promise<WebResult[]> {
    const response = await fetchWithTimeout(TAVILY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: key,
            query,
            max_results: SEARCH_MAX_RESULTS,
            search_depth: 'basic',
            include_answer: true,
        }),
    });

    if (!response.ok) {
        throw new SearchError('HTTP', 'Tavily returned ' + response.status + '. Check the search API key.');
    }

    const data: any = await response.json();
    const results: WebResult[] = [];

    if (data?.answer) {
        results.push({
            title: 'Summary',
            url: 'https://tavily.com',
            snippet: clamp(String(data.answer), SEARCH_SNIPPET_CHARS),
        });
    }
    for (const item of data?.results || []) {
        results.push({
            title: clamp(item.title || item.url, 110),
            url: item.url,
            snippet: clamp(item.content || '', SEARCH_SNIPPET_CHARS),
        });
    }
    return results.slice(0, SEARCH_MAX_RESULTS + 1);
}

/* ------------------------------------------------------------------ Brave */

async function searchBrave(query: string, key: string): Promise<WebResult[]> {
    const response = await fetchWithTimeout(
        BRAVE_API + '?q=' + encodeURIComponent(query) + '&count=' + SEARCH_MAX_RESULTS,
        { headers: { Accept: 'application/json', 'X-Subscription-Token': key } }
    );

    if (!response.ok) {
        throw new SearchError('HTTP', 'Brave Search returned ' + response.status + '. Check the search API key.');
    }

    const data: any = await response.json();
    return (data?.web?.results || []).slice(0, SEARCH_MAX_RESULTS).map((item: any) => ({
        title: clamp(item.title || item.url, 110),
        url: item.url,
        snippet: clamp(stripHtml(item.description || ''), SEARCH_SNIPPET_CHARS),
    }));
}

/* --------------------------------------------------------------- exported */

export async function webSearch(query: string, provider: SearchProvider): Promise<WebResult[]> {
    const clean = (query || '').trim();
    if (!clean) throw new SearchError('EMPTY', 'Empty search query.');

    if (provider === 'duckduckgo') {
        const results = await searchDuckDuckGo(clean);
        if (!results.length) throw new SearchError('EMPTY', 'No results found for that search.');
        return results;
    }

    const key = await getSearchKey();
    if (!key) {
        throw new SearchError(
            'NO_KEY',
            'The ' + provider + ' provider needs a search API key. Add it in AI Settings, or switch to DuckDuckGo which needs no key.'
        );
    }

    const results = provider === 'tavily' ? await searchTavily(clean, key) : await searchBrave(clean, key);
    if (!results.length) throw new SearchError('EMPTY', 'No results found for that search.');
    return results;
}

/** Fetches one page and returns readable text, capped for the model context. */
export async function readWebPage(url: string): Promise<{ url: string; title: string; text: string }> {
    const target = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    const response = await fetchWithTimeout(target, {
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    });

    if (!response.ok) throw new SearchError('HTTP', 'That page returned ' + response.status + '.');

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const bodyMatch = html.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i);

    return {
        url: target,
        title: clamp(stripHtml(titleMatch ? titleMatch[1] : target), 120),
        text: clamp(stripHtml(bodyMatch ? bodyMatch[1] : html), PAGE_TEXT_CHARS),
    };
}
