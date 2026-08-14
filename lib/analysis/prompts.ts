import type { RecordingContext } from '@/lib/db/schema';
import { formatDuration } from '@/lib/format';

export type OutputType =
  | 'professional_recap'
  | 'executive_brief'
  | 'training_notes'
  | 'meeting_recap'
  | 'podcast_recap';

export type DetailLevel = 'short' | 'standard' | 'detailed';

export const OUTPUT_TYPES: { value: OutputType; label: string; description: string }[] = [
  {
    value: 'professional_recap',
    label: 'Professional Recap',
    description: 'Balanced polished summary for internal business use.',
  },
  {
    value: 'executive_brief',
    label: 'Executive Brief',
    description: 'Short leadership-focused overview.',
  },
  {
    value: 'training_notes',
    label: 'Training Notes',
    description: 'Educational summary emphasising concepts and learning points.',
  },
  {
    value: 'meeting_recap',
    label: 'Meeting Recap',
    description: 'Topics, decisions, action items, unresolved questions.',
  },
  {
    value: 'podcast_recap',
    label: 'Podcast Recap',
    description: 'Episode summary, discussion topics, quotes, takeaways.',
  },
];

export const DETAIL_LEVELS: { value: DetailLevel; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Detailed' },
];

const OUTPUT_INSTRUCTIONS: Record<OutputType, string> = {
  professional_recap: `Write a professional recap for internal business use. The reader did not
attend and needs to understand what was discussed, what it means, and what to do about it.
Balance narrative summary with concrete specifics.`,

  executive_brief: `Write for a senior leader with three minutes. Lead with consequence, not
chronology. Prefer decisions, risks, numbers, and commitments over description of the discussion.
Keep the executive summary tight and make every takeaway one a leader could act on or repeat.`,

  training_notes: `Write educational notes for someone learning this material. Emphasise concepts,
definitions, procedures, worked examples, and common mistakes named in the recording. Takeaway
titles should read like things to learn, not things that happened.`,

  meeting_recap: `Structure around what a meeting record needs: topics covered, decisions actually
made, action items with an owner if one was named, and questions left unresolved. Distinguish a
decision from a discussion — only call something decided if the recording shows it was.`,

  podcast_recap: `Write an episode recap. Cover what the episode was about, the major discussion
topics in order, the guest's central arguments, and the moments worth hearing. Lean harder on
notable quotes here than in the other formats, and keep the register closer to editorial than
corporate.`,
};

const DETAIL_INSTRUCTIONS: Record<DetailLevel, string> = {
  short: `Be brief: 2 paragraphs of executive summary, 4-6 key takeaways, explanations of one or
two sentences.`,
  standard: `Aim for 2-3 paragraphs of executive summary and 6-9 key takeaways with explanations of
two to three sentences.`,
  detailed: `Go deeper: 3-4 paragraphs of executive summary and 9-12 key takeaways, each explained
thoroughly with the specifics, numbers, and named entities that appeared in the recording.`,
};

/**
 * The rules that keep the output honest. Written as prohibitions because that is
 * what they are — and backed by lib/analysis/ground.ts, which verifies quotes
 * and timestamps against the transcript afterwards rather than taking the
 * model's word for them.
 */
const GROUNDING_RULES = `GROUNDING — these override every other instruction:

- Use ONLY what is in the transcript. The transcript is the entire world.
- Do NOT add outside facts, context, definitions, statistics, or background,
  even when you are confident they are correct and would improve the result.
- Do NOT correct, update, or contradict what a speaker said using your own
  knowledge. If a speaker states something you believe is wrong, report what
  they said. You are summarising a recording, not fact-checking it.
- Do NOT invent quotes, numbers, names, job titles, dates, conclusions, or
  recommendations.
- Every quote must be VERBATIM — a contiguous span of words copied exactly from
  the transcript. Do not stitch together separated phrases, tidy grammar,
  paraphrase, or compress. Punctuation and capitalisation may be normalised;
  words may not. Quotes that do not match the transcript exactly are discarded
  automatically, so an approximate quote is a wasted one.
- Only produce recommended actions the recording actually supports — something a
  speaker recommended, committed to, or clearly implied. If the recording does
  not support any, return an empty list. An empty list is a correct answer.
- Attach timestamps from the [ms] markers on the transcript lines you drew from.
  Timestamps are how a reader verifies your claim, so point at the line that
  supports the point, not the approximate area.
- If the recording is too short, too quiet, or too fragmentary to support a
  section, return fewer items or an empty list rather than padding it.`;

export const SYSTEM_PROMPT = `You are the analysis engine inside SIGNAL, a media intelligence tool
built by KLINEKRAFT. You read transcripts of real recordings — podcasts, meetings, training
sessions, webinars — and turn them into written recaps that a professional will read instead of
listening to the recording.

Write like a sharp human analyst who was in the room: specific, plain, and confident. Name the
things that were named. Prefer the concrete detail over the general observation.

Avoid the register of generated text. No "delves into", "underscores", "it is important to note",
"in today's fast-paced world", "the discussion highlights". Do not open the summary by restating
the title or announcing what the recording is. Do not repeat the same point in different words
across takeaways — each one must earn its place.

${GROUNDING_RULES}`;

/**
 * Transcript lines carry a millisecond marker and the speaker label so the model
 * can cite provenance. Long recordings are truncated from the middle rather than
 * the end, because the close of a discussion usually carries the conclusions.
 */
export function renderTranscript(
  segments: { startMs: number; text: string; speakerLabel?: string | null; displayName?: string | null }[],
  maxChars = 400_000,
): { text: string; truncated: boolean } {
  const lines = segments.map((s) => {
    const who = s.displayName || s.speakerLabel || 'SPEAKER';
    return `[${s.startMs}] ${who}: ${s.text}`;
  });

  const full = lines.join('\n');
  if (full.length <= maxChars) return { text: full, truncated: false };

  const headChars = Math.floor(maxChars * 0.6);
  const tailChars = maxChars - headChars;

  let head = '';
  let headIndex = 0;
  while (headIndex < lines.length && head.length + lines[headIndex].length < headChars) {
    head += lines[headIndex] + '\n';
    headIndex += 1;
  }

  let tail = '';
  let tailIndex = lines.length - 1;
  while (tailIndex > headIndex && tail.length + lines[tailIndex].length < tailChars) {
    tail = lines[tailIndex] + '\n' + tail;
    tailIndex -= 1;
  }

  const omitted = tailIndex - headIndex + 1;
  return {
    text: `${head}\n[... ${omitted} transcript lines omitted from the middle of a very long recording ...]\n\n${tail}`,
    truncated: true,
  };
}

export function buildUserPrompt(input: {
  transcript: string;
  truncated: boolean;
  outputType: OutputType;
  detail: DetailLevel;
  title?: string | null;
  durationMs?: number | null;
  context?: RecordingContext | null;
  speakers?: { providerLabel: string; displayName?: string | null }[];
}): string {
  const parts: string[] = [];

  parts.push(`OUTPUT FORMAT: ${OUTPUT_INSTRUCTIONS[input.outputType]}`);
  parts.push(`DETAIL LEVEL: ${DETAIL_INSTRUCTIONS[input.detail]}`);

  const supplied: string[] = [];
  if (input.title) supplied.push(`Title given by the uploader: ${input.title}`);
  if (input.durationMs) supplied.push(`Recording length: ${formatDuration(input.durationMs)}`);
  if (input.context?.description) supplied.push(`Context: ${input.context.description}`);

  if (input.context?.speakers?.length) {
    const named = input.context.speakers
      .map((s) => (s.role ? `${s.name} (${s.role})` : s.name))
      .join(', ');
    supplied.push(`People the uploader expects to appear: ${named}`);
  }

  if (input.speakers?.length) {
    const labels = input.speakers
      .map((s) => (s.displayName ? `${s.providerLabel} = ${s.displayName}` : s.providerLabel))
      .join(', ');
    supplied.push(`Speaker labels in the transcript: ${labels}`);
  }

  if (input.context?.vocabulary?.length) {
    supplied.push(`Terms and proper nouns to spell correctly: ${input.context.vocabulary.join(', ')}`);
  }

  if (supplied.length) {
    parts.push(
      `RECORDING DETAILS — supplied by the uploader as background. Use them for spelling, naming, and
framing only. They are not transcript content and are not facts you may report.
${supplied.map((s) => `- ${s}`).join('\n')}`,
    );
  }

  if (input.truncated) {
    parts.push(
      `NOTE: This recording was too long to include in full. A section from the middle has been
omitted — do not treat the jump as a topic change, and do not speculate about what was omitted.`,
    );
  }

  parts.push(
    `TRANSCRIPT — each line is [milliseconds from start] SPEAKER: text.

${input.transcript}`,
  );

  parts.push(
    `Produce the structured analysis now. The title should describe what the recording is actually
about — use the uploader's title if it fits, otherwise write a better one.`,
  );

  return parts.join('\n\n');
}
