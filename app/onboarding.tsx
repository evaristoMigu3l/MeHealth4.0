import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';
import { useKeyboardLayout } from '../hooks/useKeyboardLayout';
import { useRouter } from 'expo-router';
import { useUserStore } from '../stores/useUserStore';

/**
 * First-run profile screen.
 *
 * Same fix as the auth screen: no <KeyboardAvoidingView behavior="height"> on
 * Android (it fights the window resize and makes the fields strobe). The
 * leftover keyboard space is added as padding instead.
 */
export default function OnboardingScreen() {
    const { colors } = useAppTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { keyboardOffset, isKeyboardVisible } = useKeyboardLayout();
    const setProfile = useUserStore((state) => state.setProfile);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');

    const handleSubmit = () => {
        if (!name.trim()) return;
        setProfile({ name, email, dob: '', gender: 'Male', ethnicity: '' });
        router.replace('/(tabs)');
    };

    const bottomSpace = isKeyboardVisible ? keyboardOffset + 16 : Math.max(insets.bottom, 24);

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.content, { paddingTop: insets.top + 40 }]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
            >
                <Text style={styles.title}>Welcome!</Text>
                <Text style={styles.subtitle}>Let's set up your health profile</Text>

                <Text style={styles.label}>Name *</Text>
                <TextInput placeholderTextColor={colors.textSecondary}
                    style={styles.input}
                    placeholder="Enter your name"
                    value={name}
                    onChangeText={setName}
                    autoCorrect={false}
                />

                <Text style={styles.label}>Email</Text>
                <TextInput placeholderTextColor={colors.textSecondary}
                    style={styles.input}
                    placeholder="your@email.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: bottomSpace }]}>
                <TouchableOpacity
                    style={[styles.button, !name.trim() && styles.buttonDisabled]}
                    onPress={handleSubmit}
                    disabled={!name.trim()}
                >
                    <Text style={styles.buttonText}>Continue</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        flexGrow: 1,
        padding: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        marginBottom: 32,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 8,
    },
    input: {
        backgroundColor: colors.surface,
        padding: 16,
        borderRadius: 12,
        fontSize: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: colors.border,
        color: colors.text,
    },
    footer: {
        paddingHorizontal: 24,
        paddingTop: 12,
    },
    button: {
        backgroundColor: '#3B82F6',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonDisabled: {
        backgroundColor: '#D1D5DB',
    },
    buttonText: {
        color: colors.surface,
        fontSize: 16,
        fontWeight: '600',
    },
});
