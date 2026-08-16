import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useThemeStore } from '../stores/useThemeStore';

type ThemeColors = {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    primary: string;
    card: string;
};

const lightColors: ThemeColors = {
    background: '#F8F9FA',
    surface: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#6B7280',
    border: '#F3F4F6',
    primary: '#6366F1', // Indigo primary usually used
    card: '#FFFFFF',
};

const darkColors: ThemeColors = {
    background: '#0F172A', // Slate 900
    surface: '#1E293B', // Slate 800
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    border: '#334155',
    primary: '#818CF8',
    card: '#1E293B',
};

/**
 * App colours for the active theme.
 *
 * The returned object is memoized: it keeps the SAME identity between renders
 * as long as the theme does not change. Screens use `colors` as the dependency
 * of their `useMemo(() => getStyles(colors), [colors])`, so a stable identity
 * is what stops every screen from rebuilding its stylesheet (and re-mounting
 * its inputs) on every single keystroke.
 */
export function useAppTheme() {
    const themePreference = useThemeStore((state) => state.themePreference);
    const systemColorScheme = useColorScheme();

    const isDark =
        themePreference === 'dark' ||
        (themePreference === 'system' && systemColorScheme === 'dark');

    return useMemo(
        () => ({
            isDark,
            colors: isDark ? darkColors : lightColors,
        }),
        [isDark],
    );
}
