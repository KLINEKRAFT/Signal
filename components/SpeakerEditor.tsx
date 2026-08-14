'use client';

import { useState } from 'react';
import type { JobPayload } from '@/lib/types';

/**
 * Renaming speakers.
 *
 * `SPEAKER_01` is the provider's identity and stays in the database; the
 * display name is a separate column, so renaming updates every occurrence at
 * once through the join and never rewrites a single segment.
 *
 * Names supplied before processing appear as one-tap suggestions rather than
 * being assigned automatically. Diarization numbers speakers by order of first
 * appearance, which usually matches the order people list them — but "usually"
 * is not good enough when the name ends up attached to a quote.
 */
export function SpeakerEditor({
  speakers,
  suggestions,
  onRename,
}: {
  speakers: JobPayload['speakers'];
  suggestions: { name: string; role?: string }[];
  onRename: (speakerId: string, displayName: string) => Promise<void>;
}) {
  if (!speakers.length) {
    return (
      <div className="border border-line p-4">
        <p className="label label-lit">SPEAKERS</p>
        <p className="mt-3 text-xs leading-relaxed text-gray-dim">
          No separate speakers were detected in this recording.
        </p>
      </div>
    );
  }

  const taken = new Set(speakers.map((s) => s.displayName).filter(Boolean));
  const unused = suggestions.filter((s) => !taken.has(s.name));

  return (
    <div className="border border-line p-4">
      <p className="label label-lit">SPEAKERS</p>
      <p className="mt-2 text-xs leading-relaxed text-gray-dim">
        Renaming updates the whole transcript.
      </p>

      <ul className="mt-4 space-y-3">
        {speakers.map((speaker) => (
          <SpeakerRow
            key={speaker.id}
            speaker={speaker}
            suggestions={unused}
            onRename={onRename}
          />
        ))}
      </ul>
    </div>
  );
}

function SpeakerRow({
  speaker,
  suggestions,
  onRename,
}: {
  speaker: JobPayload['speakers'][number];
  suggestions: { name: string; role?: string }[];
  onRename: (speakerId: string, displayName: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(speaker.displayName ?? '');
  const [saving, setSaving] = useState(false);

  const dirty = draft.trim() !== (speaker.displayName ?? '');

  const commit = async (value?: string) => {
    const next = (value ?? draft).trim();
    setSaving(true);
    try {
      await onRename(speaker.id, next);
      setDraft(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li>
      <p className="label">{speaker.providerLabel}</p>

      <div className="mt-1.5 flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => dirty && commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          placeholder="Add a name"
          disabled={saving}
          className="min-w-0 flex-1 border border-line px-2.5 py-2 text-xs text-paper transition-colors focus:border-line-lit focus:outline-none disabled:opacity-50"
        />
        {dirty ? (
          <button
            type="button"
            onClick={() => commit()}
            disabled={saving}
            className="label shrink-0 border border-line px-2.5 transition-colors hover:border-line-lit hover:text-paper disabled:opacity-40"
          >
            {saving ? '…' : 'Set'}
          </button>
        ) : null}
      </div>

      {!speaker.displayName && suggestions.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.name}
              type="button"
              onClick={() => commit(suggestion.name)}
              title={suggestion.role ? `${suggestion.name} — ${suggestion.role}` : suggestion.name}
              className="label border border-dashed border-line px-2 py-1 transition-colors hover:border-accent hover:text-accent"
            >
              {suggestion.name}
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}
