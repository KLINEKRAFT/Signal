import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type Database = NeonHttpDatabase<typeof schema>;

let instance: Database | null = null;

function connect(): Database {
  if (instance) return instance;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and paste your Neon connection string.',
    );
  }

  // HTTP driver: each query is one stateless round trip, which is what a
  // serverless function wants. Switch to neon-serverless (WebSocket) only if a
  // future feature needs interactive transactions.
  instance = drizzle(neon(url), { schema });
  return instance;
}

/**
 * Connects on first query, not on import. A missing DATABASE_URL then surfaces
 * as a readable runtime error on one route instead of failing the whole build.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const client = connect() as unknown as Record<string | symbol, unknown>;
    const value = client[property];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export { schema };
