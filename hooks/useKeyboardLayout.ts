import { useSyncExternalStore } from 'react';
import { Dimensions, Keyboard, KeyboardEvent, LayoutChangeEvent, Platform } from 'react-native';

/**
 * Single source of truth for "how much room does the software keyboard still
 * steal from my screen?".
 *
 * Why this exists
 * ---------------
 * On Android the answer depends on something the JS side cannot know up front:
 *
 *  - Classic `adjustResize` (Expo Go, most phones, APKs on Android <= 14):
 *    the OS shrinks the app window, so the layout ALREADY moved out of the way.
 *    Adding our own padding on top of that pushes the content up twice, which
 *    is what covered/squashed the AI chat messages and hid the header.
 *
 *  - Edge-to-edge Android 15+ (what a release APK gets with
 *    `edgeToEdgeEnabled: true`): the window does NOT shrink, the keyboard is
 *    drawn over the app, so we MUST pad by the keyboard height ourselves.
 *
 * Instead of guessing, we measure. The root layout reports the real height of
 * the app frame (`onAppFrameLayout`); the difference between the tallest frame
 * we ever saw and the current one is how much the OS already absorbed. The
 * padding we hand out is only the remainder, so the behaviour is identical in
 * Expo Go and in an installed APK.
 *
 * Everything lives in one module-level store, so ten screens listening to the
 * keyboard cost exactly one set of native listeners, and every consumer is
 * updated in the same React commit (no dueling re-renders = no flicker).
 */

export type KeyboardLayout = {
    /** Extra bottom padding needed so content clears the keyboard. */
    keyboardOffset: number;
    /** Raw keyboard height reported by the OS. */
    keyboardHeight: number;
    /** True while the keyboard is open. */
    isKeyboardVisible: boolean;
};

const EMPTY: KeyboardLayout = { keyboardOffset: 0, keyboardHeight: 0, isKeyboardVisible: false };

let snapshot: KeyboardLayout = EMPTY;

let keyboardHeight = 0;
let frameHeight = 0;            // live height of the root app view (0 = not measured yet)
let restingFrameHeight = 0;     // tallest frame height seen with the keyboard closed
let windowHeight = Math.round(Dimensions.get('window').height);
let windowWidth = Math.round(Dimensions.get('window').width);
let restingWindowHeight = windowHeight;

const listeners = new Set<() => void>();
let publishTimer: ReturnType<typeof setTimeout> | null = null;

/** How many pixels of the keyboard the OS already took care of by resizing. */
function absorbedByWindow(): number {
    if (frameHeight > 0 && restingFrameHeight > 0) {
        return Math.max(0, restingFrameHeight - frameHeight);
    }
    return Math.max(0, restingWindowHeight - windowHeight);
}

function computeSnapshot(): KeyboardLayout {
    if (keyboardHeight <= 0) return EMPTY;
    const remaining = keyboardHeight - absorbedByWindow();
    return {
        // Sub-pixel noise must never turn into a state update, otherwise the
        // layout oscillates by a pixel forever (the "lightbulb" flicker).
        keyboardOffset: remaining > 2 ? Math.round(remaining) : 0,
        keyboardHeight,
        isKeyboardVisible: true,
    };
}

function publish(): void {
    publishTimer = null;
    const next = computeSnapshot();
    if (
        next.keyboardOffset === snapshot.keyboardOffset &&
        next.keyboardHeight === snapshot.keyboardHeight &&
        next.isKeyboardVisible === snapshot.isKeyboardVisible
    ) {
        return; // nothing changed -> no re-render at all
    }
    snapshot = next;
    listeners.forEach((listener) => listener());
}

/**
 * Keyboard events and the window resize they trigger arrive a few milliseconds
 * apart. Coalescing them into a single publish means the UI moves once instead
 * of jumping to a wrong position and correcting itself one frame later.
 */
function schedulePublish(): void {
    if (publishTimer !== null) return;
    publishTimer = setTimeout(publish, 32);
}

function onKeyboardShow(event: KeyboardEvent): void {
    const height = Math.round(event?.endCoordinates?.height ?? 0);
    if (height === keyboardHeight) return;
    keyboardHeight = height;
    schedulePublish();
}

function onKeyboardHide(): void {
    if (keyboardHeight === 0) return;
    keyboardHeight = 0;
    // Closing must feel instant, and there is no "wrong intermediate value"
    // risk here, so skip the coalescing delay.
    if (publishTimer !== null) {
        clearTimeout(publishTimer);
        publishTimer = null;
    }
    publish();
}

// iOS reports the keyboard before it animates, Android only after it is up.
const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

Keyboard.addListener(showEvent, onKeyboardShow);
Keyboard.addListener(hideEvent, onKeyboardHide);

Dimensions.addEventListener('change', ({ window }) => {
    const height = Math.round(window.height);
    const width = Math.round(window.width);

    if (width !== windowWidth) {
        // Rotation (or a fold): every "resting" measurement is stale now.
        windowWidth = width;
        restingWindowHeight = height;
        restingFrameHeight = 0;
        frameHeight = 0;
    }

    windowHeight = height;
    if (keyboardHeight === 0 && height > restingWindowHeight) restingWindowHeight = height;
    schedulePublish();
});

/**
 * Reports the measured height of the root app view. Wire it up once, on the
 * outermost View of the root layout:
 *
 *   <View style={{ flex: 1 }} onLayout={onAppFrameLayout}>
 *
 * It is a stable module-level function, so it never invalidates a memo and
 * never causes an extra render by itself.
 */
export function onAppFrameLayout(event: LayoutChangeEvent): void {
    const height = Math.round(event?.nativeEvent?.layout?.height ?? 0);
    if (height <= 0 || height === frameHeight) return;

    frameHeight = height;
    if (keyboardHeight === 0 && height > restingFrameHeight) restingFrameHeight = height;
    schedulePublish();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot(): KeyboardLayout {
    return snapshot;
}

/** Keyboard state shared by every screen. Re-renders only on real changes. */
export function useKeyboardLayout(): KeyboardLayout {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
