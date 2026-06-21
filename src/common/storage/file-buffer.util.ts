import { BadRequestException } from '@nestjs/common';

export const ALLOWED_IMAGE_AND_PDF_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export function decodeBase64Payload(fileBase64: string): Buffer {
  const trimmed = fileBase64.trim();
  if (!trimmed) {
    throw new BadRequestException('File payload is empty.');
  }

  const normalized = trimmed.includes(',')
    ? trimmed.split(',').pop()!.trim()
    : trimmed;

  if (!/^[A-Za-z0-9+/=\s]+$/.test(normalized)) {
    throw new BadRequestException('File payload is not valid base64.');
  }

  const buffer = Buffer.from(normalized.replace(/\s/g, ''), 'base64');
  if (buffer.length === 0) {
    throw new BadRequestException('File payload decoded to an empty file.');
  }

  return buffer;
}

export function decodeImageBase64(payload: string): { buffer: Buffer; ext: string } {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new BadRequestException('Image payload is empty.');
  }

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    const mime = dataUrlMatch[1].toLowerCase();
    const ext =
      mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(dataUrlMatch[2], 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException('Image payload decoded to an empty image.');
    }
    return { buffer, ext };
  }

  const normalized = trimmed.includes(',')
    ? trimmed.split(',').pop()!.trim()
    : trimmed;
  const buffer = Buffer.from(normalized.replace(/\s/g, ''), 'base64');
  if (buffer.length === 0) {
    throw new BadRequestException('Image payload decoded to an empty image.');
  }
  return { buffer, ext: 'jpg' };
}

export function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.subarray(0, 4).toString() === '%PDF') {
    return 'application/pdf';
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  if (isJpeg) return 'image/jpeg';

  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  if (isPng) return 'image/png';

  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString() === 'RIFF' &&
    buffer.subarray(8, 12).toString() === 'WEBP';
  if (isWebp) return 'image/webp';

  return null;
}

export function validateImageOrPdfBuffer(buffer: Buffer, mimeType: string): void {
  const mime = mimeType.toLowerCase();
  const detected = detectMimeFromBuffer(buffer);

  if (!detected) {
    throw new BadRequestException(
      'Unable to detect a supported file type from file content.',
    );
  }

  if (detected !== mime) {
    throw new BadRequestException(
      `Declared MIME type "${mimeType}" does not match file content (${detected}).`,
    );
  }
}

export function extensionForMime(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

export function sanitizeStorageLabel(label: string): string {
  return label.trim().replace(/[/\\?%*:|"<>]/g, '_').slice(0, 120);
}

export function isHttpUrl(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
}
