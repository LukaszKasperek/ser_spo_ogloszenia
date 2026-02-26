import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupUploadedFiles,
  detectMimeTypeFromSignature,
  safeFilename,
  validateFileSignatures,
} from '../../src/utils/fileHelpers';

const createdFiles: string[] = [];

async function createTempFile(name: string, bytes: number[]): Promise<string> {
  const filePath = path.join(
    os.tmpdir(),
    `spotted-vitest-${Date.now()}-${Math.random()}-${name}`,
  );
  await fs.writeFile(filePath, Buffer.from(bytes));
  createdFiles.push(filePath);
  return filePath;
}

afterEach(async () => {
  await Promise.allSettled(createdFiles.map((filePath) => fs.unlink(filePath)));
  createdFiles.length = 0;
});

describe('safeFilename', () => {
  it('zamienia niedozwolone znaki na podkreślniki', () => {
    const result = safeFilename('te@st plik(1).png');

    expect(result).toBe('te_st_plik_1_.png');
  });
});

describe('detectMimeTypeFromSignature', () => {
  it('wykrywa JPEG po sygnaturze pliku', async () => {
    const filePath = await createTempFile('photo.jpg', [0xff, 0xd8, 0xff, 0x00]);

    const mimeType = await detectMimeTypeFromSignature(filePath);
    expect(mimeType).toBe('image/jpeg');
  });

  it('wykrywa PNG po sygnaturze pliku', async () => {
    const filePath = await createTempFile('photo.png', [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    const mimeType = await detectMimeTypeFromSignature(filePath);
    expect(mimeType).toBe('image/png');
  });

  it('zwraca null dla nieobsługiwanej sygnatury', async () => {
    const filePath = await createTempFile('file.bin', [0x00, 0x01, 0x02, 0x03]);

    const mimeType = await detectMimeTypeFromSignature(filePath);
    expect(mimeType).toBeNull();
  });
});

describe('validateFileSignatures', () => {
  it('zwraca true dla obsługiwanych plików', async () => {
    const jpegPath = await createTempFile('a.jpg', [0xff, 0xd8, 0xff, 0x00]);
    const pngPath = await createTempFile('b.png', [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    const files = [{ path: jpegPath }, { path: pngPath }] as Express.Multer.File[];
    await expect(validateFileSignatures(files)).resolves.toBe(true);
  });

  it('zwraca false gdy sygnatura pliku jest błędna', async () => {
    const wrongPath = await createTempFile('x.jpg', [0x10, 0x11, 0x12]);
    const files = [{ path: wrongPath }] as Express.Multer.File[];

    await expect(validateFileSignatures(files)).resolves.toBe(false);
  });
});

describe('cleanupUploadedFiles', () => {
  it('usuwa pliki i nie rzuca błędu przy braku pliku', async () => {
    const filePath = await createTempFile('to-delete.jpg', [0xff, 0xd8, 0xff, 0x00]);
    const missingPath = `${filePath}-missing`;

    const files = [{ path: filePath }, { path: missingPath }] as Express.Multer.File[];
    await expect(cleanupUploadedFiles(files)).resolves.toBeUndefined();
    await expect(fs.access(filePath)).rejects.toThrow();
  });
});
