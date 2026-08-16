import { useMemo, useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';
import { useKeyboardLayout } from '../hooks/useKeyboardLayout';
import { signInWithEmail, signUpWithEmail } from '../utils/supabase/authService';
import SecureTextField from '../components/ui/SecureTextField';

/**
 * Cloud account screen — sign in / create account.
 *
 * Shown instead of the app when there is no Supabase session. After a
 * successful sign-in the sync engine hydrates all stores from the cloud
 * (and runs the one-time legacy migration if local data exists), then
 * the router redirects into the app.
 *
 * Keyboard handling note: this screen used to wrap everything in a
 * <KeyboardAvoidingView behavior="height"> on Android. That behaviour feeds
 * its own measured height back into its layout, so when Android ALSO resized
 * the window for the keyboard the two never agreed on a final size — the
 * inputs, the button and every character being typed strobed on and off.
 * We now let the OS resize the window and only add the leftover keyboard
 * space ourselves (0 on adjustResize devices, the full height on
 * edge-to-edge Android 15+), which behaves the same in Expo Go and in an APK.
 */
export default function AuthScreen() {
    const { colors } = useAppTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { keyboardOffset, isKeyboardVisible } = useKeyboardLayout();

    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const switchMode = (next: 'signin' | 'signup') => {
        setMode(next);
        // The confirm field unmounts in sign-in mode, so drop its value with it.
        setConfirmPassword('');
        setError(null);
        setInfo(null);
    };

    const handleSubmit = async () => {
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail || !password) return;

        if (mode === 'signup') {
            if (password.length < 6) {
                setError(t('auth_password_hint'));
                return;
            }
            if (password !== confirmPassword) {
                setError(t('confirm_password') + ' ✗');
                return;
            }
        }

        setLoading(true);
        setError(null);
        setInfo(null);
        try {
            if (mode === 'signin') {
                const result = await signInWithEmail(trimmedEmail, password);
                if (!result.ok) {
                    setError(result.error || 'Sign in failed. Please try again.');
                }
                // On success the session change is observed by the sync
                // engine; the root layout redirects once authStatus
                // becomes 'signedIn'.
            } else {
                const result = await signUpWithEmail(trimmedEmail, password, '');
                if (!result.ok) {
                    setError(result.error || 'Could not create the account. Please try again.');
                } else if (result.needsEmailConfirmation) {
                    setInfo(t('auth_check_email'));
                    setMode('signin');
                }
                // If email confirmation is disabled, signUp already created
                // a session and the redirect happens automatically.
            }
        } catch (err: any) {
            setError(err?.message || 'Authentication failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const bottomSpace = (isKeyboardVisible ? keyboardOffset : insets.bottom) + 32;

    // Stable array so the memoised password field is not re-rendered for a
    // style object that never actually changes.
    const passwordInputStyle = useMemo(() => [styles.input, styles.inputFlush], [styles]);

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[
                    styles.scroll,
                    { paddingTop: insets.top + 48, paddingBottom: bottomSpace },
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
            >
                <Text style={styles.title}>
                    {mode === 'signin' ? t('auth_welcome_back') : t('auth_create_account')}
                </Text>
                <Text style={styles.subtitle}>
                    {mode === 'signin' ? t('auth_subtitle_signin') : t('auth_subtitle_signup')}
                </Text>

                <Text style={styles.label}>{t('email')}</Text>
                <TextInput
                    style={styles.input}
                    placeholder="your@email.com"
                    placeholderTextColor={colors.textSecondary}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    submitBehavior="submit"
                />

                <Text style={styles.label}>{t('password')}</Text>
                <SecureTextField
                    containerStyle={styles.fieldWrap}
                    inputStyle={passwordInputStyle}
                    iconColor={colors.textSecondary}
                    placeholder={t('auth_password_hint')}
                    placeholderTextColor={colors.textSecondary}
                    onChangeText={setPassword}
                    textContentType={mode === 'signin' ? 'password' : 'newPassword'}
                    returnKeyType={mode === 'signin' ? 'go' : 'next'}
                    onSubmitEditing={mode === 'signin' ? handleSubmit : undefined}
                />

                {mode === 'signup' && (
                    <>
                        <Text style={styles.label}>{t('confirm_password')}</Text>
                        <SecureTextField
                            containerStyle={styles.fieldWrap}
                            inputStyle={passwordInputStyle}
                            iconColor={colors.textSecondary}
                            placeholder={t('confirm_password')}
                            placeholderTextColor={colors.textSecondary}
                            onChangeText={setConfirmPassword}
                            textContentType="newPassword"
                            returnKeyType="go"
                            onSubmitEditing={handleSubmit}
                        />
                    </>
                )}

                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                {info ? <Text style={styles.infoText}>{info}</Text> : null}

                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleSubmit}
                    disabled={loading || !email.trim() || !password}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>
                            {mode === 'signin' ? t('sign_in') : t('sign_up')}
                        </Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.switchButton} onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
                    <Text style={styles.switchText}>
                        {mode === 'signin' ? t('no_account') : t('have_account')}{' '}
                        <Text style={styles.switchLink}>
                            {mode === 'signin' ? t('sign_up') : t('sign_in')}
                        </Text>
                    </Text>
                </TouchableOpacity>
            </ScrollView>
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
    scroll: {
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
    fieldWrap: {
        marginBottom: 20,
    },
    inputFlush: {
        marginBottom: 0,
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
    button: {
        backgroundColor: '#3B82F6',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        backgroundColor: '#93C5FD',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    switchButton: {
        marginTop: 20,
        alignItems: 'center',
    },
    switchText: {
        color: colors.textSecondary,
        fontSize: 14,
    },
    switchLink: {
        color: '#3B82F6',
        fontWeight: '600',
    },
    errorText: {
        color: '#EF4444',
        fontSize: 14,
        marginBottom: 12,
    },
    infoText: {
        color: '#3B82F6',
        fontSize: 14,
        marginBottom: 12,
    },
});
