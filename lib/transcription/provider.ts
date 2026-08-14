import type { NormalizedTranscript } from '@/lib/types';
import { createAssemblyAIProvider } from './assemblyai';

export interface SubmitOptions {
  /** Publicly fetchable URL. For private blobs, a short-lived signed GET URL. */
  mediaUrl: string;
  /** Callback the provider hits on completion. Must be a production URL. */
  webhookUrl?: string;
  /** Shared secret the provider echoes back in a header, so forgeries fail. */
  webhookSecret?: string;
  /** Terms, names, and acronyms to bias recognition toward. */
  vocabulary?: string[];
  /** Hint from the optional context form; improves diarization accuracy. */
  expectedSpeakers?: number;
  languageCode?: string;
}

export interface SubmitResult {
  providerJobId: string;
}

export type ProviderJobState = 'queued' | 'processing' | 'completed' | 'error';

export interface ProviderStatus {
  state: ProviderJobState;
  errorMessage?: string;
}

/**
 * Every transcription provider implements this. Nothing outside this folder
 * touches a provider SDK or response shape, so swapping AssemblyAI for
 * Deepgram, OpenAI, or self-hosted Whisper is a one-file change.
 */
export interface TranscriptionProvider {
  readonly name: string;
  submit(options: SubmitOptions): Promise<SubmitResult>;
  getStatus(providerJobId: string): Promise<ProviderStatus>;
  fetchTranscript(providerJobId: string): Promise<NormalizedTranscript>;
}

/**
 * The single place the app chooses a provider. Swapping to Deepgram, OpenAI, or
 * self-hosted Whisper means adding one file and one case here — no caller
 * changes, because callers only ever see NormalizedTranscript.
 */
export function getTranscriptionProvider(name?: string): TranscriptionProvider {
  const provider = name ?? process.env.TRANSCRIPTION_PROVIDER ?? 'assemblyai';

  switch (provider) {
    case 'assemblyai':
      return createAssemblyAIProvider();
    default:
      throw new Error(`Unknown transcription provider "${provider}".`);
  }
}
