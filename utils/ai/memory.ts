import { MEMORY_MAX_CHARS, MEMORY_MAX_FACTS } from './config';
import { useAiStore } from '../../stores/useAiStore';

/**
 * The memory file.
 *
 * Plain text, one fact per line, stored on the phone in the AI store and sent
 * with every request so the model always knows it. The user can edit or wipe
 * it from AI Settings; the model can append to it with the remember tool.
 */

export function getMemory(): string {
    return useAiStore.getState().memory || '';
}

export function memoryLines(): string[] {
    return getMemory()
        .split('\n')
        .map((line) => line.replace(/^[-*\s]+/, '').trim())
        .filter(Boolean);
}

export function setMemory(text: string): void {
    const clean = (text || '').replace(/\r\n/g, '\n').trimStart();
    useAiStore.getState().setMemory(clean.slice(0, MEMORY_MAX_CHARS));
}

/** Appends one fact, ignoring near-duplicates and enforcing the caps. */
export function rememberFact(fact: string): { added: boolean; reason?: string; total: number } {
    const clean = (fact || '').replace(/\s+/g, ' ').trim();
    const lines = memoryLines();

    if (!clean) return { added: false, reason: 'Nothing to remember.', total: lines.length };

    const normalized = clean.toLowerCase();
    if (lines.some((line) => line.toLowerCase() === normalized)) {
        return { added: false, reason: 'Already in memory.', total: lines.length };
    }
    if (lines.length >= MEMORY_MAX_FACTS) {
        return {
            added: false,
            reason: 'Memory is full (' + MEMORY_MAX_FACTS + ' notes). Ask the user to remove some in AI Settings.',
            total: lines.length,
        };
    }

    const next = lines.concat([clean]);
    const joined = next.map((line) => '- ' + line).join('\n');
    if (joined.length > MEMORY_MAX_CHARS) {
        return { added: false, reason: 'Memory is full. Ask the user to trim it in AI Settings.', total: lines.length };
    }

    useAiStore.getState().setMemory(joined);
    return { added: true, total: next.length };
}

/** Removes every line matching the given text (case insensitive substring). */
export function forgetFact(match: string): { removed: number; total: number } {
    const needle = (match || '').trim().toLowerCase();
    const lines = memoryLines();
    if (!needle) return { removed: 0, total: lines.length };

    const kept = lines.filter((line) => line.toLowerCase().indexOf(needle) === -1);
    const removed = lines.length - kept.length;
    if (removed > 0) {
        useAiStore.getState().setMemory(kept.map((line) => '- ' + line).join('\n'));
    }
    return { removed, total: kept.length };
}

export function clearMemory(): void {
    useAiStore.getState().setMemory('');
}

/** Block injected into the system prompt. Empty string when there is nothing. */
export function memoryForPrompt(): string {
    const lines = memoryLines();
    if (!lines.length) return '';
    return [
        '# Memory (things the user told you to remember)',
        'Treat these as standing facts and preferences. Use them without being asked.',
        'If one clearly conflicts with what the user says now, trust the user and update memory.',
        '',
        lines.map((line) => '- ' + line).join('\n'),
    ].join('\n');
}

export const MEMORY_PLACEHOLDER = [
    '- I am allergic to penicillin',
    '- My usual blood pressure target is under 130/80',
    '- I take my medicines after breakfast, around 08:30',
    '- Reply in Portuguese unless I write in English',
].join('\n');
