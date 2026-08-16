import { useKeyboardLayout } from './useKeyboardLayout';

/**
 * Bottom spacing a screen still has to add for the keyboard.
 *
 * Kept under the old name so existing screens keep working, but it now returns
 * the *effective* offset instead of the raw keyboard height: when Android
 * already shrank the window there is nothing left to pad, and padding anyway
 * was pushing form content out of view.
 *
 * Use `useKeyboardLayout()` if you need the raw height or the visibility flag.
 */
export function useKeyboardHeight(): number {
    return useKeyboardLayout().keyboardOffset;
}
