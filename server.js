const express = require('express');
const multer = require('multer');
const cors = require('cors');
const sendEmail = require('./utils/sendMail');

// @addons
const { query, validationResult } = require('express-validator');
const app = express();
const helmet = require('helmet');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');

const port = process.env.PORT || 5000;

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
    xContentTypOptions: true,
    xDnsPrefetchControl: { allow: false },
    xDownloadOptions: true,
    xFrameOptions: { action: 'deny' },
    xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
    xPoweredBy: false,
    xXssProtection: false,
  })
);

app.use(hpp());
const limiter = rateLimit({
  max: 10,
  windowMs: 15 * 60 * 1000, // 15 min
  message: 'Too many requests from this IP, please try again in an hour!',
});

app.use(express.json());

app.use(
  cors({
    // origin: 'http://localhost:5173',
    origin: 'https://spotted.contdev.usermd.net',
    credentials: true,
  })
);
app.use('/upload', limiter);

// Konfiguracja multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === 'image/jpeg' ||
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/jpg'
  ) {
    cb(null, true);
  } else {
    cb(new Error('Tylko JPEG, PNG i JPG dozwolone.'));
  }
};

// konfiguracja multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 1024 * 1024 * 10 }, // 10MB
});

// @Middleware
const checkFileCount = (req, res, next) => {
  if (req.files.length > 3) {
    return res.status(400).json({ error: 'Więcej niż 3 pliki' });
  }
  next();
};

app.post(
  '/upload',
  query('message').notEmpty().escape(),
  query('sender').notEmpty().escape(),
  upload.array('file', 3),
  async (req, res, next) => {
    const files = req.files;
    const { sender, message } = req.body;

    console.log('Server side:', { sender, message, files });

    try {
      await sendEmail(sender, message, files);
      res.status(200).json({
        message: 'ok',
      });
    } catch (error) {
      res.status(500).json({
        message: 'error',
      });
    }
  }
);

app.get('*', (req, res) => {
  res.send('x');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
