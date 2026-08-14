import { generateObject, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import type { JobPayload } from '@/lib/types';
import { formatDuration } from '@/lib/format';
import { verifyQuotedSpans, type GroundingSegment } from './ground';
import { DERIVATIVE_KINDS, type DerivativeKind } from './kinds';

/**
 * Derived outputs: an email, a social post, a training handout.
 *
 * These are written from the finished recap rather than from the recording, so
 * the recap is the primary source and the transcript is only there to keep
 * quotes honest. That ordering matters — asking the model to re-read a
 * three-hour transcript to write a six-line email is both slower and worse than
 * handing it the analysis that was already done.
 */

const schema = z.object({
  title: z
    .string()
    .describe('Email subject, post hook, or handout title depending on the format requested.'),
  body: z
    .string()
    .describe(
      'The piece itself, as Markdown. Headings, bullets, and bold are allowed. No preamble, no explanation of what you wrote, no sign-off placeholders like [Your Name].',
    ),
});

const INSTRUCTIONS: Record<DerivativeKind, string> = {
  email: `Write an internal email that sends this recap to colleagues who did not attend.

Open with the single most useful thing in the recording — not "I wanted to share" or "Please find
attached". Two or three short paragraphs, or one paragraph plus a tight bulleted list if the
recording produced action items. Close with what the reader should do next, if the recording
supports one; otherwise just stop.

Subject line: specific and concrete, under about ten words. Not "Podcast Recap".

Do not invent a sender, a recipient, a deadline, or a meeting. Do not add a signature block.`,

  social_post: `Write a post for a professional network such as LinkedIn.

Lead with the most interesting or counterintuitive point in the recording — the line that makes
someone stop scrolling — then three or four short paragraphs or bullets that deliver on it. Plain
sentences, generous line breaks, no hashtag pile-up (two at most, at the end, only if they are
genuinely the topic). No emoji.

After the main post, add a horizontal rule and a heading "Short version", then a two-or-three
sentence variant for a platform with a tighter limit.

The title field is the opening line of the post.

Write it as the person who published the recording would: informed and specific, not promotional.
Do not claim results, numbers, or outcomes the recording does not contain.`,

  training_handout: `Write a one-page handout for teaching this material to someone who was not there.

Structure it for learning rather than for record-keeping: what this is about, the concepts that
matter with a plain definition for each, the procedure or sequence if the recording described one,
common mistakes or misunderstandings that were actually named, and a short list of questions a
learner should be able to answer afterwards.

Use Markdown headings and bullets. Define jargon the first time it appears — but only jargon the
recording itself explains or uses in a way that makes its meaning clear. Do not import definitions
from your own knowledge, and do not add a concept the recording never covered just because it
belongs in a complete treatment of the subject.`,
};

const SYSTEM = `You are the writing engine inside SIGNAL, a media intelligence tool built by
KLINEKRAFT. You take a recap that has already been produced from a recording and turn it into a
specific piece of writing someone will send, publish, or hand out.

Write like a capable human professional: plain, specific, and confident. Avoid the register of
generated text — no "delves into", "underscores", "in today's fast-paced world", "it is important
to note", "key insights". Do not open by announcing what the piece is.

GROUNDING — these override every other instruction:

- Use ONLY the recap and transcript provided. They are the entire world.
- Do NOT add outside facts, statistics, context, or background, even when you are confident they
  are correct and would strengthen the piece.
- Do NOT invent numbers, names, dates, outcomes, results, or claims of impact.
- Use quotation marks ONLY around words copied verbatim from the transcript. Any quoted span that
  does not match the transcript has its quotation marks stripped before publication, which will
  make the sentence read oddly — so quote exactly or write it as your own prose.
- If the recording does not support a section the format normally has, leave that section out
  rather than filling it.`;

function renderSource(payload: JobPayload): string {
  const { job, analysis } = payload;
  const parts: string[] = [];

  parts.push(`RECORDING: ${job.title || job.originalFilename}`);
  if (job.durationMs) parts.push(`LENGTH: ${formatDuration(job.durationMs)}`);

  if (payload.speakers.length) {
    parts.push(
      `SPEAKERS: ${payload.speakers.map((s) => s.displayName || s.providerLabel).join(', ')}`,
    );
  }

  if (job.context?.description) parts.push(`CONTEXT: ${job.context.description}`);

  if (!analysis) return parts.join('\n');

  if (analysis.executiveSummary.length) {
    parts.push(`\nEXECUTIVE SUMMARY\n${analysis.executiveSummary.join('\n\n')}`);
  }

  if (analysis.mostImportant.length) {
    parts.push(
      `\nWHAT MATTERS MOST\n${analysis.mostImportant
        .map((i) => `- ${i.title}: ${i.explanation}`)
        .join('\n')}`,
    );
  }

  if (analysis.keyTakeaways.length) {
    parts.push(
      `\nKEY TAKEAWAYS\n${analysis.keyTakeaways
        .map((t) => `- ${t.title}: ${t.explanation}`)
        .join('\n')}`,
    );
  }

  if (analysis.recommendedActions.length) {
    parts.push(
      `\nRECOMMENDED ACTIONS\n${analysis.recommendedActions.map((a) => `- ${a.action}`).join('\n')}`,
    );
  }

  if (analysis.quotes.length) {
    // These are already verified verbatim, so the model can quote them safely.
    parts.push(
      `\nVERIFIED QUOTES — these are confirmed word-for-word and are safe to quote directly:\n${analysis.quotes
        .map((q) => `- "${q.quote}"`)
        .join('\n')}`,
    );
  }

  if (analysis.topics.length) parts.push(`\nTOPICS: ${analysis.topics.join(', ')}`);

  return parts.join('\n');
}

export { DERIVATIVE_KINDS };
export type { DerivativeKind };

export type DeriveResult = {
  title: string;
  body: string;
  model: string;
  /** Quoted spans that did not match the transcript and were unquoted. */
  unverifiedQuotes: string[];
};

export async function deriveOutput(
  payload: JobPayload,
  kind: DerivativeKind,
): Promise<DeriveResult> {
  if (!payload.analysis) {
    throw new Error('Generate a recap first — these are written from it.');
  }

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      'AI_GATEWAY_API_KEY is not set. Add it in .env.local, or connect AI Gateway in the Vercel dashboard.',
    );
  }

  const modelId = process.env.AI_ANALYSIS_MODEL || 'anthropic/claude-sonnet-5';

  const prompt = [
    `FORMAT REQUESTED: ${INSTRUCTIONS[kind]}`,
    `\nTHE RECAP — this is your primary source.\n\n${renderSource(payload)}`,
    `\nTRANSCRIPT — provided so you can quote accurately. Do not summarise it again; the recap
above already did that.\n\n${payload.segments
      .map((s) => s.text)
      .join(' ')
      .slice(0, 120_000)}`,
    `\nWrite the piece now.`,
  ].join('\n');

  let object: { title: string; body: string };
  try {
    const generated = await generateObject({
      model: modelId,
      schema,
      system: SYSTEM,
      prompt,
      maxOutputTokens: 4_000,
    });
    object = generated.object;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      throw new Error(
        'The writing model returned a response that could not be read. Retrying usually resolves this.',
      );
    }
    throw error;
  }

  // Same rule as the recap: nothing claims to be verbatim unless it is. A
  // failed span keeps its words but loses its quotation marks, so the piece
  // stays readable while no longer asserting someone said it exactly that way.
  const segments: GroundingSegment[] = payload.segments.map((s) => ({
    startMs: s.startMs,
    endMs: s.endMs,
    text: s.text,
  }));

  const { text: body, unverified } = verifyQuotedSpans(object.body, segments);

  return {
    title: object.title.trim(),
    body: body.trim(),
    model: modelId,
    unverifiedQuotes: unverified,
  };
}
