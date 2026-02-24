import type { Request, Response } from 'express';
import { validationResult } from 'express-validator';

import { MAX_TOTAL_FILES_SIZE_BYTES } from '../constants';
import { sendEmail } from '../utils/sendMail';
import {
  validateFileSignatures,
  cleanupUploadedFiles,
} from '../utils/fileHelpers';

export async function uploadController(
  req: Request,
  res: Response,
): Promise<void> {
  const validation = validationResult(req);
  if (!validation.isEmpty()) {
    res.status(400).json({
      error: validation.array({ onlyFirstError: true })[0].msg,
    });
    return;
  }

  const files: Express.Multer.File[] = Array.isArray(req.files)
    ? req.files
    : [];
  const { sender, message } = req.body;

  const totalFilesSize = files.reduce((total, file) => total + file.size, 0);
  if (totalFilesSize > MAX_TOTAL_FILES_SIZE_BYTES) {
    await cleanupUploadedFiles(files);
    res.status(400).json({
      error: 'Łączny rozmiar wszystkich plików nie może przekroczyć 20 MB.',
    });
    return;
  }

  const signaturesAreValid = await validateFileSignatures(files);
  if (!signaturesAreValid) {
    await cleanupUploadedFiles(files);
    res.status(400).json({
      error:
        'Nieprawidłowy typ pliku. Akceptowane typy to: .jpeg, .png, .jpg',
    });
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('Upload request accepted', {
      sender,
      messageLength: String(message).length,
      filesCount: files.length,
    });
  }

  try {
    await sendEmail(sender, message, files);
    res.status(200).json({ message: 'ok' });
  } catch (_error) {
    console.error('Upload sendEmail failed');
    res.status(500).json({ error: 'Wystąpił błąd serwera.' });
  } finally {
    await cleanupUploadedFiles(files);
  }
}
