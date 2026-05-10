"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { getPlaybackModeLabel } from "@/lib/youtube";
import type { PlaybackMode } from "@/types/game";

type ApiLoadState = "idle" | "loading" | "loaded" | "failed";
type PlaybackStateLabel =
  | "unstarted"
  | "ended"
  | "playing"
  | "paused"
  | "buffering"
  | "cued"
  | "unknown";

type YouTubePlayerStateCode = -1 | 0 | 1 | 2 | 3 | 5;

type YouTubePlayerInstance = {
  cueVideoById: (options: { videoId: string; startSeconds?: number; endSeconds?: number }) => void;
  loadVideoById: (options: { videoId: string; startSeconds?: number; endSeconds?: number }) => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  stopVideo: () => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  destroy: () => void;
};

type YouTubePlayerEvent = {
  data: number;
  target: YouTubePlayerInstance;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        config: {
          videoId?: string;
          width?: string;
          height?: string;
          playerVars?: Record<string, number | string | undefined>;
          events?: {
            onReady?: (event: YouTubePlayerEvent) => void;
            onError?: (event: YouTubePlayerEvent) => void;
            onStateChange?: (event: YouTubePlayerEvent) => void;
          };
        },
      ) => YouTubePlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
    __olympusYouTubeApiPromise?: Promise<void>;
  }
}

export type PlayerDebugState = {
  apiStatus: ApiLoadState;
  playerCreated: boolean;
  isReady: boolean;
  readyFired: boolean;
  errorFired: boolean;
  errorCode: number | null;
  errorMessage: string | null;
  playbackState: PlaybackStateLabel;
  playbackStateCode: number | null;
  currentTime: number;
  attemptedSeekTo: boolean;
  attemptedPlayVideo: boolean;
  stopTimerStarted: boolean;
};

export const DEFAULT_PLAYER_DEBUG_STATE: PlayerDebugState = {
  apiStatus: "loading",
  playerCreated: false,
  isReady: false,
  readyFired: false,
  errorFired: false,
  errorCode: null,
  errorMessage: null,
  playbackState: "unstarted",
  playbackStateCode: -1,
  currentTime: 0,
  attemptedSeekTo: false,
  attemptedPlayVideo: false,
  stopTimerStarted: false,
};

export type TimedYouTubePlayerHandle = {
  playClip: () => void;
  stopPlayback: () => void;
};

type TimedYouTubePlayerProps = {
  videoId: string | null;
  startSeconds: number;
  endSeconds: number;
  playbackMode: PlaybackMode;
  validationMessage?: string | null;
  autoPlayRequestKey?: string | null;
  spoilerGuard?: boolean;
  highlighted?: boolean;
  naked?: boolean;
  showDiagnostics?: boolean;
  onStatusChange?: (message: string) => void;
  onDebugChange?: (debugState: PlayerDebugState) => void;
  onVideoEnded?: () => void;
};

function mapPlaybackState(code: number | null): PlaybackStateLabel {
  switch (code) {
    case -1:
      return "unstarted";
    case 0:
      return "ended";
    case 1:
      return "playing";
    case 2:
      return "paused";
    case 3:
      return "buffering";
    case 5:
      return "cued";
    default:
      return "unknown";
  }
}

function getYouTubeErrorMessage(errorCode: number | null): string {
  switch (errorCode) {
    case 2:
      return "YouTube rejected the video request. Double-check the video ID or URL format.";
    case 5:
      return "The browser could not play this YouTube video in the HTML5 player.";
    case 100:
      return "The video was not found or is private/unavailable.";
    case 101:
    case 150:
      return "This video cannot be embedded by the owner. Try a different public YouTube video.";
    default:
      return "The YouTube player failed to initialize or load the selected video.";
  }
}

function loadYouTubeIframeApi(logEvent: (message: string, details?: unknown) => void): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The YouTube IFrame API can only load in the browser."));
  }

  if (window.YT?.Player) {
    logEvent("API script already available.");
    return Promise.resolve();
  }

  if (window.__olympusYouTubeApiPromise) {
    return window.__olympusYouTubeApiPromise;
  }

  window.__olympusYouTubeApiPromise = new Promise<void>((resolve, reject) => {
    logEvent("Loading YouTube IFrame API script...");

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    ) as HTMLScriptElement | null;
    const previousReadyHandler = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      logEvent("API script load success.");
      previousReadyHandler?.();
      resolve();
    };

    if (existingScript) {
      existingScript.addEventListener(
        "error",
        () => {
          reject(new Error("The YouTube IFrame API script failed to load."));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      reject(new Error("The YouTube IFrame API script failed to load."));
    };

    document.head.appendChild(script);
  });

  return window.__olympusYouTubeApiPromise;
}

export const TimedYouTubePlayer = forwardRef<TimedYouTubePlayerHandle, TimedYouTubePlayerProps>(
  function TimedYouTubePlayer(
    {
      videoId,
      startSeconds,
      endSeconds,
      playbackMode,
      validationMessage,
      autoPlayRequestKey,
      spoilerGuard = false,
      highlighted = false,
      naked = false,
      showDiagnostics = false,
      onStatusChange,
      onDebugChange,
      onVideoEnded,
    },
    ref,
  ) {
    const playerMountRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<YouTubePlayerInstance | null>(null);
    const playerReadyRef = useRef(false);
    const stopMonitorRef = useRef<number | null>(null);
    const timePollerRef = useRef<number | null>(null);
    const playbackSequenceTimeoutRef = useRef<number | null>(null);
    const pendingAutoPlayRef = useRef(false);
    // Tracks the startSeconds for the active clip so onStateChange can verify the seek.
    const activeStartSecondsRef = useRef<number>(0);
    // Set to true while a loadVideoById sequence is in flight — blocks cueVideoById from interfering.
    const loadingVideoRef = useRef(false);
    const [debugState, setDebugState] = useState<PlayerDebugState>(DEFAULT_PLAYER_DEBUG_STATE);

    const logEvent = useCallback((message: string, details?: unknown) => {
      if (details !== undefined) {
        console.info(`[Olympus Night][YouTube] ${message}`, details);
        return;
      }
      console.info(`[Olympus Night][YouTube] ${message}`);
    }, []);

    const pushStatus = useCallback(
      (message: string) => {
        onStatusChange?.(message);
      },
      [onStatusChange],
    );

    const updateDebugState = useCallback(
      (updater: (current: PlayerDebugState) => PlayerDebugState) => {
        setDebugState((current) => updater(current));
      },
      [],
    );

    const clearStopMonitor = useCallback(() => {
      if (stopMonitorRef.current !== null) {
        window.clearInterval(stopMonitorRef.current);
        stopMonitorRef.current = null;
        updateDebugState((current) => ({ ...current, stopTimerStarted: false }));
      }
    }, [updateDebugState]);

    const clearTimePoller = useCallback(() => {
      if (timePollerRef.current !== null) {
        window.clearInterval(timePollerRef.current);
        timePollerRef.current = null;
      }
    }, []);

    const clearPlaybackSequenceTimer = useCallback(() => {
      if (playbackSequenceTimeoutRef.current !== null) {
        window.clearTimeout(playbackSequenceTimeoutRef.current);
        playbackSequenceTimeoutRef.current = null;
      }
    }, []);

    const getSafeCurrentTime = useCallback(() => {
      const rawTime = playerRef.current?.getCurrentTime?.();
      return typeof rawTime === "number" && Number.isFinite(rawTime) ? Number(rawTime.toFixed(2)) : 0;
    }, []);

    const applyPlaybackMode = useCallback(() => {
      const player = playerRef.current as (YouTubePlayerInstance & { setVolume?: (vol: number) => void }) | null;

      // Guard: player must be fully ready and its mute/unMute methods must be callable.
      // The player object can exist (non-null) in a partially-torn-down state
      // (e.g. mid-destroy, or onReady hasn't fired yet) where API methods are absent.
      if (!player || !playerReadyRef.current) {
        return;
      }
      if (typeof player.mute !== "function" || typeof player.unMute !== "function") {
        return;
      }

      if (playbackMode === "video-only") {
        player.mute();
        logEvent("Applied video-only mode: video visible, audio muted.");
        return;
      }

      player.unMute();
      player.setVolume?.(100);

      if (playbackMode === "audio-only") {
        logEvent("Applied audio-only guessing mode with fully hidden video.");
        return;
      }

      logEvent("Applied audio + video mode.");
    }, [logEvent, playbackMode]);

    const startStopMonitor = useCallback(
      (clipEndSeconds: number) => {
        const player = playerRef.current;

        if (!player) {
          return;
        }

        clearStopMonitor();

        stopMonitorRef.current = window.setInterval(() => {
          const currentTime = getSafeCurrentTime();

          updateDebugState((current) => ({ ...current, currentTime }));

          if (currentTime >= clipEndSeconds) {
            logEvent("Stop triggered at playback time.", { currentTime, endSeconds: clipEndSeconds });
            player.stopVideo();
            clearStopMonitor();
            pushStatus("Playback stopped automatically at the selected end time.");
          }
        }, 250);

        logEvent("Stop timer started.", { endSeconds: clipEndSeconds });
        updateDebugState((current) => ({ ...current, stopTimerStarted: true }));
      },
      [clearStopMonitor, getSafeCurrentTime, logEvent, pushStatus, updateDebugState],
    );

    const runPlaybackSequence = useCallback(
      (reason: string) => {
        logEvent("Round playback requested.", {
          reason,
          videoId,
          startSeconds,
          endSeconds,
          playbackMode,
        });

        if (!videoId) {
          const message = "Cannot play because the parsed video ID is invalid.";
          pushStatus(message);
          updateDebugState((current) => ({
            ...current,
            errorFired: true,
            errorMessage: message,
          }));
          return;
        }

        if (validationMessage) {
          pushStatus(validationMessage);
          updateDebugState((current) => ({
            ...current,
            errorFired: true,
            errorMessage: validationMessage,
          }));
          return;
        }

        const player = playerRef.current;

        if (!player || !playerReadyRef.current) {
          pendingAutoPlayRef.current = true;
          logEvent("Playback queued until player ready.", { reason });
          pushStatus("Waiting for the YouTube player to finish loading...");
          return;
        }

        pendingAutoPlayRef.current = false;
        loadingVideoRef.current = true;
        activeStartSecondsRef.current = startSeconds;
        clearStopMonitor();
        clearPlaybackSequenceTimer();
        applyPlaybackMode();

        updateDebugState((current) => ({
          ...current,
          attemptedSeekTo: false,
          attemptedPlayVideo: false,
          errorFired: false,
          errorCode: null,
          errorMessage: null,
        }));

        player.stopVideo();
        // loadVideoById with startSeconds tells YouTube where to begin, but the API
        // silently ignores this hint when the video is cached. We correct the position
        // in onStateChange (state=playing) instead of relying on a blind setTimeout.
        player.loadVideoById({
          videoId,
          startSeconds,
          endSeconds,
        });

        // Belt-and-suspenders: also seekTo after a short buffer, in case the video
        // starts playing before onStateChange fires (e.g. autoplay from cache).
        playbackSequenceTimeoutRef.current = window.setTimeout(() => {
          const activePlayer = playerRef.current;
          if (!activePlayer) return;

          const currentTime = activePlayer.getCurrentTime?.() ?? 0;
          if (currentTime < startSeconds - 0.5) {
            activePlayer.seekTo(startSeconds, true);
          }
          activePlayer.playVideo();

          updateDebugState((current) => ({
            ...current,
            attemptedSeekTo: true,
            attemptedPlayVideo: true,
          }));

          pushStatus(`Playing clip from ${startSeconds}s to ${endSeconds}s.`);
          startStopMonitor(endSeconds);
        }, 250);
      },
      [
        applyPlaybackMode,
        clearPlaybackSequenceTimer,
        clearStopMonitor,
        endSeconds,
        logEvent,
        playbackMode,
        pushStatus,
        startSeconds,
        startStopMonitor,
        updateDebugState,
        validationMessage,
        videoId,
      ],
    );

    const playClip = useCallback(() => {
      runPlaybackSequence("manual-replay");
    }, [runPlaybackSequence]);

    const stopPlayback = useCallback(() => {
      logEvent("stopVideo requested.");
      clearStopMonitor();
      clearPlaybackSequenceTimer();

      const player = playerRef.current;

      if (!player) {
        pushStatus("No player instance exists yet.");
        return;
      }

      player.stopVideo();
      pushStatus("Playback stopped.");
    }, [clearPlaybackSequenceTimer, clearStopMonitor, logEvent, pushStatus]);

    useImperativeHandle(
      ref,
      () => ({
        playClip,
        stopPlayback,
      }),
      [playClip, stopPlayback],
    );

    useEffect(() => {
      onDebugChange?.(debugState);
    }, [debugState, onDebugChange]);

    useEffect(() => {
      applyPlaybackMode();
    }, [applyPlaybackMode]);

    useEffect(() => {
      let cancelled = false;

      loadYouTubeIframeApi(logEvent)
        .then(() => {
          if (!cancelled) {
            updateDebugState((current) => ({ ...current, apiStatus: "loaded" }));
          }
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          const message =
            error instanceof Error ? error.message : "The YouTube IFrame API failed to load.";

          console.error("[Olympus Night][YouTube] API script load failure", error);
          updateDebugState((current) => ({
            ...current,
            apiStatus: "failed",
            errorFired: true,
            errorMessage: message,
          }));
          pushStatus(message);
        });

      return () => {
        cancelled = true;
      };
    }, [logEvent, pushStatus, updateDebugState]);

    useEffect(() => {
      logEvent("Player mounted.", { videoId });

      return () => {
        logEvent("Player unmounted.", { videoId });
        playerReadyRef.current = false;
        pendingAutoPlayRef.current = false;
        clearStopMonitor();
        clearTimePoller();
        clearPlaybackSequenceTimer();

        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }
      };
    }, [clearPlaybackSequenceTimer, clearStopMonitor, clearTimePoller, logEvent, videoId]);

    useEffect(() => {
      if (!videoId || debugState.apiStatus !== "loaded" || !playerMountRef.current || playerRef.current) {
        return;
      }

      playerMountRef.current.innerHTML = "";
      logEvent("Creating YouTube player instance.", { videoId });

      const player = new window.YT!.Player(playerMountRef.current, {
        width: "100%",
        height: "100%",
        videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          iv_load_policy: 3,
          cc_load_policy: 0,
          modestbranding: 1,
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
          start: Math.floor(startSeconds),
          end: Math.floor(endSeconds),
        },
        events: {
          onReady: (event) => {
            logEvent("Player ready.", { videoId });
            playerRef.current = event.target;
            playerReadyRef.current = true;
            applyPlaybackMode();
            updateDebugState((current) => ({
              ...current,
              playerCreated: true,
              isReady: true,
              readyFired: true,
              errorFired: false,
              errorCode: null,
              errorMessage: null,
            }));
            pushStatus("YouTube player ready.");

            if (pendingAutoPlayRef.current) {
              logEvent("Player ready -> starting queued round playback.");
              window.setTimeout(() => {
                runPlaybackSequence("player-ready");
              }, 50);
            }
          },
          onError: (event) => {
            const errorCode = typeof event.data === "number" ? event.data : null;
            const errorMessage = getYouTubeErrorMessage(errorCode);

            console.error("[Olympus Night][YouTube] Player error", { errorCode });
            clearStopMonitor();
            updateDebugState((current) => ({
              ...current,
              errorFired: true,
              errorCode,
              errorMessage,
              playbackState: "unknown",
              playbackStateCode: errorCode,
            }));
            pushStatus(errorMessage);
          },
          onStateChange: (event) => {
            const nextState = mapPlaybackState(event.data as YouTubePlayerStateCode);

            logEvent("State change.", { code: event.data, label: nextState });
            updateDebugState((current) => ({
              ...current,
              playbackState: nextState,
              playbackStateCode: event.data,
            }));

            if (nextState === "cued") {
              logEvent("Video loaded and cued.", { videoId, startSeconds, endSeconds });
            }

            // Fix Bug 1 & 2: the moment YouTube actually starts playing, verify the
            // position. loadVideoById's startSeconds hint is ignored when the video
            // is cached; seekTo in a blind setTimeout can also lose to early autoplay.
            // Correcting here (state=1=playing) is the only reliable moment.
            if (nextState === "playing") {
              const target = activeStartSecondsRef.current;
              const currentTime = event.target.getCurrentTime?.() ?? 0;
              if (target > 0.5 && currentTime < target - 0.5) {
                logEvent("Seek correction on play: video started too early.", { currentTime, target });
                event.target.seekTo(target, true);
              }
              loadingVideoRef.current = false;
            }

            if (nextState === "ended") {
              clearStopMonitor();
              pushStatus("Clip finished.");
              onVideoEnded?.();
            }
          },
        },
      });

      playerRef.current = player;
      window.setTimeout(() => {
        updateDebugState((current) => ({ ...current, playerCreated: true }));
      }, 0);
    }, [
      applyPlaybackMode,
      clearStopMonitor,
      debugState.apiStatus,
      endSeconds,
      logEvent,
      pushStatus,
      runPlaybackSequence,
      startSeconds,
      updateDebugState,
      videoId,
    ]);

    useEffect(() => {
      // Bug 3 fix: skip cueVideoById while a loadVideoById sequence is in flight.
      // Calling cueVideoById mid-load resets the player's internal startSeconds and
      // causes it to snap to a different (often wrong) position.
      if (!playerRef.current || !playerReadyRef.current || !videoId || validationMessage || loadingVideoRef.current) {
        return;
      }

      logEvent("cueVideoById called.", { videoId, startSeconds, endSeconds });
      playerRef.current.cueVideoById({
        videoId,
        startSeconds,
        endSeconds,
      });
      applyPlaybackMode();
    }, [applyPlaybackMode, endSeconds, logEvent, startSeconds, validationMessage, videoId]);

    useEffect(() => {
      if (!autoPlayRequestKey) {
        return;
      }

      logEvent("Round changed.", {
        autoPlayRequestKey,
        videoId,
        startSeconds,
        endSeconds,
        playbackMode,
      });
      pendingAutoPlayRef.current = true;

      const timer = window.setTimeout(() => {
        runPlaybackSequence("round-change");
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }, [autoPlayRequestKey, endSeconds, logEvent, playbackMode, runPlaybackSequence, startSeconds, videoId]);

    useEffect(() => {
      if (!debugState.isReady) {
        clearTimePoller();
        return;
      }

      timePollerRef.current = window.setInterval(() => {
        const player = playerRef.current;

        if (!player) {
          return;
        }

        const currentTime = getSafeCurrentTime();
        updateDebugState((current) =>
          current.currentTime === currentTime ? current : { ...current, currentTime },
        );
      }, 250);

      return () => {
        clearTimePoller();
      };
    }, [clearTimePoller, debugState.isReady, getSafeCurrentTime, updateDebugState]);

    const fallbackMessage = useMemo(() => {
      if (validationMessage) {
        return validationMessage;
      }

      if (!videoId) {
        return "Enter a valid YouTube URL to initialize the player.";
      }

      if (debugState.apiStatus === "failed") {
        return debugState.errorMessage ?? "The YouTube IFrame API failed to load.";
      }

      if (debugState.errorMessage) {
        return debugState.errorMessage;
      }

      if (!debugState.playerCreated) {
        return "Creating YouTube player instance...";
      }

      if (!debugState.readyFired) {
        return "Player instance created. Waiting for onReady...";
      }

      return null;
    }, [debugState, validationMessage, videoId]);

    return (
      <div
        className={naked ? "h-full w-full" : "rounded-3xl p-4 shadow-2xl"}
        style={
          naked
            ? undefined
            : highlighted
            ? { background: "rgba(5,3,18,0.85)", border: "2px solid rgba(201,162,39,0.55)", boxShadow: "0 0 60px rgba(201,162,39,0.25), 0 0 120px rgba(201,162,39,0.10)" }
            : { background: "rgba(5,3,18,0.80)", border: "1px solid rgba(255,255,255,0.08)" }
        }
      >
        {!naked ? (
          <div className="mb-3 flex justify-end">
            <span className="rounded-full px-3 py-1 text-sm font-medium" style={{ background: "rgba(5,3,18,0.80)", border: "1px solid rgba(201,162,39,0.30)", color: "#E8C55A" }}>{getPlaybackModeLabel(playbackMode)}</span>
          </div>
        ) : null}

        <div className={naked ? "relative h-full w-full overflow-hidden bg-black" : "relative aspect-video overflow-hidden rounded-2xl bg-black"}>
          <div ref={playerMountRef} className="h-full w-full" />

          {fallbackMessage ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/90 px-6 text-center text-sm text-slate-100 backdrop-blur-sm">
              {fallbackMessage}
            </div>
          ) : null}

          {playbackMode === "audio-only" && debugState.readyFired ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center text-slate-100" style={{ background: "#07051a" }}>
              <div className="rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em]" style={{ border: "1px solid rgba(201,162,39,0.30)", background: "rgba(201,162,39,0.10)", color: "#E8C55A" }}>
                Audio only mode
              </div>
              <p className="mt-4 max-w-md px-6 text-lg font-medium">
                Video is fully hidden during the guessing phase.
              </p>
            </div>
          ) : null}

          {spoilerGuard && playbackMode !== "audio-only" && debugState.readyFired ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-slate-950" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-slate-950" />
              <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-slate-950" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-slate-950" />
            </>
          ) : null}
        </div>

        {showDiagnostics ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              <div className="font-semibold text-slate-100">API</div>
              <div>{debugState.apiStatus}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              <div className="font-semibold text-slate-100">Ready</div>
              <div>{debugState.readyFired ? "Yes" : "No"}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              <div className="font-semibold text-slate-100">State</div>
              <div>{debugState.playbackState}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              <div className="font-semibold text-slate-100">Time</div>
              <div>{Number.isFinite(debugState.currentTime) ? debugState.currentTime.toFixed(2) : "0.00"}s</div>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);
