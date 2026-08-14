import type { AnalysisResult } from '@/lib/types';

/**
 * Grounding: the difference between an analysis you can check and one you have
 * to trust.
 *
 * A language model asked for quotes and timestamps will produce plausible ones
 * whether or not they exist. Prompting reduces that; it does not eliminate it.
 * So nothing the model returns about *where* something came from is believed —
 * every quote is matched back against the stored transcript, and every
 * timestamp is replaced with one derived from the segment that actually
 * contains the text.
 *
 * The rule this file enforces: if it is not in the transcript, it does not ship.
 */

export type GroundingSegment = {
  startMs: number;
  endMs: number;
  text: string;
  speakerLabel?: string | null;
};

/** Lowercase, strip punctuation, collapse whitespace. Comparison form only. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Index = {
  haystack: string;
  /** Start offset of each segment within `haystack`, same order as segments. */
  offsets: number[];
  segments: GroundingSegment[];
};

function buildIndex(segments: GroundingSegment[]): Index {
  const offsets: number[] = [];
  const parts: string[] = [];
  let cursor = 0;

  for (const segment of segments) {
    const normalized = normalize(segment.text);
    offsets.push(cursor);
    parts.push(normalized);
    cursor += normalized.length + 1; // +1 for the joining space
  }

  return { haystack: parts.join(' '), offsets, segments };
}

/** Which segment covers a character offset in the concatenated haystack. */
function segmentAt(index: Index, offset: number): number {
  let low = 0;
  let high = index.offsets.length - 1;
  let found = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (index.offsets[mid] <= offset) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return found;
}

/**
 * A quote survives only if its words appear verbatim and in order in the
 * transcript. Punctuation and casing may differ — those are formatting, not
 * words — but no word may be added, dropped, or changed.
 */
function locateQuote(index: Index, quote: string): { start: number; end: number } | null {
  const needle = normalize(quote);
  if (needle.length < 12) return null; // too short to be a meaningful quote

  const at = index.haystack.indexOf(needle);
  if (at === -1) return null;

  return { start: at, end: at + needle.length };
}

function clampTimestamp(
  segments: GroundingSegment[],
  stamp: { startMs: number; endMs?: number } | undefined,
): { startMs: number; endMs?: number } | undefined {
  if (!stamp || typeof stamp.startMs !== 'number' || Number.isNaN(stamp.startMs)) return undefined;
  if (!segments.length) return undefined;

  const first = segments[0].startMs;
  const last = segments[segments.length - 1].endMs;

  // A timestamp outside the recording is not a near miss, it is invented.
  if (stamp.startMs < first - 1000 || stamp.startMs > last + 1000) return undefined;

  const startMs = Math.max(first, Math.min(stamp.startMs, last));
  const endMs =
    typeof stamp.endMs === 'number' && stamp.endMs > startMs
      ? Math.min(stamp.endMs, last)
      : undefined;

  return { startMs, endMs };
}

export type GroundingReport = {
  quotesProposed: number;
  quotesKept: number;
  timestampsDropped: number;
};

/**
 * Rewrites an analysis so every claim about provenance is true, and returns a
 * report of what was discarded. Callers surface the report rather than hiding
 * it — a recap that quietly dropped six of eight quotes is worth knowing about.
 */
export function groundAnalysis(
  result: AnalysisResult,
  segments: GroundingSegment[],
): { result: AnalysisResult; report: GroundingReport } {
  const index = buildIndex(segments);
  let timestampsDropped = 0;

  const quotes = (result.quotes ?? []).flatMap((quote) => {
    const located = locateQuote(index, quote.quote);
    if (!located) return [];

    // Timestamps and speaker come from the segment the words are actually in,
    // never from the model. This is what makes a quote checkable.
    const startIndex = segmentAt(index, located.start);
    const endIndex = segmentAt(index, located.end - 1);
    const startSegment = segments[startIndex];
    const endSegment = segments[endIndex] ?? startSegment;

    return [
      {
        quote: quote.quote.trim().replace(/^["'“‘]|["'”’]$/g, ''),
        speakerId: startSegment.speakerLabel ?? undefined,
        startMs: startSegment.startMs,
        endMs: endSegment.endMs,
      },
    ];
  });

  const keyTakeaways = (result.keyTakeaways ?? []).map((takeaway) => {
    const timestamps = (takeaway.timestamps ?? []).flatMap((stamp) => {
      const clamped = clampTimestamp(segments, stamp);
      if (!clamped) {
        timestampsDropped += 1;
        return [];
      }
      return [clamped];
    });
    return { ...takeaway, timestamps };
  });

  const actions = (result.actions ?? []).map((action) => {
    const clamped = clampTimestamp(segments, action.sourceTimestamp);
    if (action.sourceTimestamp && !clamped) timestampsDropped += 1;
    return { action: action.action, sourceTimestamp: clamped };
  });

  return {
    result: { ...result, quotes, keyTakeaways, actions },
    report: {
      quotesProposed: result.quotes?.length ?? 0,
      quotesKept: quotes.length,
      timestampsDropped,
    },
  };
}
