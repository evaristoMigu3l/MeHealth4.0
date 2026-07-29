import MarkdownText from './MarkdownText';
import { sanitizeMarkdown } from './MarkdownText';

/**
 * Markdown renderer used by the chat.
 *
 * IMPORTANT about libraries:
 * `react-markdown` cannot be used here. It renders HTML DOM nodes (<div>,
 * <strong>, <p>) and React Native has no DOM, so it crashes. The React Native
 * equivalent is `react-native-markdown-display`.
 *
 * This component supports both:
 *   1. If `react-native-markdown-display` is installed, it is used, with the
 *      theme mapping below.
 *   2. If it is not installed, the built-in renderer in MarkdownText.tsx is
 *      used instead.
 *
 * So the app works with zero extra dependencies, and switching to the library
 * is just:  npm install react-native-markdown-display
 */

type Props = {
    text: string;
    colors: any;
    color?: string;
    size?: number;
    accent?: boolean;
};

let LibraryMarkdown: any = null;
try {
    // Optional dependency: resolved at runtime, ignored when absent.
    LibraryMarkdown = require('react-native-markdown-display').default;
} catch {
    LibraryMarkdown = null;
}

/** Style map handed to react-native-markdown-display when it is installed. */
function libraryStyles(colors: any, base: string, size: number, accent: boolean) {
    const accentColor = accent ? colors.primary : base;
    const softBorder = accent ? colors.border : 'rgba(255,255,255,0.35)';
    const codeBg = accent ? colors.background : 'rgba(255,255,255,0.18)';

    return {
        body: { color: base, fontSize: size, lineHeight: size * 1.45 },
        paragraph: { marginTop: 0, marginBottom: 6, color: base },
        heading1: { color: accentColor, fontSize: size + 6, fontWeight: '800', marginBottom: 6 },
        heading2: { color: accentColor, fontSize: size + 3, fontWeight: '800', marginBottom: 6 },
        heading3: { color: accentColor, fontSize: size + 1, fontWeight: '700', marginBottom: 4 },
        strong: { fontWeight: '800', color: base },
        em: { fontStyle: 'italic', color: base },
        s: { textDecorationLine: 'line-through', opacity: 0.7 },
        link: { color: accentColor, textDecorationLine: 'underline', fontWeight: '600' },
        blockquote: {
            backgroundColor: codeBg, borderLeftWidth: 3, borderLeftColor: accentColor,
            paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, borderRadius: 8,
        },
        bullet_list: { marginBottom: 4 },
        ordered_list: { marginBottom: 4 },
        bullet_list_icon: { color: accentColor, fontWeight: '900' },
        ordered_list_icon: { color: accentColor, fontWeight: '800' },
        code_inline: {
            fontFamily: 'monospace', fontSize: size - 1.5,
            color: accent ? '#B45309' : base,
            backgroundColor: accent ? 'rgba(245, 158, 11, 0.14)' : 'rgba(255,255,255,0.18)',
        },
        code_block: {
            fontFamily: 'monospace', fontSize: size - 2, color: base,
            backgroundColor: codeBg, borderWidth: 1, borderColor: softBorder,
            borderRadius: 12, padding: 12, marginBottom: 10,
        },
        fence: {
            fontFamily: 'monospace', fontSize: size - 2, color: base,
            backgroundColor: codeBg, borderWidth: 1, borderColor: softBorder,
            borderRadius: 12, padding: 12, marginBottom: 10,
        },
        table: { borderWidth: 1, borderColor: softBorder, borderRadius: 10, marginBottom: 10 },
        thead: { backgroundColor: codeBg },
        th: { padding: 8, fontWeight: '800', color: accentColor },
        td: { padding: 8, color: base },
        tr: { borderBottomWidth: 1, borderBottomColor: softBorder },
        hr: { backgroundColor: softBorder, height: 1, marginVertical: 10 },
    } as any;
}

export default function MarkdownMessage({ text, colors, color, size = 15, accent = true }: Props) {
    // Clean the noise models emit (+++, ***, ****word****) before rendering,
    // whichever renderer ends up being used.
    const cleaned = sanitizeMarkdown(text || '');

    if (LibraryMarkdown) {
        return (
            <LibraryMarkdown style={libraryStyles(colors, color || colors.text, size, accent)}>
                {cleaned}
            </LibraryMarkdown>
        );
    }

    return <MarkdownText text={cleaned} colors={colors} color={color} size={size} accent={accent} />;
}

/** True when the optional library is installed. Shown in AI Settings. */
export const usingMarkdownLibrary = !!LibraryMarkdown;
