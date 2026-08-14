'use client';

import { useMemo, useRef, useState } from 'react';
import type { JobPayload } from '@/lib/types';
import { formatTimestamp } from '@/lib/format';
import { CopyButton } from './CopyButton';
import { SpeakerEditor } from './SpeakerEditor';
import { EmptyState } from './EmptyState';
import { buildTranscriptText } from '@/lib/exports/document';

/**
 * The transcript, grouped into speaker turns.
 *
 * Segments arrive one utterance at a time, which reads as a stutter on screen.
 * Consecutive segments from the same speaker are merged into a turn for
 * display, while each keeps its own timestamp and stays individually editable —
 * the display grouping never changes the stored data.
 */
type Turn = {
  speakerId: string | null;
  startMs: number;
  segments: JobPayload['segments'];
};

export function TranscriptView({
  payload,
  onSeek,
  registerSegmentRef,
  onRenameSpeaker,
  onEditSegment,
}: {
  payload: JobPayload;
  onSeek: (ms: number) => void;
  registerSegmentRef: (startMs: number, el: HTMLElement | null) => void;
  onRenameSpeaker: (speakerId: string, displayName: string) => Promise<void>;
  onEditSegment: (segmentId: string, text: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const speakerName = useMemo(() => {
    const map = new Map(payload.speakers.map((s) => [s.id, s.displayName || s.providerLabel]));
    return (id: string | null) => (id ? (map.get(id) ?? 'SPEAKER') : 'SPEAKER');
  }, [payload.speakers]);

  const turns = useMemo<Turn[]>(() => {
    const out: Turn[] = [];
    for (const segment of payload.segments) {
      const last = out[out.length - 1];
      if (last && last.speakerId === segment.speakerId) {
        last.segments.push(segment);
      } else {
        out.push({ speakerId: segment.speakerId, startMs: segment.startMs, segments: [segment] });
      }
    }
    return out;
  }, [payload.segments]);

  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!needle) return turns;
    return turns
      .map((turn) => ({
        ...turn,
        segments: turn.segments.filter((s) => s.text.toLowerCase().includes(needle)),
      }))
      .filter((turn) => turn.segments.length > 0);
  }, [turns, needle]);

  const matchCount = useMemo(
    () => (needle ? visible.reduce((sum, turn) => sum + turn.segments.length, 0) : 0),
    [visible, needle],
  );

  if (!payload.segments.length) {
    return (
      <EmptyState
        label="TRANSCRIPT PENDING"
        detail="Nothing has been transcribed for this recording yet."
      />
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-14">
      <div className="min-w-0">
        <div className="sticky top-14 z-10 -mx-5 flex flex-wrap items-center gap-2 border-b border-line bg-ink/95 px-5 py-3 backdrop-blur-sm sm:-mx-8 sm:px-8">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search transcript</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search transcript"
              className="w-full border border-line px-3 py-2 text-sm text-paper transition-colors focus:border-line-lit focus:outline-none"
            />
          </label>

          {needle ? (
            <span className="label whitespace-nowrap">
              {matchCount} {matchCount === 1 ? 'MATCH' : 'MATCHES'}
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="label border border-line px-3 py-2 transition-colors hover:border-line-lit hover:text-paper"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>

          <CopyButton value={() => buildTranscriptText(payload)} label="Copy all" />
        </div>

        {visible.length === 0 ? (
          <p className="mt-10 text-sm text-gray">
            Nothing in this transcript matches “{query.trim()}”.
          </p>
        ) : (
          <div className="mt-8 space-y-8">
            {visible.map((turn, i) => (
              <TurnBlock
                key={`${turn.startMs}-${i}`}
                turn={turn}
                name={speakerName(turn.speakerId)}
                collapsed={collapsed}
                query={needle}
                onSeek={onSeek}
                registerSegmentRef={registerSegmentRef}
                onEditSegment={onEditSegment}
              />
            ))}
          </div>
        )}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <SpeakerEditor
          speakers={payload.speakers}
          suggestions={payload.job.context?.speakers ?? []}
          onRename={onRenameSpeaker}
        />
      </aside>
    </div>
  );
}

function TurnBlock({
  turn,
  name,
  collapsed,
  query,
  onSeek,
  registerSegmentRef,
  onEditSegment,
}: {
  turn: Turn;
  name: string;
  collapsed: boolean;
  query: string;
  onSeek: (ms: number) => void;
  registerSegmentRef: (startMs: number, el: HTMLElement | null) => void;
  onEditSegment: (segmentId: string, text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const showing = collapsed ? open : true;

  return (
    <article>
      <div className="flex items-baseline gap-3">
        <button
          type="button"
          onClick={() => (collapsed ? setOpen((o) => !o) : onSeek(turn.startMs))}
          className="font-display text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:text-accent"
        >
          {name}
        </button>
        <button
          type="button"
          onClick={() => onSeek(turn.startMs)}
          className="data text-[11px] text-gray-dim transition-colors hover:text-accent"
        >
          {formatTimestamp(turn.startMs)}
        </button>
      </div>

      {showing ? (
        <div className="mt-2.5 space-y-2">
          {turn.segments.map((segment) => (
            <Segment
              key={segment.id}
              segment={segment}
              query={query}
              onSeek={onSeek}
              registerSegmentRef={registerSegmentRef}
              onEditSegment={onEditSegment}
            />
          ))}
        </div>
      ) : (
        <p className="mt-2 truncate text-sm text-gray-dim">{turn.segments[0]?.text}</p>
      )}
    </article>
  );
}

function Segment({
  segment,
  query,
  onSeek,
  registerSegmentRef,
  onEditSegment,
}: {
  segment: JobPayload['segments'][number];
  query: string;
  onSeek: (ms: number) => void;
  registerSegmentRef: (startMs: number, el: HTMLElement | null) => void;
  onEditSegment: (segmentId: string, text: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(segment.text);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const save = async () => {
    const text = draft.trim();
    if (!text || text === segment.text) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onEditSegment(segment.id, text);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="border border-line-lit p-2">
        <textarea
          autoFocus
          rows={Math.max(2, Math.ceil(draft.length / 80))}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(segment.text);
              setEditing(false);
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
          }}
          className="w-full resize-y bg-transparent text-[15px] leading-relaxed text-paper focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="label border border-line px-3 py-1.5 transition-colors hover:border-line-lit hover:text-paper disabled:opacity-40"
          >
            {saving ? 'Saving' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(segment.text);
              setEditing(false);
            }}
            className="label px-2 py-1.5 transition-colors hover:text-paper"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={(el) => {
        ref.current = el;
        registerSegmentRef(segment.startMs, el);
      }}
      className="group relative -mx-2 rounded-xs px-2 py-1 transition-colors hover:bg-ink-raised"
    >
      <p className="text-[15px] leading-relaxed text-paper/90">
        {highlight(segment.text, query)}
      </p>

      <div className="mt-1.5 flex items-center gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onSeek(segment.startMs)}
          className="data text-[10px] text-gray-dim transition-colors hover:text-accent"
        >
          {formatTimestamp(segment.startMs)}
        </button>
        <CopyButton value={segment.text} label="Copy" compact />
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="label border border-line px-2 py-1.5 transition-colors hover:border-line-lit hover:text-paper"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

/** Marks search hits without dangerouslySetInnerHTML. */
function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;

  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (;;) {
    const at = lower.indexOf(query, cursor);
    if (at === -1) break;
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <mark key={at} className="bg-accent/25 text-paper">
        {text.slice(at, at + query.length)}
      </mark>,
    );
    cursor = at + query.length;
  }

  if (cursor === 0) return text;
  parts.push(text.slice(cursor));
  return parts;
}
