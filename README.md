# SIGNAL

**MEDIA / TRANSCRIPTION / INTELLIGENCE**

## Turn recordings into something useful.

Upload video or audio of any realistic length. SIGNAL transcribes it, identifies
who is speaking, and turns it into a polished written recap — executive summary,
key takeaways with verifiable timestamps, notable quotes, and recommended
actions.

A KLINEKRAFT product.

---

## What it does

```
DROP MEDIA → PROCESS → TRANSCRIBE → ANALYZE → RECAP
```

The user never splits recordings, converts files, extracts audio, or thinks
about provider limits. The transcript is the source material; the recap is the
product.

Drop a recording in. Come back to something useful.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Visual system, upload, direct-to-Blob, Neon, jobs, persistent state | **Built** |
| 2 | AssemblyAI, transcript storage, segments, diarization, renaming | **Built** |
| 3 | AI analysis, summary, takeaways, quotes, actions, timestamp grounding | **Built** |
| 4 | PDF / DOCX / TXT / Markdown export, history, retention controls | **Built** |
| 5 | Generated email, social post, and training handout from a recap | **Built** |

Builds clean on Next 16.3, React 19.2, Tailwind 4.3, `@vercel/blob` 2.8, AI SDK 7.

## Architecture

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the decisions and why they were
made. The short version:

- The browser uploads media **directly to Vercel Blob** using multipart. Media
  bytes never pass through a Vercel Function.
- The Blob store is **private**. The transcription provider receives a
  **short-lived signed GET URL**, not a public link.
- **No FFmpeg, no chunking.** AssemblyAI accepts 5 GB / 10 hours and strips audio
  from video itself.
- **No queue, no worker.** Provider webhook plus reconcile-on-read. One daily
  cron, and only for retention.
- **Every AI claim is checked against the transcript** before it is stored.

## Where each operation runs

| Operation | Runs in |
| --- | --- |
| File selection, duration probe, poster frame | Browser |
| Multipart upload of media | Browser → Vercel Blob, direct |
| Upload token minting, job creation | Vercel Function (~200 ms) |
| **Media bytes** | **Never touch a Vercel Function** |
| Transcription | AssemblyAI |
| Webhook → fetch transcript → write segments | Vercel Function (~5 s) |
| Analysis (structured output via AI Gateway) | Vercel Function (~20–60 s) |
| Exports (TXT / MD / PDF / DOCX) | Vercel Function, on demand |
| Playback | Browser ← Blob, via a signed redirect |

## Repository layout

```
app/
  page.tsx                 Upload screen
  jobs/[id]/page.tsx       Processing and results
  history/page.tsx         Previous jobs
  api/jobs/                Create, read, rename, delete, analysis, derive,
                           retry, speakers, segments, media, export
  api/transcription/       Provider webhook
  api/upload/              Client-upload token minting only
  api/cron/retention/      Daily source-media sweep
components/                UI, one concern per file
lib/
  db/                      Drizzle schema, lazy Neon client, payload queries
  storage/                 Blob paths, signed URLs, deletion, retention
  media/                   The one decision the pipeline makes
  transcription/           Provider interface + AssemblyAI adapter + cleaning
  analysis/                Prompts, structured output, grounding, derived outputs
  exports/                 One document model, four renderers
  pipeline.ts              The job state machine
  types.ts                 Provider-neutral shapes
public/
  signal-logo.svg          Supply this — the SIGNAL mark, header
  klinekraft-logo.svg      Supply this — maker's mark, footer
```

Neither logo is ever redrawn. If an asset is missing, the component falls back
to a plain typographic wordmark so the layout still holds.

## Design system

Monochrome, warm-shifted, built for a dark room.

| Token | Value | Use |
| --- | --- | --- |
| `--color-ink` | `#0a0a0a` | Base surface |
| `--color-paper` | `#f2f1ed` | Primary text |
| `--color-gray` | `#8c8880` | Secondary text |
| `--color-line` | `#201f1d` | Hairline borders |
| `--color-accent` | `#d6202a` | Active state, errors, drag target |

Space Grotesk for display and UI, IBM Plex Mono for data and micro-labels.
Uppercase is reserved for technical metadata; body copy stays sentence case.

The signature is a dot field used three ways: dropzone texture that densifies to
red on drag-over, hairline rules, and a pulse that travels a dot track while a
stage is live. There is no fake waveform — no audio amplitude data exists at that
point in the pipeline, so nothing pretends otherwise.

---

## Media processing

`lib/media/inspect.ts` is the pipeline's only decision, and today it makes one:
approve a direct upload, or reject the file with a plain-English reason.

**Path A (direct) is the only path built.** AssemblyAI accepts 5 GB and 10 hours,
transcribes video by stripping the audio itself, and converts everything to
16 kHz internally — their documentation recommends submitting native format
without transcoding. Audio extraction (Path B) and chunking (Path C) solve
problems that do not occur below those ceilings, and both would require FFmpeg,
which is the single largest reliability risk on a serverless platform.

`inspect.ts` is the seam where B and C would go if a future provider needed them.
Nothing else in the app knows those paths do not exist.

## Transcription

`lib/transcription/provider.ts` defines the interface; `assemblyai.ts` implements
it against the REST API with plain `fetch`. Nothing outside that folder imports a
provider response shape — everything speaks `NormalizedTranscript` and
`TranscriptSegment` from `lib/types.ts`, so swapping to Deepgram, OpenAI, or
self-hosted Whisper is one new file and one case in a switch.

Provider speaker labels (`A`, `B`) are mapped to our own (`SPEAKER_01`,
`SPEAKER_02`) on the way in, numbered by first appearance. Renaming a speaker
writes a separate `display_name` column, so the provider identity survives and
every segment updates at once through the join.

Transcription artifacts are cleaned once, at ingest, on the segment text itself —
so the transcript you read, the text sent to the analysis model, and the text a
quote is verified against are all the same string. Cleaning removes standalone
fillers and immediate stutters and nothing else; it never rewords, reorders, or
corrects.

## AI analysis

Transcription and analysis are separate stages, and that separation is the point:
changing output type or detail level re-runs one model call against text already
in Postgres. It never re-transcribes.

The model is instructed to ground everything in the transcript and to add no
outside knowledge. But instructions are not a guarantee, so **nothing the model
says about provenance is trusted**:

- **Quotes** must appear verbatim in the stored transcript, matched after
  normalising case and punctuation. Anything paraphrased is discarded rather
  than shown in quotation marks.
- **Quote timestamps and speaker attribution** are taken from the segment the
  words were actually found in, never from the model.
- **Takeaway and action timestamps** are clamped to the recording; anything
  outside it is dropped.

`lib/analysis/ground.ts` enforces this and reports what it discarded. If the
recording supports no action items, the recap says so instead of inventing them.

## Exports

One format-neutral document model (`lib/exports/document.ts`) feeds four
renderers, so Markdown, plain text, PDF, and DOCX cannot drift apart. PDF is
rendered with `pdf-lib` — pure JS, no binaries, which is what makes it viable
inside a serverless function.

## Generated outputs

The GENERATE tab writes an email, a social post, or a training handout **from
the finished recap** rather than from the recording — the analysis has already
been done, so re-reading a three-hour transcript to write a six-line email would
be slower and worse. Each is on demand, since most recordings never need any of
them.

The transcript is still passed alongside the recap for one reason: quotes.
Anything the model puts in quotation marks is checked against it, and a span
that cannot be found keeps its words but loses its quotation marks — so the
prose stays readable while nothing claims to be verbatim unless it is. Short
spans are left alone, because a two-word phrase in quotes is a defined term
rather than a claim about what someone said.

---

## Setup

You need three accounts. All three have free tiers that cover this comfortably.

### 1. Neon (database)

1. Sign up at **neon.tech** and create a project.
2. Open **Connect** and copy the **pooled** connection string.
3. Put it in `.env.local` as `DATABASE_URL`.

### 2. Vercel Blob (storage)

1. In the Vercel dashboard: **Storage → Create → Blob**.
2. **Choose `Private` access.** This cannot be changed after creation.
3. Connect the store to this project. Vercel adds `BLOB_READ_WRITE_TOKEN`.
4. Run `vercel env pull .env.local` to bring it down locally.

### 3. AssemblyAI (transcription)

1. Sign up at **assemblyai.com**. New accounts get **$50 in credits with no card
   required**, roughly 185–330 hours of transcription.
2. Copy the API key into `ASSEMBLYAI_API_KEY`.
3. Budget: base transcription runs about **$0.15/hour** of audio, with speaker
   diarization adding roughly **$0.02/hour**. A 50-minute podcast costs about
   fifteen cents.

### 4. AI analysis (Vercel AI Gateway)

Create a key in the Vercel dashboard under **AI Gateway**, set
`AI_GATEWAY_API_KEY`, and pick a model string in `AI_ANALYSIS_MODEL`. One key
covers every provider the gateway supports, so changing models never touches
code.

---

## Local development

```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL and BLOB_READ_WRITE_TOKEN
npm run db:push                # creates tables in Neon
npm run dev
```

Open http://localhost:3000.

**Three things to know locally:**

- Blob's `onUploadCompleted` callback **does not fire against localhost**. The
  client sends a `PATCH /api/jobs/[id]` after the upload lands, which covers it.
  Both paths are idempotent, so production runs both harmlessly.
- The transcription webhook cannot reach localhost either. Reconcile-on-read
  covers it: open `/jobs/[id]` and the server checks the provider directly once
  the job has been transcribing longer than `RECONCILE_AFTER_MS`.
- Uploads still go to the real Blob store from your machine. Delete test files
  when you are done — see the storage note below.

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. Add `DATABASE_URL`, `ASSEMBLYAI_API_KEY`, `AI_GATEWAY_API_KEY`,
   `AI_ANALYSIS_MODEL`, `APP_URL`, and `TRANSCRIPTION_WEBHOOK_SECRET` under
   **Settings → Environment Variables**. `BLOB_READ_WRITE_TOKEN` appears
   automatically when you connect the store, and `CRON_SECRET` when you add the
   cron job in `vercel.json`.
3. Deploy, then run `npm run db:push` once against the production database.

**The webhook must point at the production domain, not a preview URL.** Preview
deployments sit behind Vercel Authentication and will reject the callback. That
is what `APP_URL` is for; leave it unset and the app derives the production URL
from Vercel's own environment.

## Storage limits worth watching

The Hobby plan includes **1 GB of Blob storage and 10 GB of transfer per month**,
and included usage is shared across all Vercel services in the project. Exceeding
a Blob limit on Hobby **removes Blob access for 30 days** rather than generating
a bill.

A single 50-minute video can be most of that 1 GB. This is why `retention`
defaults to `delete_after_processing`: the transcript and recap are what matter,
and they live in Postgres, not Blob. The other policies (24 hours, 7 days,
30 days, keep) are swept once a day by `/api/cron/retention`.

Note also that the Hobby plan is for personal, non-commercial projects. If SIGNAL
becomes a tool the brokerages depend on, that is a Pro-plan conversation.

## Current limitations

- **No authentication.** Anyone who reaches the deployment can upload and read.
  Add Vercel Authentication on the project until real auth exists. The schema
  leaves room for a `users` table.
- Files over 5 GB or 10 hours are rejected with a message rather than chunked.
- Very long recordings are truncated from the middle before analysis (the
  transcript is stored in full, and the recap says when this happened).
- Transcript edits correct the stored text but do not re-run the existing recap;
  regenerate it if an edit changes something material.
- Exports are generated on demand rather than stored, so a very large transcript
  PDF is rendered per request.

## Roadmap

Speaker-level analytics. Real authentication when more than one person uses it.
