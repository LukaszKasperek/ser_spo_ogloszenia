import mongoose from 'mongoose';
import { z } from 'zod';

const mongoEnvSchema = z.object({
  MONGODB_URI: z.string().trim().min(1, 'MONGODB_URI jest wymagane'),
  MONGODB_DB_NAME: z.string().trim().min(1, 'MONGODB_DB_NAME jest wymagane'),
});

function getMongoEnv(): { uri: string; dbName: string } {
  const parsedEnv = mongoEnvSchema.safeParse(process.env);

  if (!parsedEnv.success) {
    throw new Error(
      `Nieprawidlowa konfiguracja MongoDB: ${parsedEnv.error.issues[0]?.message ?? 'brak wymaganych zmiennych'}`,
    );
  }

  return {
    uri: parsedEnv.data.MONGODB_URI,
    dbName: parsedEnv.data.MONGODB_DB_NAME,
  };
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
