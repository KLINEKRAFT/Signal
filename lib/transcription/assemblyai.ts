import type { NormalizedTranscript, TranscriptSegment } from '@/lib/types';
import type {
  ProviderStatus,
  SubmitOptions,
  SubmitResult,
  TranscriptionProvider,
} from './provider';

/**
 * AssemblyAI adapter.
 *
 * Deliberately written against the REST API with plain fetch rather than the
 * SDK. The surface we use is four fields on one POST and one GET, and a thin
 * adapter is easier to keep honest than a dependency whose response types leak
 * upward. Nothing in here escapes this file — callers get NormalizedTranscript.
 *
 * Verified against the v2 API: /v2/transcript accepts 5 GB / 10 hours, strips
 * audio from video itself, and returns `utterances` when speaker_labels is on.
 */

const API = 'https://api.assemblyai.com/v2';

/** Provider status strings. Mapped to our own union before leaving this file. */
type AaiStatus = 'queued' | 'processing' | 'completed' | 'error';

type AaiWord = {
  text: string;
  start: number;
  end: number;
  speaker?: string | null;
};

type AaiUtterance = {
  speaker?: string | null;
  start: number;
  end: number;
  text: string;
};

type AaiTranscript = {
  id: string;
  status: AaiStatus;
  text?: string | null;
  error?: string | null;
  language_code?: string | null;
  audio_duration?: number | null; // seconds
  utterances?: AaiUtterance[] | null;
  words?: AaiWord[] | null;
};

function apiKey(): string {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) {
    throw new Error(
      'ASSEMBLYAI_API_KEY is not set. Add it in .env.local, or in Vercel under Settings → Environment Variables.',
    );
  }
  return key;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: apiKey(),
      'content-type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    // The provider returns { error } on 4xx. Surface that text — it is written
    // for developers but is far more useful than "request failed".
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      /* non-JSON error body; the status line is what we have */
    }
    throw new Error(`AssemblyAI: ${detail}`);
  }

  return (await response.json()) as T;
}

/**
 * Provider speaker labels are `A`, `B`, `C`. We store `SPEAKER_01`, `SPEAKER_02`
 * because that identity is ours, not theirs, and must survive a provider swap.
 * Numbered by first appearance so the mapping is chronological and stable.
 */
function speakerMapper() {
  const seen = new Map<string, string>();
  return (raw: string | null | undefined): string | undefined => {
    if (!raw) return undefined;
    const existing = seen.get(raw);
    if (existing) return existing;
    const label = `SPEAKER_${String(seen.size + 1).padStart(2, '0')}`;
    seen.set(raw, label);
    return label;
  };
}

/**
 * Fallback when diarization is unavailable: group words into readable segments
 * on sentence endings, capped so no single block runs longer than ~30 seconds.
 * Without this a non-diarized transcript would be one unnavigable wall of text.
 */
function segmentsFromWords(words: AaiWord[]): TranscriptSegment[] {
  const MAX_SEGMENT_MS = 30_000;
  const segments: TranscriptSegment[] = [];
  let buffer: AaiWord[] = [];

  const flush = () => {
    if (!buffer.length) return;
    segments.push({
      id: `seg_${segments.length}`,
      startMs: buffer[0].start,
      endMs: buffer[buffer.length - 1].end,
      text: buffer.map((w) => w.text).join(' ').trim(),
    });
    buffer = [];
  };

  for (const word of words) {
    buffer.push(word);
    const spanMs = word.end - buffer[0].start;
    if (/[.!?]$/.test(word.text) || spanMs >= MAX_SEGMENT_MS) flush();
  }
  flush();

  return segments;
}

function normalize(transcript: AaiTranscript): NormalizedTranscript {
  const toSpeaker = speakerMapper();

  const segments: TranscriptSegment[] = transcript.utterances?.length
    ? transcript.utterances.map((u, i) => ({
        id: `seg_${i}`,
        speaker: toSpeaker(u.speaker),
        startMs: u.start,
        endMs: u.end,
        text: u.text.trim(),
      }))
    : segmentsFromWords(transcript.words ?? []);

  return {
    providerJobId: transcript.id,
    language: transcript.language_code ?? undefined,
    durationMs: transcript.audio_duration ? Math.round(transcript.audio_duration * 1000) : undefined,
    segments: segments.filter((s) => s.text.length > 0),
    text: (transcript.text ?? segments.map((s) => s.text).join(' ')).trim(),
  };
}

export function createAssemblyAIProvider(): TranscriptionProvider {
  return {
    name: 'assemblyai',

    async submit(options: SubmitOptions): Promise<SubmitResult> {
      const body: Record<string, unknown> = {
        audio_url: options.mediaUrl,
        speaker_labels: true,
        punctuate: true,
        format_text: true,
      };

      // Up to 10 speakers is the provider ceiling; a wrong hint hurts more than
      // no hint, so anything outside that range is simply omitted.
      if (options.expectedSpeakers && options.expectedSpeakers >= 2 && options.expectedSpeakers <= 10) {
        body.speakers_expected = options.expectedSpeakers;
      }

      if (options.vocabulary?.length) {
        // word_boost accepts up to 1000 terms; ours come from a text field, so
        // the cap is defensive rather than expected.
        body.word_boost = options.vocabulary.slice(0, 1000);
        body.boost_param = 'high';
      }

      if (options.languageCode) body.language_code = options.languageCode;
      else body.language_detection = true;

      if (options.webhookUrl) {
        body.webhook_url = options.webhookUrl;
        // A shared secret in a header rather than the query string, so the
        // secret never lands in provider logs or referrer chains.
        if (options.webhookSecret) {
          body.webhook_auth_header_name = 'x-signal-webhook-secret';
          body.webhook_auth_header_value = options.webhookSecret;
        }
      }

      const created = await call<AaiTranscript>('/transcript', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      return { providerJobId: created.id };
    },

    async getStatus(providerJobId: string): Promise<ProviderStatus> {
      const t = await call<AaiTranscript>(`/transcript/${providerJobId}`);
      const state =
        t.status === 'completed' ? 'completed' : t.status === 'error' ? 'error' : t.status;
      return { state, errorMessage: t.error ?? undefined };
    },

    async fetchTranscript(providerJobId: string): Promise<NormalizedTranscript> {
      const t = await call<AaiTranscript>(`/transcript/${providerJobId}`);

      if (t.status === 'error') throw new Error(t.error ?? 'Transcription failed.');
      if (t.status !== 'completed') {
        throw new Error(`Transcript is still ${t.status}.`);
      }

      return normalize(t);
    },
  };
}
