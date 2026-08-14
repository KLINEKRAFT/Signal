import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { jobs, type RecordingContext } from '@/lib/db/schema';
import { planMedia } from '@/lib/media/inspect';
import { mediaKind } from '@/lib/format';
import { ACCEPTED_MIME_PREFIXES } from '@/lib/constants';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(100);
    return NextResponse.json({ jobs: rows });
  } catch {
    return NextResponse.json({ error: 'Could not load history.' }, { status: 500 });
  }
}

type CreateBody = {
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  durationMs?: number | null;
  title?: string | null;
  context?: RecordingContext | null;
};

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (!body?.originalFilename || !body?.mimeType || !body?.fileSize) {
    return NextResponse.json({ error: 'Missing file details.' }, { status: 400 });
  }

  if (!ACCEPTED_MIME_PREFIXES.some((p) => body.mimeType.startsWith(p))) {
    return NextResponse.json(
      { error: 'That file is not video or audio. Upload a recording instead.' },
      { status: 415 },
    );
  }

  const plan = planMedia({ fileSize: body.fileSize, durationMs: body.durationMs });
  if (plan.path === 'rejected') {
    return NextResponse.json({ error: plan.reason }, { status: 413 });
  }

  try {
    const [job] = await db
      .insert(jobs)
      .values({
        title: body.title?.trim() || null,
        originalFilename: body.originalFilename,
        mediaType: mediaKind(body.mimeType),
        mimeType: body.mimeType,
        fileSize: body.fileSize,
        durationMs: body.durationMs ?? null,
        context: body.context ?? null,
        status: 'created',
      })
      .returning();

    return NextResponse.json({ job }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Could not start the job. The database did not respond.' },
      { status: 500 },
    );
  }
}
