import fs from 'fs';
import { ALLOWED_MIME_TYPES } from '../constants';

const fsp = fs.promises;

export function safeFilename(originalName: string): string {
  return originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(-120);
}

export async function detectMimeTypeFromSignature(
  filePath: string,
): Promise<string | null> {
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(12);
    await handle.read(buffer, 0, 12, 0);

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'image/png';
    }

    return null;
  } finally {
    await handle.close();
  }
}

export async function validateFileSignatures(
  files: Express.Multer.File[],
): Promise<boolean> {
  for (const file of files) {
    const detectedType = await detectMimeTypeFromSignature(file.path);
    if (
      !detectedType ||
      !ALLOWED_MIME_TYPES.includes(detectedType as (typeof ALLOWED_MIME_TYPES)[number])
    ) {
      return false;
    }
  }

  return true;
}

export async function cleanupUploadedFiles(
  files: Express.Multer.File[],
): Promise<void> {
  await Promise.allSettled(
    files
      .map((file) => file.path)
      .filter(Boolean)
      .map((filePath) => fsp.unlink(filePath)),
  );
}
