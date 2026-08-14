'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { JobPayload, JobStatus } from '@/lib/types';
import { ProcessingStages } from './ProcessingStages';
import { ResultHeader } from './ResultHeader';
import { ResultTabs, type TabKey } from './ResultTabs';
import { RecapView } from './RecapView';
import { TranscriptView } from './TranscriptView';
import { TakeawaysView } from './TakeawaysView';
import { QuotesView } from './QuotesView';
import { DetailsView } from './DetailsView';
import { ExportMenu } from './ExportMenu';
import { MediaPlayer } from './MediaPlayer';
import { formatDuration, sourceLabel } from '@/lib/format';

const LIVE: JobStatus[] = ['created', 'uploading', 'uploaded', 'transcribing', 'analyzing'];

export function JobView({ initial }: { initial: JobPayload }) {
  const [payload, setPayload] = useState(initial);
  const [tab, setTab] = useState<TabKey>('recap');
  const [regenerating, setRegenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const segmentRefs = useRef(new Map<number, HTMLElement>());

  const status = payload.job.status;

  // Polling exists so a returning visitor sees current state, not so the job
  // survives. The job lives in Postgres; closing this tab changes nothing.
  useEffect(() => {
    if (!LIVE.includes(status)) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${payload.job.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const next = (await res.json()) as JobPayload;
        if (!cancelled && next?.job) setPayload(next);
      } catch {
        // A dropped poll is not worth surfacing; the next one retries.
      }
    };

    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [payload.job.id, status]);

  const registerSegmentRef = useCallback((startMs: number, el: HTMLElement | null) => {
    if (el) segmentRefs.current.set(startMs, el);
    else segmentRefs.current.delete(startMs);
  }, []);

  /**
   * One seek handler for the whole screen: move the player, switch to the
   * transcript, and scroll the matching line into view. This is what makes a
   * timestamp on a takeaway a verification control rather than decoration.
   */
  const seek = useCallback((ms: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = ms / 1000;
      void mediaRef.current.play?.().catch(() => {
        // Autoplay refusal is fine — the seek still happened.
      });
    }

    setTab('transcript');

    // The transcript may be mounting for the first time, so wait a frame.
    requestAnimationFrame(() => {
      const exact = segmentRefs.current.get(ms);
      const target =
        exact ??
        [...segmentRefs.current.entries()]
          .sort((a, b) => Math.abs(a[0] - ms) - Math.abs(b[0] - ms))[0]?.[1];

      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.animate?.(
        [{ backgroundColor: 'rgba(214,32,42,0.18)' }, { backgroundColor: 'transparent' }],
        { duration: 1400, easing: 'ease-out' },
      );
    });
  }, []);

  const rename = useCallback(
    async (title: string) => {
      const res = await fetch(`/api/jobs/${payload.job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setPayload((p) => ({ ...p, job: { ...p.job, title: title || null } }));
      }
    },
    [payload.job.id],
  );

  const renameSpeaker = useCallback(
    async (speakerId: string, displayName: string) => {
      // Optimistic: renaming should feel instant across the whole transcript.
      setPayload((p) => ({
        ...p,
        speakers: p.speakers.map((s) =>
          s.id === speakerId ? { ...s, displayName: displayName || null } : s,
        ),
      }));

      const res = await fetch(`/api/jobs/${payload.job.id}/speakers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakerId, displayName }),
      });

      if (!res.ok) {
        const fresh = await fetch(`/api/jobs/${payload.job.id}`, { cache: 'no-store' });
        if (fresh.ok) setPayload(await fresh.json());
      }
    },
    [payload.job.id],
  );

  const editSegment = useCallback(
    async (segmentId: string, text: string) => {
      setPayload((p) => ({
        ...p,
        segments: p.segments.map((s) => (s.id === segmentId ? { ...s, text } : s)),
      }));

      await fetch(`/api/jobs/${payload.job.id}/segments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentId, text }),
      });
    },
    [payload.job.id],
  );

  const regenerate = useCallback(
    async (outputType: string, detail: string) => {
      setRegenerating(true);
      setActionError(null);
      try {
        const res = await fetch(`/api/jobs/${payload.job.id}/analysis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outputType, detail }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? 'The recap could not be regenerated.');
        setPayload(body as JobPayload);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'The recap could not be regenerated.');
      } finally {
        setRegenerating(false);
      }
    },
    [payload.job.id],
  );

  const retry = useCallback(async () => {
    setRetrying(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/jobs/${payload.job.id}/retry`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'This recording could not be reprocessed.');
      setPayload(body as JobPayload);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'This recording could not be reprocessed.');
    } finally {
      setRetrying(false);
    }
  }, [payload.job.id]);

  // ── Failed ───────────────────────────────────────────────────────────────
  if (status === 'failed') {
    const stageLabel = payload.job.failedStage === 'analyzing' ? 'the analysis' : 'transcription';

    return (
      <div className="max-w-2xl">
        <ProcessingStages status={status} failedStage={payload.job.failedStage} index={1} />

        <div className="mt-8 border border-accent p-5">
          <p className="label text-accent">PROCESS HALTED</p>
          <p className="mt-3 text-sm leading-relaxed text-paper">
            {payload.job.errorMessage ?? 'Something went wrong while processing this recording.'}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-gray">
            {payload.segments.length
              ? 'The transcript is stored, so retrying re-runs the analysis only.'
              : payload.job.hasMedia
                ? 'The uploaded media is still stored. Retrying will not re-upload it.'
                : 'The source media is no longer stored.'}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={retry}
              disabled={retrying}
              className="label border border-line px-4 py-2.5 transition-colors hover:border-line-lit hover:text-paper disabled:opacity-40"
            >
              {retrying ? 'Retrying' : `Retry ${stageLabel}`}
            </button>
            <Link
              href="/"
              className="label border border-line px-4 py-2.5 transition-colors hover:border-line-lit hover:text-paper"
            >
              Upload another
            </Link>
          </div>

          {actionError ? (
            <p className="mt-3 text-sm text-accent" role="alert">
              {actionError}
            </p>
          ) : null}
        </div>

        {payload.segments.length ? (
          <p className="mt-6 text-sm text-gray">
            <button
              type="button"
              onClick={() => setTab('transcript')}
              className="underline decoration-gray-dim underline-offset-4 hover:text-paper"
            >
              The transcript is still readable.
            </button>
          </p>
        ) : null}
      </div>
    );
  }

  // ── Processing ───────────────────────────────────────────────────────────
  if (status !== 'complete') {
    return (
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16">
        <ProcessingStages status={status} failedStage={null} index={1} />

        <aside className="lg:border-l lg:border-line lg:pl-8">
          <p className="label label-lit">{sourceLabel(payload.job.id)}</p>
          <h2 className="mt-3 font-display text-lg font-medium leading-snug">
            {payload.job.title || payload.job.originalFilename}
          </h2>
          <p className="data mt-2 text-xs text-gray">
            {formatDuration(payload.job.durationMs)} {payload.job.mediaType.toUpperCase()}
          </p>

          <p className="mt-8 max-w-xs text-xs leading-relaxed text-gray-dim">
            This keeps running whether or not this page is open. Come back to this link any time.
          </p>

          <Link
            href="/history"
            className="label mt-6 inline-block border border-line px-4 py-3 transition-colors hover:border-line-lit hover:text-paper"
          >
            All recordings
          </Link>
        </aside>
      </div>
    );
  }

  // ── Complete ─────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <ResultHeader payload={payload} onRename={rename} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <ExportMenu payload={payload} />
      </div>

      {payload.job.hasMedia ? (
        <div className="mt-6 max-w-2xl">
          <MediaPlayer payload={payload} mediaRef={mediaRef} />
        </div>
      ) : null}

      <div className="mt-8">
        <ResultTabs
          active={tab}
          onChange={setTab}
          counts={{
            takeaways: payload.analysis?.keyTakeaways.length ?? 0,
            quotes: payload.analysis?.quotes.length ?? 0,
          }}
        />
      </div>

      <div className="mt-10">
        {tab === 'recap' ? (
          <RecapView
            payload={payload}
            onSeek={seek}
            onRegenerate={regenerate}
            regenerating={regenerating}
            error={actionError}
          />
        ) : null}

        {tab === 'transcript' ? (
          <TranscriptView
            payload={payload}
            onSeek={seek}
            registerSegmentRef={registerSegmentRef}
            onRenameSpeaker={renameSpeaker}
            onEditSegment={editSegment}
          />
        ) : null}

        {tab === 'takeaways' ? <TakeawaysView payload={payload} onSeek={seek} /> : null}
        {tab === 'quotes' ? <QuotesView payload={payload} onSeek={seek} /> : null}
        {tab === 'details' ? <DetailsView payload={payload} /> : null}
      </div>
    </div>
  );
}
