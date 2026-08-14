import { NextResponse } from 'next/server';
import { loadJob } from '@/lib/db/queries';
import { buildRecapDocument, buildTranscriptText } from '@/lib/exports/document';
import { toMarkdown, toPlainText } from '@/lib/exports/markdown';
import { toPdf } from '@/lib/exports/pdf';
import { toDocx } from '@/lib/exports/docx';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Re-backs bytes onto a plain ArrayBuffer. `Buffer` and pdf-lib's output are
 * both `ArrayBufferLike`-backed, which the response `BodyInit` type rejects.
 */
function copy(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(input.byteLength);
  out.set(input);
  return out;
}

const FORMATS = ['txt', 'md', 'pdf', 'docx'] as const;
type Format = (typeof FORMATS)[number];

/**
 * Exports are generated on demand rather than stored.
 *
 * A recap is a few kilobytes of text and rendering it takes milliseconds, so
 * caching the output in Blob would add a cache-invalidation problem (rename a
 * speaker, regenerate a recap) in exchange for nothing.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);

  const format = (url.searchParams.get('format') ?? 'md') as Format;
  const kind = url.searchParams.get('kind') === 'transcript' ? 'transcript' : 'recap';

  if (!FORMATS.includes(format)) {
    return NextResponse.json({ error: 'Unsupported export format.' }, { status: 400 });
  }

  const payload = await loadJob(id);
  if (!payload) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 });

  if (kind === 'transcript' && !payload.segments.length) {
    return NextResponse.json({ error: 'This recording has no transcript yet.' }, { status: 409 });
  }
  if (kind === 'recap' && !payload.analysis) {
    return NextResponse.json({ error: 'This recording has no recap yet.' }, { status: 409 });
  }

  const doc = buildRecapDocument(payload);
  const base = `signal-${doc.filename}${kind === 'transcript' ? '-transcript' : '-recap'}`;

  const send = (body: string | Uint8Array<ArrayBuffer>, type: string, extension: string) =>
    new NextResponse(body, {
      headers: {
        'content-type': type,
        'content-disposition': `attachment; filename="${base}.${extension}"`,
        'cache-control': 'no-store',
      },
    });

  try {
    if (kind === 'transcript') {
      const text = buildTranscriptText(payload);
      if (format === 'md' || format === 'txt') {
        return send(text, 'text/plain; charset=utf-8', format);
      }
      // A transcript rendered as a formal document is still just its turns.
      const transcriptDoc = {
        ...doc,
        subtitle: 'Transcript',
        blocks: text
          .split('\n\n')
          .slice(1)
          .map((chunk) => ({ type: 'paragraph' as const, text: chunk.replace(/\n/g, '  ') })),
      };
      if (format === 'pdf') {
        return send(copy(await toPdf(transcriptDoc)), 'application/pdf', 'pdf');
      }
      return send(
        copy(await toDocx(transcriptDoc)),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'docx',
      );
    }

    switch (format) {
      case 'txt':
        return send(toPlainText(doc), 'text/plain; charset=utf-8', 'txt');
      case 'md':
        return send(toMarkdown(doc), 'text/markdown; charset=utf-8', 'md');
      case 'pdf':
        return send(copy(await toPdf(doc)), 'application/pdf', 'pdf');
      case 'docx':
        return send(
          copy(await toDocx(doc)),
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'docx',
        );
    }
  } catch {
    return NextResponse.json(
      { error: 'The export could not be generated. Try a different format.' },
      { status: 500 },
    );
  }
}
