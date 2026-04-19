import type { PlaybackMode } from "@/types/game";

const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Accepts common YouTube URL formats or a raw 11-character video ID.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const value = input.trim();

  if (!value) {
    return null;
  }

  if (YOUTUBE_ID_PATTERN.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const shortId = url.pathname.split("/").filter(Boolean)[0];
      return shortId && YOUTUBE_ID_PATTERN.test(shortId) ? shortId : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const watchId = url.searchParams.get("v");
      if (watchId && YOUTUBE_ID_PATTERN.test(watchId)) {
        return watchId;
      }

      const pathParts = url.pathname.split("/").filter(Boolean);
      const embeddedId = pathParts[pathParts.length - 1];

      if (
        ["embed", "shorts", "live", "v"].includes(pathParts[0] ?? "") &&
        embeddedId &&
        YOUTUBE_ID_PATTERN.test(embeddedId)
      ) {
        return embeddedId;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function validateClipRange(startSeconds: number, endSeconds: number): string | null {
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
    return "Start and end times must be valid numbers.";
  }

  if (startSeconds < 0 || endSeconds < 0) {
    return "Start and end times cannot be negative.";
  }

  if (endSeconds <= startSeconds) {
    return "End time must be greater than start time.";
  }

  return null;
}

export function getPlaybackModeLabel(mode: PlaybackMode): string {
  switch (mode) {
    case "audio-only":
      return "Audio only";
    case "video-only":
      return "Video only";
    default:
      return "Audio + video";
  }
}
