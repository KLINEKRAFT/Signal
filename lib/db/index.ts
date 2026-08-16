import { neon, neonConfig } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type Database = NeonHttpDatabase<typeof schema>;

let instance: Database | null = null;

/**
 * Backoff for waking a suspended compute. Neon scales to zero after a few
 * minutes idle, and the first query afterwards has to wait for a cold start —
 * long enough that the driver can give up before the database ever answers.
 * Untreated, that surfaces as "the database did not respond" on the first click
 * after any break, and success on the second.
 */
const WAKE_RETRY_DELAYS_MS = [250, 750, 1_500];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether a failed request is safe to send again.
 *
 * The HTTP driver sends every statement as a POST, so a retry is a re-execution
 * — and a request can fail after the server has already run it. Repeating a
 * SELECT costs a round trip; repeating an INSERT creates a second row. So only
 * reads are retried, and a write that fails is reported rather than guessed at.
 *
 * Waking the compute is what actually matters, and a read does that just as
 * well as a write. Routes that are about to write call `warmUp` first and
 * inherit the retry that way.
 */
function isRetryableStatement(body: unknown): boolean {
  if (typeof body !== 'string') return false;
  try {
    const parsed = JSON.parse(body) as {
      query?: unknown;
      queries?: { query?: unknown }[];
    };
    const statements = parsed.queries
      ? parsed.queries.map((q) => q?.query)
      : [parsed.query];

    return (
      statements.length > 0 &&
      statements.every((s) => typeof s === 'string' && /^\s*select\b/i.test(s))
    );
  } catch {
    return false;
  }
}

/**
 * Installed once, before any client exists, so every query in the app inherits
 * it — including the ones server components run directly.
 */
neonConfig.fetchFunction = async (input: RequestInfo | URL, init?: RequestInit) => {
  const retryable = isRetryableStatement(init?.body);

  for (let attempt = 0; ; attempt += 1) {
    const lastAttempt = !retryable || attempt >= WAKE_RETRY_DELAYS_MS.length;

    try {
      const response = await fetch(input, init);
      // 5xx here is the proxy failing to reach a compute, not a rejected query;
      // a bad statement comes back 4xx and must not be repeated.
      if (response.ok || response.status < 500 || lastAttempt) return response;
    } catch (error) {
      if (lastAttempt) throw error;
    }

    await sleep(WAKE_RETRY_DELAYS_MS[attempt]);
  }
};

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

/**
 * Wake the compute before writing.
 *
 * A trivial read, which the retry above will keep trying through a cold start.
 * Once it answers the compute is live and the write that follows lands on the
 * first attempt. Costs one round trip against a warm database and saves the
 * whole request against a sleeping one.
 */
export async function warmUp(): Promise<void> {
  await db.execute(sql`select 1`);
}

export { schema };
