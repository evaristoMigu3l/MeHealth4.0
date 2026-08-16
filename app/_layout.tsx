import "../global.css";
import { Stack, useRouter, useSegments, useNavigationContainerRef } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useAppTheme } from '../hooks/useAppTheme';
import { useEffect, useState, useRef, useMemo } from 'react';
import { AppState, AppStateStatus, View, Modal, LogBox } from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import { useCloudStore } from '../stores/useCloudStore';
import { initCloudSync } from '../utils/supabase/syncEngine';
import LockScreen from '../components/LockScreen';
import * as SplashScreen from 'expo-splash-screen';
import { migrateAttachmentsToPersistentStorage } from '../utils/migrateAttachments';
import { onAppFrameLayout } from '../hooks/useKeyboardLayout';

// Ignore specific warnings from expo-notifications in Expo Go
LogBox.ignoreLogs([
    'warnOfExpoGoPushUsage',
    'Calling getDevicePushTokenAsync',
    'expo-notifications: Android Push notifications',
    'SafeAreaView has been deprecated',
]);

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Boot the cloud sync engine as early as possible (module scope): it
// restores the persisted Supabase session and hydrates the stores.
initCloudSync();

/**
 * Auth gate (Supabase + expo-router protected-route pattern):
 *  - signed out  → force /auth
 *  - signed in   → leave /auth and enter the app
 * While the session is being restored ('initializing') we stay put and
 * keep the splash screen visible.
 *
 * IMPORTANT: the sync engine boots at module scope, so the session can
 * resolve BEFORE expo-router's NavigationContainer has mounted. Calling
 * router.replace() at that moment throws "Attempted to navigate before
 * mounting the Root Layout component". We therefore track container
 * readiness explicitly and only navigate once it flips to ready.
 */
function useProtectedRoute() {
    const segments = useSegments();
    const segmentPath = segments.join('/');
    const router = useRouter();
    const authStatus = useCloudStore((s) => s.authStatus);
    const navRef = useNavigationContainerRef();
    const [navReady, setNavReady] = useState(false);

    // Flip navReady once the root navigator reports ready. The 'state'
    // listener fires on the first navigation state commit, which is the
    // earliest reliable signal that router.replace() is safe.
    useEffect(() => {
        if (navRef.isReady()) {
            setNavReady(true);
            return;
        }
        const unsub = navRef.addListener('state', () => {
            if (navRef.isReady()) setNavReady(true);
        });
        return unsub;
    }, [navRef]);

    useEffect(() => {
        if (authStatus === 'initializing') return;
        if (!navReady) return; // navigator not mounted yet — wait
        const inAuthGroup = segmentPath.split('/')[0] === 'auth';
        if (authStatus === 'signedOut' && !inAuthGroup) {
            router.replace('/auth');
        } else if (authStatus === 'signedIn' && inAuthGroup) {
            router.replace('/');
        }
    }, [authStatus, segmentPath, navReady, router]);
}

export default function RootLayout() {
    const { isDark, colors } = useAppTheme();
    const hasPin = useAuthStore((s) => s.hasPin);
    const isLocked = useAuthStore((s) => s.isLocked);
    const setIsLocked = useAuthStore((s) => s.setIsLocked);
    const authStatus = useCloudStore((s) => s.authStatus);
    const appStateRef = useRef(AppState.currentState);
    const backgroundTime = useRef<number | null>(null);

    useProtectedRoute();

    // Lock on first launch if PIN exists
    useEffect(() => {
        if (hasPin) setIsLocked(true);
    }, []);

    // Migrate old cache-based attachment URIs to persistent storage (runs once)
    useEffect(() => {
        migrateAttachmentsToPersistentStorage();
    }, []);

    // Lock when app stays in background for more than 60 seconds
    useEffect(() => {
        const sub = AppState.addEventListener('change', (nextState) => {
            if (appStateRef.current === 'active' && nextState.match(/inactive|background/)) {
                backgroundTime.current = Date.now();
            } else if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
                if (hasPin && backgroundTime.current) {
                    const elapsed = Date.now() - backgroundTime.current;
                    // 5-minute grace period prevents locking when quickly using file pickers/camera
                    if (elapsed > 300000) {
                        setIsLocked(true);
                    }
                }
                backgroundTime.current = null;
            }
            appStateRef.current = nextState;
        });
        return () => sub.remove();
    }, [hasPin, setIsLocked]);

    // Hide splash screen once the session state is known (not before —
    // this prevents a flash of the wrong screen while auth restores).
    useEffect(() => {
        if (authStatus === 'initializing') return;
        // A small timeout ensures React Native has painted the first frame
        // with the correct theme colors, preventing any white flashes.
        const timer = setTimeout(() => {
            SplashScreen.hideAsync();
        }, 150);
        return () => clearTimeout(timer);
    }, [authStatus]);

    // Memoize the navigation theme so ThemeProvider receives a STABLE
    // object reference. Without this, every RootLayout render created a
    // brand-new theme object, forcing every theme consumer (i.e. the whole
    // navigation tree) to re-render — a major source of screen flicker.
    // `colors` is a module-level constant from useAppTheme, so this only
    // recomputes when the theme actually changes.
    const customTheme = useMemo(() => (isDark ? {
        ...DarkTheme,
        colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary }
    } : {
        ...DefaultTheme,
        colors: { ...DefaultTheme.colors, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary }
    }), [isDark, colors]);

    return (
        <ThemeProvider value={customTheme}>
            {/* App always stays mounted — no flicker on unlock */}
            <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={onAppFrameLayout}>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' }, animation: 'none' }}>
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen name="auth" options={{ headerShown: false }} />
                </Stack>
            </View>
            <StatusBar style={isDark ? "light" : "dark"} />

            {/* Lock screen rendered as an overlay Modal — app tree stays alive underneath */}
            <Modal
                visible={isLocked && hasPin && authStatus === 'signedIn'}
                transparent={false}
                animationType="none"
                statusBarTranslucent
                hardwareAccelerated
                onRequestClose={() => { /* prevent back button closing lock */ }}
            >
                <LockScreen mode="unlock" onSuccess={() => setIsLocked(false)} />
            </Modal>
        </ThemeProvider>
    );
}
