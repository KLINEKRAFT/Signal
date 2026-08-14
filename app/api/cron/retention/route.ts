import { NextResponse } from 'next/server';
import { sweepRetention } from '@/lib/storage/retention';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Daily retention sweep.
 *
 * Once a day is the Hobby cron limit, and it is also all this needs — the
 * shortest retention window is 24 hours, so daily granularity is the right
 * resolution rather than a compromise.
 *
 * Vercel signs cron invocations with CRON_SECRET when it is set; anything else
 * reaching this route is rejected.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
  }

  try {
    const result = await sweepRetention();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[retention] sweep failed', error);
    return NextResponse.json({ error: 'The retention sweep failed.' }, { status: 500 });
  }
}
