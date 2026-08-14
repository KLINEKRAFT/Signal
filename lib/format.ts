export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** 00:46:21 for anything over an hour, 46:21 otherwise. */
export function formatDuration(ms?: number | null): string {
  if (ms == null) return '--:--';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Always HH:MM:SS. Used for positions inside a recording, where a fixed width
 * keeps a column of timestamps readable and unambiguous — unlike formatDuration
 * above, which drops the hour for short recordings.
 */
export function formatTimestamp(ms?: number | null): string {
  if (ms == null) return '00:00:00';
  const total = Math.max(0, Math.round(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '--';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d
    .toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(',', '');
}

/** SOURCE_001 style label derived from a job id. */
export function sourceLabel(id: string, index?: number): string {
  if (typeof index === 'number') return `SOURCE_${String(index).padStart(3, '0')}`;
  return `SOURCE_${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

export function mediaKind(mime: string): 'video' | 'audio' {
  return mime.startsWith('video/') ? 'video' : 'audio';
}
