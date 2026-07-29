/**
 * Markdown cleaner for assistant replies.
 *
 * Small models emit broken emphasis: they glue ** to neighbouring words
 * ("geridas**podem"), leave one marker unclosed, or put spaces inside the
 * markers ("** texto **"). Both markdown renderers then either print the raw
 * asterisks or swallow the space between two words.
 *
 * This module rewrites emphasis into a strictly valid, spaced form BEFORE
 * rendering, so the renderer never has to guess:
 *   - delimiters are paired in order, an odd leftover marker is dropped
 *   - the inner text is trimmed
 *   - a single space is guaranteed on the outside of every marker
 *   - inline code and fenced code blocks are left untouched
 */

/** Word characters, including accented Latin letters used in Portuguese. */
const WORD = 'A-Za-z0-9\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF';
const WORD_START = new RegExp('^[' + WORD + ']');
const WORD_END = new RegExp('[' + WORD + ']$');
/** Sentence punctuation that also needs a space before an opening marker. */
const PUNCT_END = /[.,;:!?%]$/;

/** True when a space must be inserted before an opening marker. */
function needsSpaceBefore(text: string): boolean {
    return WORD_END.test(text) || PUNCT_END.test(text);
}

/**
 * Pairs up every occurrence of one delimiter on a single line and rebuilds it
 * with trimmed content and guaranteed outside spacing.
 */
function fixDelimiter(text: string, delimiter: string): string {
    const parts = text.split(delimiter);
    if (parts.length < 3) {
        // Zero or one marker: a lone marker is noise, drop it.
        return parts.join('');
    }

    // parts alternate: outside, inside, outside, inside, ...
    // An even number of markers is required, so an unpaired tail is merged back.
    const markerCount = parts.length - 1;
    if (markerCount % 2 === 1) {
        const tail = parts.pop() as string;
        parts[parts.length - 1] = (parts[parts.length - 1] + ' ' + tail).replace(/\s{2,}/g, ' ');
    }

    let out = parts[0];

    for (let i = 1; i < parts.length; i += 2) {
        const inner = (parts[i] || '').trim();
        const after = parts[i + 1] === undefined ? '' : parts[i + 1];

        if (!inner) {
            // Empty emphasis such as "****": keep the words apart and move on.
            out = out + (needsSpaceBefore(out) && WORD_START.test(after) ? ' ' : '') + after;
            continue;
        }

        if (needsSpaceBefore(out)) out += ' ';
        out += delimiter + inner + delimiter;
        out += WORD_START.test(after) ? ' ' + after : after;
    }

    return out;
}

/**
 * Placeholders that hide already-repaired bold markers from the italic pass.
 * Without them, splitting on "*" would tear "**palavra**" apart.
 */
const HOLD_BOLD_ITALIC = '\u0001';
const HOLD_BOLD = '\u0002';

/** Applies the delimiter repair to one line, protecting inline code spans. */
function fixEmphasisLine(line: string): string {
    const segments = line.split(/(`[^`]*`)/g);

    return segments
        .map((segment) => {
            if (segment.startsWith('`')) return segment;

            let out = segment;

            // Collapse runs of four or more asterisks: "****palavra****" -> bold.
            out = out.replace(/\*{4,}/g, '**');

            // Longest delimiter first, parking each repaired pair behind a
            // placeholder so the shorter passes cannot break it.
            out = fixDelimiter(out, '***');
            out = out.split('***').join(HOLD_BOLD_ITALIC);

            out = fixDelimiter(out, '**');
            out = out.split('**').join(HOLD_BOLD);

            out = fixDelimiter(out, '*');

            out = out.split(HOLD_BOLD).join('**');
            out = out.split(HOLD_BOLD_ITALIC).join('***');

            out = fixDelimiter(out, '~~');

            // Underscore emphasis, only when it is clearly a delimiter and not
            // part of an identifier such as log_symptom.
            if (/(^|\s)__[^\s_]/.test(out)) {
                out = fixDelimiter(out, '__');
            }

            return out;
        })
        .join('');
}

/**
 * Splits a line where a list marker got glued to the previous sentence, e.g.
 * "...da saude- Emocoes negativas" -> newline + "- Emocoes negativas".
 * Only fires after sentence punctuation, so real hyphenated words are safe.
 */
function splitGluedBullets(line: string): string {
    if (/^\s*[-*+]\s/.test(line)) return line;

    return line
        // "...da saude- Emocoes negativas": a dash followed by a space is never
        // a hyphenated word, so it is a list marker that lost its newline.
        .replace(new RegExp('([' + WORD + '])\\s*[-*]\\s+(?=[' + WORD + '])', 'g'), '$1\n- ')
        // "...saude.- Emocoes" / "saude:-Emocoes" after sentence punctuation.
        .replace(new RegExp('([.:;!?])\\s*[-*]\\s*(?=[' + WORD + '])', 'g'), '$1\n- ');
}

/** Restores the space that models drop after a colon, comma or period. */
function fixPunctuationSpacing(line: string): string {
    const segments = line.split(/(`[^`]*`)/g);

    return segments
        .map((segment) => {
            if (segment.startsWith('`')) return segment;
            return segment
                // "Saude:Emocoes" -> "Saude: Emocoes" (skips URLs and 10:30)
                .replace(new RegExp('([' + WORD + '])([:,;!?])([' + WORD + '])', 'g'), (m, a, p, b) => {
                    if (p === ':' && /\d/.test(a) && /\d/.test(b)) return m; // times
                    return a + p + ' ' + b;
                })
                // "frase.Outra" -> "frase. Outra", but not "1.5" or "file.ts"
                .replace(new RegExp('([a-z\u00E0-\u00FF])\\.([A-Z\u00C0-\u00D6])', 'g'), '$1. $2');
        })
        .join('');
}

/**
 * Full cleanup pass. Fenced code blocks are passed through untouched.
 */
export function cleanMarkdown(input: string): string {
    const source = (input || '').replace(/\r\n/g, '\n');
    const lines = source.split('\n');
    const out: string[] = [];
    let inFence = false;

    for (const raw of lines) {
        const trimmed = raw.trim();

        if (/^```/.test(trimmed)) {
            inFence = !inFence;
            out.push(raw);
            continue;
        }

        if (inFence) {
            out.push(raw);
            continue;
        }

        // Decoration lines the models invent become a real divider.
        if (/^(\+{3,}|={3,}|~{3,}|\*{3,}|-{3,})$/.test(trimmed)) {
            out.push('---');
            continue;
        }

        // Trailing "++" or "**" garbage at the end of a line.
        let line = raw.replace(/[+]{2,}\s*$/, '');

        line = splitGluedBullets(line);
        line = line
            .split('\n')
            .map((part) => fixPunctuationSpacing(fixEmphasisLine(part)))
            .join('\n');

        // Never leave double spaces behind, except leading indentation.
        line = line.replace(/^(\s*)(.*)$/, (_m, indent, rest) => indent + rest.replace(/ {2,}/g, ' '));

        out.push(line);
    }

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
