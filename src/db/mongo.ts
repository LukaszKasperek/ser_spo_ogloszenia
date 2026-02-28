import mongoose from 'mongoose';
import { z } from 'zod';

const mongoEnvSchema = z.object({
  MONGODB_DB_NAME: z.string().trim().min(1, 'MONGODB_DB_NAME jest wymagane'),
  MONGODB_USER: z.string().trim().min(1, 'MONGODB_USER jest wymagane'),
  MONGODB_PASSWORD: z
    .string()
    .trim()
    .min(1, 'MONGODB_PASSWORD jest wymagane'),
  MONGODB_HOST: z.string().trim().default('mongo56.mydevil.net'),
  MONGODB_PORT: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return 27017;
      }
      return Number(value);
    }, z.number().int().min(1).max(65535))
    .default(27017),
  MONGODB_PROTOCOL: z.enum(['mongodb', 'mongodb+srv']).default('mongodb'),
});

function getMongoEnv(): { uri: string; dbName: string } {
  const parsedEnv = mongoEnvSchema.safeParse(process.env);

  if (!parsedEnv.success) {
    throw new Error(
      `Nieprawidlowa konfiguracja MongoDB: ${parsedEnv.error.issues[0]?.message ?? 'brak wymaganych zmiennych'}`,
    );
  }

  const {
    MONGODB_DB_NAME,
    MONGODB_USER,
    MONGODB_PASSWORD,
    MONGODB_HOST,
    MONGODB_PORT,
    MONGODB_PROTOCOL,
  } = parsedEnv.data;

  const normalizedUser = encodeCredential(MONGODB_USER);
  const normalizedPassword = encodeCredential(MONGODB_PASSWORD);
  const uri = `${MONGODB_PROTOCOL}://${normalizedUser}:${normalizedPassword}@${MONGODB_HOST}:${MONGODB_PORT}/${MONGODB_DB_NAME}`;

  return { uri, dbName: MONGODB_DB_NAME };
}

function encodeCredential(value: string): string {
  // Akceptuje surowe i juz zakodowane dane logowania.
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

export async function connectToMongo(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  const { uri, dbName } = getMongoEnv();
  await mongoose.connect(uri, { dbName });
}

export async function disconnectFromMongo(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
