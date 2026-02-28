import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { connectToMongo, disconnectFromMongo } from './db/mongo';

const port = process.env.PORT || 5000;

async function bootstrap(): Promise<void> {
  await connectToMongo();

  const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });

  const gracefulShutdown = async (): Promise<void> => {
    await disconnectFromMongo();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

bootstrap().catch((error: unknown) => {
  console.error('Application bootstrap failed', error);
  process.exit(1);
});
