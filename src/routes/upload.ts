import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { body } from 'express-validator';

import {
  MAX_FILES,
  MAX_FILE_SIZE_BYTES,
  MIN_MESSAGE_LENGTH,
  MAX_MESSAGE_LENGTH,
  ALLOWED_SENDERS,
  ALLOWED_MIME_TYPES,
} from '../constants';
import { safeFilename } from '../utils/fileHelpers';
import { uploadController } from '../controllers/uploadController';

const router = Router();

const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), 'spotted-upload-temp');
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const timestamp = Date.now();
      const random = Math.round(Math.random() * 1e9);
      cb(null, `${timestamp}-${random}-${safeFilename(file.originalname)}`);
    },
  }),
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_MIME_TYPES)[number])) {
      return cb(new Error('Nieprawidłowy typ pliku'));
    }
    cb(null, true);
  },
});

router.post(
  '/upload',
  upload.array('file', MAX_FILES),
  body('sender')
    .trim()
    .notEmpty()
    .isIn([...ALLOWED_SENDERS])
    .withMessage('Nieprawidłowa wartość pola nadawcy'),
  body('message')
    .trim()
    .notEmpty()
    .isLength({ min: MIN_MESSAGE_LENGTH, max: MAX_MESSAGE_LENGTH })
    .withMessage(
      `Wiadomość może mieć od ${MIN_MESSAGE_LENGTH} do ${MAX_MESSAGE_LENGTH} znaków`,
    ),
  uploadController,
);

export default router;
