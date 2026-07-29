import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform } from 'react-native';

export function useKeyboardHeight() {
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        const onKeyboardDidShow = (e: KeyboardEvent) => {
            setKeyboardHeight(e.endCoordinates.height);
        };

        const onKeyboardDidHide = () => {
            setKeyboardHeight(0);
        };

        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSubscription = Keyboard.addListener(showEvent, onKeyboardDidShow);
        const hideSubscription = Keyboard.addListener(hideEvent, onKeyboardDidHide);

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    return keyboardHeight;
}
