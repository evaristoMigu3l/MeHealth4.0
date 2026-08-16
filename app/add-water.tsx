import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useHealthStore } from '../stores/useHealthStore';
import { useTranslation } from '../hooks/useTranslation';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

export default function AddWaterScreen() {
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const { colors } = useAppTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const router = useRouter();
    const { t } = useTranslation();
    const { addWaterLog } = useHealthStore();

    const [amountStr, setAmountStr] = useState('');
    const [unit, setUnit] = useState<'ml' | 'L'>('ml');

    const handleSubmit = () => {
        let amount = parseFloat(amountStr.replace(',', '.'));
        if (isNaN(amount) || amount <= 0) return;

        if (unit === 'L') {
            amount = amount * 1000; // Convert to ml
        }

        addWaterLog({
            id: Date.now().toString(),
            dateTime: new Date().toISOString(),
            amount: amount
        });

        router.back();
    };

    return (
        <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('add_water')}</Text>
            </View>

            <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(60, keyboardHeight + 20) }]} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>{t('amount') || 'Amount'}</Text>
                
                <View style={styles.inputContainer}>
                    <TextInput 
                        style={styles.input} 
                        keyboardType="numeric" 
                        placeholder="0" 
                        placeholderTextColor={colors.textSecondary}
                        value={amountStr} 
                        onChangeText={setAmountStr} 
                    />
                    <View style={styles.unitToggle}>
                        <TouchableOpacity 
                            style={[styles.unitBtn, unit === 'ml' && styles.unitBtnActive]} 
                            onPress={() => setUnit('ml')}
                        >
                            <Text style={[styles.unitText, unit === 'ml' && styles.unitTextActive]}>ml</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.unitBtn, unit === 'L' && styles.unitBtnActive]} 
                            onPress={() => setUnit('L')}
                        >
                            <Text style={[styles.unitText, unit === 'L' && styles.unitTextActive]}>L</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.presets}>
                    <TouchableOpacity style={styles.presetBtn} onPress={() => { setAmountStr('250'); setUnit('ml'); }}><Text style={styles.presetText}>250 ml (1 {t('glass', { count: 1 })})</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.presetBtn} onPress={() => { setAmountStr('500'); setUnit('ml'); }}><Text style={styles.presetText}>500 ml</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.presetBtn} onPress={() => { setAmountStr('1'); setUnit('L'); }}><Text style={styles.presetText}>1 L</Text></TouchableOpacity>
                </View>

            </ScrollView>

            <View style={[styles.footer, keyboardHeight > 0 && { paddingBottom: keyboardHeight + 12 }]}>
                <TouchableOpacity style={[styles.button, (!amountStr || parseFloat(amountStr.replace(',', '.')) <= 0) && styles.buttonDisabled]} onPress={handleSubmit} disabled={!amountStr || parseFloat(amountStr.replace(',', '.')) <= 0}>
                    <Text style={styles.buttonText}>{t('save')}</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    backButton: { padding: 4 },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '600', color: colors.text, marginLeft: 12 },
    scrollView: { flex: 1 },
    scrollContent: { padding: 20 },
    label: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    input: { flex: 1, backgroundColor: colors.surface, padding: 16, borderRadius: 12, fontSize: 24, borderWidth: 1, borderColor: colors.border, color: colors.text, fontWeight: 'bold' },
    unitToggle: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginLeft: 12, overflow: 'hidden' },
    unitBtn: { paddingVertical: 16, paddingHorizontal: 20 },
    unitBtnActive: { backgroundColor: '#3B82F6' },
    unitText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
    unitTextActive: { color: '#FFF' },
    presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    presetBtn: { backgroundColor: 'rgba(59, 130, 246, 0.1)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)' },
    presetText: { color: '#3B82F6', fontWeight: '600' },
    footer: { padding: 20, paddingBottom: 32 },
    button: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 12, alignItems: 'center' },
    buttonDisabled: { backgroundColor: '#D1D5DB' },
    buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
