/**
 * Media Content Verification Result
 */
export interface IMediaContentValidationResult {
  readonly isValid: boolean;
  readonly detectedFormat?: string;
  readonly error?: string;
}

export interface IMediaContentValidator {
  validateSignature(
    bytes: Uint8Array,
    expectedContentType: string
  ): IMediaContentValidationResult;
  detectFormat(bytes: Uint8Array): string | null;
}

/**
 * Binary File Signature (Magic Bytes) Content Validator
 * Validates initial binary payload to prevent extension/MIME spoofing,
 * executable injection, and corrupted catalog media ingestion.
 * Adheres to OOP and Single Responsibility Principle (SRP).
 *
 * ARCHITECTURAL LIMITATIONS & SECURITY CONSIDERATIONS:
 * 1. Shallow Header Scope: This validator inspects only initial container header bytes (0-63).
 * 2. Polyglot Attack Limitation: Shallow magic byte checks cannot detect polyglot files
 *    (e.g., valid JPEG/MP3 header prepended to an executable or shell payload).
 * 3. Stream & Frame Integrity: Does not decode full media streams, verify container consistency,
 *    validate audio codecs, calculate true duration, or cleanse embedded metadata (EXIF/ID3).
 * 4. Catalog Ingestion Policy: Shallow validation is sufficient ONLY for personal media (avatars).
 *    Public catalog media MUST remain quarantined in staging until an asynchronous transcoding
 *    pipeline (FFmpeg / AWS MediaConvert) strips metadata, decodes audio, and verifies full streams.
 */
export class MediaContentValidator implements IMediaContentValidator {
  /**
   * Validates whether the binary header matches the claimed Content-Type.
   */
  public validateSignature(
    bytes: Uint8Array,
    expectedContentType: string
  ): IMediaContentValidationResult {
    if (!bytes || bytes.length < 4) {
      return {
        isValid: false,
        error: 'File content is too small to contain a valid media container header',
      };
    }

    const detected = this.detectFormat(bytes);

    if (!detected) {
      return {
        isValid: false,
        error: `Unrecognized media file signature. The uploaded binary does not match any allowed media format.`,
      };
    }

    // Normalized comparison for audio/video family compatibility
    const isMatching = this.isCompatibleType(detected, expectedContentType);

    if (!isMatching) {
      return {
        isValid: false,
        detectedFormat: detected,
        error: `Content-Type mismatch: Expected "${expectedContentType}" but binary magic bytes indicate "${detected}".`,
      };
    }

    return {
      isValid: true,
      detectedFormat: detected,
    };
  }

  /**
   * Detects the media MIME type from initial header bytes (up to 64 bytes).
   */
  public detectFormat(bytes: Uint8Array): string | null {
    if (bytes.length < 4) {
      return null;
    }

    // 1. JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }

    // 2. PNG: 89 50 4E 47 (0x89 'P' 'N' 'G')
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return 'image/png';
    }

    // 3. FLAC: 66 4C 61 43 ('f' 'L' 'a' 'C')
    if (
      bytes[0] === 0x66 &&
      bytes[1] === 0x4c &&
      bytes[2] === 0x61 &&
      bytes[3] === 0x43
    ) {
      return 'audio/flac';
    }

    // 4. RIFF formats: WAV and WEBP
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 && // 'R'
      bytes[1] === 0x49 && // 'I'
      bytes[2] === 0x46 && // 'F'
      bytes[3] === 0x46    // 'F'
    ) {
      // Bytes 8-11
      const subtype = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
      if (subtype === 'WEBP') {
        return 'image/webp';
      }
      if (subtype === 'WAVE') {
        return 'audio/wav';
      }
    }

    // 5. MP3 ID3 header: 49 44 33 ('I' 'D' '3')
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      return 'audio/mpeg';
    }

    // 6. MP3 raw frame sync: 11 bits set (0xFF 0xFB, 0xF3, 0xF2, 0xFA, 0xE0..)
    if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 0x18) !== 0x08) {
      return 'audio/mpeg';
    }

    // 7. MP4 / M4A / QuickTime: 'ftyp' at offset 4
    if (
      bytes.length >= 8 &&
      bytes[4] === 0x66 && // 'f'
      bytes[5] === 0x74 && // 't'
      bytes[6] === 0x79 && // 'y'
      bytes[7] === 0x70    // 'p'
    ) {
      // Check major brand
      if (bytes.length >= 12) {
        const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
        if (brand.startsWith('M4A') || brand.startsWith('M4B')) {
          return 'audio/mp4';
        }
      }
      return 'video/mp4';
    }

    // 8. Matroska / WebM EBML header: 1A 45 DF A3
    if (
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    ) {
      return 'video/webm';
    }

    return null;
  }

  private isCompatibleType(detected: string, expected: string): boolean {
    const normDetected = detected.toLowerCase();
    const normExpected = expected.toLowerCase();

    if (normDetected === normExpected) {
      return true;
    }

    // MP4 container compatibility: video/mp4 and audio/mp4/m4a/aac
    if (
      (normDetected === 'video/mp4' || normDetected === 'audio/mp4') &&
      (normExpected === 'video/mp4' ||
        normExpected === 'audio/mp4' ||
        normExpected === 'audio/m4a' ||
        normExpected === 'audio/aac')
    ) {
      return true;
    }

    // Audio/x-wav vs audio/wav
    if (
      (normDetected === 'audio/wav' && normExpected === 'audio/x-wav') ||
      (normDetected === 'audio/x-wav' && normExpected === 'audio/wav')
    ) {
      return true;
    }

    return false;
  }
}

