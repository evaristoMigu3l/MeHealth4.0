import { useMemo, useState } from 'react';
import {
    Alert, FlatList, Keyboard, Modal, Pressable, ScrollView, StyleSheet,
    Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { useKeyboardOffset } from '../hooks/useKeyboardOffset';
import { useAiStore } from '../stores/useAiStore';
import { approveAllPending, approvePending, previewFor } from '../utils/ai/agent';
import { PendingAction } from '../utils/ai/types';

const ICONS: Record<string, any> = {
    log_symptom: 'pulse-outline',
    log_measurement: 'speedometer-outline',
    log_mood: 'happy-outline',
    log_sleep: 'moon-outline',
    log_food: 'restaurant-outline',
    log_water: 'water-outline',
    log_activity: 'walk-outline',
    add_medication: 'medkit-outline',
    mark_medication_taken: 'checkmark-done-outline',
    add_appointment: 'calendar-outline',
    add_diagnosis: 'document-text-outline',
    add_investigation: 'flask-outline',
    update_record: 'create-outline',
    delete_record: 'trash-outline',
};

/** Fields that deserve a taller, multi-line box. */
const LONG_FIELDS = ['notes', 'treatment', 'result', 'reason'];

export default function AiReviewScreen() {
    const insets = useSafeAreaInsets();
    const { colors } = useAppTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const router = useRouter();
    const { keyboardOffset, isKeyboardVisible } = useKeyboardOffset();
    const { height: windowHeight } = useWindowDimensions();

    const { pending, removePending, updatePending } = useAiStore();
    const [editing, setEditing] = useState<PendingAction | null>(null);
    const [draft, setDraft] = useState<Record<string, string>>({});

    function openEditor(item: PendingAction) {
        const asText: Record<string, string> = {};
        Object.entries(item.args).forEach(([key, value]) => {
            asText[key] = Array.isArray(value) ? value.join(', ') : value === null || value === undefined ? '' : String(value);
        });
        setDraft(asText);
        setEditing(item);
    }

    function closeEditor() {
        Keyboard.dismiss();
        setEditing(null);
    }

    function saveEdit() {
        if (!editing) return;
        const args: Record<string, any> = {};
        Object.entries(draft).forEach(([key, text]) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            const original = editing.args[key];
            if (typeof original === 'number') {
                const n = Number(trimmed.replace(',', '.'));
                args[key] = Number.isFinite(n) ? n : trimmed;
            } else if (Array.isArray(original)) {
                args[key] = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
            } else if (typeof original === 'boolean') {
                args[key] = /^(true|yes|1)$/i.test(trimmed);
            } else {
                args[key] = trimmed;
            }
        });
        updatePending(editing.id, args, previewFor(editing.tool, args));
        closeEditor();
    }

    function approveOne(item: PendingAction) {
        const result = approvePending(item.id);
        if (!result.ok) Alert.alert('Could not save', result.message);
    }

    function approveAll() {
        Alert.alert('Approve all', `Save all ${pending.length} entries to your health record?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Approve all', onPress: () => {
                    const { saved, failed } = approveAllPending();
                    Alert.alert('Done', failed ? `${saved} saved, ${failed} could not be saved.` : `${saved} entries saved.`);
                },
            },
        ]);
    }

    function renderItem({ item }: { item: PendingAction }) {
        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={styles.iconBadge}>
                        <Ionicons name={ICONS[item.tool] || 'sparkles-outline'} size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardLabel}>{item.label}</Text>
                        <Text style={styles.cardPreview}>{item.preview}</Text>
                    </View>
                </View>

                <View style={styles.cardActions}>
                    <TouchableOpacity style={[styles.action, styles.approve]} onPress={() => approveOne(item)}>
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                        <Text style={styles.approveText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.action, styles.ghost]} onPress={() => openEditor(item)}>
                        <Ionicons name="create-outline" size={16} color={colors.text} />
                        <Text style={styles.ghostText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.action, styles.ghost]} onPress={() => removePending(item.id)}>
                        <Ionicons name="close" size={16} color="#B91C1C" />
                        <Text style={[styles.ghostText, { color: '#B91C1C' }]}>Reject</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // The modal window itself resizes with the Android keyboard (softwareKeyboardLayoutMode
    // is "resize" and the modal is NOT statusBarTranslucent), so the sheet is sized in
    // percentages of its parent instead of doing manual keyboard maths. Mixing both was
    // what pushed the sheet off screen as soon as the keyboard appeared.
    // Kept for reference: the old approach shrank the sheet using the leftover keyboard
    // height. This behaves identically in Expo Go and in the release APK.
    void keyboardOffset;
    void windowHeight;

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Review AI entries</Text>
                {pending.length > 1 && (
                    <TouchableOpacity onPress={approveAll} style={styles.approveAll}>
                        <Text style={styles.approveAllText}>Approve all</Text>
                    </TouchableOpacity>
                )}
            </View>

            <FlatList
                data={pending}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.textSecondary} />
                        <Text style={styles.emptyTitle}>Nothing to review</Text>
                        <Text style={styles.emptyText}>Entries the assistant creates will appear here before they are saved.</Text>
                    </View>
                }
            />

            <Modal visible={!!editing} transparent animationType="fade" hardwareAccelerated onRequestClose={closeEditor}>
                <View style={styles.modalOverlay}>
                    {/* Tapping outside only dismisses the keyboard while it is open, so the
                        sheet can no longer be closed by accident when the layout shifts. */}
                    <Pressable
                        style={{ flex: 1 }}
                        onPress={() => { if (isKeyboardVisible) Keyboard.dismiss(); else closeEditor(); }}
                    />

                    <View style={[styles.modalContent, { maxHeight: '92%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle} numberOfLines={1}>Edit {editing?.label}</Text>
                            <TouchableOpacity onPress={closeEditor} style={styles.backButton}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            style={{ flexShrink: 1 }}
                            contentContainerStyle={{ paddingBottom: 12 }}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="none"
                            showsVerticalScrollIndicator
                        >
                            {Object.keys(draft).map((key) => (
                                <View key={key} style={{ marginBottom: 14 }}>
                                    <Text style={styles.fieldLabel}>{key.replace(/_/g, ' ')}</Text>
                                    <TextInput
                                        style={[styles.input, LONG_FIELDS.includes(key) && styles.inputLong]}
                                        value={draft[key]}
                                        onChangeText={(text) => setDraft((d) => ({ ...d, [key]: text }))}
                                        placeholderTextColor={colors.textSecondary}
                                        multiline={LONG_FIELDS.includes(key)}
                                        textAlignVertical={LONG_FIELDS.includes(key) ? 'top' : 'center'}
                                    />
                                </View>
                            ))}
                        </ScrollView>

                        <View style={[styles.modalFooter, { paddingBottom: 4 }]}>
                            <TouchableOpacity style={[styles.action, styles.ghost]} onPress={closeEditor}>
                                <Text style={styles.ghostText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.action, styles.approve]} onPress={saveEdit}>
                                <Text style={styles.approveText}>Save changes</Text>
                            </TouchableOpacity>
                        </View>
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
    approveAll: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.primary },
    approveAllText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
    card: {
        backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 12,
        borderWidth: 1, borderColor: colors.border,
    },
    cardHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    iconBadge: {
        width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background,
        alignItems: 'center', justifyContent: 'center',
    },
    cardLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },
    cardPreview: { fontSize: 15, color: colors.text, marginTop: 4, lineHeight: 21 },
    cardActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
    action: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 12, borderRadius: 10,
    },
    approve: { backgroundColor: colors.primary },
    approveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    ghost: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    ghostText: { color: colors.text, fontWeight: '600', fontSize: 14 },
    empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 12 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 20 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: {
        backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        paddingHorizontal: 20, paddingTop: 16,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    modalTitle: { flex: 1, fontSize: 19, fontWeight: '700', color: colors.text },
    modalFooter: {
        flexDirection: 'row', gap: 10, paddingTop: 10,
        borderTopWidth: 1, borderTopColor: colors.border,
    },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, textTransform: 'capitalize' },
    input: {
        backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border,
    },
    inputLong: { minHeight: 88, paddingTop: 12 },
});
