import { generateObject, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import type { AnalysisResult } from '@/lib/types';
import type { RecordingContext } from '@/lib/db/schema';
import { groundAnalysis, type GroundingReport, type GroundingSegment } from './ground';
import {
  buildUserPrompt,
  renderTranscript,
  SYSTEM_PROMPT,
  type DetailLevel,
  type OutputType,
} from './prompts';

/**
 * Analysis provider.
 *
 * Routed through Vercel AI Gateway, which means the model is a configuration
 * string rather than an import: one key, any provider, and swapping models is
 * an environment change instead of a code change. The rest of the app never
 * sees this file's types — it gets AnalysisResult from lib/types.
 */

/** Matches AnalysisResult. Descriptions are part of the prompt the model reads. */
const analysisSchema = z.object({
  title: z.string().describe('What the recording is actually about. Not a generic label.'),

  executiveSummary: z
    .array(z.string())
    .describe('Paragraphs of plain prose. Each string is one paragraph. No headings, no bullets.'),

  keyTakeaways: z
    .array(
      z.object({
        title: z.string().describe('Short, specific, sentence case. Not a topic label.'),
        explanation: z.string().describe('Two to three sentences. Concrete, not generic.'),
        timestamps: z
          .array(
            z.object({
              startMs: z.number().describe('Milliseconds, from the [ms] marker on the source line.'),
              endMs: z.number().optional(),
            }),
          )
          .describe('Where in the recording this came from, so a reader can verify it.'),
      }),
    )
    .describe('Each takeaway must make a distinct point. Do not restate one point several ways.'),

  mostImportant: z
    .array(z.object({ title: z.string(), explanation: z.string() }))
    .describe('Exactly the three most important ideas in the whole recording.'),

  actions: z
    .array(
      z.object({
        action: z.string().describe('An imperative instruction. Something a person could do.'),
        sourceTimestamp: z
          .object({ startMs: z.number(), endMs: z.number().optional() })
          .optional(),
      }),
    )
    .describe('Only actions the recording supports. Empty list if it supports none.'),

  quotes: z
    .array(
      z.object({
        quote: z.string().describe('VERBATIM words copied from the transcript. Never paraphrase.'),
        speakerId: z.string().optional(),
        startMs: z.number(),
        endMs: z.number().optional(),
      }),
    )
    .describe('Quotes that do not match the transcript exactly are discarded automatically.'),

  topics: z.array(z.string()).describe('Short topic labels, in the order they were discussed.'),
});

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5';

function model(): string {
  return process.env.AI_ANALYSIS_MODEL || DEFAULT_MODEL;
}

/**
 * Detail level drives output budget as well as prompt wording — a detailed
 * recap of a three-hour recording needs the room, and a truncated JSON object
 * fails schema validation rather than degrading gracefully.
 */
const OUTPUT_TOKENS: Record<DetailLevel, number> = {
  short: 4_000,
  standard: 8_000,
  detailed: 16_000,
};

export type AnalyzeInput = {
  segments: (GroundingSegment & { displayName?: string | null })[];
  outputType: OutputType;
  detail: DetailLevel;
  title?: string | null;
  durationMs?: number | null;
  context?: RecordingContext | null;
  speakers?: { providerLabel: string; displayName?: string | null }[];
};

export type AnalyzeOutput = {
  result: AnalysisResult;
  model: string;
  grounding: GroundingReport;
};

export async function analyzeTranscript(input: AnalyzeInput): Promise<AnalyzeOutput> {
  if (!input.segments.length) {
    throw new Error('There is no transcript to analyse yet.');
  }

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      'AI_GATEWAY_API_KEY is not set. Add it in .env.local, or connect AI Gateway in the Vercel dashboard.',
    );
  }

  const { text, truncated } = renderTranscript(
    input.segments.map((s) => ({
      startMs: s.startMs,
      text: s.text,
      speakerLabel: s.speakerLabel,
      displayName: s.displayName,
    })),
  );

  const modelId = model();

  let object: AnalysisResult;
  try {
    const generated = await generateObject({
      model: modelId,
      schema: analysisSchema,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt({
        transcript: text,
        truncated,
        outputType: input.outputType,
        detail: input.detail,
        title: input.title,
        durationMs: input.durationMs,
        context: input.context,
        speakers: input.speakers,
      }),
      maxOutputTokens: OUTPUT_TOKENS[input.detail],
    });
    object = generated.object as AnalysisResult;
  } catch (error) {
    // A malformed object is the one failure worth naming precisely — it means
    // the recap can be retried without re-transcribing anything.
    if (NoObjectGeneratedError.isInstance(error)) {
      throw new Error(
        'The analysis model returned a response that could not be read. Retrying usually resolves this.',
      );
    }
    throw error;
  }

  // Nothing the model said about provenance is trusted until it is checked
  // against the transcript. See lib/analysis/ground.ts.
  const { result, report } = groundAnalysis(object, input.segments);

  return { result, model: modelId, grounding: report };
}
