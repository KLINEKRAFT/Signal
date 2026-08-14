/**
 * Light, meaning-preserving cleanup of transcription artifacts.
 *
 * Applied once at ingest, to the segment text itself — not to a separate copy.
 * That matters: the transcript the user reads, the text sent to the analysis
 * model, and the text a quote is verified against are then all the same string.
 * If cleaning produced a second version, a quote could be verbatim against one
 * and fabricated-looking against the other.
 *
 * Deliberately conservative. It removes disfluencies that carry no meaning and
 * nothing else. It never rewords, reorders, corrects grammar, or fixes facts.
 */

/** Standalone hesitation sounds. Only removed when they are the whole token. */
const FILLERS = new Set(['um', 'uh', 'erm', 'uhh', 'umm', 'hmm', 'mm', 'mhm', 'ah', 'eh']);

/**
 * Words that legitimately repeat in English, so an immediate repetition is not
 * evidence of a stutter. "had had", "that that", "is is" all occur naturally.
 */
const REPEATABLE = new Set(['had', 'that', 'is', 'is,', 'no', 'very', 'so', 'ha', 'yeah']);

function stripPunctuation(token: string): string {
  return token.replace(/[.,!?;:—–-]+$/g, '').toLowerCase();
}

export function cleanSegmentText(input: string): string {
  const tokens = input.split(/\s+/).filter(Boolean);
  const out: string[] = [];

  for (const token of tokens) {
    const bare = stripPunctuation(token);

    // Drop a filler only when it stands alone and is not the entire segment —
    // a segment that is genuinely just "Mhm." is a real conversational answer.
    if (FILLERS.has(bare) && tokens.length > 2) {
      // A filler is often bracketed by commas ("is, uh, changing"). Removing it
      // between them would leave "is, changing", so the opening comma goes too.
      if (/,$/.test(token) && out.length && /,$/.test(out[out.length - 1])) {
        out[out.length - 1] = out[out.length - 1].replace(/,+$/, '');
      }
      continue;
    }

    // Collapse an immediate stutter ("the the" → "the"), keeping the later
    // token so trailing punctuation survives.
    const previous = out.length ? stripPunctuation(out[out.length - 1]) : null;
    if (previous && previous === bare && !REPEATABLE.has(bare)) {
      out[out.length - 1] = token;
      continue;
    }

    out.push(token);
  }

  const text = out
    .join(' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Capitalise the opening letter if removing a leading filler lowercased it.
  return text.replace(/^([a-z])/, (m) => m.toUpperCase());
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
