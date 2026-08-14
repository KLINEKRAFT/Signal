/**
 * Restrained activity indicator. A pulse travels across a dot row while a stage
 * is live. It is not a waveform and does not pretend to be one — no real audio
 * amplitude data exists at this point in the pipeline.
 */
export function SignalBar({ active }: { active: boolean }) {
  if (!active) {
    return <div className="dot-rule w-full opacity-60" aria-hidden />;
  }
  return (
    <div
      className="signal-track h-1.5 w-full"
      role="progressbar"
      aria-label="Processing"
      aria-valuetext="In progress"
    />
  );
}
