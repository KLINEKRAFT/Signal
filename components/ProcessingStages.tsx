import { STAGES, stageStates, type JobStatus } from '@/lib/types';
import { SignalBar } from './SignalBar';

const HEADLINE: Record<JobStatus, string> = {
  created: 'WAITING FOR MEDIA',
  uploading: 'UPLOADING',
  uploaded: 'MEDIA PREPARED',
  transcribing: 'TRANSCRIBING',
  analyzing: 'ANALYZING',
  complete: 'COMPLETE',
  failed: 'STOPPED',
};

const SUBTEXT: Record<JobStatus, string> = {
  created: 'MEDIA PIPELINE READY',
  uploading: 'SOURCE TRANSFER ACTIVE',
  uploaded: 'SOURCE STORED',
  transcribing: 'TRANSCRIPT ENGINE ACTIVE',
  analyzing: 'ANALYSIS PASS',
  complete: 'OUTPUT READY',
  failed: 'PROCESS HALTED',
};

export function ProcessingStages({
  status,
  failedStage,
  index,
}: {
  status: JobStatus;
  failedStage?: string | null;
  index: number;
}) {
  const states = stageStates(status, failedStage);
  const active = status === 'transcribing' || status === 'analyzing' || status === 'uploaded';

  return (
    <div>
      <div className="flex items-start gap-5">
        <span className="data text-5xl font-medium leading-none text-gray-faint sm:text-6xl">
          {String(index).padStart(2, '0')}
        </span>
        <div className="min-w-0 pt-1">
          <h1 className="font-display text-2xl font-medium tracking-[0.1em] sm:text-3xl">
            {HEADLINE[status]}
          </h1>
          <p className="label mt-2">{SUBTEXT[status]}</p>
        </div>
      </div>

      <div className="mt-6">
        <SignalBar active={active} />
      </div>

      <ol className="mt-8 space-y-0 border-t border-line">
        {STAGES.map((stage) => {
          const state = states[stage.key];
          return (
            <li
              key={stage.key}
              className="flex items-center gap-4 border-b border-line py-3.5"
            >
              <Marker state={state} />
              <span
                className={`label ${
                  state === 'done' || state === 'active' ? 'label-lit' : ''
                } ${state === 'active' ? 'text-paper' : ''} ${
                  state === 'failed' ? 'text-accent' : ''
                }`}
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Marker({ state }: { state: 'done' | 'active' | 'pending' | 'failed' }) {
  if (state === 'done') {
    return (
      <span aria-hidden className="w-4 shrink-0 text-center text-xs text-paper">
        &#10003;
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span aria-hidden className="w-4 shrink-0 text-center text-xs text-accent">
        &#215;
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span aria-hidden className="flex w-4 shrink-0 justify-center">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
    );
  }
  return (
    <span aria-hidden className="flex w-4 shrink-0 justify-center">
      <span className="h-1.5 w-1.5 rounded-full border border-gray-faint" />
    </span>
  );
}
