import { useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { cleanMarkdown } from '../../utils/ai/markdownClean';

/**
 * Dependency-free markdown renderer for assistant replies.
 *
 * Renders: headings (accent coloured), bold, italic, bold-italic, strikethrough,
 * inline code chips, fenced code blocks with a language bar and basic syntax
 * colouring, bullet and numbered lists with accent markers, block quotes,
 * tables, dividers, links and ==highlight==.
 *
 * Also cleans the formatting noise models invent (+++, ***, ****word****,
 * ** spaced bold **) instead of printing it raw.
 */

type Props = {
    text: string;
    colors: any;
    /** Base text colour, e.g. white inside a user bubble. */
    color?: string;
    size?: number;
    /** Set false inside coloured bubbles to keep headings/markers readable. */
    accent?: boolean;
};

type Block =
    | { kind: 'p'; text: string }
    | { kind: 'h'; level: number; text: string }
    | { kind: 'bullet'; text: string; indent: number }
    | { kind: 'number'; text: string; marker: string; indent: number }
    | { kind: 'todo'; text: string; done: boolean }
    | { kind: 'quote'; text: string }
    | { kind: 'code'; text: string; language?: string }
    | { kind: 'table'; header: string[]; rows: string[][] }
    | { kind: 'rule' };

/* ------------------------------------------------------------------ cleanup */

/**
 * Repairs the model's broken emphasis and spacing before parsing.
 * The heavy lifting lives in utils/ai/markdownClean so the library renderer
 * can reuse exactly the same cleanup.
 */
function sanitize(input: string): string {
    return cleanMarkdown(input);
}

/* ------------------------------------------------------------------- blocks */

function splitRow(line: string): string[] {
    return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
}

function parseBlocks(source: string): Block[] {
    const lines = sanitize(source).split('\n');
    const blocks: Block[] = [];
    let paragraph: string[] = [];

    const flush = () => {
        if (paragraph.length) {
            blocks.push({ kind: 'p', text: paragraph.join(' ').trim() });
            paragraph = [];
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Fenced code block
        const fence = trimmed.match(/^```+\s*([\w+#-]+)?$/);
        if (fence) {
            flush();
            const body: string[] = [];
            i++;
            while (i < lines.length && !/^```+\s*$/.test(lines[i].trim())) {
                body.push(lines[i]);
                i++;
            }
            blocks.push({ kind: 'code', text: body.join('\n'), language: fence[1] });
            continue;
        }

        if (!trimmed) {
            flush();
            continue;
        }

        if (/^(-{3,}|_{3,})$/.test(trimmed)) {
            flush();
            blocks.push({ kind: 'rule' });
            continue;
        }

        // Table: header row followed by a --- separator row
        if (trimmed.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/.test(lines[i + 1])) {
            flush();
            const header = splitRow(trimmed);
            const rows: string[][] = [];
            i += 2;
            while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
                rows.push(splitRow(lines[i]));
                i++;
            }
            i--;
            blocks.push({ kind: 'table', header, rows });
            continue;
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            flush();
            blocks.push({ kind: 'h', level: heading[1].length, text: heading[2].trim() });
            continue;
        }

        const quote = trimmed.match(/^>\s?(.*)$/);
        if (quote) {
            flush();
            blocks.push({ kind: 'quote', text: quote[1].trim() });
            continue;
        }

        const todo = line.match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/);
        if (todo) {
            flush();
            blocks.push({ kind: 'todo', done: todo[1].toLowerCase() === 'x', text: todo[2].trim() });
            continue;
        }

        const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
        if (bullet) {
            flush();
            blocks.push({ kind: 'bullet', indent: Math.floor(bullet[1].length / 2), text: bullet[2].trim() });
            continue;
        }

        const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
        if (numbered) {
            flush();
            blocks.push({
                kind: 'number',
                indent: Math.floor(numbered[1].length / 2),
                marker: `${numbered[2]}.`,
                text: numbered[3].trim(),
            });
            continue;
        }

        paragraph.push(trimmed);
    }

    flush();
    return blocks;
}

/* ------------------------------------------------------------------- inline */

type Span = {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    strike?: boolean;
    mark?: boolean;
    href?: string;
};

function parseInline(input: string): Span[] {
    const spans: Span[] = [];
    const pattern = /(`[^`]+`)|(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+\*\*)|(__[^_]+__)|(==[^=]+==)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~~[^~]+~~)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s)]+)/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(input))) {
        if (match.index > cursor) spans.push({ text: input.slice(cursor, match.index) });
        const token = match[0];

        if (token.startsWith('`')) spans.push({ text: token.slice(1, -1), code: true });
        else if (token.startsWith('***')) spans.push({ text: token.slice(3, -3), bold: true, italic: true });
        else if (token.startsWith('**')) spans.push({ text: token.slice(2, -2), bold: true });
        else if (token.startsWith('__')) spans.push({ text: token.slice(2, -2), bold: true });
        else if (token.startsWith('==')) spans.push({ text: token.slice(2, -2), mark: true });
        else if (token.startsWith('~~')) spans.push({ text: token.slice(2, -2), strike: true });
        else if (token.startsWith('[')) {
            const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
            spans.push(link ? { text: link[1], href: link[2] } : { text: token });
        } else if (token.startsWith('http')) spans.push({ text: token, href: token });
        else if (token.startsWith('*') || token.startsWith('_')) spans.push({ text: token.slice(1, -1), italic: true });
        else spans.push({ text: token });

        cursor = match.index + token.length;
    }

    if (cursor < input.length) spans.push({ text: input.slice(cursor) });

    // Drop leftover markers from unbalanced markup.
    return spans.map((span) =>
        span.code ? span : { ...span, text: span.text.replace(/\*{1,3}/g, '').replace(/(^|\s)_(\S)/g, '$1$2') }
    );
}

/* --------------------------------------------------------- code highlighting */

const KEYWORDS = new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'import', 'from',
    'export', 'default', 'class', 'new', 'await', 'async', 'try', 'catch', 'throw', 'typeof',
    'interface', 'type', 'extends', 'implements', 'public', 'private', 'static', 'def', 'elif',
    'None', 'True', 'False', 'true', 'false', 'null', 'undefined', 'this', 'self', 'in', 'not',
    'and', 'or', 'select', 'where', 'insert', 'update', 'delete', 'SELECT', 'WHERE', 'FROM',
]);

type CodeToken = { text: string; type: 'plain' | 'keyword' | 'string' | 'number' | 'comment' };

function tokenizeCode(source: string): CodeToken[] {
    const tokens: CodeToken[] = [];
    const pattern = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("[^"\n]*"|'[^'\n]*'|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source))) {
        if (match.index > cursor) tokens.push({ text: source.slice(cursor, match.index), type: 'plain' });
        const token = match[0];

        if (match[1]) tokens.push({ text: token, type: 'comment' });
        else if (match[2]) tokens.push({ text: token, type: 'string' });
        else if (match[3]) tokens.push({ text: token, type: 'number' });
        else tokens.push({ text: token, type: KEYWORDS.has(token) ? 'keyword' : 'plain' });

        cursor = match.index + token.length;
    }

    if (cursor < source.length) tokens.push({ text: source.slice(cursor), type: 'plain' });
    return tokens;
}

/* ---------------------------------------------------------------- component */

export default function MarkdownText({ text, colors, color, size = 15, accent = true }: Props) {
    const styles = useMemo(() => getStyles(colors, color, size, accent), [colors, color, size, accent]);
    const blocks = useMemo(() => parseBlocks(text || ''), [text]);
    const accentColor = accent ? colors.primary : (color || colors.text);

    const renderSpans = (line: string, keyPrefix: string) =>
        parseInline(line).map((span, index) => {
            const spanStyle = [
                span.bold && styles.bold,
                span.italic && styles.italic,
                span.strike && styles.strike,
                span.mark && styles.mark,
                span.code && styles.inlineCode,
                span.href && styles.link,
            ].filter(Boolean) as any[];

            return (
                <Text
                    key={`${keyPrefix}-${index}`}
                    style={spanStyle}
                    onPress={span.href ? () => Linking.openURL(span.href as string).catch(() => { }) : undefined}
                >
                    {span.text}
                </Text>
            );
        });

    return (
        <View>
            {blocks.map((block, index) => {
                const key = `b${index}`;

                switch (block.kind) {
                    case 'h':
                        return (
                            <View key={key} style={styles.headingWrap}>
                                <Text
                                    style={[
                                        styles.heading,
                                        block.level === 1 && styles.h1,
                                        block.level === 2 && styles.h2,
                                        block.level >= 3 && styles.h3,
                                    ]}
                                >
                                    {renderSpans(block.text, key)}
                                </Text>
                                {block.level <= 2 && <View style={styles.headingUnderline} />}
                            </View>
                        );

                    case 'code':
                        return (
                            <View key={key} style={styles.codeBlock}>
                                <View style={styles.codeBar}>
                                    <View style={styles.codeDot} />
                                    <Text style={styles.codeLanguage}>{block.language || 'code'}</Text>
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
                                    <Text style={styles.codeText}>
                                        {tokenizeCode(block.text).map((token, tokenIndex) => (
                                            <Text
                                                key={`${key}-t${tokenIndex}`}
                                                style={
                                                    token.type === 'keyword' ? styles.codeKeyword
                                                        : token.type === 'string' ? styles.codeString
                                                            : token.type === 'number' ? styles.codeNumber
                                                                : token.type === 'comment' ? styles.codeComment
                                                                    : undefined
                                                }
                                            >
                                                {token.text}
                                            </Text>
                                        ))}
                                    </Text>
                                </ScrollView>
                            </View>
                        );

                    case 'quote':
                        return (
                            <View key={key} style={styles.quote}>
                                <Text style={[styles.paragraph, styles.quoteText]}>{renderSpans(block.text, key)}</Text>
                            </View>
                        );

                    case 'todo':
                        return (
                            <View key={key} style={styles.listRow}>
                                <Text style={[styles.checkbox, block.done && { color: accentColor }]}>
                                    {block.done ? '\u2611' : '\u2610'}
                                </Text>
                                <Text style={[styles.paragraph, styles.listText, block.done && styles.todoDone]}>
                                    {renderSpans(block.text, key)}
                                </Text>
                            </View>
                        );

                    case 'bullet':
                        return (
                            <View key={key} style={[styles.listRow, { paddingLeft: 2 + block.indent * 14 }]}>
                                <Text style={styles.bulletDot}>{'\u2022'}</Text>
                                <Text style={[styles.paragraph, styles.listText]}>{renderSpans(block.text, key)}</Text>
                            </View>
                        );

                    case 'number':
                        return (
                            <View key={key} style={[styles.listRow, { paddingLeft: 2 + block.indent * 14 }]}>
                                <Text style={styles.numberMarker}>{block.marker}</Text>
                                <Text style={[styles.paragraph, styles.listText]}>{renderSpans(block.text, key)}</Text>
                            </View>
                        );

                    case 'table':
                        return (
                            <ScrollView key={key} horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
                                <View style={styles.table}>
                                    <View style={[styles.tableRow, styles.tableHeaderRow]}>
                                        {block.header.map((cell, cellIndex) => (
                                            <Text key={`${key}-h${cellIndex}`} style={[styles.tableCell, styles.tableHeaderCell]}>
                                                {cell}
                                            </Text>
                                        ))}
                                    </View>
                                    {block.rows.map((row, rowIndex) => (
                                        <View key={`${key}-r${rowIndex}`} style={styles.tableRow}>
                                            {row.map((cell, cellIndex) => (
                                                <Text key={`${key}-r${rowIndex}c${cellIndex}`} style={styles.tableCell}>
                                                    {renderSpans(cell, `${key}-r${rowIndex}c${cellIndex}`)}
                                                </Text>
                                            ))}
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>
                        );

                    case 'rule':
                        return <View key={key} style={styles.rule} />;

                    default:
                        return (
                            <Text key={key} style={styles.paragraph}>
                                {renderSpans(block.text, key)}
                            </Text>
                        );
                }
            })}
        </View>
    );
}

export { sanitize as sanitizeMarkdown };

/* -------------------------------------------------------------------- styles */

const getStyles = (colors: any, color: string | undefined, size: number, accent: boolean) => {
    const base = color || colors.text;
    const accentColor = accent ? colors.primary : base;
    const codeBg = accent ? colors.background : 'rgba(255,255,255,0.18)';
    const softBorder = accent ? colors.border : 'rgba(255,255,255,0.35)';

    return StyleSheet.create({
        paragraph: { fontSize: size, lineHeight: size * 1.45, color: base, marginBottom: 6 },

        headingWrap: { marginTop: 6, marginBottom: 8 },
        heading: { fontWeight: '800', color: accentColor, letterSpacing: 0.2 },
        h1: { fontSize: size + 6 },
        h2: { fontSize: size + 3 },
        h3: { fontSize: size + 1 },
        headingUnderline: { height: 2, width: 28, borderRadius: 2, backgroundColor: accentColor, marginTop: 5, opacity: 0.7 },

        bold: { fontWeight: '800', color: base },
        italic: { fontStyle: 'italic', color: base },
        strike: { textDecorationLine: 'line-through', color: base, opacity: 0.7 },
        mark: { backgroundColor: accent ? 'rgba(250, 204, 21, 0.35)' : 'rgba(255,255,255,0.3)', color: base },
        link: { color: accent ? colors.primary : base, textDecorationLine: 'underline', fontWeight: '600' },
        inlineCode: {
            fontFamily: 'monospace',
            fontSize: size - 1.5,
            color: accent ? '#B45309' : base,
            backgroundColor: accent ? 'rgba(245, 158, 11, 0.14)' : 'rgba(255,255,255,0.18)',
        },

        codeBlock: {
            backgroundColor: codeBg,
            borderRadius: 12,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: softBorder,
            overflow: 'hidden',
        },
        codeBar: {
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 12, paddingVertical: 7,
            borderBottomWidth: 1, borderBottomColor: softBorder,
        },
        codeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: accentColor },
        codeLanguage: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
        codeText: { fontFamily: 'monospace', fontSize: size - 2, lineHeight: size * 1.5, color: base },
        codeKeyword: { color: accent ? '#7C3AED' : '#E9D5FF', fontWeight: '700' },
        codeString: { color: accent ? '#047857' : '#A7F3D0' },
        codeNumber: { color: accent ? '#B45309' : '#FDE68A' },
        codeComment: { color: colors.textSecondary, fontStyle: 'italic' },

        quote: {
            borderLeftWidth: 3,
            borderLeftColor: accentColor,
            backgroundColor: accent ? colors.background : 'rgba(255,255,255,0.14)',
            borderRadius: 8,
            paddingLeft: 10, paddingRight: 10, paddingVertical: 8,
            marginBottom: 8,
        },
        quoteText: { fontStyle: 'italic', marginBottom: 0, color: base },

        listRow: { flexDirection: 'row', gap: 8, marginBottom: 5 },
        bulletDot: { fontSize: size + 2, lineHeight: size * 1.45, color: accentColor, fontWeight: '900' },
        numberMarker: { fontSize: size, lineHeight: size * 1.45, color: accentColor, fontWeight: '800', minWidth: 18 },
        checkbox: { fontSize: size + 3, lineHeight: size * 1.45, color: colors.textSecondary },
        todoDone: { textDecorationLine: 'line-through', opacity: 0.65 },
        listText: { flex: 1, marginBottom: 0 },

        tableScroll: { marginBottom: 10 },
        table: { borderWidth: 1, borderColor: softBorder, borderRadius: 10, overflow: 'hidden' },
        tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: softBorder },
        tableHeaderRow: { backgroundColor: accent ? colors.background : 'rgba(255,255,255,0.16)' },
        tableCell: {
            minWidth: 96, paddingHorizontal: 10, paddingVertical: 8,
            fontSize: size - 1, color: base, borderRightWidth: 1, borderRightColor: softBorder,
        },
        tableHeaderCell: { fontWeight: '800', color: accentColor },

        rule: { height: 1, backgroundColor: softBorder, marginVertical: 10 },
    });
};
