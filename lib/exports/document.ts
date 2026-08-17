import type { JobPayload } from '@/lib/types';
import { formatDate, formatDuration, formatTimestamp } from '@/lib/format';
import { OUTPUT_TYPES } from '@/lib/analysis/prompts';

/**
 * The recap, as a format-neutral document.
 *
 * Every export renders this same structure, so Markdown, PDF, and DOCX cannot
 * drift apart — a section added here appears in all of them or none.
 */
export type Block =
  | { type: 'heading'; text: string }
  // `index` marks an item in a counted series. Set here rather than inferred by
  // each renderer, so the numbering cannot differ between PDF, DOCX and
  // Markdown — and so a renderer that has no use for it can simply ignore it.
  | { type: 'subheading'; text: string; index?: number }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'meta'; label: string; value: string }
  | { type: 'quote'; text: string; attribution: string }
  | { type: 'note'; text: string }
  | { type: 'rule' };

export type RecapDocument = {
  title: string;
  subtitle: string;
  filename: string;
  blocks: Block[];
};

export function speakerName(
  payload: JobPayload,
  speakerId: string | null | undefined,
): string | null {
  if (!speakerId) return null;
  const speaker = payload.speakers.find((s) => s.id === speakerId);
  if (!speaker) return null;
  return speaker.displayName || speaker.providerLabel;
}

/** Analysis stores the provider label, not the row id — quotes resolve here. */
function speakerByLabel(payload: JobPayload, label: string | undefined): string | null {
  if (!label) return null;
  const speaker = payload.speakers.find((s) => s.providerLabel === label);
  if (!speaker) return null;
  return speaker.displayName || speaker.providerLabel;
}

function safeSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'recap'
  );
}

export function buildRecapDocument(payload: JobPayload): RecapDocument {
  const { job, analysis } = payload;
  const title = job.title || job.originalFilename;
  const outputLabel =
    OUTPUT_TYPES.find((o) => o.value === analysis?.outputType)?.label ?? 'Recap';

  const blocks: Block[] = [];

  blocks.push({ type: 'meta', label: 'Source', value: job.originalFilename });
  blocks.push({ type: 'meta', label: 'Duration', value: formatDuration(job.durationMs) });
  blocks.push({ type: 'meta', label: 'Processed', value: formatDate(job.completedAt ?? job.createdAt) });
  if (payload.transcript?.wordCount) {
    blocks.push({
      type: 'meta',
      label: 'Words',
      value: payload.transcript.wordCount.toLocaleString('en-US'),
    });
  }
  if (payload.speakers.length) {
    blocks.push({
      type: 'meta',
      label: 'Speakers',
      value: payload.speakers.map((s) => s.displayName || s.providerLabel).join(', '),
    });
  }

  blocks.push({ type: 'rule' });

  if (!analysis) {
    blocks.push({ type: 'note', text: 'No recap has been generated for this recording yet.' });
    return { title, subtitle: outputLabel, filename: safeSlug(title), blocks };
  }

  if (analysis.executiveSummary.length) {
    blocks.push({ type: 'heading', text: 'Executive Summary' });
    for (const paragraph of analysis.executiveSummary) {
      blocks.push({ type: 'paragraph', text: paragraph });
    }
  }

  if (analysis.mostImportant.length) {
    blocks.push({ type: 'heading', text: 'What Matters Most' });
    analysis.mostImportant.forEach((item, i) => {
      blocks.push({ type: 'subheading', text: item.title, index: i + 1 });
      blocks.push({ type: 'paragraph', text: item.explanation });
    });
  }

  if (analysis.keyTakeaways.length) {
    blocks.push({ type: 'heading', text: 'Key Takeaways' });
    analysis.keyTakeaways.forEach((takeaway, i) => {
      const stamps = takeaway.timestamps
        .map((t) => (t.endMs ? `${formatTimestamp(t.startMs)}–${formatTimestamp(t.endMs)}` : formatTimestamp(t.startMs)))
        .join(', ');
      blocks.push({
        type: 'subheading',
        text: stamps ? `${takeaway.title}  ·  ${stamps}` : takeaway.title,
        index: i + 1,
      });
      blocks.push({ type: 'paragraph', text: takeaway.explanation });
    });
  }

  if (analysis.recommendedActions.length) {
    blocks.push({ type: 'heading', text: 'Recommended Actions' });
    for (const action of analysis.recommendedActions) {
      const stamp = action.sourceTimestamp ? `  (${formatTimestamp(action.sourceTimestamp.startMs)})` : '';
      blocks.push({ type: 'bullet', text: `${action.action}${stamp}` });
    }
  }

  if (analysis.quotes.length) {
    blocks.push({ type: 'heading', text: 'Notable Quotes' });
    for (const quote of analysis.quotes) {
      const who = speakerByLabel(payload, quote.speakerId);
      const stamp = formatTimestamp(quote.startMs);
      blocks.push({
        type: 'quote',
        text: quote.quote,
        attribution: who ? `${who} · ${stamp}` : stamp,
      });
    }
  }

  if (analysis.topics.length) {
    blocks.push({ type: 'heading', text: 'Topics' });
    blocks.push({ type: 'paragraph', text: analysis.topics.join(' · ') });
  }

  blocks.push({ type: 'rule' });
  blocks.push({
    type: 'note',
    text: 'Generated by SIGNAL from the recording transcript. Timestamps refer to the source recording and can be used to verify any point above.',
  });

  return { title, subtitle: outputLabel, filename: safeSlug(title), blocks };
}

/** The transcript is a different document: one speaker turn after another. */
export function buildTranscriptText(payload: JobPayload): string {
  const lines: string[] = [];
  const title = payload.job.title || payload.job.originalFilename;

  lines.push(title, '');

  let lastSpeaker: string | null = null;

  for (const segment of payload.segments) {
    const who = speakerName(payload, segment.speakerId);
    const stamp = formatTimestamp(segment.startMs);

    if (who !== lastSpeaker) {
      if (lines.length > 2) lines.push('');
      lines.push(`${(who ?? 'SPEAKER').toUpperCase()} — ${stamp}`);
      lastSpeaker = who;
    }

    lines.push(segment.text);
  }

  return lines.join('\n');
}
