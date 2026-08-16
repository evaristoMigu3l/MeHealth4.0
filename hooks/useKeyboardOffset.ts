import { useKeyboardLayout } from './useKeyboardLayout';

/**
 * Returns how many pixels of bottom padding a screen still needs so its input
 * stays above the software keyboard.
 *
 * The measurement logic now lives in `useKeyboardLayout`, which compares the
 * real height of the app frame against the keyboard height. That means the
 * offset is 0 when Android already resized the window (Expo Go / adjustResize)
 * and equal to the keyboard height when it did not (edge-to-edge APK on
 * Android 15+), so screens never shift twice.
 */
export function useKeyboardOffset() {
    return useKeyboardLayout();
}
