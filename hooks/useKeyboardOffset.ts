import { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, KeyboardEvent, Platform, useWindowDimensions } from 'react-native';

/**
 * Returns how many pixels of bottom padding a screen still needs so its input
 * stays above the software keyboard.
 *
 * Why this exists: on Android the behaviour depends on whether the window is
 * resized when the keyboard opens (adjustResize) or not (adjustPan, which is
 * what often happens with edge to edge on newer Android). Always padding by the
 * keyboard height would double shift on devices that resize; never padding
 * leaves the input under the keyboard on devices that do not. So we measure how
 * much the window already shrank and only pad the difference.
 *
 * Behaves the same in Expo Go and in a release APK.
 */
export function useKeyboardOffset() {
    const { height: windowHeight } = useWindowDimensions();
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const fullHeight = useRef(Dimensions.get('window').height);

    // The tallest window height we have seen is the height with no keyboard.
    if (windowHeight > fullHeight.current) fullHeight.current = windowHeight;

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const onShow = (event: KeyboardEvent) => setKeyboardHeight(event.endCoordinates?.height || 0);
        const onHide = () => setKeyboardHeight(0);

        const showSub = Keyboard.addListener(showEvent, onShow);
        const hideSub = Keyboard.addListener(hideEvent, onHide);
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const alreadyShrunk = Math.max(0, fullHeight.current - windowHeight);
    const offset = Math.max(0, keyboardHeight - alreadyShrunk);

    return {
        /** Extra bottom padding needed so content clears the keyboard. */
        keyboardOffset: offset,
        /** Raw keyboard height reported by the OS. */
        keyboardHeight,
        /** True while the keyboard is open. */
        isKeyboardVisible: keyboardHeight > 0,
    };
}
