import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';

import {
  API_RATE_LIMIT_MAX,
  API_RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
} from './constants';
import uploadRoutes from './routes/upload';
import workRoutes from './routes/work';
import { errorHandler } from './middleware/errorHandler';

const app = express();

function resolveTrustProxyValue(): boolean | number {
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

app.use(express.json({ limit: '100kb' }));

function getAllowedCorsOrigins(): string[] {
  const envOrigins = process.env.CORS_ORIGINS;
  if (!envOrigins) {
    return ['https://spottedlezajsk.pl', 'https://www.spottedlezajsk.pl'];
  }

  const origins = envOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0
    ? origins
    : ['https://spottedlezajsk.pl', 'https://www.spottedlezajsk.pl'];
}

app.use(
  cors({
    origin: getAllowedCorsOrigins(),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false,
  }),
);

const uploadLimiter = rateLimit({
  max: RATE_LIMIT_MAX,
  windowMs: RATE_LIMIT_WINDOW_MS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({ error: 'Zbyt wiele żądań, spróbuj ponownie później.' });
  },
});

const apiLimiter = rateLimit({
  max: API_RATE_LIMIT_MAX,
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({ error: 'Zbyt wiele żądań API, spróbuj ponownie później.' });
  },
});

app.use('/api', apiLimiter);
app.use('/upload', uploadLimiter);
app.use(uploadRoutes);
app.use(workRoutes);

app.get(/.*/, (_req, res) => {
  res.send('x');
});

app.use(errorHandler);

export default app;
