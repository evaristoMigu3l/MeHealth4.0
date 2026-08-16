import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
    StyleSheet, TextInput, TouchableOpacity, View,
    type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Password / secret input that does not strobe while you type.
 *
 * Why this exists
 * ---------------
 * A normal controlled field (`value={password} onChangeText={setPassword}`)
 * sends every keystroke to JS and then sends the whole string back down to the
 * native EditText. On Android a secure field re-applies its masking transform
 * whenever its text is set, so that round-trip restarts the "show the last
 * letter, then hide it" animation on EVERY character — the letters appear and
 * vanish over and over while typing. With React 19 the state update can also
 * land a frame late, so the field is briefly re-set to the previous string,
 * which makes the character visibly blink.
 *
 * The fix is to stop echoing the text back: the native input keeps its own
 * text (uncontrolled) and we only listen to it. The parent still receives
 * every change through `onChangeText`, so validation and submit buttons work
 * exactly as before.
 *
 * `value` is still accepted, but it is only used to PUSH text in from the
 * outside (loading a saved key, clearing a field after save). Text that came
 * from typing is never pushed back, so it can never fight the keyboard.
 */

type Props = {
    /** External value. Only applied when it differs from what the field holds. */
    value?: string;
    onChangeText: (text: string) => void;
    /** Masking when `showToggle` is false (the parent owns the eye button). */
    secureTextEntry?: boolean;
    /** Render the built-in eye button and own the reveal state. */
    showToggle?: boolean;
    inputStyle?: StyleProp<TextStyle>;
    containerStyle?: StyleProp<ViewStyle>;
    iconColor?: string;
    placeholder?: string;
    placeholderTextColor?: string;
    textContentType?: TextInputProps['textContentType'];
    returnKeyType?: TextInputProps['returnKeyType'];
    onSubmitEditing?: () => void;
    editable?: boolean;
    testID?: string;
};

function SecureTextField({
    value,
    onChangeText,
    secureTextEntry = true,
    showToggle = true,
    inputStyle,
    containerStyle,
    iconColor,
    placeholder,
    placeholderTextColor,
    textContentType,
    returnKeyType,
    onSubmitEditing,
    editable,
    testID,
}: Props) {
    const inputRef = useRef<TextInput>(null);
    /** What the native field currently holds, tracked without re-rendering. */
    const textRef = useRef(value ?? '');
    /**
     * The only thing that ever writes text into the native field. `id` changes
     * exclusively for external updates, which remounts the input with the new
     * text. Typing never touches it, so typing never rewrites the field.
     */
    const [seed, setSeed] = useState(() => ({ id: 0, text: value ?? '' }));
    const [revealed, setRevealed] = useState(false);
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (value === undefined || value === textRef.current) return;
        textRef.current = value;
        setSeed((prev) => ({ id: prev.id + 1, text: value }));
    }, [value]);

    const handleChangeText = useCallback(
        (text: string) => {
            textRef.current = text;
            onChangeText(text);
        },
        [onChangeText],
    );

    // Android moves the caret to position 0 when the input type flips between
    // masked and visible. Put it back at the end so revealing a password does
    // not scramble the next character you type.
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const end = textRef.current.length;
        const frame = requestAnimationFrame(() => {
            inputRef.current?.setSelection(end, end);
        });
        return () => cancelAnimationFrame(frame);
    }, [revealed]);

    const masked = showToggle ? !revealed : secureTextEntry;

    const field = (
        <TextInput
            key={seed.id}
            ref={inputRef}
            style={showToggle ? [inputStyle, styles.inputWithToggle] : inputStyle}
            defaultValue={seed.text}
            onChangeText={handleChangeText}
            secureTextEntry={masked}
            placeholder={placeholder}
            placeholderTextColor={placeholderTextColor}
            textContentType={textContentType}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            editable={editable}
            testID={testID}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            disableFullscreenUI
        />
    );

    if (!showToggle) return field;

    return (
        <View style={[styles.wrap, containerStyle]}>
            {field}
            <TouchableOpacity
                style={styles.toggle}
                onPress={() => setRevealed((prev) => !prev)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            >
                <Ionicons
                    name={revealed ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={iconColor}
                />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'relative',
        justifyContent: 'center',
    },
    // Room for the eye button so long passwords do not run under it.
    inputWithToggle: {
        paddingRight: 48,
        marginBottom: 0,
    },
    toggle: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default memo(SecureTextField);
