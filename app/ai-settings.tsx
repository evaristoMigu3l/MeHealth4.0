import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Switch,
    Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useAppTheme } from '../hooks/useAppTheme';
import { useKeyboardOffset } from '../hooks/useKeyboardOffset';
import { useAiStore } from '../stores/useAiStore';
import { clearApiKey, getApiKey, hasApiKey, setApiKey } from '../utils/ai/secrets';
import { getGeminiKey, setGeminiKey } from '../utils/ai/secrets';
import { listModels, testConnection, ZenError } from '../utils/ai/zenClient';
import { GeminiError, listVisionModels, testVisionConnection } from '../utils/ai/geminiClient';
import { DEFAULT_BASE_URL, FALLBACK_MODELS, FALLBACK_VISION_MODELS, GEMINI_BASE_URL, SEARCH_PROVIDERS } from '../utils/ai/config';
import { DEFAULT_CUSTOM_PROMPT_HINT } from '../utils/ai/systemPrompt';
import { getSearchKey, setSearchKey } from '../utils/ai/secrets';
import { MEMORY_MAX_CHARS } from '../utils/ai/config';
import { MEMORY_PLACEHOLDER, memoryLines, setMemory as saveMemory } from '../utils/ai/memory';
import { usingMarkdownLibrary } from '../components/ai/MarkdownMessage';
import { ZenModel } from '../utils/ai/types';

export default function AiSettingsScreen() {
    const insets = useSafeAreaInsets();
    const { colors } = useAppTheme();
    const styles = getStyles(colors);
    const router = useRouter();
    const { keyboardOffset, isKeyboardVisible } = useKeyboardOffset();

    const {
        baseUrl, setBaseUrl, model, setModel, temperature, setTemperature,
        autoApprove, setAutoApprove, models, setModels, modelsFetchedAt,
        hasKey, setHasKey, toolsUnsupported, setToolsUnsupported, pending,
        customPrompt, setCustomPrompt, customPromptMode, setCustomPromptMode,
        memory, webSearchEnabled, setWebSearchEnabled,
        searchProvider, setSearchProvider, hasSearchKeySaved, setHasSearchKeySaved,
        visionModel, setVisionModel, visionModels, setVisionModels,
        hasGeminiKeySaved, setHasGeminiKeySaved,
    } = useAiStore();

    const [keyInput, setKeyInput] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [savingKey, setSavingKey] = useState(false);
    const [loadingModels, setLoadingModels] = useState(false);
    const [testing, setTesting] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [manualModel, setManualModel] = useState('');
    const [urlInput, setUrlInput] = useState(baseUrl);
    const [promptDraft, setPromptDraft] = useState(customPrompt);
    const [memoryDraft, setMemoryDraft] = useState(memory);
    const [searchKeyInput, setSearchKeyInput] = useState('');
    const [showSearchKey, setShowSearchKey] = useState(false);
    const [geminiKeyInput, setGeminiKeyInput] = useState('');
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [savingGemini, setSavingGemini] = useState(false);
    const [loadingVision, setLoadingVision] = useState(false);
    const [testingVision, setTestingVision] = useState(false);
    const [visionModelInput, setVisionModelInput] = useState('');

    useEffect(() => {
        (async () => {
            const stored = await getApiKey();
            setHasKey(!!stored);
            if (stored) setKeyInput(stored);
            const storedSearch = await getSearchKey();
            setHasSearchKeySaved(!!storedSearch);
            if (storedSearch) setSearchKeyInput(storedSearch);
            const storedGemini = await getGeminiKey();
            setHasGeminiKeySaved(!!storedGemini);
            if (storedGemini) setGeminiKeyInput(storedGemini);
        })();
    }, [setHasKey, setHasSearchKeySaved, setHasGeminiKeySaved]);

    // Keep the memory box in sync when the assistant remembers something new.
    useEffect(() => { setMemoryDraft(memory); }, [memory]);

    const memoryCount = memoryLines().length;
    const providerInfo = SEARCH_PROVIDERS.find((p) => p.id === searchProvider);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        const list = models.length ? models : FALLBACK_MODELS.map((id) => ({ id } as ZenModel));
        const sorted = [...list].sort((a, b) => Number(!!b.free) - Number(!!a.free) || a.id.localeCompare(b.id));
        return term ? sorted.filter((m) => m.id.toLowerCase().includes(term)) : sorted;
    }, [models, search]);

    async function saveKey() {
        setSavingKey(true);
        try {
            await setApiKey(keyInput);
            const ok = await hasApiKey();
            setHasKey(ok);
            Alert.alert(ok ? 'Key saved' : 'Key removed', ok
                ? 'Stored in the device keystore. It never leaves your phone except to call OpenCode Zen.'
                : 'The API key was removed from this device.');
        } catch {
            Alert.alert('Error', 'Could not save the key to the device keystore.');
        } finally {
            setSavingKey(false);
        }
    }

    async function removeKey() {
        Alert.alert('Remove API key', 'The assistant will stop working until you add a key again.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove', style: 'destructive', onPress: async () => {
                    await clearApiKey();
                    setKeyInput('');
                    setHasKey(false);
                },
            },
        ]);
    }

    async function refreshModels() {
        if (!hasKey) {
            Alert.alert('API key needed', 'Save your OpenCode Zen API key first.');
            return;
        }
        setLoadingModels(true);
        try {
            const list = await listModels(baseUrl);
            setModels(list);
            Alert.alert('Models updated', `${list.length} model(s) available right now.`);
        } catch (e: any) {
            Alert.alert('Could not load models', e instanceof ZenError ? e.message : 'Check your connection and key.');
        } finally {
            setLoadingModels(false);
        }
    }

    async function runTest() {
        if (!hasKey) { Alert.alert('API key needed', 'Save your API key first.'); return; }
        if (!model) { Alert.alert('Model needed', 'Pick a model first.'); return; }
        setTesting(true);
        try {
            const answer = await testConnection(baseUrl, model);
            Alert.alert('Connection OK', `${model} replied: ${answer}`);
        } catch (e: any) {
            Alert.alert('Test failed', e instanceof ZenError ? e.message : 'Unknown error.');
        } finally {
            setTesting(false);
        }
    }

    /** The Gemini key is stored in the keystore, exactly like the Zen key. */
    async function saveGeminiKey() {
        setSavingGemini(true);
        try {
            await setGeminiKey(geminiKeyInput);
            const saved = !!(await getGeminiKey());
            setHasGeminiKeySaved(saved);
            Alert.alert(saved ? 'Gemini key saved' : 'Gemini key removed', saved
                ? 'Stored in the device keystore. It is used only to describe the photos you attach.'
                : 'Image understanding is off until you add a key again.');
        } catch {
            Alert.alert('Error', 'Could not save the key to the device keystore.');
        } finally {
            setSavingGemini(false);
        }
    }

    /** Google renames its models often, so the list is fetched from the API. */
    async function refreshVisionModels() {
        if (!hasGeminiKeySaved) {
            Alert.alert('Gemini key needed', 'Save your Google Gemini API key first.');
            return;
        }
        setLoadingVision(true);
        try {
            const list = await listVisionModels();
            setVisionModels(list);
            Alert.alert('Image models updated', `${list.length} model(s) available for this key.`);
        } catch (e: any) {
            Alert.alert('Could not load image models', e instanceof GeminiError ? e.message : 'Check your connection and key.');
        } finally {
            setLoadingVision(false);
        }
    }

    async function runVisionTest() {
        if (!hasGeminiKeySaved) { Alert.alert('Gemini key needed', 'Save your Gemini key first.'); return; }
        if (!visionModel) { Alert.alert('Model needed', 'Pick an image model first.'); return; }
        setTestingVision(true);
        try {
            const answer = await testVisionConnection(visionModel);
            Alert.alert('Image model OK', `${visionModel} replied: ${answer}`);
        } catch (e: any) {
            Alert.alert('Test failed', e instanceof GeminiError ? e.message : 'Unknown error.');
        } finally {
            setTestingVision(false);
        }
    }

    // Whatever the API returned, plus the built-in list as a safety net.
    const visionChoices = visionModels.length
        ? visionModels
        : FALLBACK_VISION_MODELS.map((id) => ({ id, name: id, free: /flash/i.test(id) }));

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>AI Assistant</Text>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: (isKeyboardVisible ? keyboardOffset : 0) + 40 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
            >
                <View style={styles.privacyCard}>
                    <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
                    <Text style={styles.privacyText}>
                        Only the text you type in the chat, plus a short profile line and the records the assistant reads,
                        are sent to OpenCode Zen. Nothing else leaves the phone, and your key is kept in the device keystore.
                    </Text>
                </View>

                {/* ---------------------------------------------------------- key */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>API key</Text>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            value={keyInput}
                            onChangeText={setKeyInput}
                            placeholder="Paste your OpenCode Zen key"
                            placeholderTextColor={colors.textSecondary}
                            secureTextEntry={!showKey}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity style={styles.eyeButton} onPress={() => setShowKey((v) => !v)}>
                            <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={saveKey} disabled={savingKey}>
                            {savingKey
                                ? <ActivityIndicator size="small" color="#FFFFFF" />
                                : <Text style={styles.buttonPrimaryText}>Save key</Text>}
                        </TouchableOpacity>
                        {hasKey && (
                            <TouchableOpacity style={[styles.button, styles.buttonGhost]} onPress={removeKey}>
                                <Text style={styles.buttonGhostText}>Remove</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={styles.hint}>
                        {hasKey ? 'A key is saved on this device.' : 'No key saved yet. Get one at opencode.ai/auth.'}
                    </Text>
                </View>

                {/* -------------------------------------------------------- model */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Model</Text>

                    <TouchableOpacity style={styles.row} onPress={() => setPickerOpen(true)}>
                        <View style={styles.rowInfo}>
                            <Ionicons name="hardware-chip-outline" size={20} color={colors.textSecondary} />
                            <Text style={styles.rowText}>{model || 'Select a model'}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.row} onPress={refreshModels} disabled={loadingModels}>
                        <View style={styles.rowInfo}>
                            <Ionicons name="refresh-outline" size={20} color={colors.textSecondary} />
                            <Text style={styles.rowText}>Refresh model list</Text>
                        </View>
                        {loadingModels
                            ? <ActivityIndicator size="small" color={colors.primary} />
                            : <Text style={styles.rowValue}>
                                {modelsFetchedAt ? new Date(modelsFetchedAt).toLocaleDateString() : 'never'}
                            </Text>}
                    </TouchableOpacity>

                    <Text style={styles.label}>Or type a model id manually</Text>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            value={manualModel}
                            onChangeText={setManualModel}
                            placeholder="e.g. big-pickle"
                            placeholderTextColor={colors.textSecondary}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity
                            style={styles.eyeButton}
                            onPress={() => {
                                if (!manualModel.trim()) return;
                                setModel(manualModel.trim());
                                setManualModel('');
                                Alert.alert('Model set', 'Use Test connection to confirm it works.');
                            }}
                        >
                            <Ionicons name="checkmark" size={20} color={colors.primary} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.hint}>
                        Zen rotates its free models often. If a model stops working, refresh the list or type the new id here.
                    </Text>

                    <TouchableOpacity style={[styles.button, styles.buttonPrimary, { marginTop: 12 }]} onPress={runTest} disabled={testing}>
                        {testing
                            ? <ActivityIndicator size="small" color="#FFFFFF" />
                            : <Text style={styles.buttonPrimaryText}>Test connection</Text>}
                    </TouchableOpacity>

                    {toolsUnsupported && (
                        <TouchableOpacity style={styles.warnRow} onPress={() => setToolsUnsupported(false)}>
                            <Ionicons name="warning-outline" size={16} color="#92400E" />
                            <Text style={styles.warnText}>JSON fallback active for this model. Tap to retry with real tool calls.</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* ------------------------------------------------ image understanding */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Image understanding</Text>
                    <Text style={styles.hint}>
                        Photos are read by Google Gemini, which has its own key and its own model. Your text model stays
                        OpenCode Zen: it receives Gemini's description of the photo and does the logging from there.
                    </Text>

                    <Text style={styles.label}>Gemini API key</Text>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            value={geminiKeyInput}
                            onChangeText={setGeminiKeyInput}
                            placeholder="Paste your Google AI Studio key"
                            placeholderTextColor={colors.textSecondary}
                            secureTextEntry={!showGeminiKey}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity style={styles.eyeButton} onPress={() => setShowGeminiKey((v) => !v)}>
                            <Ionicons name={showGeminiKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={saveGeminiKey} disabled={savingGemini}>
                            {savingGemini
                                ? <ActivityIndicator size="small" color="#FFFFFF" />
                                : <Text style={styles.buttonPrimaryText}>Save Gemini key</Text>}
                        </TouchableOpacity>
                        {hasGeminiKeySaved && (
                            <TouchableOpacity
                                style={[styles.button, styles.buttonGhost]}
                                onPress={() => {
                                    setGeminiKeyInput('');
                                    setGeminiKey('').then(() => setHasGeminiKeySaved(false));
                                }}
                            >
                                <Text style={styles.buttonGhostText}>Remove</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={styles.hint}>
                        {hasGeminiKeySaved
                            ? 'A Gemini key is saved on this device. Photos go only to ' + GEMINI_BASE_URL.replace('https://', '') + '.'
                            : 'No Gemini key yet. Create a free one at aistudio.google.com/apikey.'}
                    </Text>

                    <Text style={styles.label}>Image model</Text>
                    {visionChoices.slice(0, 10).map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.row}
                            onPress={() => setVisionModel(item.id)}
                        >
                            <View style={[styles.rowInfo, { flex: 1, paddingRight: 12 }]}>
                                <Ionicons
                                    name={visionModel === item.id ? 'radio-button-on' : 'radio-button-off'}
                                    size={20}
                                    color={visionModel === item.id ? colors.primary : colors.textSecondary}
                                />
                                <Text style={styles.rowText} numberOfLines={1}>{item.id}</Text>
                            </View>
                            {item.free && <Text style={styles.freeTag}>free tier</Text>}
                        </TouchableOpacity>
                    ))}

                    <TouchableOpacity style={styles.row} onPress={refreshVisionModels} disabled={loadingVision}>
                        <View style={styles.rowInfo}>
                            <Ionicons name="refresh-outline" size={20} color={colors.textSecondary} />
                            <Text style={styles.rowText}>Refresh image model list</Text>
                        </View>
                        {loadingVision
                            ? <ActivityIndicator size="small" color={colors.primary} />
                            : <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
                    </TouchableOpacity>

                    <Text style={styles.label}>Or type a model id manually</Text>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            value={visionModelInput}
                            onChangeText={setVisionModelInput}
                            placeholder="e.g. gemini-2.0-flash"
                            placeholderTextColor={colors.textSecondary}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity
                            style={styles.eyeButton}
                            onPress={() => {
                                if (!visionModelInput.trim()) return;
                                setVisionModel(visionModelInput.trim());
                                setVisionModelInput('');
                                Alert.alert('Image model set', 'Use Test image model to confirm it works.');
                            }}
                        >
                            <Ionicons name="checkmark" size={20} color={colors.primary} />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.button, styles.buttonPrimary, { marginTop: 12 }]}
                        onPress={runVisionTest}
                        disabled={testingVision}
                    >
                        {testingVision
                            ? <ActivityIndicator size="small" color="#FFFFFF" />
                            : <Text style={styles.buttonPrimaryText}>Test image model</Text>}
                    </TouchableOpacity>

                    <Text style={styles.hint}>
                        In the chat, tap Photo next to the message box to attach a picture: a medicine box, a lab result,
                        a meal, a monitor screen or a skin change. Nothing is uploaded unless you send the message.
                    </Text>
                </View>

                {/* ------------------------------------------------------ behaviour */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Behaviour</Text>

                    <View style={styles.row}>
                        <View style={[styles.rowInfo, { flex: 1, paddingRight: 12 }]}>
                            <Ionicons name="shield-checkmark-outline" size={20} color={colors.textSecondary} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.rowText}>Save entries directly</Text>
                                <Text style={styles.rowHint}>Off: entries wait in the review list first (recommended).</Text>
                            </View>
                        </View>
                        <Switch
                            value={autoApprove}
                            onValueChange={setAutoApprove}
                            trackColor={{ false: colors.border, true: colors.primary }}
                        />
                    </View>

                    <TouchableOpacity style={styles.row} onPress={() => router.push('/ai-review')}>
                        <View style={styles.rowInfo}>
                            <Ionicons name="clipboard-outline" size={20} color={colors.textSecondary} />
                            <Text style={styles.rowText}>Review staged entries</Text>
                        </View>
                        <View style={styles.rowInfo}>
                            <Text style={styles.rowValue}>{pending.length}</Text>
                            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                        </View>
                    </TouchableOpacity>

                    <Text style={styles.label}>Creativity (temperature): {temperature.toFixed(2)}</Text>
                    <Slider
                        style={{ width: '100%', height: 40 }}
                        minimumValue={0}
                        maximumValue={1}
                        step={0.05}
                        value={temperature}
                        onValueChange={setTemperature}
                        minimumTrackTintColor={colors.primary}
                        maximumTrackTintColor={colors.border}
                        thumbTintColor={colors.primary}
                    />
                    <Text style={styles.hint}>Keep it low (0.1 - 0.3) so the assistant sticks to the facts you give it.</Text>
                </View>

                {/* -------------------------------------------- custom instructions */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Assistant behaviour (system prompt)</Text>
                    <Text style={styles.hint}>
                        Your own instructions for how the assistant should behave. Safety rules and the tool list are always kept.
                    </Text>

                    <TextInput
                        style={[styles.input, styles.promptInput]}
                        value={promptDraft}
                        onChangeText={setPromptDraft}
                        placeholder={DEFAULT_CUSTOM_PROMPT_HINT}
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        textAlignVertical="top"
                        autoCapitalize="sentences"
                    />

                    <Text style={styles.label}>How should it be used?</Text>
                    <View style={styles.modeRow}>
                        {(['append', 'replace'] as const).map((mode) => (
                            <TouchableOpacity
                                key={mode}
                                style={[styles.modeChip, customPromptMode === mode && styles.modeChipActive]}
                                onPress={() => setCustomPromptMode(mode)}
                            >
                                <Ionicons
                                    name={customPromptMode === mode ? 'radio-button-on' : 'radio-button-off'}
                                    size={16}
                                    color={customPromptMode === mode ? colors.primary : colors.textSecondary}
                                />
                                <Text style={[styles.modeChipText, customPromptMode === mode && { color: colors.primary, fontWeight: '700' }]}>
                                    {mode === 'append' ? 'Add to default' : 'Replace default'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={styles.hint}>
                        {customPromptMode === 'append'
                            ? 'Recommended: your instructions are added on top of the built-in health-logging prompt.'
                            : 'Advanced: your text becomes the whole prompt. Only the date, the tool list and the core safety line are kept.'}
                    </Text>

                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={[styles.button, styles.buttonPrimary]}
                            onPress={() => {
                                setCustomPrompt(promptDraft);
                                Alert.alert('Saved', promptDraft.trim()
                                    ? 'Your instructions will be used from the next message on.'
                                    : 'Custom instructions cleared. The default prompt is used.');
                            }}
                        >
                            <Text style={styles.buttonPrimaryText}>Save instructions</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, styles.buttonGhost]}
                            onPress={() => {
                                setPromptDraft('');
                                setCustomPrompt('');
                                setCustomPromptMode('append');
                            }}
                        >
                            <Text style={styles.buttonGhostText}>Reset</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.hint}>
                        {customPrompt.trim()
                            ? `Active: ${customPrompt.trim().length} characters of custom instructions.`
                            : 'No custom instructions saved - using the default assistant behaviour.'}
                    </Text>
                </View>

                {/* -------------------------------------------------- web search */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Web search</Text>

                    <View style={styles.row}>
                        <View style={[styles.rowInfo, { flex: 1, paddingRight: 12 }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.rowText}>Allow the assistant to search the web</Text>
                                <Text style={styles.rowHint}>
                                    When on, a globe button appears next to the message box. The assistant searches only
                                    when it does not know something.
                                </Text>
                            </View>
                        </View>
                        <Switch
                            value={webSearchEnabled}
                            onValueChange={setWebSearchEnabled}
                            trackColor={{ false: colors.border, true: colors.primary }}
                            thumbColor="#FFFFFF"
                        />
                    </View>

                    <Text style={styles.label}>Search provider</Text>
                    {SEARCH_PROVIDERS.map((provider) => (
                        <TouchableOpacity
                            key={provider.id}
                            style={styles.modelRow}
                            onPress={() => setSearchProvider(provider.id)}
                        >
                            <Ionicons
                                name={searchProvider === provider.id ? 'radio-button-on' : 'radio-button-off'}
                                size={18}
                                color={searchProvider === provider.id ? colors.primary : colors.textSecondary}
                            />
                            <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={styles.modelText}>{provider.label}</Text>
                                <Text style={styles.rowHint}>{provider.hint}</Text>
                            </View>
                            {!provider.needsKey && <Text style={styles.freeTag}>NO KEY</Text>}
                        </TouchableOpacity>
                    ))}

                    {!!providerInfo?.needsKey && (
                        <>
                            <Text style={styles.label}>{providerInfo.label} API key</Text>
                            <View style={styles.inputRow}>
                                <TextInput
                                    style={styles.input}
                                    value={searchKeyInput}
                                    onChangeText={setSearchKeyInput}
                                    placeholder="Paste the search API key"
                                    placeholderTextColor={colors.textSecondary}
                                    secureTextEntry={!showSearchKey}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                                <TouchableOpacity style={styles.eyeButton} onPress={() => setShowSearchKey(!showSearchKey)}>
                                    <Ionicons name={showSearchKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.buttonRow}>
                                <TouchableOpacity
                                    style={[styles.button, styles.buttonPrimary]}
                                    onPress={async () => {
                                        await setSearchKey(searchKeyInput);
                                        setHasSearchKeySaved(!!searchKeyInput.trim());
                                        Alert.alert(searchKeyInput.trim() ? 'Search key saved' : 'Search key removed',
                                            'Stored in the device keystore, like your model key.');
                                    }}
                                >
                                    <Text style={styles.buttonPrimaryText}>Save search key</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.hint}>
                                {hasSearchKeySaved ? 'A search key is saved on this device.' : 'No search key yet - DuckDuckGo works without one.'}
                            </Text>
                        </>
                    )}

                    <Text style={styles.hint}>
                        Only the search words leave your phone. Your health records are never sent to a search engine, and the assistant is told to search the general topic only.
                    </Text>
                </View>

                {/* ------------------------------------------------------- memory */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Memory</Text>
                    <Text style={styles.hint}>
                        One note per line. This file is sent with every message, so the assistant always knows it.
                        Say "remember that..." in the chat and it adds a line here by itself.
                    </Text>

                    <TextInput
                        style={[styles.input, { minHeight: 150, paddingTop: 12 }]}
                        value={memoryDraft}
                        onChangeText={setMemoryDraft}
                        placeholder={MEMORY_PLACEHOLDER}
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        textAlignVertical="top"
                        maxLength={MEMORY_MAX_CHARS}
                    />

                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={[styles.button, styles.buttonPrimary]}
                            onPress={() => {
                                saveMemory(memoryDraft);
                                Alert.alert('Memory saved', 'The assistant will use it from the next message on.');
                            }}
                        >
                            <Text style={styles.buttonPrimaryText}>Save memory</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, styles.buttonGhost]}
                            onPress={() => Alert.alert('Clear memory', 'The assistant will forget everything you told it to remember. Your health records are not affected.', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Clear', style: 'destructive', onPress: () => {
                                        setMemoryDraft('');
                                        saveMemory('');
                                    },
                                },
                            ])}
                        >
                            <Text style={styles.buttonGhostText}>Clear</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.hint}>
                        {memoryCount
                            ? `${memoryCount} note${memoryCount === 1 ? '' : 's'} in memory, ${memory.length} of ${MEMORY_MAX_CHARS} characters used.`
                            : 'Memory is empty.'}
                        {'\n'}Keep it short - everything here is sent with every request.
                    </Text>
                </View>

                {/* --------------------------------------------------- formatting */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Reply formatting</Text>
                    <View style={styles.row}>
                        <View style={styles.rowInfo}>
                            <Text style={styles.rowText}>Markdown renderer</Text>
                            <Text style={styles.rowHint}>
                                {usingMarkdownLibrary
                                    ? 'Using react-native-markdown-display.'
                                    : 'Using the built-in renderer. Run npm install react-native-markdown-display to switch to the library - the app picks it up automatically.'}
                            </Text>
                        </View>
                        <Ionicons
                            name={usingMarkdownLibrary ? 'library-outline' : 'phone-portrait-outline'}
                            size={20}
                            color={colors.primary}
                        />
                    </View>
                </View>

                {/* ------------------------------------------------------ endpoint */}
                <View style={[styles.section, { marginBottom: 40 }]}>
                    <Text style={styles.sectionTitle}>Endpoint (advanced)</Text>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            value={urlInput}
                            onChangeText={setUrlInput}
                            placeholder={DEFAULT_BASE_URL}
                            placeholderTextColor={colors.textSecondary}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity style={styles.eyeButton} onPress={() => { setBaseUrl(urlInput); Alert.alert('Endpoint saved'); }}>
                            <Ionicons name="checkmark" size={20} color={colors.primary} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.hint}>
                        Any OpenAI-compatible base URL works. Default: {DEFAULT_BASE_URL}
                    </Text>
                </View>
            </ScrollView>

            {/* --------------------------------------------------- model picker */}
            <Modal visible={pickerOpen} transparent animationType="none" statusBarTranslucent hardwareAccelerated>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select model</Text>
                            <TouchableOpacity onPress={() => setPickerOpen(false)} style={styles.backButton}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            style={[styles.input, { marginBottom: 12 }]}
                            value={search}
                            onChangeText={setSearch}
                            placeholder="Search models"
                            placeholderTextColor={colors.textSecondary}
                            autoCapitalize="none"
                        />

                        {!models.length && (
                            <Text style={styles.hint}>
                                Showing a small offline fallback list. Tap Refresh model list to load what Zen offers today.
                            </Text>
                        )}

                        <FlatList
                            data={filtered}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.modelRow}
                                    onPress={() => { setModel(item.id); setPickerOpen(false); }}
                                >
                                    <Ionicons
                                        name={model === item.id ? 'checkmark-circle' : 'radio-button-off'}
                                        size={20}
                                        color={model === item.id ? colors.primary : colors.border}
                                    />
                                    <Text style={[styles.modelText, model === item.id && { color: colors.primary, fontWeight: '700' }]}>
                                        {item.id}
                                    </Text>
                                    {item.free && <Text style={styles.freeTag}>free</Text>}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backButton: { padding: 8 },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '600', color: colors.text, marginLeft: 8 },
    privacyCard: {
        flexDirection: 'row', gap: 10, margin: 16, padding: 14, borderRadius: 14,
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    privacyText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
    section: { backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 },
    sectionTitle: {
        fontSize: 12, fontWeight: '700', color: colors.textSecondary,
        textTransform: 'uppercase', marginBottom: 10,
    },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: {
        flex: 1, backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 14,
        paddingVertical: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border,
    },
    eyeButton: { padding: 10 },
    buttonRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    button: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    buttonPrimary: { backgroundColor: colors.primary },
    buttonPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
    buttonGhost: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    buttonGhostText: { color: colors.text, fontWeight: '600', fontSize: 15 },
    hint: { fontSize: 12, color: colors.textSecondary, marginTop: 8, lineHeight: 17 },
    label: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 16, marginBottom: 8 },
    row: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    rowInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowText: { fontSize: 15, color: colors.text },
    rowHint: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    rowValue: { fontSize: 13, color: colors.textSecondary },
    warnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10 },
    warnText: { flex: 1, fontSize: 12, color: '#92400E' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: {
        backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 20, maxHeight: '85%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
    promptInput: { minHeight: 150, paddingTop: 12, lineHeight: 20 },
    modeRow: { flexDirection: 'row', gap: 10 },
    modeChip: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
        backgroundColor: colors.background,
    },
    modeChipActive: { borderColor: colors.primary },
    modeChipText: { fontSize: 13, color: colors.text, fontWeight: '600' },
    modelRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    modelText: { flex: 1, fontSize: 15, color: colors.text },
    freeTag: {
        fontSize: 11, fontWeight: '700', color: '#047857', backgroundColor: '#D1FAE5',
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden',
    },
});
