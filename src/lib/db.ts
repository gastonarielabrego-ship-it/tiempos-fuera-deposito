import { createClient, Client } from '@libsql/client';

const globalForDb = globalThis as unknown as {
  db: Client | undefined;
};

function createDb(): Client {
  const url = process.env.DATABASE_URL || 'file:db/custom.db';
  return createClient({ url });
}

export const db = globalForDb.db ?? createDb();

if (process.env.NODE_ENV !== 'production') globalForDb.db = db;