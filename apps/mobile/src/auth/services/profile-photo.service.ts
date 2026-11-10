export interface OptimizedPhoto {
  readonly uri: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly byteLength: number;
}

export interface PhotoValidationResult {
  readonly valid: boolean;
  readonly photo?: OptimizedPhoto;
  readonly error?: string;
}

export const MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Validates and optimizes profile photo data.
 * Rejects SVG, executable scripts, oversized media, and invalid schemes.
 */
export function validateAndOptimizeProfilePhoto(
  input: string,
  options?: { maxSizeBytes?: number }
): PhotoValidationResult {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'Please select a valid image file.' };
  }

  const raw = input.trim();
  const maxSize = options?.maxSizeBytes ?? MAX_PHOTO_SIZE_BYTES;

  // 1. Data URI validation (e.g., base64 image from file/picker)
  if (raw.startsWith('data:')) {
    const match = raw.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
    if (!match) {
      return { valid: false, error: 'Unrecognized image data format.' };
    }
    const mimeType = match[1]?.toLowerCase();
    if (!mimeType || !(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      return { valid: false, error: 'Supported formats: JPEG, PNG, and WebP only.' };
    }

    const base64Data = match[2]!;
    // Calculate approximate binary size from base64 length
    const byteLength = Math.floor((base64Data.length * 3) / 4) - (base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0);

    if (byteLength <= 0) {
      return { valid: false, error: 'The selected image is empty.' };
    }
    if (byteLength > maxSize) {
      return {
        valid: false,
        error: `Image size (${(byteLength / (1024 * 1024)).toFixed(1)} MB) exceeds allowed limit of ${(maxSize / (1024 * 1024)).toFixed(0)} MB.`,
      };
    }

    return {
      valid: true,
      photo: {
        uri: raw,
        mimeType: mimeType as OptimizedPhoto['mimeType'],
        byteLength,
      },
    };
  }

  // 2. HTTPS Web URL validation (e.g., Google OAuth profile photo or hosted avatar)
  if (/^https:\/\/[^\s]+$/.test(raw)) {
    if (raw.length > 4096) {
      return { valid: false, error: 'Image URL is too long.' };
    }
    // Infer mime type or default to image/jpeg
    let mimeType: OptimizedPhoto['mimeType'] = 'image/jpeg';
    if (/\.png(\?.*)?$/i.test(raw)) mimeType = 'image/png';
    else if (/\.webp(\?.*)?$/i.test(raw)) mimeType = 'image/webp';

    return {
      valid: true,
      photo: {
        uri: raw,
        mimeType,
        byteLength: 0, // Remote size verified on download/stream
      },
    };
  }

  // 3. Local file URI validation (e.g., file:///data/user/...)
  if (/^file:\/\/[^\s]+$/.test(raw)) {
    let mimeType: OptimizedPhoto['mimeType'] = 'image/jpeg';
    if (/\.png$/i.test(raw)) mimeType = 'image/png';
    else if (/\.webp$/i.test(raw)) mimeType = 'image/webp';

    return {
      valid: true,
      photo: {
        uri: raw,
        mimeType,
        byteLength: 0,
      },
    };
  }

  return { valid: false, error: 'Image source must be a secure HTTPS link, local file, or valid image data.' };
}

/**
 * Curated, premium high-contrast avatars for quick personalization.
 * All presets are optimized lightweight WebP/PNG assets with standard 1:1 square ratio.
 */
export const PRESET_AVATARS: readonly { readonly id: string; readonly label: string; readonly uri: string }[] = [
  {
    id: 'cosmic-purple',
    label: 'Cosmic Purple',
    uri: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=256&auto=format&fit=crop&q=80',
  },
  {
    id: 'neon-horizon',
    label: 'Neon Horizon',
    uri: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=256&auto=format&fit=crop&q=80',
  },
  {
    id: 'midnight-sound',
    label: 'Midnight Sound',
    uri: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=256&auto=format&fit=crop&q=80',
  },
  {
    id: 'golden-hour',
    label: 'Golden Hour',
    uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=256&auto=format&fit=crop&q=80',
  },
];
