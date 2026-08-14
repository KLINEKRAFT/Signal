/**
 * Provider-neutral types. Nothing outside lib/transcription may import an
 * AssemblyAI response shape.
 */

export interface TranscriptSegment {
  id: string;
  speaker?: string; // provider label, e.g. SPEAKER_01
  startMs: number;
  endMs: number;
  text: string;
}

export interface NormalizedTranscript {
  providerJobId: string;
  language?: string;
  durationMs?: number;
  segments: TranscriptSegment[];
  text: string;
}

export interface AnalysisResult {
  title: string;
  executiveSummary: string[];
  keyTakeaways: {
    title: string;
    explanation: string;
    timestamps: { startMs: number; endMs?: number }[];
  }[];
  mostImportant: { title: string; explanation: string }[];
  actions: { action: string; sourceTimestamp?: { startMs: number; endMs?: number } }[];
  quotes: { quote: string; speakerId?: string; startMs: number; endMs?: number }[];
  topics: string[];
}

/**
 * The complete shape of a recording, as every screen and export receives it.
 * Dates are ISO strings because this crosses the server/client boundary.
 */
export interface JobPayload {
  job: {
    id: string;
    title: string | null;
    originalFilename: string;
    mediaType: string;
    mimeType: string;
    fileSize: number;
    durationMs: number | null;
    status: JobStatus;
    failedStage: string | null;
    errorMessage: string | null;
    hasMedia: boolean;
    retention: string;
    transcriptionProvider: string | null;
    transcriptionJobId: string | null;
    language: string | null;
    context: {
      speakers?: { name: string; role?: string }[];
      description?: string;
      vocabulary?: string[];
    } | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
  };
  transcript: { wordCount: number | null; language: string | null } | null;
  speakers: { id: string; providerLabel: string; displayName: string | null }[];
  segments: {
    id: string;
    speakerId: string | null;
    startMs: number;
    endMs: number;
    text: string;
    sequence: number;
  }[];
  analysis: {
    id: string;
    outputType: string;
    detail: string;
    model: string | null;
    executiveSummary: string[];
    keyTakeaways: AnalysisResult['keyTakeaways'];
    mostImportant: AnalysisResult['mostImportant'];
    recommendedActions: AnalysisResult['actions'];
    quotes: AnalysisResult['quotes'];
    topics: string[];
    createdAt: string;
  } | null;
}

/** Stage markers shown on the processing screen. */
export const STAGES = [
  { key: 'received', label: 'MEDIA RECEIVED' },
  { key: 'prepared', label: 'MEDIA PREPARED' },
  { key: 'transcribing', label: 'TRANSCRIBING' },
  { key: 'analyzing', label: 'ANALYSIS PASS' },
  { key: 'recap', label: 'BUILDING RECAP' },
] as const;

export type StageKey = (typeof STAGES)[number]['key'];
export type StageState = 'done' | 'active' | 'pending' | 'failed';

export type JobStatus =
  | 'created'
  | 'uploading'
  | 'uploaded'
  | 'transcribing'
  | 'analyzing'
  | 'complete'
  | 'failed';

export function stageStates(
  status: JobStatus,
  failedStage?: string | null,
): Record<StageKey, StageState> {
  const order: StageKey[] = ['received', 'prepared', 'transcribing', 'analyzing', 'recap'];
  const activeIndex: Record<JobStatus, number> = {
    created: -1,
    uploading: -1,
    uploaded: 1,
    transcribing: 2,
    analyzing: 3,
    complete: 5,
    failed: -1,
  };

  const idx = activeIndex[status];
  const out = {} as Record<StageKey, StageState>;

  order.forEach((key, i) => {
    if (status === 'failed') {
      out[key] = failedStage === key ? 'failed' : i < order.indexOf((failedStage as StageKey) ?? 'received') ? 'done' : 'pending';
      return;
    }
    if (i < idx) out[key] = 'done';
    else if (i === idx) out[key] = 'active';
    else out[key] = 'pending';
  });

  // `analyzing` covers both the analysis pass and recap assembly.
  if (status === 'analyzing') out.recap = 'active';
  return out;
}
