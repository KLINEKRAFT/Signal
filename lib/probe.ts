/**
 * Reads duration and a poster frame in the browser, before anything is
 * uploaded. Doing this client-side means the server never needs FFmpeg and the
 * user sees real metadata the instant they pick a file.
 */
export async function probeMedia(
  file: File,
): Promise<{ durationMs: number | null; posterUrl: string | null }> {
  const isVideo = file.type.startsWith('video/');
  const objectUrl = URL.createObjectURL(file);

  try {
    const el = document.createElement(isVideo ? 'video' : 'audio') as
      | HTMLVideoElement
      | HTMLAudioElement;
    el.preload = 'metadata';
    el.muted = true;
    el.src = objectUrl;

    const durationSec = await new Promise<number | null>((resolve) => {
      const done = (v: number | null) => resolve(v);
      const timer = setTimeout(() => done(null), 8000);
      el.onloadedmetadata = () => {
        clearTimeout(timer);
        done(Number.isFinite(el.duration) ? el.duration : null);
      };
      el.onerror = () => {
        clearTimeout(timer);
        done(null);
      };
    });

    let posterUrl: string | null = null;
    if (isVideo && durationSec) {
      posterUrl = await capturePoster(el as HTMLVideoElement, durationSec);
    }

    return {
      durationMs: durationSec ? Math.round(durationSec * 1000) : null,
      posterUrl,
    };
  } finally {
    // Poster frames are data URLs, so the object URL is safe to release.
    URL.revokeObjectURL(objectUrl);
  }
}

function capturePoster(video: HTMLVideoElement, durationSec: number): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 6000);

    const draw = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 320 / (video.videoWidth || 320));
        canvas.width = Math.max(1, Math.round((video.videoWidth || 320) * scale));
        canvas.height = Math.max(1, Math.round((video.videoHeight || 180) * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        resolve(null);
      }
    };

    video.onseeked = draw;
    video.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    // A frame a little way in avoids black leader frames.
    video.currentTime = Math.min(durationSec * 0.1, 3);
  });
}
