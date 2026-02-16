const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sendEmail = require('./utils/sendMail');
const { body, validationResult } = require('express-validator');
const helmet = require('helmet');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 5000;
const fsp = fs.promises;

function resolveTrustProxyValue() {
  const value = process.env.TRUST_PROXY;

  if (!value) {
    return process.env.NODE_ENV === 'production' ? 1 : false;
  }

  if (value === 'true') return true;
  if (value === 'false') return false;

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? false : numericValue;
}

app.set('trust proxy', resolveTrustProxyValue());

const MAX_FILES = 3;
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_TOTAL_FILES_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const MIN_MESSAGE_LENGTH = 3;
const MAX_MESSAGE_LENGTH = 2000;
const ALLOWED_SENDERS = ['Od Spottera', 'Od Spotterki'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), 'spotted-upload-temp');
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });

function safeFilename(originalName) {
  return originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(-120);
}

async function detectMimeTypeFromSignature(filePath) {
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

async function validateFileSignatures(files) {
  for (const file of files) {
    const detectedType = await detectMimeTypeFromSignature(file.path);
    if (!detectedType || !ALLOWED_MIME_TYPES.includes(detectedType)) {
      return false;
    }
  }

  return true;
}

async function cleanupUploadedFiles(files) {
  await Promise.allSettled(
    files
      .map((file) => file.path)
      .filter(Boolean)
      .map((filePath) => fsp.unlink(filePath)),
  );
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: true,
    originAgentCluster: true,
    referrerPolicy: { policy: ['origin'] },
    strictTransportSecurity: {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true,
    },
    xContentTypeOptions: true,
    xDnsPrefetchControl: { allow: false },
    xDownloadOptions: true,
    xFrameOptions: { action: 'deny' },
    xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
    xPoweredBy: false,
    xXssProtection: false,
  }),
);

app.use(hpp());
app.disable('x-powered-by');

const limiter = rateLimit({
  max: 8,
  windowMs: 15 * 60 * 1000, // 15 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({ error: 'Zbyt wiele żądań, spróbuj ponownie później.' });
  },
});

app.use(express.json({ limit: '100kb' }));

app.use(
  cors({
    origin: ['https://spottedlezajsk.pl', 'https://www.spottedlezajsk.pl'],
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false,
  }),
);

app.use('/upload', limiter);

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
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Nieprawidłowy typ pliku'));
    }
    cb(null, true);
  },
});

app.post(
  '/upload',
  upload.array('file', MAX_FILES),
  body('sender')
    .trim()
    .notEmpty()
    .isIn(ALLOWED_SENDERS)
    .withMessage('Nieprawidłowa wartość pola nadawcy'),
  body('message')
    .trim()
    .notEmpty()
    .isLength({ min: MIN_MESSAGE_LENGTH, max: MAX_MESSAGE_LENGTH })
    .withMessage(
      `Wiadomość może mieć od ${MIN_MESSAGE_LENGTH} do ${MAX_MESSAGE_LENGTH} znaków`,
    ),
  async (req, res) => {
    const validation = validationResult(req);
    if (!validation.isEmpty()) {
      return res.status(400).json({
        error: validation.array({ onlyFirstError: true })[0].msg,
      });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    const { sender, message } = req.body;

    const totalFilesSize = files.reduce((total, file) => total + file.size, 0);
    if (totalFilesSize > MAX_TOTAL_FILES_SIZE_BYTES) {
      await cleanupUploadedFiles(files);
      return res.status(400).json({
        error: 'Łączny rozmiar wszystkich plików nie może przekroczyć 20 MB.',
      });
    }

    const signaturesAreValid = await validateFileSignatures(files);
    if (!signaturesAreValid) {
      await cleanupUploadedFiles(files);
      return res.status(400).json({
        error:
          'Nieprawidłowy typ pliku. Akceptowane typy to: .jpeg, .png, .jpg',
      });
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
      return res.status(200).json({ message: 'ok' });
    } catch (_error) {
      console.error('Upload sendEmail failed');
      return res.status(500).json({ error: 'Wystąpił błąd serwera.' });
    } finally {
      await cleanupUploadedFiles(files);
    }
  },
);

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res
        .status(400)
        .json({ error: 'Pojedynczy plik nie może być większy niż 15 MB.' });
    }
    return res.status(400).json({ error: 'Nieprawidłowe dane pliku.' });
  }

  if (error instanceof Error && error.message === 'Nieprawidłowy typ pliku') {
    return res.status(400).json({
      error: 'Nieprawidłowy typ pliku. Akceptowane typy to: .jpeg, .png, .jpg',
    });
  }

  return res.status(500).json({ error: 'Wystąpił błąd serwera.' });
});

app.get(/.*/, (_req, res) => {
  res.send('x_spo');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
