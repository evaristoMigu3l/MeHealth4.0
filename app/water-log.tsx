import { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useHealthStore } from '../stores/useHealthStore';
import { format, parseISO } from 'date-fns';
import { useTranslation } from '../hooks/useTranslation';
import { ptBR, enUS } from 'date-fns/locale';
import { useThemeStore } from '../stores/useThemeStore';

export default function WaterLogScreen() {

    const insets = useSafeAreaInsets();
    const { colors } = useAppTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const router = useRouter();
    const { t } = useTranslation();
    const { language } = useThemeStore();
    const dateLocale = language === 'pt' ? ptBR : enUS;
    const { waterLogs, removeWaterLog } = useHealthStore();

    const sortedLogs = useMemo(() => {
        return [...waterLogs].sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
    }, [waterLogs]);

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
                <Text style={styles.headerTitle}>{t('water')}</Text>
                <TouchableOpacity onPress={() => router.push('/add-water')}><Ionicons name="add" size={24} color="#3B82F6" /></TouchableOpacity>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.listContainer}>
                {sortedLogs.map(log => (
                    <View key={log.id} style={styles.card}>
                        <View style={styles.cardHeader}>
                            <View style={styles.categoryBadge}>
                                <Ionicons name="water" size={16} color="#3B82F6" />
                                <Text style={styles.categoryText}>{t('water')}</Text>
                            </View>
                            <Text style={styles.timeText}>{format(parseISO(log.dateTime), 'MMM d, HH:mm', { locale: dateLocale })}</Text>
                        </View>
                        <View style={styles.cardContent}>
                            <Text style={styles.activityTitle}>{log.amount >= 1000 ? `${(log.amount / 1000).toFixed(1)} L` : `${log.amount} ml`}</Text>
                        </View>
                        <View style={styles.cardActions}>
                            <TouchableOpacity style={styles.deleteButton} onPress={() => removeWaterLog(log.id)}>
                                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                <Text style={styles.deleteText}>{t('delete')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
                {sortedLogs.length === 0 && <Text style={styles.emptyText}>{t('no_logs') || 'No logs found.'}</Text>}
            </ScrollView>
        </View>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: 'space-between' },
    headerTitle: { fontSize: 20, fontWeight: '600', color: colors.text },
    content: { flex: 1 },
    listContainer: { paddingHorizontal: 16, paddingVertical: 20 },
    card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    categoryBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(59, 130, 246, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    categoryText: { color: '#3B82F6', fontSize: 12, fontWeight: '600', marginLeft: 4 },
    timeText: { fontSize: 12, color: colors.textSecondary },
    cardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    activityTitle: { fontSize: 22, fontWeight: 'bold', color: colors.text, flex: 1, marginRight: 12 },
    cardActions: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 4 },
    deleteButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
    deleteText: { fontSize: 14, color: '#EF4444', marginLeft: 4 },
    emptyText: { textAlign: 'center', color: colors.textSecondary, fontStyle: 'italic', marginTop: 40 },
});
