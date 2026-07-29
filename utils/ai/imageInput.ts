import * as ImagePicker from 'expo-image-picker';
import {
    VISION_JPEG_QUALITY,
    VISION_MAX_IMAGE_BYTES,
} from './config';
import { AttachedImage } from './types';

/**
 * Picking a photo for the assistant.
 *
 * The photo never leaves the phone unless the user sends the message, and even
 * then only the compressed bytes go to the vision model. The local uri is kept
 * so the same picture can be attached to a health record.
 */

export class ImageInputError extends Error {
    code: 'PERMISSION' | 'CANCELLED' | 'TOO_LARGE' | 'READ_FAILED';
    constructor(code: ImageInputError['code'], message: string) {
        super(message);
        this.code = code;
    }
}

/** base64 carries 4 characters per 3 bytes, so this is close enough to check size. */
function approximateBytes(base64: string): number {
    return Math.floor((base64.length * 3) / 4);
}

function toAttached(asset: ImagePicker.ImagePickerAsset): AttachedImage {
    const base64 = asset.base64 || '';
    if (!base64) {
        throw new ImageInputError('READ_FAILED', 'The photo could not be read. Try another one.');
    }

    const bytes = approximateBytes(base64);
    if (bytes > VISION_MAX_IMAGE_BYTES) {
        const mb = (bytes / (1024 * 1024)).toFixed(1);
        throw new ImageInputError(
            'TOO_LARGE',
            'That photo is about ' + mb + ' MB, which is too large to analyse. Take it again at a lower resolution.'
        );
    }

    return {
        uri: asset.uri,
        base64,
        mimeType: asset.mimeType || 'image/jpeg',
        width: asset.width,
        height: asset.height,
        bytes,
    };
}

/** Shared options: compressed JPEG, base64 included, no editing step. */
const PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: VISION_JPEG_QUALITY,
    base64: true,
    exif: false,
    allowsMultipleSelection: false,
};

/** Opens the gallery. Returns null when the user backs out. */
export async function pickImageFromLibrary(): Promise<AttachedImage | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        throw new ImageInputError('PERMISSION', 'Photo access was denied. Allow it in the system settings to attach pictures.');
    }

    const result = await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
    if (result.canceled || !result.assets?.length) return null;
    return toAttached(result.assets[0]);
}

/** Opens the camera. Returns null when the user backs out. */
export async function takePhoto(): Promise<AttachedImage | null> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
        throw new ImageInputError('PERMISSION', 'Camera access was denied. Allow it in the system settings to take pictures.');
    }

    const result = await ImagePicker.launchCameraAsync(PICK_OPTIONS);
    if (result.canceled || !result.assets?.length) return null;
    return toAttached(result.assets[0]);
}

/* ------------------------------------------------------------ last image */

/**
 * The most recent photo of this conversation. Held in memory only (never
 * persisted, never written to AsyncStorage) so the text model can ask follow-up
 * questions about it through the analyze_image tool.
 */
let lastImage: AttachedImage | null = null;

export function setLastImage(image: AttachedImage | null): void {
    lastImage = image;
}

export function getLastImage(): AttachedImage | null {
    return lastImage;
}

export function clearLastImage(): void {
    lastImage = null;
}

/** Human readable size, used in the attachment chip. */
export function describeSize(image: AttachedImage): string {
    const kb = image.bytes / 1024;
    if (kb < 1024) return Math.round(kb) + ' KB';
    return (kb / 1024).toFixed(1) + ' MB';
}
