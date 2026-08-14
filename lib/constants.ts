/**
 * AssemblyAI accepts up to 5 GB and 10 hours at /v2/transcript and strips audio
 * from video itself, so there is no extraction or chunking step in this app.
 * These constants are the real provider ceiling — anything above them fails
 * fast with a clear message rather than being silently mangled.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
export const MAX_DURATION_MS = 10 * 60 * 60 * 1000; // 10 hours

/** Multipart is recommended by Vercel above 100 MB; below that it adds cost. */
export const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;

export const ACCEPTED_MIME_PREFIXES = ['video/', 'audio/'];

export const ACCEPTED_EXTENSIONS = [
  '.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.ts', '.mts',
  '.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg', '.opus', '.wma',
];

/** Shown in the dropzone. Deliberately short — the full list is in the README. */
export const SUPPORTED_SUMMARY = 'MP4 · MOV · WEBM · MKV · MP3 · M4A · WAV · FLAC';

/**
 * If a job has been `transcribing` longer than this, the job route reconciles
 * against the provider on read instead of trusting the webhook. Hobby cron runs
 * once a day, so this is the self-healing mechanism, not a scheduled poll.
 */
export const RECONCILE_AFTER_MS = 3 * 60 * 1000;
