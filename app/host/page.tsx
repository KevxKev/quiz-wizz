"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_PLAYER_DEBUG_STATE,
  TimedYouTubePlayer,
  type PlayerDebugState,
  type TimedYouTubePlayerHandle,
} from "@/components/host/TimedYouTubePlayer";
import {
  DEFAULT_ANSWERING_DURATION_SECONDS,
  DEFAULT_LEADERBOARD_DURATION_SECONDS,
  DEFAULT_REPLAY_DURATION_SECONDS,
  DEFAULT_REVEAL_DURATION_SECONDS,
  DEFAULT_ROUND_INTRO_DURATION_SECONDS,
  DEFAULT_WORTHY_PLAYING_MAX_SECONDS,
  buildLeaderboard,
  buildRoundPayloadFromQuizEntry,
  createPhaseDeadline,
  generateRoomCode,
  getCountdownSeconds,
  getPhaseDurationSeconds,
  getPhaseProgressPercent,
  getReplayWindow,
  getRoomStatusLabel,
  mergeQuizEntries,
  readStoredQuizEntries,
  summarizeRoundReveal,
} from "@/lib/room";
import {
  formatSupabaseErrorMessage,
  getSupabaseBrowserClient,
  getSupabaseSetupMessage,
  isSupabaseSchemaError,
} from "@/lib/supabase";
import { formatSecondsAsClock, parseClockInputToSeconds } from "@/lib/time";
import { parseYouTubeVideoId, validateClipRange } from "@/lib/youtube";
import type {
  LeaderboardEntry,
  PlaybackMode,
  QuizEntry,
  Room,
  RoomPlayer,
  RoomStatus,
  Round,
  RoundAnswer,
  RoundState,
} from "@/types/game";
import { OlympusBackground, OlympusTransition } from "@/components/ui";

type RoundCountSetting = "3" | "5" | "all";

const ROUND_COUNT_OPTIONS: Array<{ value: RoundCountSetting; label: string }> = [
  { value: "3", label: "3 rounds" },
  { value: "5", label: "5 rounds" },
  { value: "all", label: "All saved entries" },
];

const PHASE_SPLASH_DURATION_MS = 700;

function getHostStatusMessage(args: {
  room: Room;
  players: RoomPlayer[];
  currentRound: Round | null;
  answerCount: number;
  readyCount: number;
  revealSummary: { correctCount: number; correctPlayerNames: string[] };
  leaderboard: LeaderboardEntry[];
}) {
  const { room, players, currentRound, answerCount, readyCount, revealSummary, leaderboard } = args;
  const totalPlayers = players.length;
  const totalRounds = room.total_rounds ?? 0;

  switch (room.status) {
    case "lobby":
      return `Lobby open. ${readyCount}/${totalPlayers} player(s) are ready. Start the game when you want the automated loop to begin.`;
    case "playing":
      return currentRound
        ? `Round ${currentRound.round_number}${totalRounds ? ` of ${totalRounds}` : ""} is about to begin.`
        : "The next round is loading...";
    case "clip_playing":
      return currentRound
        ? `Round ${currentRound.round_number}: the clip is playing and answers are already live. ${answerCount}/${totalPlayers} player(s) have answered.`
        : "The clip is starting...";
    case "answering":
      return currentRound
        ? `Final chance for round ${currentRound.round_number}. ${answerCount}/${totalPlayers} player(s) have locked an answer.`
        : "Final answers are open.";
    case "revealed":
      return currentRound
        ? `Round ${currentRound.round_number} revealed. Correct answer: ${currentRound.correct_answer ?? "not set"}. ${revealSummary.correctCount} player(s) got it right.`
        : "The round has been revealed.";
    case "leaderboard":
      return leaderboard.length > 0
        ? `Leaderboard break. ${leaderboard[0]?.nickname ?? "No one"} is currently leading with ${leaderboard[0]?.score ?? 0} point(s).`
        : "Showing the leaderboard before the next round.";
    case "finished":
      return room.winner_name
        ? `Game finished. ${room.winner_name} wins the session.`
        : "Game finished. Reset the room to play again.";
    default:
      return "Room ready.";
  }
}

function getHostPhaseDisplay(args: {
  status?: RoomStatus | null;
  roundNumber?: number | null;
  countdownSeconds?: number | null;
  answerCount?: number;
  playerCount?: number;
  readyCount?: number;
  winnerName?: string | null;
}) {
  const {
    status,
    roundNumber,
    countdownSeconds,
    answerCount = 0,
    playerCount = 0,
    readyCount = 0,
    winnerName,
  } = args;

  switch (status) {
    case "lobby":
      return {
        badge: "Lobby",
        title: "Get Ready",
        subtitle: `${readyCount}/${playerCount} player(s) are ready. Start when everyone is set.`,
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "playing":
      return {
        badge: roundNumber ? `Round ${roundNumber}` : "Get Ready",
        title: "Get Ready",
        subtitle: "The next clip is about to start.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "clip_playing":
      return {
        badge: roundNumber ? `Round ${roundNumber}` : "Now playing",
        title: "Guess the Song",
        subtitle:
          countdownSeconds !== null
            ? `${countdownSeconds}s left in the clip. ${answerCount}/${playerCount} answered.`
            : "The clip is playing and answers are live.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "answering":
      return {
        badge: roundNumber ? `Round ${roundNumber}` : "Last chance",
        title: "Guess the Song",
        subtitle:
          countdownSeconds !== null
            ? `${countdownSeconds}s left to lock in an answer. ${answerCount}/${playerCount} submitted.`
            : "Final answers are open right now.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "revealed":
      return {
        badge: roundNumber ? `Round ${roundNumber}` : "Reveal",
        title: "Leaderboard",
        subtitle: "Correct answer revealed. Scores updated.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "leaderboard":
      return {
        badge: "Scores",
        title: "Leaderboard",
        subtitle: "Scores are updating before the next round.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "worthy_playing":
      return {
        badge: "Worthy!",
        title: "The gods have spoken",
        subtitle: "The full song is playing. Next round begins after.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "finished":
      return {
        badge: "Final result",
        title: winnerName ? `${winnerName} wins!` : "Game finished",
        subtitle: "Press Play Again / Reset Room to start a new session.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    default:
      return {
        badge: "Olympus Night",
        title: "Ready to play",
        subtitle: "Create a room to begin.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
  }
}

function fmtScore(score: number): string {
  return Math.round(score).toLocaleString();
}

function fmtSpeed(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return (ms / 1000).toFixed(2) + "s";
}

export default function HostPage() {
  const playerHandleRef = useRef<TimedYouTubePlayerHandle | null>(null);
  const preparedRoundRef = useRef<string | null>(null);
  const phaseChangeKeyRef = useRef<string | null>(null);
  const shuffledEntryOrderRef = useRef<string[]>([]);
  // Prevents the "early worthy trigger" from firing more than once per round
  const worthyAutoTriggeredRef = useRef(false);
  const soundtrackRef = useRef<HTMLAudioElement | null>(null);
  const soundtrackFadeRef = useRef<number | null>(null);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://192.168.2.15:3001";

  const [youtubeUrl, setYoutubeUrl] = useState("https://www.youtube.com/watch?v=M7lc1UVf-VE");
  const [startTimeInput, setStartTimeInput] = useState("00:00");
  const [endTimeInput, setEndTimeInput] = useState("00:15");
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("audio-video");
  const [roundCountSetting, setRoundCountSetting] = useState<RoundCountSetting>("5");
  const [, setPlayerStatus] = useState("Ready. Once a round starts, the TV screen will advance automatically.");
  const [, setPlayerDebug] = useState<PlayerDebugState>(DEFAULT_PLAYER_DEBUG_STATE);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [answerCount, setAnswerCount] = useState(0);
  const [, setCorrectAnswerCount] = useState(0);
  const [correctPlayerNames, setCorrectPlayerNames] = useState<string[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [quizEntryCount, setQuizEntryCount] = useState(0);
  const [roomStatus, setRoomStatus] = useState("Create a room, let players join, and then start the automated game session.");
  const [, setHostDebugSteps] = useState<string[]>([]);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isAdvancingPhase, setIsAdvancingPhase] = useState(false);
  const [isResettingRoom, setIsResettingRoom] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [phaseSplash, setPhaseSplash] = useState<{ title: string; subtitle: string; visible: boolean } | null>(null);
  const [supabaseMessage] = useState<string | null>(supabase ? null : getSupabaseSetupMessage());
  const [worthyVoteCount, setWorthyVoteCount] = useState(0);
  const [worthyVotesSubmitted, setWorthyVotesSubmitted] = useState(0);

  const parsedVideoId = useMemo(() => parseYouTubeVideoId(youtubeUrl), [youtubeUrl]);
  const startSeconds = useMemo(() => parseClockInputToSeconds(startTimeInput), [startTimeInput]);
  const endSeconds = useMemo(() => parseClockInputToSeconds(endTimeInput), [endTimeInput]);

  const validationMessage = useMemo(() => {
    if (!youtubeUrl.trim()) {
      return "Enter a YouTube URL or a raw 11-character video ID.";
    }

    if (!parsedVideoId) {
      return "That does not look like a valid YouTube link.";
    }

    if (startSeconds === null || endSeconds === null) {
      return "Use `mm:ss` format for start and end time, for example `00:15` or `01:05`.";
    }

    return validateClipRange(startSeconds, endSeconds);
  }, [endSeconds, parsedVideoId, startSeconds, youtubeUrl]);

  const playerRenderKey = currentRound?.id
    ? `round-${currentRound.id}${room?.status === "worthy_playing" ? "-worthy" : ""}`
    : "manual-player";
  const autoPlayRequestKey =
    room && currentRound && (room.status === "clip_playing" || room.status === "revealed" || room.status === "worthy_playing")
      ? `${currentRound.id}-${room.status}`
      : null;
  const readyPlayerCount = useMemo(
    () => players.filter((player) => !player.is_host && Boolean(player.is_ready)).length,
    [players],
  );
  const countdownSeconds = useMemo(
    () => getCountdownSeconds(room?.phase_ends_at ?? null, nowMs),
    [nowMs, room?.phase_ends_at],
  );
  const phaseProgressPercent = useMemo(
    () => getPhaseProgressPercent(room?.phase_started_at ?? null, room?.phase_ends_at ?? null, nowMs),
    [nowMs, room?.phase_ends_at, room?.phase_started_at],
  );
  const totalRoundsLabel = room?.total_rounds
    ? `${Math.min(room.current_round_number || 0, room.total_rounds)}/${room.total_rounds}`
    : room
      ? `${room.current_round_number}/?`
      : "0/0";
  const phaseDisplay = useMemo(
    () =>
      getHostPhaseDisplay({
        status: room?.status,
        roundNumber: currentRound?.round_number ?? null,
        countdownSeconds,
        answerCount,
        playerCount: players.length,
        readyCount: readyPlayerCount,
        winnerName: room?.winner_name ?? leaderboard[0]?.nickname ?? null,
      }),
    [answerCount, countdownSeconds, currentRound?.round_number, leaderboard, players.length, readyPlayerCount, room?.status, room?.winner_name],
  );

  const logHostStep = useCallback((label: string, details?: unknown) => {
    const timestamp = new Date().toLocaleTimeString();
    const detailText = details === undefined ? "" : ` ${JSON.stringify(details)}`;
    const entry = `${timestamp} - ${label}${detailText}`;

    console.info(`[Quiz Wizz][Host] ${label}`, details ?? "");
    setHostDebugSteps((current) => [...current.slice(-13), entry]);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 100);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // Early worthy trigger: as soon as >49 % of non-host players vote yes, skip waiting
  // for the revealed-phase timer and go straight to worthy_playing.
  useEffect(() => {
    if (room?.status !== "revealed") return;

    const nonHostCount = players.filter((p) => !p.is_host).length;
    if (nonHostCount === 0) return;

    const pct = (worthyVoteCount / nonHostCount) * 100;
    if (pct > 49 && !worthyAutoTriggeredRef.current) {
      worthyAutoTriggeredRef.current = true;
      void handleAdvancePhase("worthy-early-vote");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worthyVoteCount, room?.status, players]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const phaseKey = `${room.status}-${currentRound?.id ?? "none"}-${currentRound?.state ?? "none"}`;

    if (phaseChangeKeyRef.current === null) {
      phaseChangeKeyRef.current = phaseKey;
      return;
    }

    if (phaseChangeKeyRef.current === phaseKey) {
      return;
    }

    phaseChangeKeyRef.current = phaseKey;

    if (room.status !== "playing") {
      setPhaseSplash(null);
      return;
    }

    setPhaseSplash({
      title: phaseDisplay.title,
      subtitle: phaseDisplay.subtitle,
      visible: true,
    });

    const fadeTimer = window.setTimeout(() => {
      setPhaseSplash((current) => (current ? { ...current, visible: false } : current));
    }, Math.max(180, PHASE_SPLASH_DURATION_MS - 200));

    const clearTimer = window.setTimeout(() => {
      setPhaseSplash(null);
    }, PHASE_SPLASH_DURATION_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [currentRound?.id, currentRound?.state, phaseDisplay.subtitle, phaseDisplay.title, room]);

  const prepareRoundClip = useCallback(
    (roundData: Round | null, roomStatus?: RoomStatus | null) => {
      if (!roundData?.youtube_video_id) {
        preparedRoundRef.current = null;
        return;
      }

      const clipVariant = roomStatus === "worthy_playing" ? "worthy" : roomStatus === "revealed" ? "replay" : roomStatus === "playing" ? "intro" : "main";
      const preparedKey = `${roundData.id}:${clipVariant}`;

      if (preparedRoundRef.current === preparedKey) {
        return;
      }

      preparedRoundRef.current = preparedKey;
      const baseClipStartSeconds = roundData.clip_start_seconds ?? 0;
      const baseClipEndSeconds = roundData.clip_end_seconds ?? 15;
      const replayWindow =
        roomStatus === "revealed"
          ? getReplayWindow({
              clip_start_seconds: baseClipStartSeconds,
              clip_end_seconds: baseClipEndSeconds,
            })
          : null;
      // Worthy: play the full video from start with a long endSeconds so it runs to natural end
      const clipStartSeconds = roomStatus === "worthy_playing" ? 0 : replayWindow?.startSeconds ?? baseClipStartSeconds;
      const clipEndSeconds = roomStatus === "worthy_playing" ? 3600 : replayWindow?.endSeconds ?? baseClipEndSeconds;
      const basePlaybackMode = roundData.playback_mode ?? "audio-video";
      const clipPlaybackMode =
        roomStatus === "worthy_playing"
          ? "audio-video"
          : roomStatus === "revealed" && basePlaybackMode === "audio-only"
          ? "audio-video"
          : basePlaybackMode;

      logHostStep("Round clip prepared", {
        roundId: roundData.id,
        roundNumber: roundData.round_number,
        videoId: roundData.youtube_video_id,
        startSeconds: clipStartSeconds,
        endSeconds: clipEndSeconds,
        playbackMode: clipPlaybackMode,
      });

      setYoutubeUrl(`https://www.youtube.com/watch?v=${roundData.youtube_video_id}`);
      setStartTimeInput(formatSecondsAsClock(clipStartSeconds));
      setEndTimeInput(formatSecondsAsClock(clipEndSeconds));
      setPlaybackMode(clipPlaybackMode);
      setPlayerStatus(
        roomStatus === "revealed"
          ? `Round ${roundData.round_number} replay moment is now playing.`
          : `Round ${roundData.round_number} clip loaded and ready for playback.`,
      );
    },
    [logHostStep],
  );

  const fetchActiveQuizEntries = useCallback(async () => {
    const localEntries = readStoredQuizEntries().filter((entry) => entry.is_active !== false);

    if (!supabase) {
      setQuizEntryCount(localEntries.length);
      return localEntries;
    }

    const { data, error } = await supabase
      .from("quiz_entries")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error || !data) {
      if (error) {
        logHostStep("Using local quiz entry fallback", {
          message: formatSupabaseErrorMessage(error, "Could not load quiz entries from Supabase."),
        });
      }

      setQuizEntryCount(localEntries.length);
      return localEntries;
    }

    const remoteEntries = (data as QuizEntry[]).map((entry) => ({
      ...entry,
      answer_options: Array.isArray(entry.answer_options) ? (entry.answer_options as string[]) : [],
    }));

    const mergedEntries = mergeQuizEntries(remoteEntries, localEntries).filter((entry) => entry.is_active !== false);
    setQuizEntryCount(mergedEntries.length);
    return mergedEntries;
  }, [logHostStep, supabase]);

  const loadRoomSnapshot = useCallback(
    async (roomId: string) => {
      if (!supabase) {
        return;
      }

      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .maybeSingle();

      if (roomError) {
        setRoomStatus(formatSupabaseErrorMessage(roomError, "Could not load the room."));
        return;
      }

      if (!roomData) {
        setRoom(null);
        setPlayers([]);
        setCurrentRound(null);
        setAnswerCount(0);
        setCorrectAnswerCount(0);
        setCorrectPlayerNames([]);
        setLeaderboard([]);
        return;
      }

      const normalizedRoom = roomData as Room;
      setRoom(normalizedRoom);

      const [roomPlayersResult, roundsResult, answersResult] = await Promise.all([
        supabase
          .from("room_players")
          .select("*")
          .eq("room_id", roomId)
          .eq("is_host", false)
          .order("joined_at", { ascending: true }),
        supabase
          .from("rounds")
          .select("*")
          .eq("room_id", roomId)
          .order("round_number", { ascending: true }),
        supabase.from("answers").select("*").eq("room_id", roomId),
      ]);

      const normalizedPlayers = !roomPlayersResult.error ? ((roomPlayersResult.data ?? []) as RoomPlayer[]) : [];
      setPlayers(normalizedPlayers);

      const normalizedRounds = !roundsResult.error
        ? ((roundsResult.data ?? []).map((roundRow) => ({
            ...(roundRow as Round),
            answer_options: Array.isArray(roundRow.answer_options) ? (roundRow.answer_options as string[]) : [],
          })) as Round[])
        : [];

      const activeRound = normalizedRoom.current_round_id
        ? normalizedRounds.find((roundItem) => roundItem.id === normalizedRoom.current_round_id) ?? null
        : null;

      setCurrentRound(activeRound);

      if (activeRound?.youtube_video_id) {
        prepareRoundClip(activeRound, normalizedRoom.status);
      } else {
        preparedRoundRef.current = null;
      }

      const allAnswers = !answersResult.error ? ((answersResult.data ?? []) as RoundAnswer[]) : [];
      const currentRoundAnswers = activeRound
        ? allAnswers.filter((answer) => answer.round_id === activeRound.id)
        : [];

      const revealSummary = summarizeRoundReveal(normalizedPlayers, activeRound, currentRoundAnswers);
      const nextLeaderboard = buildLeaderboard(normalizedPlayers, normalizedRounds, allAnswers);
      const nextReadyCount = normalizedPlayers.filter((player) => Boolean(player.is_ready)).length;

      setAnswerCount(currentRoundAnswers.length);
      setCorrectAnswerCount(revealSummary.correctCount);
      setCorrectPlayerNames(revealSummary.correctPlayerNames);
      setLeaderboard(nextLeaderboard);

      const nonHostPlayers = normalizedPlayers.filter((p) => !p.is_host);
      setWorthyVoteCount(nonHostPlayers.filter((p) => p.worthy_vote === true).length);
      setWorthyVotesSubmitted(nonHostPlayers.filter((p) => p.worthy_vote !== null && p.worthy_vote !== undefined).length);

      setRoomStatus(
        getHostStatusMessage({
          room: normalizedRoom,
          players: normalizedPlayers,
          currentRound: activeRound,
          answerCount: currentRoundAnswers.length,
          readyCount: nextReadyCount,
          revealSummary,
          leaderboard: nextLeaderboard,
        }),
      );

      logHostStep("Room snapshot updated", {
        roomCode: normalizedRoom.code,
        status: normalizedRoom.status,
        currentRound: activeRound?.round_number ?? null,
        totalRounds: normalizedRoom.total_rounds ?? null,
        players: normalizedPlayers.length,
        readyPlayers: nextReadyCount,
        answers: currentRoundAnswers.length,
      });
    },
    [logHostStep, prepareRoundClip, supabase],
  );

  useEffect(() => {
    void fetchActiveQuizEntries();

    const refreshEntries = () => {
      void fetchActiveQuizEntries();
    };

    window.addEventListener("focus", refreshEntries);

    return () => {
      window.removeEventListener("focus", refreshEntries);
    };
  }, [fetchActiveQuizEntries]);

  useEffect(() => {
    if (!supabase || !room?.id) {
      return;
    }

    void loadRoomSnapshot(room.id);

    const channel = supabase
      .channel(`host-room-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        () => {
          void loadRoomSnapshot(room.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${room.id}` },
        () => {
          void loadRoomSnapshot(room.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${room.id}` },
        () => {
          void loadRoomSnapshot(room.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "answers", filter: `room_id=eq.${room.id}` },
        () => {
          void loadRoomSnapshot(room.id);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadRoomSnapshot, room?.id, supabase]);

  const startRoundSession = useCallback(
    async (targetRoom: Room, roundNumber: number, totalRounds: number, reason: string) => {
      if (!supabase) {
        return false;
      }

      const availableEntries = await fetchActiveQuizEntries();
      if (availableEntries.length === 0) {
        setRoomStatus("No active quiz entries are available yet. Add one from `/submit` first.");
        return false;
      }

      // Build or reuse a shuffled entry order for the whole game session.
      // On round 1 (or if the ref was cleared by a reset), shuffle all entry IDs
      // using Fisher-Yates so songs play in a random, non-repeating order.
      if (roundNumber === 1 || shuffledEntryOrderRef.current.length === 0) {
        const ids = availableEntries.map((e) => e.id);
        for (let i = ids.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
        }
        shuffledEntryOrderRef.current = ids;
      }

      const targetId = shuffledEntryOrderRef.current[(roundNumber - 1) % shuffledEntryOrderRef.current.length];
      const selectedEntry = availableEntries.find((e) => e.id === targetId) ?? availableEntries[0] ?? null;
      if (!selectedEntry) {
        setRoomStatus("Could not find a quiz entry for the next round.");
        return false;
      }

      const payload = buildRoundPayloadFromQuizEntry(roundNumber, selectedEntry, "queued");
      const now = new Date();
      const introDurationSeconds = DEFAULT_ROUND_INTRO_DURATION_SECONDS;

      logHostStep("Starting automated round", {
        reason,
        roundNumber,
        totalRounds,
        quizEntryId: selectedEntry.id,
        introDurationSeconds,
      });

      const { data: roundData, error: roundError } = await supabase
        .from("rounds")
        .insert({ room_id: targetRoom.id, ...payload })
        .select("*")
        .single();

      if (roundError) {
        throw roundError;
      }

      const { error: roomUpdateError } = await supabase
        .from("rooms")
        .update({
          status: "playing",
          current_round_id: roundData.id,
          current_round_number: roundNumber,
          total_rounds: totalRounds,
          phase_started_at: now.toISOString(),
          phase_ends_at: createPhaseDeadline(introDurationSeconds, now),
          winner_name: null,
        })
        .eq("id", targetRoom.id);

      if (roomUpdateError) {
        throw roomUpdateError;
      }

      const normalizedRound: Round = {
        ...(roundData as Round),
        answer_options: Array.isArray(roundData.answer_options)
          ? (roundData.answer_options as string[])
          : payload.answer_options,
      };

      setCurrentRound(normalizedRound);
      setAnswerCount(0);
      setCorrectAnswerCount(0);
      setCorrectPlayerNames([]);
      setWorthyVoteCount(0);
      setWorthyVotesSubmitted(0);
      worthyAutoTriggeredRef.current = false;

      // Reset worthy votes for all players before the new round
      await supabase
        .from("room_players")
        .update({ worthy_vote: null })
        .eq("room_id", targetRoom.id)
        .eq("is_host", false);

      prepareRoundClip(normalizedRound, "playing");
      setPlayerStatus(`Round ${roundNumber} intro is on screen now.`);
      await loadRoomSnapshot(targetRoom.id);
      return true;
    },
    [fetchActiveQuizEntries, loadRoomSnapshot, logHostStep, prepareRoundClip, supabase],
  );

  const finishGame = useCallback(
    async (reason: string) => {
      if (!supabase || !room) {
        return;
      }

      const winnerName = leaderboard[0]?.nickname ?? null;
      const { error } = await supabase
        .from("rooms")
        .update({
          status: "finished",
          phase_started_at: new Date().toISOString(),
          phase_ends_at: null,
          winner_name: winnerName,
        })
        .eq("id", room.id);

      if (error) {
        throw error;
      }

      setRoomStatus(
        winnerName ? `${winnerName} wins the game.` : "Game finished. Reset the room to play again.",
      );
      logHostStep("Game finished", {
        reason,
        winnerName,
        totalRounds: room.total_rounds ?? room.current_round_number,
      });
    },
    [leaderboard, logHostStep, room, supabase],
  );

  const handleAdvancePhase = useCallback(
    async (source: string) => {
      if (!supabase || !room) {
        setRoomStatus("Create a room first.");
        return;
      }

      if (room.status === "lobby") {
        return;
      }

      if (room.status !== "finished" && !currentRound) {
        setRoomStatus("Start the game first.");
        return;
      }

      setIsAdvancingPhase(true);
      logHostStep("Advancing phase", {
        source,
        roomStatus: room.status,
        roundNumber: currentRound?.round_number ?? null,
      });

      try {
        const now = new Date();
        const updatePhase = async (nextRoomStatus: RoomStatus, nextRoundState: RoundState, durationSeconds: number) => {
          if (!currentRound) {
            return;
          }

          const [roundResult, roomResult] = await Promise.all([
            supabase
              .from("rounds")
              .update({ state: nextRoundState })
              .eq("id", currentRound.id),
            supabase
              .from("rooms")
              .update({
                status: nextRoomStatus,
                phase_started_at: now.toISOString(),
                phase_ends_at: createPhaseDeadline(durationSeconds, now),
              })
              .eq("id", room.id),
          ]);

          if (roundResult.error) {
            throw roundResult.error;
          }

          if (roomResult.error) {
            throw roomResult.error;
          }
        };

        const allPlayersAnswered = players.length > 0 && answerCount >= players.length;

        if (room.status === "playing") {
          await updatePhase(
            "clip_playing",
            "clip_playing",
            getPhaseDurationSeconds("clip_playing", currentRound),
          );
          setRoomStatus(`Round ${currentRound?.round_number ?? room.current_round_number}: the clip is playing and answers are live.`);
        } else if (room.status === "clip_playing") {
          if (allPlayersAnswered) {
            await updatePhase(
              "revealed",
              "revealed",
              DEFAULT_REVEAL_DURATION_SECONDS + DEFAULT_REPLAY_DURATION_SECONDS,
            );
            setRoomStatus(`Everyone answered. Revealing the correct answer now.`);
          } else {
            await updatePhase("answering", "answering", DEFAULT_ANSWERING_DURATION_SECONDS);
            setRoomStatus(`Clip finished. Final answer window is open.`);
          }
        } else if (room.status === "answering") {
          await updatePhase(
            "revealed",
            "revealed",
            DEFAULT_REVEAL_DURATION_SECONDS + DEFAULT_REPLAY_DURATION_SECONDS,
          );
          setRoomStatus(`Round ${currentRound?.round_number ?? room.current_round_number}: revealing the answer.`);
        } else if (room.status === "revealed") {
          // Count worthy votes — >49% → full video; otherwise → next round
          const nonHostPlayers = players.filter((p) => !p.is_host);
          const worthyYes = nonHostPlayers.filter((p) => p.worthy_vote === true).length;
          const quorum = nonHostPlayers.length;
          const worthyPercent = quorum > 0 ? (worthyYes / quorum) * 100 : 0;

          // Always close the current round first
          if (currentRound) {
            const { error: closeRoundError } = await supabase
              .from("rounds")
              .update({ state: "closed" })
              .eq("id", currentRound.id);

            if (closeRoundError) {
              throw closeRoundError;
            }
          }

          if (worthyPercent > 49 && quorum > 0) {
            // Transition to worthy_playing — full video until it ends (max 6 min fallback)
            const { error: worthyError } = await supabase
              .from("rooms")
              .update({
                status: "worthy_playing",
                phase_started_at: now.toISOString(),
                phase_ends_at: createPhaseDeadline(DEFAULT_WORTHY_PLAYING_MAX_SECONDS, now),
              })
              .eq("id", room.id);

            if (worthyError) throw worthyError;
            setRoomStatus("The song is worthy! Playing full video now.");
          } else {
            const totalRounds = room.total_rounds ?? currentRound?.round_number ?? room.current_round_number;

            if ((currentRound?.round_number ?? room.current_round_number) >= totalRounds) {
              await finishGame(source);
            } else {
              const nextRoundNumber = (currentRound?.round_number ?? room.current_round_number) + 1;
              await startRoundSession(room, nextRoundNumber, totalRounds, source);
            }
            setRoomStatus("Round complete. Starting next round.");
          }
        } else if (room.status === "worthy_playing") {
          // Full video ended or max timer hit — advance to next round
          const totalRounds = room.total_rounds ?? currentRound?.round_number ?? room.current_round_number;

          if ((currentRound?.round_number ?? room.current_round_number) >= totalRounds) {
            await finishGame(source);
          } else {
            const nextRoundNumber = (currentRound?.round_number ?? room.current_round_number) + 1;
            await startRoundSession(room, nextRoundNumber, totalRounds, source);
          }
        } else if (room.status === "leaderboard") {
          // Fallback: leaderboard phase shouldn't be reached in normal flow but handle it safely
          if (currentRound) {
            const { error: closeRoundError } = await supabase
              .from("rounds")
              .update({ state: "closed" })
              .eq("id", currentRound.id);

            if (closeRoundError) {
              throw closeRoundError;
            }
          }

          const totalRounds = room.total_rounds ?? currentRound?.round_number ?? room.current_round_number;
          const nextRoundNumber = (currentRound?.round_number ?? room.current_round_number) + 1;

          if ((currentRound?.round_number ?? room.current_round_number) >= totalRounds) {
            await finishGame(source);
          } else {
            await startRoundSession(room, nextRoundNumber, totalRounds, source);
          }
        }

        await loadRoomSnapshot(room.id);
      } catch (error) {
        const message = isSupabaseSchemaError(error)
          ? `${formatSupabaseErrorMessage(error, "Could not advance the automated game loop.")} Run the updated \`supabase/schema.sql\` once to enable the new session states.`
          : formatSupabaseErrorMessage(error, "Could not advance the automated game loop.");
        setRoomStatus(message);
        logHostStep("Advance phase failed", { message });
      } finally {
        setIsAdvancingPhase(false);
      }
    },
    [answerCount, currentRound, finishGame, loadRoomSnapshot, logHostStep, players.length, room, startRoundSession, supabase],
  );

  useEffect(() => {
    if (!room || (room.status !== "clip_playing" && room.status !== "answering")) {
      return;
    }

    if (isAdvancingPhase || isStartingGame) {
      return;
    }

    if (players.length === 0 || answerCount < players.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      void handleAdvancePhase("all-answered");
    }, 60);

    return () => {
      window.clearTimeout(timer);
    };
  }, [answerCount, handleAdvancePhase, isAdvancingPhase, isStartingGame, players.length, room]);

  useEffect(() => {
    if (!room || !room.phase_ends_at || room.status === "lobby" || room.status === "finished") {
      return;
    }

    if (isAdvancingPhase || isStartingGame) {
      return;
    }

    const msRemaining = new Date(room.phase_ends_at).getTime() - Date.now();
    if (msRemaining <= 0) {
      void handleAdvancePhase("auto-timer");
      return;
    }

    const timer = window.setTimeout(() => {
      void handleAdvancePhase("auto-timer");
    }, Math.max(20, msRemaining + 20));

    return () => {
      window.clearTimeout(timer);
    };
  }, [handleAdvancePhase, isAdvancingPhase, isStartingGame, room]);

  const handleCreateRoom = async () => {
    if (!supabase) {
      setRoomStatus(getSupabaseSetupMessage());
      return;
    }

    setIsCreatingRoom(true);
    setRoomStatus("Creating room...");
    logHostStep("Creating room");

    try {
      let createdRoom: Room | null = null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = generateRoomCode();
        const { data, error } = await supabase
          .from("rooms")
          .insert({ code, status: "lobby", current_round_number: 0 })
          .select("*")
          .single();

        if (!error && data) {
          createdRoom = data as Room;
          break;
        }

        if (error && error.code !== "23505") {
          throw error;
        }
      }

      if (!createdRoom) {
        throw new Error("Could not generate a unique room code. Try again.");
      }

      const { data: hostPlayer, error: hostPlayerError } = await supabase
        .from("players")
        .insert({ nickname: "Host Screen" })
        .select("*")
        .single();

      if (hostPlayerError) {
        throw hostPlayerError;
      }

      const { error: roomPlayerError } = await supabase.from("room_players").insert({
        room_id: createdRoom.id,
        player_id: hostPlayer.id,
        nickname: "Host Screen",
        is_host: true,
      });

      if (roomPlayerError) {
        throw roomPlayerError;
      }

      preparedRoundRef.current = null;
      setRoom(createdRoom);
      setCurrentRound(null);
      setLeaderboard([]);
      setCorrectAnswerCount(0);
      setCorrectPlayerNames([]);
      await loadRoomSnapshot(createdRoom.id);
      setRoomStatus(`Room ${createdRoom.code} is ready. Players can join and mark themselves ready.`);
      logHostStep("Room created", { roomCode: createdRoom.code, roomId: createdRoom.id });
    } catch (error) {
      const message = formatSupabaseErrorMessage(error, "Could not create the room.");
      setRoomStatus(message);
      logHostStep("Create room failed", { message });
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleStartGame = async () => {
    if (!supabase || !room) {
      setRoomStatus("Create a room first.");
      return;
    }

    if (players.length === 0) {
      setRoomStatus("At least one player needs to join before the game can start.");
      return;
    }

    if (readyPlayerCount === 0) {
      setRoomStatus("Wait for at least one player to mark themselves ready.");
      return;
    }

    setIsStartingGame(true);
    setRoomStatus("Starting the automated game session...");
    logHostStep("Start game requested", {
      players: players.length,
      readyPlayers: readyPlayerCount,
      roundCountSetting,
    });

    try {
      const availableEntries = await fetchActiveQuizEntries();
      if (availableEntries.length === 0) {
        setRoomStatus("No active quiz entries are available yet. Add one from `/submit` first.");
        return;
      }

      const totalRounds =
        roundCountSetting === "all"
          ? availableEntries.length
          : Math.min(Number(roundCountSetting), availableEntries.length);

      if (room.current_round_number > 0 || room.status === "finished") {
        await supabase.from("answers").delete().eq("room_id", room.id);
        await supabase.from("rounds").delete().eq("room_id", room.id);
      }

      const readyReset = await supabase
        .from("room_players")
        .update({ is_ready: false })
        .eq("room_id", room.id)
        .eq("is_host", false);

      if (readyReset.error && !isSupabaseSchemaError(readyReset.error)) {
        throw readyReset.error;
      }

      await startRoundSession({ ...room, total_rounds: totalRounds, current_round_number: 0 }, 1, totalRounds, "start-game");
    } catch (error) {
      const message = isSupabaseSchemaError(error)
        ? `${formatSupabaseErrorMessage(error, "Could not start the automated game.")} Run the updated \`supabase/schema.sql\` once to enable ready states and session timers.`
        : formatSupabaseErrorMessage(error, "Could not start the automated game.");
      setRoomStatus(message);
      logHostStep("Start game failed", { message });
    } finally {
      setIsStartingGame(false);
    }
  };

  const handleResetRoom = async () => {
    if (!supabase || !room) {
      setRoomStatus("Create a room first.");
      return;
    }

    setIsResettingRoom(true);
    setRoomStatus("Resetting the room for a new game...");
    logHostStep("Resetting room", { roomCode: room.code });

    try {
      await supabase.from("answers").delete().eq("room_id", room.id);
      await supabase.from("rounds").delete().eq("room_id", room.id);

      const readyReset = await supabase
        .from("room_players")
        .update({ is_ready: false })
        .eq("room_id", room.id)
        .eq("is_host", false);

      if (readyReset.error && !isSupabaseSchemaError(readyReset.error)) {
        throw readyReset.error;
      }

      const { error: roomResetError } = await supabase
        .from("rooms")
        .update({
          status: "lobby",
          current_round_id: null,
          current_round_number: 0,
          phase_started_at: null,
          phase_ends_at: null,
          winner_name: null,
        })
        .eq("id", room.id);

      if (roomResetError) {
        throw roomResetError;
      }

      preparedRoundRef.current = null;
      shuffledEntryOrderRef.current = [];
      setCurrentRound(null);
      setAnswerCount(0);
      setCorrectAnswerCount(0);
      setCorrectPlayerNames([]);
      setLeaderboard([]);
      setPlayerStatus("Room reset. Players can ready up for another game.");
      await loadRoomSnapshot(room.id);
    } catch (error) {
      const message = formatSupabaseErrorMessage(error, "Could not reset the room.");
      setRoomStatus(message);
      logHostStep("Reset room failed", { message });
    } finally {
      setIsResettingRoom(false);
    }
  };

  const activePhaseSplash = room?.status === "playing"
    ? phaseSplash ?? { title: phaseDisplay.title, subtitle: phaseDisplay.subtitle, visible: true }
    : null;
  const isLobbyScreen = !room || room.status === "lobby";
  const isFinishedScreen = room?.status === "finished";
  const isGameScreen = Boolean(room && room.status !== "lobby" && room.status !== "finished");
  const joinUrl = room ? `${siteUrl}/join?room=${room.code}` : `${siteUrl}/join`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(joinUrl)}`;

  // ── Soundtrack: initialise once on mount ──────────────────────────────────
  useEffect(() => {
    const audio = new Audio("/dionysos-after-dark.mp3");
    audio.loop = true;
    audio.volume = 1.0;
    soundtrackRef.current = audio;

    const tryPlay = () => {
      void audio.play().catch(() => {});
    };

    // Attempt immediate autoplay; browsers may block it
    tryPlay();

    // Retry on the first user interaction (click, key, or touch)
    const onInteraction = () => {
      if (audio.paused) {
        tryPlay();
      }
      window.removeEventListener("click", onInteraction);
      window.removeEventListener("keydown", onInteraction);
      window.removeEventListener("touchstart", onInteraction);
    };

    window.addEventListener("click", onInteraction);
    window.addEventListener("keydown", onInteraction);
    window.addEventListener("touchstart", onInteraction);

    return () => {
      window.removeEventListener("click", onInteraction);
      window.removeEventListener("keydown", onInteraction);
      window.removeEventListener("touchstart", onInteraction);
      audio.pause();
      audio.src = "";
      soundtrackRef.current = null;
    };
  }, []);

  // ── Soundtrack: fade volume based on game state ───────────────────────────
  useEffect(() => {
    const audio = soundtrackRef.current;
    if (!audio) return;

    // Music plays only during lobby and final leaderboard; silent everywhere else
    const isLobby = !room || room.status === "lobby";
    const isFinished = room?.status === "finished";
    const targetVolume = (isLobby || isFinished) ? 1.0 : 0;
    const fadeDurationMs = targetVolume === 0 ? 500 : 700;
    const stepMs = 25;
    const steps = Math.ceil(fadeDurationMs / stepMs);
    const startVolume = audio.volume;
    const delta = (targetVolume - startVolume) / steps;

    if (soundtrackFadeRef.current !== null) {
      window.clearInterval(soundtrackFadeRef.current);
      soundtrackFadeRef.current = null;
    }

    let stepCount = 0;
    soundtrackFadeRef.current = window.setInterval(() => {
      stepCount += 1;
      audio.volume = Math.max(0, Math.min(1, startVolume + delta * stepCount));
      if (stepCount >= steps) {
        audio.volume = targetVolume;
        if (soundtrackFadeRef.current !== null) {
          window.clearInterval(soundtrackFadeRef.current);
          soundtrackFadeRef.current = null;
        }
      }
    }, stepMs);

    return () => {
      if (soundtrackFadeRef.current !== null) {
        window.clearInterval(soundtrackFadeRef.current);
        soundtrackFadeRef.current = null;
      }
    };
  }, [room]);

  return (
    <main className={`text-slate-50 ${isGameScreen || isFinishedScreen ? "relative h-screen overflow-hidden" : isLobbyScreen ? "h-screen overflow-hidden" : "bg-slate-950 min-h-screen px-4 py-6 sm:px-6 lg:px-8"}`}
      style={isGameScreen || isFinishedScreen ? { background: "var(--oly-night-base)" } : undefined}
    >
      {(isGameScreen || isFinishedScreen) ? (
        <>
          <OlympusBackground variant="game" showColumns showParticles />
          {/* Temple silhouette */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 flex h-[18vh] items-end justify-center overflow-hidden" aria-hidden="true">
            <svg viewBox="0 0 900 280" fill="rgba(201,162,39,0.04)" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-6xl" preserveAspectRatio="xMidYMax meet">
              <polygon points="60,95 840,95 450,12" />
              <rect x="55" y="95" width="790" height="18" />
              <rect x="90"  y="113" width="22" height="152" rx="2" /><rect x="78"  y="107" width="46" height="8" />
              <rect x="240" y="113" width="22" height="152" rx="2" /><rect x="228" y="107" width="46" height="8" />
              <rect x="390" y="113" width="22" height="152" rx="2" /><rect x="378" y="107" width="46" height="8" />
              <rect x="488" y="113" width="22" height="152" rx="2" /><rect x="476" y="107" width="46" height="8" />
              <rect x="638" y="113" width="22" height="152" rx="2" /><rect x="626" y="107" width="46" height="8" />
              <rect x="788" y="113" width="22" height="152" rx="2" /><rect x="776" y="107" width="46" height="8" />
              <rect x="40"  y="265" width="820" height="6" />
              <rect x="22"  y="257" width="856" height="8" />
              <rect x="5"   y="248" width="890" height="9" />
            </svg>
          </div>
        </>
      ) : null}
      <div className={`mx-auto ${isGameScreen || isFinishedScreen ? "relative z-10 flex h-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6" : isLobbyScreen ? "h-full" : "flex max-w-6xl flex-col gap-6"}`}>
        {isLobbyScreen ? (
          <div className="relative h-full">
            {/* ── Atmospheric background ───────────────────────────────── */}
            <OlympusBackground variant="lobby" showColumns showParticles />

            {/* ── Temple silhouette — purely decorative ────────────────── */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[22vh] overflow-hidden flex items-end justify-center"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 900 280"
                fill="rgba(201,162,39,0.055)"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full max-w-5xl"
                preserveAspectRatio="xMidYMax meet"
              >
                {/* Pediment */}
                <polygon points="60,95 840,95 450,12" />
                {/* Entablature */}
                <rect x="55" y="95" width="790" height="18" />
                {/* Column 1 */}
                <rect x="90"  y="113" width="22" height="152" rx="2" />
                <rect x="78"  y="107" width="46" height="8" />
                {/* Column 2 */}
                <rect x="240" y="113" width="22" height="152" rx="2" />
                <rect x="228" y="107" width="46" height="8" />
                {/* Column 3 */}
                <rect x="390" y="113" width="22" height="152" rx="2" />
                <rect x="378" y="107" width="46" height="8" />
                {/* Column 4 */}
                <rect x="488" y="113" width="22" height="152" rx="2" />
                <rect x="476" y="107" width="46" height="8" />
                {/* Column 5 */}
                <rect x="638" y="113" width="22" height="152" rx="2" />
                <rect x="626" y="107" width="46" height="8" />
                {/* Column 6 */}
                <rect x="788" y="113" width="22" height="152" rx="2" />
                <rect x="776" y="107" width="46" height="8" />
                {/* Steps */}
                <rect x="40"  y="265" width="820" height="6"  />
                <rect x="22"  y="257" width="856" height="8"  />
                <rect x="5"   y="248" width="890" height="9"  />
              </svg>
            </div>

            {/* ── Content ──────────────────────────────────────────────── */}
            <div className="relative z-10 flex h-full flex-col px-4 pt-5 pb-[18vh] sm:px-6 lg:px-10">

              {/* Title */}
              <header className="flex-shrink-0 pt-4 text-center sm:pt-6">
                <h1
                  className="oly-text-gold-shimmer font-black uppercase"
                  style={{ fontSize: "clamp(2.2rem, 6vw, 5rem)", letterSpacing: "0.1em" }}
                >
                  ✦ Olympus Night ✦
                </h1>
                <p className="mt-1 text-xs italic text-slate-500 sm:text-sm">
                  Where mortals compete for eternal glory on the sacred mountain
                </p>
              </header>

              {/* Divider */}
              <div className="my-4 flex items-center gap-3 sm:my-5">
                <div className="flex-1 border-t" style={{ borderColor: "rgba(201,162,39,0.18)" }} />
                <span className="text-xs" style={{ color: "var(--oly-gold-dim)" }}>⚡</span>
                <div className="flex-1 border-t" style={{ borderColor: "rgba(201,162,39,0.18)" }} />
              </div>

              {/* Panels */}
              <div className="flex flex-1 flex-col gap-5 overflow-y-auto pb-4 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:overflow-visible lg:pb-0">

                {/* ── Left panel: Room setup + QR portal ───────────────── */}
                <div
                  className="rounded-3xl p-5 sm:p-6"
                  style={{ background: "rgba(5,3,18,0.55)", border: "1px solid rgba(201,162,39,0.13)", backdropFilter: "blur(6px)" }}
                >
                  {/* Room code row */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.35em]"
                        style={{ color: "var(--oly-gold-dim)" }}
                      >
                        Room Seal
                      </p>
                      <p
                        className="mt-1 font-black tracking-[0.28em]"
                        style={{
                          fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                          color: room ? "var(--oly-gold-bright)" : "rgba(255,255,255,0.18)",
                          textShadow: room ? "0 0 18px rgba(201,162,39,0.5), 0 0 50px rgba(201,162,39,0.2)" : "none",
                        }}
                      >
                        {room?.code ?? "— — — — —"}
                      </p>
                      <p className="mt-1 max-w-xs truncate text-xs text-slate-500">
                        {room ? joinUrl : "Summon a room to reveal the seal and invitation QR."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateRoom}
                      disabled={!supabase || isCreatingRoom}
                      className="rounded-2xl px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        background: "linear-gradient(135deg, var(--oly-gold-dim) 0%, var(--oly-gold) 50%, var(--oly-gold-bright) 100%)",
                        boxShadow: "var(--oly-glow-gold)",
                        color: "#0a0800",
                      }}
                    >
                      {isCreatingRoom ? "Summoning…" : room ? "New Room" : "Summon Room"}
                    </button>
                  </div>

                  {/* Controls + QR row */}
                  <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">

                    {/* Controls column */}
                    <div className="space-y-4">
                      {/* Entry count / Supabase status */}
                      <div
                        className={`rounded-2xl border px-4 py-3 text-sm ${supabaseMessage ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-white/10 bg-black/30 text-slate-300"}`}
                      >
                        {supabaseMessage
                          ? supabaseMessage
                          : `${quizEntryCount} sacred entr${quizEntryCount === 1 ? "y" : "ies"} in the vault.`}
                      </div>

                      {/* Rounds selector */}
                      <div
                        className="rounded-2xl p-4"
                        style={{ background: "rgba(0,0,0,0.30)", border: "1px solid rgba(201,162,39,0.18)" }}
                      >
                        <p
                          className="text-[10px] font-semibold uppercase tracking-[0.3em]"
                          style={{ color: "var(--oly-gold-dim)" }}
                        >
                          Trials this feast
                        </p>
                        <select
                          value={roundCountSetting}
                          onChange={(event) => setRoundCountSetting(event.target.value as RoundCountSetting)}
                          className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none transition"
                          style={{
                            background: "rgba(5,3,18,0.70)",
                            border: "1px solid rgba(201,162,39,0.22)",
                          }}
                        >
                          {ROUND_COUNT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Status message */}
                      <div
                        className="rounded-2xl px-4 py-3 text-sm text-slate-300"
                        style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.07)" }}
                      >
                        {roomStatus}
                      </div>

                      {/* Links */}
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href="/submit"
                          className="inline-flex rounded-xl px-3 py-2 text-xs font-medium transition hover:bg-white/5"
                          style={{ border: "1px solid rgba(201,162,39,0.28)", color: "var(--oly-gold-bright)" }}
                        >
                          ＋ Add sacred entries
                        </Link>
                        {room ? (
                          <Link
                            href={`/join?room=${room.code}`}
                            className="inline-flex rounded-xl border border-slate-600 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-400 hover:bg-slate-800/50"
                          >
                            Open join page ↗
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    {/* QR invitation portal */}
                    <div className="mx-auto flex flex-col items-center gap-3 sm:mx-0">
                      <div
                        className="relative flex items-center justify-center"
                        style={{ width: "188px", height: "188px" }}
                      >
                        {/* Outer pulsing portal ring */}
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            boxShadow: "var(--oly-glow-portal)",
                            border: "2px solid rgba(150,100,255,0.45)",
                            animation: "oly-pulse-glow 3.5s ease-in-out infinite",
                          }}
                        />
                        {/* Inner accent ring */}
                        <div
                          className="absolute rounded-full"
                          style={{ inset: "14px", border: "1px solid rgba(150,100,255,0.18)" }}
                        />
                        {/* QR or placeholder */}
                        {room ? (
                          <div className="relative z-10 rounded-2xl bg-white p-2 shadow-2xl">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={qrCodeUrl}
                              alt={`QR code to join room ${room.code}`}
                              className="block h-36 w-36 rounded-xl"
                            />
                          </div>
                        ) : (
                          <div
                            className="relative z-10 flex h-36 w-36 items-center justify-center rounded-2xl text-center text-xs leading-relaxed"
                            style={{
                              background: "rgba(12,8,30,0.92)",
                              border: "1px dashed rgba(150,100,255,0.22)",
                              color: "rgba(150,100,255,0.45)",
                            }}
                          >
                            Portal awaits<br />room creation
                          </div>
                        )}
                      </div>
                      <p
                        className="text-center text-[10px] uppercase tracking-[0.3em]"
                        style={{ color: "var(--oly-gold-dim)" }}
                      >
                        {room ? "Scan to enter the feast" : "Invitation portal"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Right panel: Feast hall / player lobby ────────────── */}
                <div className="flex flex-col rounded-3xl p-5 sm:p-6" style={{ background: "rgba(5,3,18,0.55)", border: "1px solid rgba(201,162,39,0.13)", backdropFilter: "blur(6px)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.35em]"
                        style={{ color: "var(--oly-gold-dim)" }}
                      >
                        The Assembled
                      </p>
                      <h2 className="mt-1 text-xl font-bold text-white sm:text-2xl">Feast Hall</h2>
                    </div>
                    <span
                      className="rounded-full px-3 py-1 text-xs font-semibold"
                      style={{
                        background: "rgba(201,162,39,0.12)",
                        color: "var(--oly-gold-bright)",
                        border: "1px solid rgba(201,162,39,0.25)",
                      }}
                    >
                      {readyPlayerCount}/{players.length} ready
                    </span>
                  </div>

                  {players.length === 0 ? (
                    <div
                      className="mt-5 flex flex-1 items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center text-sm"
                      style={{
                        borderColor: "rgba(201,162,39,0.12)",
                        color: "rgba(255,255,255,0.20)",
                      }}
                    >
                      <div>
                        <p className="text-3xl opacity-30">⚗</p>
                        <p className="mt-2">Awaiting mortals to join&hellip;</p>
                      </div>
                    </div>
                  ) : (
                    <ul className="mt-4 flex-1 space-y-2 overflow-y-auto">
                      {players.map((player) => (
                        <li
                          key={player.id}
                          className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm"
                          style={{
                            border: `1px solid ${player.is_ready ? "rgba(201,162,39,0.30)" : "rgba(255,255,255,0.07)"}`,
                            background: player.is_ready ? "rgba(201,162,39,0.08)" : "rgba(0,0,0,0.22)",
                          }}
                        >
                          <span className="font-medium text-slate-100">{player.nickname}</span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em]"
                            style={
                              player.is_ready
                                ? { background: "rgba(201,162,39,0.18)", color: "var(--oly-gold-bright)" }
                                : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.32)" }
                            }
                          >
                            {player.is_ready ? "Ready" : "Waiting"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Enter the Feast CTA */}
                  <button
                    type="button"
                    onClick={handleStartGame}
                    disabled={!room || !supabase || players.length === 0 || readyPlayerCount === 0 || isStartingGame}
                    className="mt-5 w-full rounded-2xl px-4 py-4 text-base font-bold transition-all disabled:cursor-not-allowed"
                    style={
                      !room || players.length === 0 || readyPlayerCount === 0 || isStartingGame
                        ? {
                            background: "rgba(30,25,50,0.80)",
                            color: "rgba(255,255,255,0.18)",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }
                        : {
                            background: "linear-gradient(135deg, var(--oly-gold-dim) 0%, var(--oly-gold) 50%, var(--oly-gold-bright) 100%)",
                            boxShadow: "var(--oly-glow-gold-strong)",
                            color: "#0a0800",
                            border: "none",
                          }
                    }
                  >
                    {isStartingGame ? "Commencing the Feast…" : "Enter the Feast ✦"}
                  </button>
                </div>
              </div>
            </div>

            {/* Transition overlay wired to game-start */}
            <OlympusTransition type="cloud-wipe" active={isStartingGame} />
          </div>
        ) : null}

        {isGameScreen ? (
          <>
            {/* ── Worthy moment: fullscreen video overlay ─────────────────── */}
            {room?.status === "worthy_playing" ? (
              <div
                className="absolute inset-0 z-30 flex flex-col"
                style={{ background: "linear-gradient(135deg, #000005 0%, #050312 60%, #0a0520 100%)" }}
              >
                {/* Thin gold title strip at top */}
                <div className="flex-none py-3 text-center">
                  <p
                    className="text-xs font-bold uppercase tracking-[0.35em]"
                    style={{ color: "var(--oly-gold-bright)", textShadow: "0 0 20px rgba(201,162,39,0.60)" }}
                  >
                    ✦ The gods have spoken — this song is worthy ✦
                  </p>
                </div>

                {/* Video fills the remaining height, centered */}
                <div className="relative min-h-0 flex-1">
                  <TimedYouTubePlayer
                    key={`${playerRenderKey}-worthy`}
                    ref={playerHandleRef}
                    videoId={parsedVideoId}
                    startSeconds={0}
                    endSeconds={7200}
                    playbackMode="audio-video"
                    autoPlayRequestKey={`${currentRound?.id ?? "worthy"}-worthy_playing`}
                    spoilerGuard={false}
                    naked
                    onVideoEnded={() => void handleAdvancePhase("video-ended")}
                    onStatusChange={setPlayerStatus}
                    onDebugChange={setPlayerDebug}
                  />
                </div>
              </div>
            ) : null}

            {room?.status !== "worthy_playing" ? (<>
            <section
              className="rounded-3xl p-4"
              style={{ background: "rgba(5,3,18,0.80)", border: "1px solid rgba(201,162,39,0.20)", backdropFilter: "blur(8px)" }}
            >
              {room?.status === "revealed" ? (
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em]" style={{ color: "var(--oly-gold-dim)" }}>{phaseDisplay.badge} · Vote now on your phone</p>
                  <h1 className="mt-1 text-2xl font-black text-white">Is this song worthy of the gods?</h1>
                  <p className="mt-1 text-xs text-slate-400">
                    {worthyVotesSubmitted}/{players.length} voted · {worthyVoteCount} say worthy
                    {players.length > 0 ? ` (${Math.round((worthyVoteCount / players.length) * 100)}%)` : ""}
                  </p>
                  <div className="mx-auto mt-2 max-w-3xl">
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/50">
                      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${players.length > 0 ? (worthyVoteCount / players.length) * 100 : 0}%`, background: "linear-gradient(90deg, var(--oly-gold-dim), var(--oly-gold-bright))" }} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs" style={{ color: "var(--oly-gold-dim)" }}>
                      <span>{phaseDisplay.badge}</span>
                      <span>{countdownSeconds !== null ? `${countdownSeconds}s` : ""}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/30">
                      <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${phaseProgressPercent}%`, background: "rgba(201,162,39,0.40)" }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em]" style={{ color: "var(--oly-gold-dim)" }}>{phaseDisplay.badge}</p>
                  <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">{phaseDisplay.title}</h1>
                  <p className="mt-2 text-sm text-slate-400 sm:text-base">{phaseDisplay.subtitle}</p>
                </div>
              )}
              {room?.status !== "revealed" ? (
                <div className="mx-auto mt-4 max-w-3xl">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--oly-gold-dim)" }}>
                    <span>{currentRound ? `Round ${currentRound.round_number}` : "Waiting"}</span>
                    <span>{countdownSeconds !== null ? `${countdownSeconds}s` : room ? getRoomStatusLabel(room.status) : "Waiting"}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/50">
                    <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${phaseProgressPercent}%`, background: "linear-gradient(90deg, var(--oly-gold-dim), var(--oly-gold-bright))" }} />
                  </div>
                </div>
              ) : null}
            </section>

            <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
              <div className="relative min-h-0">
                <TimedYouTubePlayer
                  key={playerRenderKey}
                  ref={playerHandleRef}
                  videoId={parsedVideoId}
                  startSeconds={startSeconds ?? 0}
                  endSeconds={endSeconds ?? 0}
                  playbackMode={playbackMode}
                  validationMessage={validationMessage}
                  autoPlayRequestKey={autoPlayRequestKey}
                  spoilerGuard
                  highlighted={room?.status === "clip_playing"}
                  onStatusChange={setPlayerStatus}
                  onDebugChange={setPlayerDebug}
                />

                {activePhaseSplash ? (
                  <div className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-black/90 px-6 text-center transition-opacity duration-300 ${activePhaseSplash.visible ? "opacity-100" : "opacity-0"}`}>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "var(--oly-gold-dim)" }}>Get Ready</p>
                      <h3 className="mt-2 text-3xl font-bold text-white">{activePhaseSplash.title}</h3>
                      <p className="mt-2 text-sm text-slate-300">{activePhaseSplash.subtitle}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="min-h-0">
                {(room?.status === "revealed" || room?.status === "leaderboard") && leaderboard.length > 0 ? (
                  <section
                    className="h-full rounded-3xl p-5"
                    style={{ background: "rgba(5,3,18,0.80)", border: "2px solid rgba(201,162,39,0.40)", backdropFilter: "blur(8px)", boxShadow: "0 0 40px rgba(201,162,39,0.15)" }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--oly-gold-dim)" }}>Scores</p>
                    <h2 className="mt-2 text-3xl font-bold text-white">Leaderboard</h2>
                    <ul className="mt-5 space-y-3">
                      {leaderboard.map((entry, index) => (
                        <li
                          key={entry.roomPlayerId}
                          className="flex items-center justify-between rounded-2xl px-4 py-3 text-base"
                          style={
                            index === 0
                              ? { border: "1px solid rgba(201,162,39,0.50)", background: "rgba(201,162,39,0.12)", color: "var(--oly-gold-bright)" }
                              : { border: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.30)", color: "rgba(255,255,255,0.75)" }
                          }
                        >
                          <span className="font-semibold">#{index + 1} {entry.nickname}</span>
                          <span className="flex items-center gap-3">
                            {entry.lastRoundAnswerMs != null ? (
                              <span style={{ fontSize: "0.75rem", opacity: 0.55 }}>{fmtSpeed(entry.lastRoundAnswerMs)}</span>
                            ) : null}
                            <span className="font-bold" style={{ color: index === 0 ? "var(--oly-gold-bright)" : "rgba(255,255,255,0.50)" }}>{fmtScore(entry.score)} pt</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : currentRound ? (
                  <section
                    className="h-full rounded-3xl p-5"
                    style={{ background: "rgba(5,3,18,0.80)", border: "1px solid rgba(201,162,39,0.18)", backdropFilter: "blur(8px)" }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--oly-gold-dim)" }}>
                      {room ? getRoomStatusLabel(room.status) : "Waiting"} · Progress {totalRoundsLabel}
                    </p>
                    <h2 className="mt-3 text-2xl font-bold text-white">{currentRound.prompt_text}</h2>

                    <div className="mt-5 grid gap-3">
                      {currentRound.answer_options.map((option, index) => {
                        const isCorrectChoice =
                          (room?.status === "revealed" || room?.status === "leaderboard") && currentRound.correct_answer === option;

                        return (
                          <div
                            key={`${currentRound.id}-${index}-${option}`}
                            className="rounded-2xl px-4 py-3 text-base font-semibold"
                            style={
                              isCorrectChoice
                                ? { border: "1px solid rgba(201,162,39,0.70)", background: "rgba(201,162,39,0.15)", color: "var(--oly-gold-bright)" }
                                : { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.30)", color: "rgba(255,255,255,0.65)" }
                            }
                          >
                            {option}
                          </div>
                        );
                      })}
                    </div>

                    {room?.status === "revealed" ? (
                      <div
                        className="mt-5 rounded-2xl px-4 py-4 text-center text-sm"
                        style={{ border: "1px solid rgba(201,162,39,0.50)", background: "rgba(201,162,39,0.12)" }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--oly-gold-dim)" }}>Correct Answer</p>
                        <p className="mt-2 text-xl font-bold" style={{ color: "var(--oly-gold-bright)" }}>{currentRound.correct_answer ?? "not set"}</p>
                        <p className="mt-2 text-sm text-slate-300">
                          {correctPlayerNames.length > 0 ? `Correct players: ${correctPlayerNames.join(", ")}` : "No player got this round right."}
                        </p>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            </div>
          </>) : null}
          </>
        ) : null}

        {isFinishedScreen ? (
          <section
            className="flex h-full flex-col justify-center rounded-3xl p-6 text-center"
            style={{ background: "rgba(5,3,18,0.80)", border: "1px solid rgba(201,162,39,0.25)", backdropFilter: "blur(12px)" }}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.28em]" style={{ color: "var(--oly-gold-dim)" }}>Final Result</p>
            <h1 className="oly-text-gold-shimmer mt-3 font-black" style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}>
              {room?.winner_name ? `${room.winner_name} Wins!` : "Game Over"}
            </h1>
            <p className="mt-3 text-slate-400">Thanks for playing Olympus Night.</p>

            {leaderboard.length > 0 ? (
              <div className="mx-auto mt-6 w-full max-w-2xl rounded-3xl p-5 text-left" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(201,162,39,0.18)" }}>
                <h2 className="text-center text-xl font-bold" style={{ color: "var(--oly-gold-bright)" }}>Final Leaderboard</h2>
                <ul className="mt-4 space-y-3">
                  {leaderboard.map((entry, index) => (
                    <li
                      key={entry.roomPlayerId}
                      className="flex items-center justify-between rounded-2xl px-4 py-3 text-base font-semibold"
                      style={
                        index === 0
                          ? { border: "1px solid rgba(201,162,39,0.50)", background: "rgba(201,162,39,0.12)", color: "var(--oly-gold-bright)" }
                          : { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.75)" }
                      }
                    >
                      <span>#{index + 1} {entry.nickname}</span>
                      <span className="flex items-center gap-3">
                        {entry.avgAnswerMs != null ? (
                          <span style={{ fontSize: "0.75rem", opacity: 0.55 }}>avg {fmtSpeed(entry.avgAnswerMs)}</span>
                        ) : null}
                        <span>{fmtScore(entry.score)} pt</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleResetRoom}
                disabled={!room || isResettingRoom}
                className="rounded-2xl px-5 py-3 text-sm font-bold transition-all disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, var(--oly-gold-dim) 0%, var(--oly-gold) 50%, var(--oly-gold-bright) 100%)",
                  boxShadow: "var(--oly-glow-gold)",
                  color: "#0a0800",
                }}
              >
                {isResettingRoom ? "Resetting…" : "Play Again"}
              </button>
              <Link
                href="/submit"
                className="rounded-2xl px-4 py-3 text-sm font-semibold transition"
                style={{ border: "1px solid rgba(201,162,39,0.25)", color: "var(--oly-gold-dim)" }}
              >
                Add sacred entries
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

