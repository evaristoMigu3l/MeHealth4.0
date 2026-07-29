import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, FlatList, Image, Keyboard, Linking, Platform, StyleSheet,
    Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { useKeyboardOffset } from '../hooks/useKeyboardOffset';
import { useAiStore } from '../stores/useAiStore';
import { hasApiKey } from '../utils/ai/secrets';
import { runAgentTurn } from '../utils/ai/agent';
import {
    describeSize, ImageInputError, pickImageFromLibrary, takePhoto,
} from '../utils/ai/imageInput';
import { AttachedImage, ChatBubble } from '../utils/ai/types';
import MarkdownMessage from '../components/ai/MarkdownMessage';

const SUGGESTIONS = [
    'I had rice and beans at 1pm, felt dizzy after and took my medication',
    'Slept 5 hours, woke up with a headache 7 out of 10',
    'Weight 68.4 kg this morning, BP 120/80',
    'What did I log today?',
];

export default function AiChatScreen() {
    const insets = useSafeAreaInsets();
    const { keyboardOffset, isKeyboardVisible } = useKeyboardOffset();
    const { colors } = useAppTheme();
    const styles = getStyles(colors);
    const router = useRouter();
    const listRef = useRef<FlatList<ChatBubble>>(null);

    const {
        bubbles, addBubble, patchBubble, clearChat, model, pending, autoApprove,
        hasKey, setHasKey, toolsUnsupported,
        webSearchEnabled, setWebSearchEnabled, searchProvider, memory,
        hasGeminiKeySaved, visionModel,
    } = useAiStore();

    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('Thinking');
    const [image, setImage] = useState<AttachedImage | null>(null);

    useEffect(() => {
        hasApiKey().then(setHasKey);
    }, [setHasKey]);

    const scrollToEnd = () => {
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    };

    useEffect(() => {
        const timer = setTimeout(scrollToEnd, 140);
        return () => clearTimeout(timer);
    }, [bubbles.length, busy]);

    // When the keyboard opens, keep the newest message visible above the input.
    useEffect(() => {
        if (!isKeyboardVisible) return;
        const timer = setTimeout(scrollToEnd, 160);
        return () => clearTimeout(timer);
    }, [isKeyboardVisible, keyboardOffset]);

    const notReady = !hasKey || !model;
    const visionReady = hasGeminiKeySaved && !!visionModel;

    /** Picks a photo, from the camera or the gallery, and holds it for the next message. */
    async function attachImage() {
        if (busy) return;

        if (!visionReady) {
            Alert.alert(
                'Image understanding not set up',
                'Add your Google Gemini API key and pick an image model in AI Settings first.',
                [{ text: 'Cancel', style: 'cancel' }, { text: 'Open settings', onPress: () => router.push('/ai-settings') }]
            );
            return;
        }

        Keyboard.dismiss();

        const run = async (picker: () => Promise<AttachedImage | null>) => {
            try {
                const picked = await picker();
                if (picked) setImage(picked);
            } catch (e: any) {
                Alert.alert(
                    'Photo',
                    e instanceof ImageInputError ? e.message : (e?.message || 'The photo could not be used.')
                );
            }
        };

        Alert.alert('Attach a photo', 'The photo is sent only to the image model you chose.', [
            { text: 'Take photo', onPress: () => run(takePhoto) },
            { text: 'Choose from gallery', onPress: () => run(pickImageFromLibrary) },
            { text: 'Cancel', style: 'cancel' },
        ]);
    }

    async function send(text?: string) {
        const message = (text ?? input).trim();
        const attached = image;
        if ((!message && !attached) || busy) return;

        if (notReady) {
            Alert.alert(
                'Assistant not set up',
                !hasKey ? 'Add your OpenCode Zen API key in AI Settings first.' : 'Choose a model in AI Settings first.',
                [{ text: 'Cancel', style: 'cancel' }, { text: 'Open settings', onPress: () => router.push('/ai-settings') }]
            );
            return;
        }

        setInput('');
        setImage(null);
        addBubble({
            id: `u${Date.now()}`,
            role: 'user',
            text: message || 'Look at this photo.',
            imageUri: attached?.uri,
            createdAt: new Date().toISOString(),
        });
        setBusy(true);
        setStatus(attached ? 'Looking at the image' : 'Thinking');

        // The whole reply arrives at once and is shown as a single finished bubble.
        const result = await runAgentTurn(message, { onStatus: setStatus, image: attached });

        setBusy(false);

        if (result.error) {
            addBubble({
                id: `e${Date.now()}`,
                role: 'error',
                text: result.error,
                createdAt: new Date().toISOString(),
                actions: result.actions,
            });
            return;
        }

        addBubble({
            id: `a${Date.now()}`,
            role: 'assistant',
            text: result.text || 'Done.',
            createdAt: new Date().toISOString(),
            actions: result.actions,
            sources: result.sources,
        });
    }

    function renderBubble({ item }: { item: ChatBubble }) {
        const isUser = item.role === 'user';
        const isError = item.role === 'error';
        const textColor = isUser ? '#FFFFFF' : isError ? '#B91C1C' : colors.text;

        return (
            <View style={[styles.bubbleRow, isUser ? styles.rowRight : styles.rowLeft]}>
                <View style={[
                    styles.bubble,
                    isUser && styles.bubbleUser,
                    isError && styles.bubbleError,
                ]}>
                    {!!item.imageUri && (
                        <Image source={{ uri: item.imageUri }} style={styles.bubbleImage} resizeMode="cover" />
                    )}

                    {isUser
                        ? <Text style={[styles.plainText, { color: textColor }]}>{item.text}</Text>
                        : <MarkdownMessage text={item.text} colors={colors} color={textColor} />}

                    {!!item.actions?.length && (
                        <View style={styles.chipWrap}>
                            {item.actions.map((action, index) => (
                                <View
                                    key={`${item.id}-${index}`}
                                    style={[
                                        styles.chip,
                                        action.status === 'saved' && styles.chipSaved,
                                        action.status === 'failed' && styles.chipFailed,
                                    ]}
                                >
                                    <Ionicons
                                        name={
                                            action.status === 'saved' ? 'checkmark-circle'
                                                : action.status === 'failed' ? 'alert-circle'
                                                    : action.status === 'info'
                                                        ? (action.tool === 'remember' || action.tool === 'forget' || action.tool === 'list_memory' ? 'bookmark-outline' : 'globe-outline')
                                                        : 'time-outline'
                                        }
                                        size={13}
                                        color={action.status === 'failed' ? '#B91C1C' : action.status === 'saved' ? '#047857' : colors.primary}
                                    />
                                    <Text style={[
                                        styles.chipText,
                                        action.status === 'saved' && { color: '#047857' },
                                        action.status === 'failed' && { color: '#B91C1C' },
                                    ]} numberOfLines={2}>
                                        {action.label}: {action.preview}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {!!item.sources?.length && (
                        <View style={styles.sourceWrap}>
                            <Text style={styles.sourceTitle}>Sources</Text>
                            {item.sources.map((source, index) => (
                                <TouchableOpacity
                                    key={`${item.id}-s${index}`}
                                    style={styles.sourceRow}
                                    onPress={() => Linking.openURL(source.url).catch(() => { })}
                                >
                                    <Ionicons name="link-outline" size={12} color={colors.primary} />
                                    <Text style={styles.sourceText} numberOfLines={1}>{source.title || source.url}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>
            </View>
        );
    }

    // The whole screen shifts up by exactly the part of the keyboard that the
    // window did not already absorb, so the input is always visible in Expo Go
    // and in the release APK.
    const bottomPadding = isKeyboardVisible
        ? keyboardOffset + 8
        : Math.max(insets.bottom, 10);

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.headerTitle}>Assistant</Text>
                    <Text style={styles.headerSubtitle} numberOfLines={1}>
                        {model ? model : 'no model selected'}{autoApprove ? ' - auto-save on' : ''}
                    </Text>
                </View>
                {bubbles.length > 0 && (
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => Alert.alert('Clear conversation', 'Staged entries in the review list are kept.', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Clear', style: 'destructive', onPress: clearChat },
                        ])}
                    >
                        <Ionicons name="trash-outline" size={22} color={colors.textSecondary} />
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/ai-settings')}>
                    <Ionicons name="options-outline" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>

            {pending.length > 0 && !isKeyboardVisible && (
                <TouchableOpacity style={styles.reviewBanner} onPress={() => router.push('/ai-review')}>
                    <Ionicons name="clipboard-outline" size={18} color={colors.primary} />
                    <Text style={styles.reviewBannerText}>
                        {pending.length} entr{pending.length === 1 ? 'y' : 'ies'} waiting for your review
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                </TouchableOpacity>
            )}

            {toolsUnsupported && !isKeyboardVisible && (
                <View style={styles.warnBanner}>
                    <Ionicons name="warning-outline" size={16} color="#92400E" />
                    <Text style={styles.warnText}>This model has limited tool support - using JSON fallback mode.</Text>
                </View>
            )}

            <FlatList
                ref={listRef}
                data={bubbles}
                keyExtractor={(item) => item.id}
                renderItem={renderBubble}
                style={{ flex: 1 }}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
                onContentSizeChange={scrollToEnd}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Ionicons name="sparkles-outline" size={40} color={colors.primary} />
                        <Text style={styles.emptyTitle}>Just tell me your day</Text>
                        <Text style={styles.emptyText}>
                            I fill in your symptoms, meals, water, sleep, vitals, activity and doses.
                            {autoApprove ? ' Entries are saved directly.' : ' Everything lands in a review list so you only have to check it.'}
                        </Text>
                        {SUGGESTIONS.map((s) => (
                            <TouchableOpacity key={s} style={styles.suggestion} onPress={() => { Keyboard.dismiss(); send(s); }}>
                                <Text style={styles.suggestionText}>{s}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                }
            />

            {busy && (
                <View style={styles.statusRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.statusText}>{status}...</Text>
                </View>
            )}

            <View style={[styles.inputBarWrap, { paddingBottom: bottomPadding }]}>
                <View style={styles.toolRow}>
                    <TouchableOpacity
                        style={[styles.toolToggle, webSearchEnabled && styles.toolToggleOn]}
                        onPress={() => setWebSearchEnabled(!webSearchEnabled)}
                    >
                        <Ionicons
                            name={webSearchEnabled ? 'globe' : 'globe-outline'}
                            size={15}
                            color={webSearchEnabled ? '#FFFFFF' : colors.textSecondary}
                        />
                        <Text style={[styles.toolToggleText, webSearchEnabled && styles.toolToggleTextOn]}>
                            Web search {webSearchEnabled ? 'on' : 'off'}
                        </Text>
                    </TouchableOpacity>

                    {webSearchEnabled && (
                        <Text style={styles.toolHint} numberOfLines={1}>via {searchProvider}</Text>
                    )}

                    <TouchableOpacity
                        style={[styles.toolToggle, !!image && styles.toolToggleOn]}
                        onPress={attachImage}
                    >
                        <Ionicons
                            name={image ? 'image' : 'image-outline'}
                            size={15}
                            color={image ? '#FFFFFF' : colors.textSecondary}
                        />
                        <Text style={[styles.toolToggleText, !!image && styles.toolToggleTextOn]}>
                            {image ? 'Photo ready' : 'Photo'}
                        </Text>
                    </TouchableOpacity>

                    {!!memory.trim() && (
                        <TouchableOpacity style={styles.memoryPill} onPress={() => router.push('/ai-settings')}>
                            <Ionicons name="bookmark" size={12} color={colors.primary} />
                            <Text style={styles.memoryPillText}>Memory on</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {!!image && (
                    <View style={styles.attachRow}>
                        <Image source={{ uri: image.uri }} style={styles.attachThumb} resizeMode="cover" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.attachTitle} numberOfLines={1}>Photo attached</Text>
                            <Text style={styles.attachHint} numberOfLines={1}>
                                {describeSize(image)} - read by {visionModel}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => setImage(null)} style={styles.iconButton}>
                            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.inputBar}>
                    <TextInput
                    style={styles.input}
                    placeholder={notReady ? 'Set up the assistant first...' : image ? 'Ask about the photo, or just send it...' : 'I ate..., I feel..., I took...'}
                    placeholderTextColor={colors.textSecondary}
                    value={input}
                    onChangeText={setInput}
                    multiline
                    editable={!busy}
                    onFocus={scrollToEnd}
                    textAlignVertical="top"
                    />
                    <TouchableOpacity
                        style={[styles.sendButton, (!input.trim() && !image) || busy ? styles.sendButtonDisabled : null]}
                        onPress={() => send()}
                        disabled={(!input.trim() && !image) || busy}
                    >
                        <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
        backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    iconButton: { padding: 8, minWidth: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
    headerSubtitle: { fontSize: 12, color: colors.textSecondary },
    reviewBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    reviewBannerText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
    warnBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: '#FEF3C7',
    },
    warnText: { flex: 1, color: '#92400E', fontSize: 12 },
    listContent: { padding: 16, paddingBottom: 16 },
    bubbleImage: {
        width: '100%', height: 170, borderRadius: 12, marginBottom: 10,
        backgroundColor: colors.border,
    },
    attachRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginHorizontal: 12, marginBottom: 8, padding: 8,
        backgroundColor: colors.surface, borderRadius: 12,
        borderWidth: 1, borderColor: colors.border,
    },
    attachThumb: { width: 42, height: 42, borderRadius: 8, backgroundColor: colors.border },
    attachTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
    attachHint: { fontSize: 11, color: colors.textSecondary },
    bubbleRow: { flexDirection: 'row', marginBottom: 12 },
    rowLeft: { justifyContent: 'flex-start' },
    rowRight: { justifyContent: 'flex-end' },
    bubble: {
        maxWidth: '88%', backgroundColor: colors.surface, borderRadius: 16, padding: 14,
        borderWidth: 1, borderColor: colors.border,
    },
    bubbleUser: { backgroundColor: colors.primary, borderColor: colors.primary },
    bubbleError: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
    plainText: { fontSize: 15, lineHeight: 21 },
    chipWrap: { marginTop: 10, gap: 6 },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.background,
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
    },
    chipSaved: { backgroundColor: '#D1FAE5' },
    chipFailed: { backgroundColor: '#FEE2E2' },
    chipText: { flex: 1, fontSize: 12, color: colors.text },
    sourceWrap: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
    sourceTitle: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
    sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sourceText: { flex: 1, fontSize: 12, color: colors.primary, textDecorationLine: 'underline' },
    empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 8 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 12 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 20 },
    suggestion: {
        backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
        borderWidth: 1, borderColor: colors.border, marginBottom: 8, width: '100%',
    },
    suggestionText: { color: colors.text, fontSize: 14 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
    statusText: { color: colors.textSecondary, fontSize: 13, textTransform: 'capitalize' },
    inputBarWrap: {
        backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8,
    },
    toolRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 8 },
    toolToggle: {
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
    },
    toolToggleOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    toolToggleText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    toolToggleTextOn: { color: '#FFFFFF' },
    toolHint: { fontSize: 11, color: colors.textSecondary, textTransform: 'capitalize' },
    memoryPill: {
        flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto',
        paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.background,
        borderWidth: 1, borderColor: colors.border,
    },
    memoryPillText: { fontSize: 11, fontWeight: '600', color: colors.primary },
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 14,
    },
    input: {
        flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: colors.background, borderRadius: 20,
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: colors.text,
        borderWidth: 1, borderColor: colors.border,
    },
    sendButton: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    sendButtonDisabled: { backgroundColor: colors.border },
});
