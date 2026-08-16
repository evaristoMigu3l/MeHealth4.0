import { useCallback, useMemo } from 'react';
import { useThemeStore } from '../stores/useThemeStore';
import { translations, Language } from '../utils/i18n';

/**
 * Translation helper.
 *
 * `t` and the returned object are memoized per language. Previously both were
 * rebuilt on every render, so any component that passed `t` down (or used it in
 * a dependency array) re-rendered its whole subtree continuously.
 */
export function useTranslation() {
    const language = useThemeStore((state) => state.language);

    const t = useCallback(
        (key: keyof typeof translations, params?: Record<string, string | number>) => {
            const langDict = translations[key];
            if (!langDict) {
                console.warn(`Translation missing for key: ${key}`);
                return key;
            }

            let text = langDict[language as Language] || langDict['en'];

            if (params) {
                Object.entries(params).forEach(([paramKey, paramValue]) => {
                    text = text.replace(`{${paramKey}}`, String(paramValue));
                });
            }

            return text;
        },
        [language],
    );

    return useMemo(() => ({ t, language }), [t, language]);
}
