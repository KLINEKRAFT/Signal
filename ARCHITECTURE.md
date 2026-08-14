# SIGNAL — Architecture

Decisions, and the reasoning behind them. Read this before changing the pipeline.

## The three findings that shaped everything

**1. AssemblyAI removes the need for FFmpeg and chunking.**
`/v2/transcript` accepts up to **5 GB** and **10 hours**, transcribes video
directly by stripping the audio itself, and converts everything to 16 kHz
internally — their docs explicitly recommend submitting native format without
transcoding. So the original brief's Path B (audio extraction) and Path C
(automatic chunking) solve problems that do not occur at this scale.

Only Path A is built. `lib/media/inspect.ts` is the seam where B and C would go;
today it either approves a direct upload or rejects the file with a plain-English
reason. This removes FFmpeg — and therefore the single largest reliability risk
on a serverless platform — from the stack entirely.

**2. Private Blob plus signed URLs solves the privacy requirement without
proxying bytes.**
Recordings contain internal company material, so media goes to a **private** Blob
store. AssemblyAI has no credentials for that store, so `getSignedMediaUrl()`
mints a URL scoped to one operation (`get`), one pathname, and a two-hour expiry.
The provider fetches it directly. Media bytes never pass through a Function.
Playback uses the same mechanism through a 307 redirect, so the browser
range-requests storage directly.

**3. No queue, no worker.**
AssemblyAI's webhook posts a transcript ID and status; we then fetch the
transcript. That is a five-second invocation, not an hour-long one. Because Hobby
cron only runs once a day, the fallback for a missed webhook is
**reconcile-on-read**: when `/jobs/[id]` loads and a job has been `transcribing`
longer than `RECONCILE_AFTER_MS`, the server checks the provider directly and
self-heals. Zero infrastructure. The one cron job that does exist sweeps source
media under its retention policy, where daily granularity is the correct
resolution rather than a compromise.

## Where each operation runs

| Operation | Runs in |
| --- | --- |
| File selection, duration probe, poster frame | Browser |
| Multipart upload of media | Browser → Vercel Blob, direct |
| Upload token minting, job creation | Vercel Function (~200 ms) |
| **Media bytes** | **Never touch a Vercel Function** |
| Transcription | AssemblyAI |
| Webhook → fetch transcript → write segments | Vercel Function (~5 s) |
| Analysis (structured output) | Vercel Function (~20–60 s) |
| Exports | Vercel Function, on demand |
| Playback | Browser ← Blob, via signed redirect |

Nothing approaches the 300-second Fluid compute ceiling on Hobby.

**The one thing that cannot run in a Vercel Function** is FFmpeg against a
multi-gigabyte file — which is exactly what this design avoids.

## Job lifecycle

```
created ──▶ uploading ──▶ uploaded ──▶ transcribing ──▶ analyzing ──▶ complete
                                            │               │
                                            └──────┬────────┘
                                                   ▼
                                                failed  (+ failed_stage)
```

`preparing_media` and `assembling_transcript` from the original brief no longer
exist: AssemblyAI accepts video directly and returns one assembled transcript.
The UI still renders five stage markers — `MEDIA PREPARED` and `BUILDING RECAP`
just resolve instantly, because honestly reporting a stage that takes no time is
better than inventing one that does.

Retry is per-stage. A failed analysis re-runs analysis only. A failed
transcription re-submits the stored media. Neither requires a new upload.

### Concurrency

The same transition is reachable from three directions — the upload webhook, the
transcription webhook, and reconcile-on-read — so every stage is entered by a
**conditional UPDATE that only succeeds from the expected previous status**:

```sql
UPDATE jobs SET status = 'analyzing'
WHERE id = $1 AND status = 'transcribing'
RETURNING *
```

Postgres decides who wins. A caller that gets no row back knows someone else is
already doing the work and returns. This is why every entry point can be called
freely without a lock, a queue, or an idempotency table.

## Grounding: why AI output is checked rather than trusted

A language model asked for quotes and timestamps will produce plausible ones
whether or not they exist. Prompting reduces that; it does not eliminate it.

So `lib/analysis/ground.ts` runs on every result before it is stored:

- A **quote** survives only if its words appear verbatim, in order, in the stored
  transcript — compared after normalising case and punctuation, because those are
  formatting, not words. Paraphrases are discarded.
- A surviving quote's **timestamps and speaker** are overwritten with values
  derived from the segment the words were actually found in. The model's own
  numbers are never used.
- **Takeaway and action timestamps** are clamped to the recording. A timestamp
  outside it is not a near miss, it is invented, and it is dropped.

The function returns a report of what it discarded, which is logged. A high drop
rate is a prompt problem worth seeing, not something to hide.

This is also why transcript cleaning happens **once, at ingest, on the segment
text itself** rather than as a separate cleaned copy. The text the user reads,
the text sent to the model, and the text a quote is verified against are then
guaranteed to be the same string. With two versions, a quote could be verbatim
against one and fabricated-looking against the other.

## Data model notes

- `jobs.context` (JSONB) holds the optional pre-processing form. `vocabulary`
  feeds AssemblyAI's `word_boost`; `speakers` feeds `speakers_expected` and
  appears as one-tap suggestions in the speaker editor.
- **Supplied names are not auto-assigned to detected speakers.** Diarization
  numbers speakers by order of first appearance, which usually matches the order
  people list them — but "usually" is not good enough when the name ends up
  attached to a quote. Suggestions are one tap; a wrong attribution is a
  correction nobody makes.
- `analyses` is **many per job**, with `output_type`, `detail`, and `is_current`.
  Changing output type writes a new row rather than overwriting the last recap.
- `speakers.provider_label` (`SPEAKER_01`) is never overwritten by a rename;
  `display_name` is separate, so renaming updates every segment at once through
  the join.
- `transcripts.raw_transcript` was dropped — it is reconstructable from segments.
- Segments are inserted in batches of 500. A multi-hour recording produces
  thousands of rows, and a single statement with that many parameters is
  rejected.
- `jobs.retention` defaults to `delete_after_processing`. Hobby Blob includes
  1 GB of storage and 10 GB of transfer per month, and exceeding it removes Blob
  access for 30 days rather than sending a bill. One 50-minute video can be most
  of that allowance, so aggressive retention is the default, not a later feature.
  Transcript and recap survive media deletion.

## Provider abstraction

Nothing outside `lib/transcription/` may import an AssemblyAI response shape.
Everything speaks `NormalizedTranscript` and `TranscriptSegment` from
`lib/types.ts`. Swapping to Deepgram, OpenAI, or self-hosted Whisper is one new
file implementing `TranscriptionProvider` plus one case in `getTranscriptionProvider`.

The adapter is written against the REST API with plain `fetch` rather than the
SDK. The surface used is four fields on one POST and one GET, and a thin adapter
is easier to keep honest than a dependency whose response types leak upward.

For analysis, Vercel AI Gateway is the provider layer: one `AI_GATEWAY_API_KEY`,
model referenced as a string, so changing models is a config change.

## Exports

One format-neutral document model feeds four renderers, so a section added in
`lib/exports/document.ts` appears in Markdown, plain text, PDF, and DOCX or in
none of them. PDF uses `pdf-lib` (pure JS, no binaries, viable in a Function)
rather than a headless browser; the layout code does its own line wrapping
against real glyph widths, keeps headings with their content across page breaks,
and preserves WinAnsi typography rather than flattening dashes to hyphens.

Exports are generated on demand rather than stored. A recap is a few kilobytes
and renders in milliseconds, so caching it in Blob would add a cache-invalidation
problem — rename a speaker, regenerate a recap — in exchange for nothing.

## Derived outputs

The email, social post, and training handout are written **from the recap, not
from the recording**. The expensive understanding step already ran; asking the
model to redo it from the transcript for a six-line email would cost more and
produce less.

Three consequences worth knowing:

- They are **on demand**, never part of processing. One model call for the
  recordings that need one beats three for every recording that does not.
- **One row per job per kind** — regenerating replaces. A previous *recap*
  output type is worth keeping; a previous draft email is not.
- Generating one **never touches job status**, so a failure here cannot disturb
  a completed recording.

The transcript is still supplied alongside the recap, for quotes alone.
`verifyQuotedSpans()` checks every quoted span in the generated prose and, when
one cannot be found, removes the quotation marks while keeping the words. That
differs from the recap's rule — where an unverifiable quote is dropped outright
— because a quote inside prose sits in a sentence that would break if it were
removed. Unquoting keeps the piece readable and stops it asserting that anyone
said those words exactly. Spans under twelve characters are ignored: quotes that
short are defined terms or scare quotes, not claims about speech.

Rendering uses a small in-house Markdown component rather than a parser plus a
sanitiser. The model's output grammar is headings, bullets, bold, and rules —
six constructs — and the component never renders HTML at all, so there is no
sanitisation surface to get wrong.

## Deliberately not built

Multi-tenant organizations, billing, roles, admin dashboards, teams, analytics,
authentication. The schema leaves room for a `users` table later. The priority is
a media pipeline that works.
