"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TimedYouTubePlayer, type TimedYouTubePlayerHandle } from "@/components/host/TimedYouTubePlayer";

import {
  Avatar,
  Bolt,
  Btn,
  Columns,
  G,
  Laurel,
  Meander,
  OPTION_COLORS,
  Panel,
  Ring,
  StarField,
  TX,
} from "@/components/olympus";
import { initialStatus } from "@/lib/game-machine";
import {
  buildRoundPayloadFromQuizEntry,
  computeAnswerScore,
  createPhaseDeadline,
  DEFAULT_ANSWERING_DURATION_SECONDS,
  DEFAULT_REVEALED_REPLAY_SECONDS,
  DEFAULT_WORTHY_PLAYING_MAX_SECONDS,
  generateRoomCode,
  getClipPlayDurationSeconds,
  getPhaseDurationSeconds,
  mergeQuizEntries,
  readStoredQuizEntries,
  selectQuizEntryForRound,
} from "@/lib/room";
import {
  formatSupabaseErrorMessage,
  getSupabaseBrowserClient,
  getSupabaseSetupMessage,
} from "@/lib/supabase";
import type { PlaybackMode, QuizEntry, Room, RoomPlayer, Round } from "@/types/game";

type RoundRow = {
  id: string;
  room_id: string;
  round_number: number;
  prompt_text: string;
  answer_options: string[];
  correct_answer: string | null;
  state: string;
  youtube_video_id: string | null;
  playback_mode: "audio-only" | "video-only" | "audio-video";
  clip_start_seconds?: number | null;
  clip_end_seconds?: number | null;
  entry_title: string | null;
  entry_artist: string | null;
};

type AnswerRow = {
  id: string;
  room_id: string;
  round_id: string;
  player_id: string;
  answer_text: string;
  answered_after_ms: number | null;
};

type QuizEntryRow = {
  id: string;
  title: string | null;
  artist: string | null;
  prompt_text: string;
  answer_options: string[];
  correct_answer: string;
  youtube_video_id: string;
  clip_start_seconds: number;
  clip_end_seconds: number;
  playback_mode: "audio-only" | "video-only" | "audio-video";
  category: string | null;
};

type LeaderRow = {
  player_id: string;
  nickname: string;
  score: number;
  gain: number;
};

function phaseSeconds(status: Room["status"], round: RoundRow | null) {
  if (!round) {
    return getPhaseDurationSeconds(status);
  }

  return getPhaseDurationSeconds(status, {
    clip_start_seconds: round.clip_start_seconds ?? 0,
    clip_end_seconds: round.clip_end_seconds ?? 15,
  });
}

function computeGain(isCorrect: boolean, answeredAfterMs: number | null, round: { clip_start_seconds?: number | null; clip_end_seconds?: number | null } | null) {
  if (!isCorrect) return 0;
  const clipDurationMs = getClipPlayDurationSeconds(round ?? {}) * 1000;
  const totalWindowMs = clipDurationMs + DEFAULT_ANSWERING_DURATION_SECONDS * 1000;
  return computeAnswerScore(answeredAfterMs, totalWindowMs);
}

export default function HostPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const clipPlayerRef = useRef<TimedYouTubePlayerHandle>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const soundtrackFadeRef = useRef<number | null>(null);

  // Shared player config — driven by prepareRoundClip, consumed by all three render phases
  const [preparedClip, setPreparedClip] = useState<{
    videoId: string | null;
    startSeconds: number;
    endSeconds: number;
    playbackMode: PlaybackMode;
    autoPlayRequestKey: string | null;
  }>({
    videoId: null,
    startSeconds: 0,
    endSeconds: 60,
    playbackMode: "audio-video",
    autoPlayRequestKey: null,
  });
  // Prevents the early worthy trigger from firing more than once per round
  const worthyAutoTriggeredRef = useRef(false);
  // Counts consecutive rounds that ended without a worthy play.
  // When this reaches 4 (i.e. 4 non-worthy rounds have passed), the next
  // revealed phase is forced into worthy_playing regardless of votes.
  // Resets to 0 whenever a worthy play occurs (voted or forced).
  const roundsSinceLastWorthyRef = useRef(0);
  // Tracks quiz_entry_id values played in the previous game so they are
  // excluded from the next game when players choose "Play Again".
  const previousGameEntryIdsRef = useRef<Set<string>>(new Set());

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [round, setRound] = useState<RoundRow | null>(null);
  const [allRounds, setAllRounds] = useState<RoundRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [allAnswers, setAllAnswers] = useState<AnswerRow[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isAdvancingPhase, setIsAdvancingPhase] = useState(false);
  const [phaseSecondsLeft, setPhaseSecondsLeft] = useState(0);
  const [selectedTotalRounds, setSelectedTotalRounds] = useState<5 | 25 | 50>(5);

  // Pre-loads clip config into state so the single player is always warm when a phase mounts
  const prepareRoundClip = useCallback(
    (r: RoundRow | null, status: Room["status"] | null) => {
      if (!r?.youtube_video_id) return;
      if (status === "playing" || status === "clip_playing" || status === "answering") {
        setPreparedClip({
          videoId: r.youtube_video_id,
          startSeconds: r.clip_start_seconds ?? 0,
          endSeconds: r.clip_end_seconds ?? 15,
          playbackMode: r.playback_mode ?? "audio-video",
          autoPlayRequestKey: status === "clip_playing" ? r.id : null,
        });
      } else if (status === "revealed") {
        const replayStart = (r.clip_start_seconds ?? 0) + 15;
        setPreparedClip({
          videoId: r.youtube_video_id,
          startSeconds: replayStart,
          endSeconds: replayStart + DEFAULT_REVEALED_REPLAY_SECONDS,
          playbackMode: "audio-video",
          autoPlayRequestKey: `${r.id}-revealed`,
        });
      } else if (status === "worthy_playing") {
        setPreparedClip({
          videoId: r.youtube_video_id,
          startSeconds: 0,
          endSeconds: 7200,
          playbackMode: "audio-video",
          autoPlayRequestKey: `${r.id}-worthy`,
        });
      }
    },
    [],
  );

  const loadBundle = useCallback(
    async (roomId: string) => {
      if (!supabase) return;

      // ── Fetch all data first, then commit to state in one synchronous block ──
      // This prevents React from rendering with a partial state where room.status
      // has advanced (e.g. "revealed") but preparedClip still has old values
      // (e.g. startSeconds = clip_start instead of clip_start + 15), which would
      // cause the player to mount and seek to the wrong position.

      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .maybeSingle();

      if (roomError) {
        setStatusMsg(formatSupabaseErrorMessage(roomError, "Could not load room."));
        return;
      }
      if (!roomData) {
        setRoom(null);
        setPlayers([]);
        setRound(null);
        setAnswers([]);
        setStatusMsg("Room not found.");
        return;
      }

      const currentRoom = roomData as Room;

      const { data: roomPlayers, error: playersError } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomId)
        .eq("is_host", false)
        .order("joined_at", { ascending: true });

      if (playersError) {
        setStatusMsg(formatSupabaseErrorMessage(playersError, "Could not load players."));
        return;
      }

      const roundQuery = currentRoom.current_round_id
        ? supabase
            .from("rounds")
            .select("*")
            .eq("id", currentRoom.current_round_id)
            .maybeSingle()
        : supabase
            .from("rounds")
            .select("*")
            .eq("room_id", roomId)
            .order("round_number", { ascending: false })
            .limit(1)
            .maybeSingle();

      const { data: currentRound, error: roundError } = await roundQuery;
      if (roundError) {
        setStatusMsg(formatSupabaseErrorMessage(roundError, "Could not load round."));
        return;
      }

      let normalizedRound: RoundRow | null = null;
      let roundAnswers: AnswerRow[] = [];

      // Fetch all rounds for the room (needed for cumulative leaderboard)
      const { data: allRoundsData, error: allRoundsError } = await supabase
        .from("rounds")
        .select("*")
        .eq("room_id", roomId)
        .order("round_number", { ascending: true });
      if (allRoundsError) {
        setStatusMsg(formatSupabaseErrorMessage(allRoundsError, "Could not load rounds."));
        return;
      }
      const normalizedAllRounds = ((allRoundsData ?? []) as RoundRow[]).map((r) => ({
        ...r,
        answer_options: Array.isArray(r.answer_options) ? r.answer_options : [],
      }));

      // Fetch all answers for the room (all rounds, for cumulative scoring)
      const { data: allAnswersData, error: allAnswersError } = await supabase
        .from("answers")
        .select("*")
        .eq("room_id", roomId);
      if (allAnswersError) {
        setStatusMsg(formatSupabaseErrorMessage(allAnswersError, "Could not load answers."));
        return;
      }
      const fetchedAllAnswers = (allAnswersData ?? []) as AnswerRow[];

      if (currentRound) {
        const normalized = currentRound as RoundRow;
        normalized.answer_options = Array.isArray(normalized.answer_options) ? normalized.answer_options : [];
        normalizedRound = normalized;
        roundAnswers = fetchedAllAnswers.filter((a) => a.round_id === normalized.id);
      }

      // ── Commit all state synchronously — React batches into one render ──
      if (normalizedRound) {
        prepareRoundClip(normalizedRound, currentRoom.status);
      }
      setRoom(currentRoom);
      if (currentRoom.total_rounds) {
        setSelectedTotalRounds(currentRoom.total_rounds as 5 | 25 | 50);
      }
      setPlayers((roomPlayers ?? []) as RoomPlayer[]);
      setRound(normalizedRound);
      setAllRounds(normalizedAllRounds);
      setAnswers(roundAnswers);
      setAllAnswers(fetchedAllAnswers);
      setStatusMsg("");
    },
    [supabase],
  );

  useEffect(() => {
    if (!room?.phase_ends_at) {
      setPhaseSecondsLeft(phaseSeconds(room?.status ?? "lobby", round));
      return;
    }

    const end = new Date(room.phase_ends_at).getTime();
    const id = window.setInterval(() => {
      const sec = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setPhaseSecondsLeft(sec);
    }, 1000);

    return () => window.clearInterval(id);
  }, [room?.phase_ends_at, room?.status, round]);

  useEffect(() => {
    if (!supabase || !room?.id) return;

    const channel = supabase
      .channel(`host-room-${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, () => {
        void loadBundle(room.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${room.id}` }, () => {
        void loadBundle(room.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${room.id}` }, () => {
        void loadBundle(room.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "answers", filter: `room_id=eq.${room.id}` }, () => {
        void loadBundle(room.id);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadBundle, room?.id, supabase]);

  // Background music — init on mount, random start position
  useEffect(() => {
    const audio = new Audio("/dionysos-after-dark.mp3");
    audio.loop = true;
    audio.volume = 0.35;
    audioRef.current = audio;

    const tryPlay = () => { void audio.play().catch(() => {}); };

    const onMetadata = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.random() * audio.duration;
      }
      tryPlay();
    };
    audio.addEventListener("loadedmetadata", onMetadata, { once: true });
    tryPlay();

    const onInteraction = () => {
      if (audio.paused) tryPlay();
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
      audio.removeEventListener("loadedmetadata", onMetadata);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  // Music fades in during lobby/finished, fades out during gameplay
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const isLobby = !room || room.status === "lobby";
    const isFinished = room?.status === "finished";
    const targetVolume = isLobby || isFinished ? 0.35 : 0;
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
  }, [room?.status]);

  // ── AUTO-ADVANCE 1: phase_ends_at timer ──────────────────────────────────
  // Fires handleAdvance automatically when the phase deadline expires.
  useEffect(() => {
    if (!room?.phase_ends_at || room.status === "lobby" || room.status === "finished") return;
    if (isAdvancingPhase) return;

    const msRemaining = new Date(room.phase_ends_at).getTime() - Date.now();
    if (msRemaining <= 0) {
      void handleAdvance("auto-timer");
      return;
    }

    const timer = window.setTimeout(() => {
      void handleAdvance("auto-timer");
    }, msRemaining + 50); // +50ms buffer to ensure deadline has passed

    return () => window.clearTimeout(timer);
  // handleAdvance changes identity when room/round change, so this is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.phase_ends_at, room?.status, isAdvancingPhase]);

  // ── AUTO-ADVANCE 2: all players answered ────────────────────────────────
  // Skips straight from clip_playing to revealed the moment everyone answers.
  useEffect(() => {
    if (room?.status !== "clip_playing" && room?.status !== "answering") return;
    if (players.length === 0) return;
    if (answers.length < players.length) return;
    if (isAdvancingPhase) return;

    const timer = window.setTimeout(() => {
      void handleAdvance("all-answered");
    }, 60);

    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.length, players.length, room?.status, isAdvancingPhase]);

  // ── AUTO-ADVANCE 3: early worthy vote majority ───────────────────────────
  // During revealed, if >49% vote worthy before the timer, skip immediately.
  useEffect(() => {
    if (room?.status !== "revealed") return;
    if (isAdvancingPhase) return;
    if (worthyAutoTriggeredRef.current) return;
    const nonHost = players.filter((p) => !p.is_host);
    if (nonHost.length === 0) return;
    const worthyYes = nonHost.filter((p) => p.worthy_vote === true).length;
    if ((worthyYes / nonHost.length) * 100 > 49) {
      worthyAutoTriggeredRef.current = true;
      void handleAdvance("worthy-early-vote");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, room?.status, isAdvancingPhase]);

  // ── AUTO-ADVANCE 4: all players ready in lobby ───────────────────────────────────────
  // NOTE: auto-start removed — host (or any player via the phone START GAME button) must
  // manually press START GAME so a single player can't accidentally start the game.
  // ── AUTO-ADVANCE 5: all players vote to play again ──────────────────────────────────
  // When the game is finished and every player has tapped "Play Again", restart automatically.
  useEffect(() => {
    if (room?.status !== "finished") return;
    if (isAdvancingPhase) return;
    const nonHost = players.filter((p) => !p.is_host);
    if (nonHost.length === 0) return;
    const allReady = nonHost.every((p) => p.is_ready);
    if (!allReady) return;
    void handlePlayAgain();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, room?.status, isAdvancingPhase]);

  const handleCreateRoom = async () => {
    if (!supabase) {
      setStatusMsg(getSupabaseSetupMessage());
      return;
    }

    setIsCreatingRoom(true);
    setStatusMsg("Summoning room...");

    try {
      let createdRoom: Room | null = null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = generateRoomCode();
        const { data, error } = await supabase
          .from("rooms")
          .insert({ code, status: initialStatus(), current_round_number: 0 })
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
        throw new Error("Could not generate unique room code.");
      }

      const { data: hostPlayer, error: hostPlayerError } = await supabase
        .from("players")
        .insert({ nickname: "Host Screen" })
        .select("*")
        .single();

      if (hostPlayerError) throw hostPlayerError;

      const { error: hostLinkError } = await supabase.from("room_players").insert({
        room_id: createdRoom.id,
        player_id: hostPlayer.id,
        nickname: "Host Screen",
        is_host: true,
      });

      if (hostLinkError) throw hostLinkError;

      await loadBundle(createdRoom.id);
    } catch (error) {
      setStatusMsg(formatSupabaseErrorMessage(error, "Could not create room."));
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const createRoundFromEntry = useCallback(
    async (targetRoom: Room, nextRoundNumber: number) => {
      if (!supabase) throw new Error("Supabase missing.");

      const localEntries = readStoredQuizEntries().filter((entry) => entry.is_active !== false);

      // Collect entry IDs already used in this game so we never repeat
      const { data: usedRoundsData } = await supabase
        .from("rounds")
        .select("quiz_entry_id")
        .eq("room_id", targetRoom.id);
      const usedEntryIds = new Set(
        ((usedRoundsData ?? []) as { quiz_entry_id: string | null }[])
          .map((r) => r.quiz_entry_id)
          .filter(Boolean) as string[],
      );
      // Also exclude songs from the previous game (play-again deduplication)
      for (const id of previousGameEntryIdsRef.current) {
        usedEntryIds.add(id);
      }

      const { data: entries, error: entriesError } = await supabase
        .from("quiz_entries")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (entriesError) {
        const pool = localEntries.filter((e) => !usedEntryIds.has(e.id));
        const fallbackEntry = selectQuizEntryForRound(pool.length > 0 ? pool : localEntries, nextRoundNumber);
        if (!fallbackEntry) throw entriesError;

        const fallbackPayload = buildRoundPayloadFromQuizEntry(nextRoundNumber, fallbackEntry, "clip_playing");
        const { data: newRoundFallback, error: roundFallbackError } = await supabase
          .from("rounds")
          .insert({ room_id: targetRoom.id, ...fallbackPayload })
          .select("*")
          .single();

        if (roundFallbackError) throw roundFallbackError;
        return newRoundFallback as RoundRow;
      }

      const remoteEntries: QuizEntry[] = ((entries ?? []) as QuizEntry[]).map((entry) => ({
        ...entry,
        answer_options: Array.isArray(entry.answer_options) ? entry.answer_options : [],
      }));
      const allEntries = mergeQuizEntries(remoteEntries, localEntries).filter((entry) => entry.is_active !== false);
      if (allEntries.length === 0) {
        throw new Error("No active quiz entries found. Add entries first.");
      }

      // Prefer entries not yet played this game; fall back to full pool if exhausted
      const freshEntries = allEntries.filter((e) => !usedEntryIds.has(e.id));
      const pick = selectQuizEntryForRound(freshEntries.length > 0 ? freshEntries : allEntries, nextRoundNumber);
      if (!pick) {
        throw new Error("Could not select a quiz entry for the next round.");
      }

      const payload = buildRoundPayloadFromQuizEntry(nextRoundNumber, pick, "clip_playing");

      const { data: newRound, error: roundError } = await supabase
        .from("rounds")
        .insert({ room_id: targetRoom.id, ...payload })
        .select("*")
        .single();

      if (roundError) throw roundError;
      return newRound as RoundRow;
    },
    [supabase, prepareRoundClip],
  );

  const setRoomPhase = async (nextStatus: Room["status"], secs: number, nextRoundId?: string) => {
    if (!supabase || !room) return;

    const startedAt = new Date();
    const endsAt = secs > 0 ? createPhaseDeadline(secs, startedAt) : null;

    const payload: Record<string, unknown> = {
      status: nextStatus,
      phase_started_at: startedAt.toISOString(),
      phase_ends_at: endsAt,
    };

    if (nextRoundId) {
      payload.current_round_id = nextRoundId;
    }

    const { error } = await supabase.from("rooms").update(payload).eq("id", room.id);
    if (error) throw error;
  };

  const TOTAL_ROUNDS = selectedTotalRounds;

  const handleSelectTotalRounds = async (n: 5 | 25 | 50) => {
    setSelectedTotalRounds(n);
    if (supabase && room) {
      try {
        await supabase.from("rooms").update({ total_rounds: n }).eq("id", room.id);
      } catch {
        // Non-critical — local selection still applied
      }
    }
  };

  const handleStartGame = async () => {
    if (!supabase || !room) return;

    try {
      const nextRoundNumber = 1;
      const newRound = await createRoundFromEntry(room, nextRoundNumber);

      // Reset all worthy votes before the first round
      await supabase
        .from("room_players")
        .update({ worthy_vote: null })
        .eq("room_id", room.id)
        .eq("is_host", false);

      const { error: roomError } = await supabase
        .from("rooms")
        .update({
          current_round_id: newRound.id,
          current_round_number: nextRoundNumber,
          total_rounds: TOTAL_ROUNDS,
          status: "playing",
          phase_started_at: new Date().toISOString(),
          phase_ends_at: createPhaseDeadline(getPhaseDurationSeconds("playing")),
        })
        .eq("id", room.id);

      if (roomError) throw roomError;
      await loadBundle(room.id);
    } catch (error) {
      setStatusMsg(formatSupabaseErrorMessage(error, "Could not start game."));
    }
  };

  const answersByPlayer = useMemo(() => {
    const m = new Map<string, AnswerRow>();
    for (const a of answers) m.set(a.player_id, a);
    return m;
  }, [answers]);

  const leaderboard = useMemo(() => {
    // Build a lookup of round by id for correct_answer and clip timing
    const roundById = new Map(allRounds.map((r) => [r.id, r]));

    // Cumulative score across ALL rounds
    const totalByPlayer = new Map<string, number>();
    // Gain from CURRENT round only (for delta display)
    const gainByPlayer = new Map<string, number>();

    players.forEach((p) => {
      totalByPlayer.set(p.player_id, 0);
      gainByPlayer.set(p.player_id, 0);
    });

    for (const a of allAnswers) {
      const r = roundById.get(a.round_id);
      if (!r?.correct_answer) continue;
      const correct = a.answer_text === r.correct_answer;
      const pts = Math.round(computeGain(correct, a.answered_after_ms, r));
      totalByPlayer.set(a.player_id, (totalByPlayer.get(a.player_id) ?? 0) + pts);
      if (a.round_id === round?.id) {
        gainByPlayer.set(a.player_id, pts);
      }
    }

    const rows: LeaderRow[] = players.map((p) => ({
      player_id: p.player_id,
      nickname: p.nickname,
      score: totalByPlayer.get(p.player_id) ?? 0,
      gain: gainByPlayer.get(p.player_id) ?? 0,
    }));

    rows.sort((a, b) => b.score - a.score);
    return rows;
  }, [allAnswers, allRounds, players, round?.id]);

  const answeredCount = answers.length;
  const worthyVotes = players.filter((p) => p.worthy_vote === true).length;

  // Central phase-advance function — called both by buttons (skip) and auto-timers.
  const handleAdvance = useCallback(async (source = "manual") => {
    if (!supabase || !room) return;
    if (isAdvancingPhase) return; // block double-fire
    // Prevent auto-sources from firing without a deadline (except video-ended)
    if (source !== "manual" && source !== "video-ended" && !room.phase_ends_at) return;

    setIsAdvancingPhase(true);
    try {
      if (room.status === "playing") {
        // Intro buffer expired — start the actual clip
        if (round) await supabase.from("rounds").update({ state: "clip_playing" }).eq("id", round.id);
        await setRoomPhase("clip_playing", getPhaseDurationSeconds("clip_playing", {
          clip_start_seconds: round?.clip_start_seconds ?? 0,
          clip_end_seconds: round?.clip_end_seconds ?? 15,
        }));
      } else if (room.status === "clip_playing" || room.status === "answering") {
        // clip ended → go directly to revealed; video continues from clip_end_seconds
        if (round) await supabase.from("rounds").update({ state: "revealed" }).eq("id", round.id);
        await setRoomPhase("revealed", getPhaseDurationSeconds("revealed"));
      } else if (room.status === "revealed") {
        const nonHostPlayers = players.filter((p) => !p.is_host);
        const worthyYes = nonHostPlayers.filter((p) => p.worthy_vote === true).length;
        const worthyPct = nonHostPlayers.length > 0 ? (worthyYes / nonHostPlayers.length) * 100 : 0;

        // Forced-worthy rule: if 4 consecutive rounds passed without a worthy play,
        // this 5th revealed phase skips the vote and forces worthy_playing.
        const forcedWorthy = roundsSinceLastWorthyRef.current >= 4;
        const goWorthy = forcedWorthy || (worthyPct > 49 && nonHostPlayers.length > 0);

        // Close current round
        if (round) {
          await supabase.from("rounds").update({ state: "closed" }).eq("id", round.id);
        }

        if (goWorthy) {
          // Reset counter — a worthy play (voted or forced) breaks the streak
          roundsSinceLastWorthyRef.current = 0;
          await setRoomPhase("worthy_playing", DEFAULT_WORTHY_PLAYING_MAX_SECONDS); // 6-min fallback; also ends when video ends via onVideoEnded
        } else {
          // No worthy this round — increment the streak counter
          roundsSinceLastWorthyRef.current += 1;
          const totalRounds = room.total_rounds ?? TOTAL_ROUNDS;
          if ((room.current_round_number ?? 0) >= totalRounds) {
            // Finish game — reset is_ready so players can vote to play again
            const winnerName = leaderboard[0]?.nickname ?? null;
            await supabase
              .from("rooms")
              .update({ status: "finished", phase_started_at: new Date().toISOString(), phase_ends_at: null, winner_name: winnerName })
              .eq("id", room.id);
            await supabase.from("room_players").update({ is_ready: false }).eq("room_id", room.id).eq("is_host", false);
          } else {
            await startNextRound();
          }
        }
      } else if (room.status === "worthy_playing") {
        const totalRounds = room.total_rounds ?? TOTAL_ROUNDS;
        if ((room.current_round_number ?? 0) >= totalRounds) {
          const winnerName = leaderboard[0]?.nickname ?? null;
          await supabase
            .from("rooms")
            .update({ status: "finished", phase_started_at: new Date().toISOString(), phase_ends_at: null, winner_name: winnerName })
            .eq("id", room.id);
          await supabase.from("room_players").update({ is_ready: false }).eq("room_id", room.id).eq("is_host", false);
        } else {
          await startNextRound();
        }
      }

      await loadBundle(room.id);
    } catch (error) {
      setStatusMsg(formatSupabaseErrorMessage(error, "Could not advance phase."));
    } finally {
      setIsAdvancingPhase(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, round, players, leaderboard, supabase, isAdvancingPhase]);

  const handlePlayAgain = useCallback(async () => {
    if (!supabase || !room) return;
    setIsAdvancingPhase(true);
    try {
      await supabase.from("room_players").update({ is_ready: false, worthy_vote: null }).eq("room_id", room.id).eq("is_host", false);
      worthyAutoTriggeredRef.current = false;
      roundsSinceLastWorthyRef.current = 0;
      // Remember which entries were played this game so the next game doesn't repeat them.
      const { data: prevRoundsData } = await supabase
        .from("rounds")
        .select("quiz_entry_id")
        .eq("room_id", room.id);
      previousGameEntryIdsRef.current = new Set(
        ((prevRoundsData ?? []) as { quiz_entry_id: string | null }[])
          .map((r) => r.quiz_entry_id)
          .filter(Boolean) as string[],
      );
      // Delete all existing rounds for this room — answers cascade automatically via FK.
      // This clears the unique(room_id, round_number) constraint so we can start from 1 again.
      await supabase.from("rounds").delete().eq("room_id", room.id);
      const newRound = await createRoundFromEntry(room, 1);
      await supabase
        .from("rooms")
        .update({
          current_round_id: newRound.id,
          current_round_number: 1,
          total_rounds: room.total_rounds ?? TOTAL_ROUNDS,
          status: "playing",
          phase_started_at: new Date().toISOString(),
          phase_ends_at: createPhaseDeadline(getPhaseDurationSeconds("playing")),
        })
        .eq("id", room.id);
      await loadBundle(room.id);
    } catch (error) {
      setStatusMsg(formatSupabaseErrorMessage(error, "Could not start new game."));
    } finally {
      setIsAdvancingPhase(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRoundFromEntry, room, supabase]);

  const handleReturnToMenu = useCallback(async () => {
    if (!supabase || !room) return;
    try {
      await supabase.from("room_players").update({ is_ready: false, worthy_vote: null }).eq("room_id", room.id).eq("is_host", false);
      await supabase
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
      await loadBundle(room.id);
    } catch (error) {
      setStatusMsg(formatSupabaseErrorMessage(error, "Could not return to menu."));
    }
  }, [loadBundle, room, supabase]);

  const startNextRound = useCallback(async () => {
    if (!supabase || !room) return;
    // Reset per-round refs
    worthyAutoTriggeredRef.current = false;
    const nextRoundNumber = (room.current_round_number ?? 0) + 1;
    const newRound = await createRoundFromEntry(room, nextRoundNumber);

    // Reset worthy votes for the new round
    await supabase
      .from("room_players")
      .update({ worthy_vote: null })
      .eq("room_id", room.id)
      .eq("is_host", false);

    const { error: roomError } = await supabase
      .from("rooms")
      .update({
        current_round_id: newRound.id,
        current_round_number: nextRoundNumber,
        status: "playing",
        phase_started_at: new Date().toISOString(),
        phase_ends_at: createPhaseDeadline(getPhaseDurationSeconds("playing")),
      })
      .eq("id", room.id);

    if (roomError) throw roomError;
  }, [createRoundFromEntry, room, supabase]);

  const configuredSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  const [runtimeOrigin, setRuntimeOrigin] = useState("");
  useEffect(() => { setRuntimeOrigin(window.location.origin.replace(/\/$/, "")); }, []);
  // Prefer the actual browser origin (always accurate) over the env var which may point to an old deployment
  const siteUrl = runtimeOrigin || configuredSiteUrl || "http://localhost:3002";
  const joinPageUrl = `${siteUrl}/join`;
  const qrTarget = room ? `${joinPageUrl}?room=${room.code}` : joinPageUrl;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrTarget)}`;

  const renderLobby = () => (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      width: "100%",
      padding: "28px 60px 32px",
      gap: 0,
      position: "relative",
      zIndex: 2,
    }}>

      {/* ── TOP: Title ── */}
      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <Laurel size={44}>
          <h1 className="gold-shimmer flicker" style={{ fontFamily: "Cinzel,serif", fontSize: 68, fontWeight: 900, letterSpacing: ".12em", lineHeight: 1, margin: 0 }}>
            OLYMPUS NIGHT
          </h1>
        </Laurel>
        <p style={{ color: `${G}77`, fontFamily: "Cinzel,serif", fontSize: 13, letterSpacing: ".35em", marginTop: 4 }}>
          MUSIC QUIZ · PARTY EDITION
        </p>
      </div>

      {/* ── MIDDLE: Room info left · Player grid right ── */}
      <div style={{ flex: 1, display: "flex", gap: 40, alignItems: "center", minHeight: 0, marginTop: 20 }}>

        {/* LEFT — join URL + room code + QR */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, flexShrink: 0, width: 380 }}>
          <p style={{ color: `${TX}55`, letterSpacing: ".12em", fontSize: 13, textAlign: "center" }}>
            JOIN AT <strong style={{ color: TX }}>{joinPageUrl}</strong>
          </p>

          {room ? (
            <>
              <Panel glow style={{ padding: "14px 20px", textAlign: "center", position: "relative", width: "100%" }}>
                <Meander side="top" />
                <Meander side="bottom" />
                <p style={{ color: `${TX}33`, fontSize: 10, letterSpacing: ".3em", marginBottom: 4 }}>ROOM CODE</p>
                <div className="gold-shimmer" style={{ fontFamily: "Cinzel,serif", fontSize: 72, fontWeight: 900, letterSpacing: ".15em", lineHeight: 1 }}>
                  {room.code}
                </div>
              </Panel>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{
                  background: "white",
                  borderRadius: 20,
                  padding: 10,
                  boxShadow: `0 0 0 1.5px ${G}44, 0 8px 32px rgba(0,0,0,.5)`,
                  lineHeight: 0,
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCodeUrl} alt={`QR code for room ${room.code}`} style={{ width: 150, height: 150, borderRadius: 12, display: "block" }} />
                </div>
                <p style={{ color: `${TX}44`, fontSize: 10, letterSpacing: ".2em" }}>SCAN TO JOIN</p>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              {statusMsg && <p style={{ color: `${TX}66`, fontSize: 13, textAlign: "center" }}>{statusMsg}</p>}
              <Btn onClick={handleCreateRoom} disabled={isCreatingRoom} size="lg">
                {isCreatingRoom ? "SUMMONING" : "CREATE ROOM"}
              </Btn>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, alignSelf: "stretch", background: `linear-gradient(to bottom, transparent, ${G}22, transparent)`, flexShrink: 0 }} />

        {/* RIGHT — player grid */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ color: `${TX}44`, letterSpacing: ".2em", fontSize: 12 }}>PLAYERS JOINED</span>
            <span style={{ fontFamily: "Cinzel,serif", fontSize: 20, color: G }}>{players.length} / 8</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {players.map((p) => (
              <Panel key={p.id} style={{
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: p.is_ready ? `0 0 0 1.5px ${G}, 0 0 18px ${G}55` : undefined,
                transition: "box-shadow .4s",
              }}>
                <Avatar name={p.nickname} size={36} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: p.is_ready ? G : TX }}>{p.nickname}</div>
                  <div style={{ fontSize: 10, color: p.is_ready ? "#4CC870" : "#FF9820", marginTop: 2 }}>{p.is_ready ? "READY ✓" : "NOT READY"}</div>
                </div>
              </Panel>
            ))}

            {/* Empty slot placeholders */}
            {Array.from({ length: Math.max(0, 8 - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} style={{
                padding: "14px 16px",
                borderRadius: 12,
                border: `1px dashed ${G}18`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 68,
              }}>
                <span style={{ color: `${TX}14`, fontSize: 11, letterSpacing: ".1em" }}>WAITING...</span>
              </div>
            ))}
          </div>

          {players.length === 0 && (
            <p style={{ color: `${TX}22`, fontSize: 13, letterSpacing: ".15em", textAlign: "center", marginTop: 8 }}>
              Waiting for players to join...
            </p>
          )}
        </div>
      </div>

      {/* ── BOTTOM: Rounds + Start ── */}
      {room && (
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 16, borderTop: `1px solid ${G}18`, marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: `${TX}44`, fontSize: 12, letterSpacing: ".15em" }}>ROUNDS</span>
            {([5, 25, 50] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => void handleSelectTotalRounds(n)}
                style={{
                  padding: "6px 20px",
                  borderRadius: 8,
                  border: `1.5px solid ${selectedTotalRounds === n ? G : `${G}33`}`,
                  background: selectedTotalRounds === n ? `${G}18` : "transparent",
                  color: selectedTotalRounds === n ? G : `${TX}44`,
                  fontFamily: "Cinzel,serif",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                  letterSpacing: ".05em",
                  transition: "all .15s",
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <span style={{ color: `${TX}33`, fontSize: 13 }}>{players.filter((p) => p.is_ready).length} of {players.length} ready</span>
            <Btn size="lg" onClick={handleStartGame}>START GAME</Btn>
          </div>
        </div>
      )}
    </div>
  );

  const renderGameHeader = () => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "8px 16px 0", zIndex: 2 }}>
      <Panel style={{ padding: "10px 22px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: `${TX}55`, fontSize: 12, letterSpacing: ".2em" }}>ROUND</span>
        <span style={{ fontFamily: "Cinzel,serif", fontSize: 26, fontWeight: 700, color: G }}>
          {room?.current_round_number ?? 0}<span style={{ fontSize: 16, color: `${TX}44` }}> / {room?.total_rounds ?? 5}</span>
        </span>
      </Panel>
      <Bolt size={20} />
      <Panel style={{ padding: "10px 22px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: `${TX}55`, fontSize: 12, letterSpacing: ".2em" }}>ROOM</span>
        <span style={{ fontFamily: "Cinzel,serif", fontSize: 22, fontWeight: 700, color: G, letterSpacing: ".2em" }}>{room?.code ?? "----"}</span>
      </Panel>
    </div>
  );

  const renderClipPlaying = () => {
    const options = (round?.answer_options ?? ["Option A", "Option B", "Option C", "Option D"]).slice(0, 4);
    const isAnswering = room?.status === "answering";
    const clipDuration = Math.max(5, (round?.clip_end_seconds ?? 15) - (round?.clip_start_seconds ?? 0));
    const ringMax = isAnswering ? getPhaseDurationSeconds("answering") : clipDuration;

    return (
      <>
        {renderGameHeader()}
        <div style={{ flex: 1, display: "flex", gap: 0, padding: "10px 32px 12px", overflow: "hidden", width: "100%", zIndex: 2 }}>

          {/* LEFT — video / audio visualizer */}
          <div style={{ flex: round?.playback_mode === "audio-only" ? 1 : 1.5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, paddingRight: 24 }}>
            <div style={{ textAlign: "center" }}>
              <h1 style={{ fontFamily: "Cinzel,serif", fontSize: round?.playback_mode === "audio-only" ? 68 : 46, fontWeight: 900, color: isAnswering ? "#E8C55A" : TX, letterSpacing: ".05em", lineHeight: 1 }}>
                {isAnswering
                  ? "LAST CHANCE"
                  : round?.playback_mode === "audio-only" ? "LISTEN CAREFULLY" : round?.playback_mode === "video-only" ? "WATCH CAREFULLY" : "WATCH AND LISTEN"}
              </h1>
              <p style={{ color: `${TX}44`, fontSize: 13, marginTop: 7, letterSpacing: ".16em" }}>
                {isAnswering
                  ? `${answeredCount} / ${players.length} answered`
                  : `${round?.playback_mode === "audio-only" ? "Audio only" : round?.playback_mode === "video-only" ? "Video only" : "Audio and video"} · Round ${room?.current_round_number ?? 0}`}
              </p>
            </div>

            {round?.playback_mode === "audio-only" ? (
              <div style={{ width: 190, height: 190, borderRadius: "50%", background: "radial-gradient(circle at 40% 40%,rgba(80,30,160,.65),rgba(20,5,60,.92))", border: `2px solid ${G}33`, display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse-glow 1.8s ease-in-out infinite" }}>
                <span style={{ fontSize: 64 }}>AUDIO</span>
              </div>
            ) : null}

            <div style={{ width: "100%", maxWidth: 780, display: preparedClip.playbackMode === "audio-only" ? "none" : undefined }}>
              <TimedYouTubePlayer
                ref={clipPlayerRef}
                videoId={preparedClip.videoId}
                startSeconds={preparedClip.startSeconds}
                endSeconds={preparedClip.endSeconds}
                playbackMode={preparedClip.playbackMode}
                autoPlayRequestKey={preparedClip.autoPlayRequestKey}
                spoilerGuard
                highlighted
              />
            </div>
          </div>

          <div style={{ width: 1, background: `${G}18`, margin: "16px 0", flexShrink: 0 }} />

          {/* RIGHT — question + options + answer counter + countdown */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, paddingLeft: 28 }}>
            <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(201,151,58,.1)", border: `1.5px solid ${G}55` }}>
              <p style={{ color: `${G}88`, fontSize: 11, letterSpacing: ".22em", marginBottom: 5 }}>QUESTION</p>
              <p style={{ fontFamily: "Cinzel,serif", fontSize: 19, fontWeight: 700, color: TX, lineHeight: 1.3 }}>{round?.prompt_text ?? "Which song is currently playing?"}</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {options.map((opt, i) => (
                <div key={`${opt}-${i}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", borderRadius: 10, background: `${OPTION_COLORS[i]}0e`, border: `1px solid ${OPTION_COLORS[i]}38` }}>
                  <span style={{ fontFamily: "Cinzel,serif", fontSize: 22, fontWeight: 900, color: OPTION_COLORS[i], width: 30, textAlign: "center", flexShrink: 0 }}>{String.fromCharCode(65 + i)}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: TX }}>{opt}</span>
                </div>
              ))}
            </div>

            {/* Answer counter + timer — compact row at bottom of right column */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderRadius: 10, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
              <div>
                <p style={{ color: `${TX}33`, fontSize: 11, letterSpacing: ".15em", marginBottom: 4 }}>ANSWERED</p>
                <p style={{ fontFamily: "Cinzel,serif", fontSize: 28, fontWeight: 900, color: G, lineHeight: 1 }}>
                  {answeredCount}<span style={{ fontSize: 15, color: `${TX}33` }}> / {players.length}</span>
                </p>
                <div style={{ width: 110, height: 3, background: "rgba(255,255,255,.08)", borderRadius: 2, marginTop: 7, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${players.length ? (answeredCount / players.length) * 100 : 0}%`, borderRadius: 2, background: "linear-gradient(90deg,#7B5000,#E8C55A)", transition: "width .6s ease" }} />
                </div>
              </div>
              <Ring value={phaseSecondsLeft} max={ringMax} size={90} fontSize={34} />
            </div>
          </div>
        </div>

        <div style={{ padding: "0 32px 10px", display: "flex", justifyContent: "flex-end", zIndex: 2 }}>
          <Btn onClick={() => void handleAdvance("skip")} variant="ghost" size="sm">
            {isAnswering ? "REVEAL NOW" : "SKIP TO ANSWERING"}
          </Btn>
        </div>
      </>
    );
  };

  const renderRevealed = () => {
    const nonHostPlayers = players.filter((p) => !p.is_host);
    const worthyYes = nonHostPlayers.filter((p) => p.worthy_vote === true).length;
    const REVEALED_MAX = getPhaseDurationSeconds("revealed");
    const correctIndex = round?.correct_answer && /^[A-D]$/i.test(round.correct_answer) ? round.correct_answer.toUpperCase().charCodeAt(0) - 65 : -1;
    const correctAnswerText = correctIndex >= 0 ? (round?.answer_options?.[correctIndex] ?? null) : null;

    return (
      <>
        <style>{`
          @keyframes revealed-glow-pulse {
            0%,100% { box-shadow: 0 0 0 2px #C9973A, 0 0 18px 3px #C9973Acc, 0 0 50px 8px #C9973A44; }
            50%     { box-shadow: 0 0 0 2px #E8C55A, 0 0 32px 7px #E8C55Aee, 0 0 80px 16px #E8C55A55; }
          }
          .revealed-player-glow { animation: revealed-glow-pulse 2.4s ease-in-out infinite; }
        `}</style>

        {/* Header: ROUND | big answer reveal | ROOM */}
        <div style={{ display: "flex", alignItems: "center", width: "100%", padding: "8px 16px 6px", zIndex: 2, gap: 16, flexShrink: 0 }}>
          <Panel style={{ padding: "8px 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ color: `${TX}55`, fontSize: 11, letterSpacing: ".2em" }}>ROUND</span>
            <span style={{ fontFamily: "Cinzel,serif", fontSize: 22, fontWeight: 700, color: G }}>
              {room?.current_round_number ?? 0}<span style={{ fontSize: 14, color: `${TX}44` }}> / {room?.total_rounds ?? 5}</span>
            </span>
          </Panel>

          <div style={{ flex: 1, textAlign: "center" }}>
            <p style={{ color: `${TX}44`, letterSpacing: ".3em", fontSize: 10, marginBottom: 2 }}>THE ANSWER WAS</p>
            <Laurel size={48}>
              <h1 className="gold-shimmer" style={{ fontFamily: "Cinzel,serif", fontSize: 64, fontWeight: 900, letterSpacing: ".06em", lineHeight: 1, margin: 0 }}>
                {round?.correct_answer ?? "?"}
              </h1>
            </Laurel>
            {correctAnswerText && (
              <p style={{ fontFamily: "Cinzel,serif", fontSize: 18, color: TX, letterSpacing: ".05em", marginTop: 4, lineHeight: 1.2 }}>{correctAnswerText}</p>
            )}
          </div>

          <Panel style={{ padding: "8px 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ color: `${TX}55`, fontSize: 11, letterSpacing: ".2em" }}>ROOM</span>
            <span style={{ fontFamily: "Cinzel,serif", fontSize: 18, fontWeight: 700, color: G, letterSpacing: ".2em" }}>{room?.code ?? "----"}</span>
          </Panel>
        </div>

        {/* Two-column layout: 75% video left, 25% leaderboard right */}
        <div style={{ flex: 1, display: "flex", gap: 20, width: "100%", zIndex: 2, padding: "6px 24px 14px", minHeight: 0 }}>

          {/* LEFT — video 75%, fills available height; padding gives glow room on all sides */}
          <div style={{ flex: 3, display: "flex", flexDirection: "column", minWidth: 0, padding: 8 }}>
            <div
              className="revealed-player-glow"
              style={{
                flex: 1,
                borderRadius: 16,
                overflow: "hidden",
                minHeight: 0,
              }}
            >
              <TimedYouTubePlayer
                ref={clipPlayerRef}
                videoId={preparedClip.videoId}
                startSeconds={preparedClip.startSeconds}
                endSeconds={preparedClip.endSeconds}
                playbackMode="audio-video"
                autoPlayRequestKey={preparedClip.autoPlayRequestKey}
                naked
              />
            </div>
          </div>

          {/* RIGHT — leaderboard 25% */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ color: `${TX}33`, fontSize: 11, letterSpacing: ".22em", textAlign: "center", flexShrink: 0 }}>STANDINGS</p>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
              {leaderboard.map((p, i) => {
                const ans = answersByPlayer.get(p.player_id);
                const correct = !!round?.correct_answer && ans?.answer_text === round.correct_answer;
                const answered = ans !== undefined;
                return (
                  <Panel key={p.player_id} style={{ padding: "9px 14px", display: "flex", alignItems: "center", gap: 8, background: i === 0 ? "rgba(201,151,58,.1)" : "rgba(13,10,40,.8)" }}>
                    <span style={{ width: 20, textAlign: "center", fontSize: i < 3 ? 15 : 11, fontFamily: "Cinzel,serif", color: G, flexShrink: 0 }}>{i + 1}</span>
                    <Avatar name={p.nickname} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "Cinzel,serif", fontSize: 13, fontWeight: 700, color: i === 0 ? G : TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nickname}</div>
                    </div>
                    {answered && (
                      <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: correct ? "rgba(78,200,120,.18)" : "rgba(200,60,60,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: correct ? "#4CC870" : "#E05555" }}>
                        {correct ? "✓" : "✗"}
                      </div>
                    )}
                    {p.gain > 0 && <span style={{ color: "#4CC870", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>+{p.gain}</span>}
                    <div style={{ fontFamily: "Cinzel,serif", fontSize: i === 0 ? 16 : 13, fontWeight: 900, color: i === 0 ? G : TX, minWidth: 44, textAlign: "right", flexShrink: 0 }}>{p.score.toLocaleString()}</div>
                  </Panel>
                );
              })}
            </div>

            {/* Worthy vote strip */}
            <Panel style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "rgba(200,160,255,.6)", fontSize: 10, letterSpacing: ".2em" }}>WORTHY?</span>
              <div style={{ display: "flex", gap: 4 }}>
                {nonHostPlayers.map((p) => (
                  <div key={p.id} style={{ width: 9, height: 9, borderRadius: "50%", background: p.worthy_vote === true ? "#C8A0FF" : p.worthy_vote === false ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.07)", border: "1px solid rgba(200,160,255,.3)", transition: "background .4s" }} />
                ))}
              </div>
              <span style={{ fontFamily: "Cinzel,serif", color: "#C8A0FF", fontSize: 18, fontWeight: 700 }}>{worthyYes}/{nonHostPlayers.length}</span>
            </Panel>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingBottom: 4, flexShrink: 0 }}>
              <Ring value={phaseSecondsLeft} max={REVEALED_MAX} size={80} fontSize={30} />
              <Btn onClick={() => void handleAdvance("skip")} variant="ghost" size="sm">SKIP</Btn>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderWorthyPlaying = () => (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#000", zIndex: 2 }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "stretch" }}>
        <TimedYouTubePlayer
          key={preparedClip.autoPlayRequestKey ?? "worthy"}
          ref={clipPlayerRef}
          videoId={preparedClip.videoId}
          startSeconds={preparedClip.startSeconds}
          endSeconds={preparedClip.endSeconds}
          playbackMode={preparedClip.playbackMode}
          autoPlayRequestKey={preparedClip.autoPlayRequestKey}
          onVideoEnded={() => void handleAdvance("video-ended")}
          naked
        />
      </div>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, background: "linear-gradient(to bottom,rgba(7,5,26,.88) 0%,transparent 100%)", padding: "22px 40px 50px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bolt size={18} color="#C8A0FF" />
          <span style={{ fontFamily: "Cinzel,serif", color: "rgba(200,160,255,.7)", fontSize: 13, letterSpacing: ".22em" }}>WORTHY BONUS</span>
        </div>
        <h1 style={{ fontFamily: "Cinzel,serif", fontSize: 42, fontWeight: 900, color: "white", letterSpacing: ".06em", position: "absolute", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>THE GODS HAVE SPOKEN</h1>
        <span style={{ fontFamily: "Cinzel,serif", color: "rgba(200,160,255,.55)", fontSize: 14, letterSpacing: ".22em" }}>♪ NOW PLAYING</span>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10, background: "linear-gradient(to top,rgba(7,5,26,.75) 0%,transparent 100%)", padding: "40px 40px 20px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <p style={{ fontFamily: "Cinzel,serif", color: "rgba(200,160,255,.5)", fontSize: 18, letterSpacing: ".25em", fontStyle: "italic" }}>Enjoy the worthy bonus</p>
        <Btn onClick={handleAdvance} variant="ghost" size="sm">CONTINUE</Btn>
      </div>
    </div>
  );

  const renderLeaderboard = () => (
    <>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", position: "relative", zIndex: 2, padding: "24px 60px 20px" }}>
        <Laurel size={48}>
          <h1 style={{ fontFamily: "Cinzel,serif", fontSize: 52, fontWeight: 900, color: TX, letterSpacing: ".1em", margin: 0 }}>STANDINGS</h1>
        </Laurel>

        <div style={{ display: "flex", gap: 24, flex: 1, marginTop: 20 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
            {leaderboard.map((p, i) => (
              <Panel key={p.player_id} style={{ padding: "13px 22px", display: "flex", alignItems: "center", gap: 18, background: i === 0 ? "rgba(201,151,58,.1)" : "rgba(13,10,40,.8)" }}>
                <span style={{ fontSize: i < 3 ? 28 : 18, width: 50, textAlign: "center", lineHeight: 1 }}>{i + 1}</span>
                <Avatar name={p.nickname} size={i === 0 ? 48 : 36} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "Cinzel,serif", fontSize: i === 0 ? 26 : 20, fontWeight: 700, color: i === 0 ? G : TX }}>{p.nickname}</div>
                </div>
                {p.gain > 0 && <span style={{ color: "#4CC870", fontSize: 14, fontWeight: 600 }}>+{p.gain}</span>}
                <div style={{ fontFamily: "Cinzel,serif", fontSize: i === 0 ? 32 : 22, fontWeight: 900, color: i === 0 ? G : TX, minWidth: 110, textAlign: "right" }}>{p.score.toLocaleString()}</div>
              </Panel>
            ))}
          </div>

          <div style={{ width: 270, display: "flex", flexDirection: "column", gap: 12 }}>
            <Panel style={{ padding: "18px 20px", textAlign: "center" }}>
              <p style={{ color: `${TX}44`, fontSize: 11, letterSpacing: ".2em", marginBottom: 8 }}>NEXT ROUND IN</p>
              <Ring value={phaseSecondsLeft} max={8} size={100} fontSize={40} />
            </Panel>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 14, gap: 12 }}>
          <Btn onClick={handleAdvance} size="sm">NEXT PHASE</Btn>
        </div>
      </div>
    </>
  );

  const renderWinner = () => {
    const sorted = [...leaderboard].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    const nonHostPlayers = players.filter((p) => !p.is_host);
    const playAgainVotes = nonHostPlayers.filter((p) => p.is_ready).length;
    const allVoted = nonHostPlayers.length > 0 && playAgainVotes === nonHostPlayers.length;
    return (
      <>
        <style>{`
          @keyframes winner-glow-pulse {
            0%,100% { box-shadow: 0 0 0 2px #C9973A, 0 0 24px 6px #C9973Acc, 0 0 60px 14px #C9973A44; }
            50%     { box-shadow: 0 0 0 2px #E8C55A, 0 0 40px 10px #E8C55Aee, 0 0 90px 22px #E8C55A55; }
          }
          .winner-row-glow { animation: winner-glow-pulse 2s ease-in-out infinite; }
        `}</style>

        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", position: "relative", zIndex: 2, padding: "20px 60px 24px", gap: 12 }}>

          {/* Title */}
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <p style={{ color: `${TX}33`, letterSpacing: ".35em", fontSize: 11, marginBottom: 2 }}>CHAMPION OF OLYMPUS</p>
            <Laurel size={52}>
              <h1 className="gold-shimmer" style={{ fontFamily: "Cinzel,serif", fontSize: 80, fontWeight: 900, letterSpacing: ".1em", lineHeight: 1, margin: 0 }}>
                {winner?.nickname ?? "NO WINNER"}
              </h1>
            </Laurel>
          </div>

          {/* Full leaderboard */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, overflow: "visible", padding: "4px 10px", minHeight: 0 }}>
            {sorted.map((p, i) => (
              <div
                key={p.player_id}
                className={i === 0 ? "winner-row-glow" : ""}
                style={{
                  borderRadius: 16,
                  padding: i === 0 ? "18px 28px" : "13px 24px",
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  background: i === 0 ? "rgba(201,151,58,.15)" : "rgba(13,10,40,.8)",
                  border: i === 0 ? `2px solid ${G}88` : "1px solid rgba(255,255,255,.06)",
                  flex: i === 0 ? "0 0 auto" : 1,
                  minHeight: 0,
                  transition: "all .3s",
                }}
              >
                <span style={{ fontFamily: "Cinzel,serif", fontSize: i === 0 ? 36 : 20, fontWeight: 900, color: i === 0 ? G : `${TX}55`, width: 50, textAlign: "center", flexShrink: 0, lineHeight: 1 }}>
                  {i === 0 ? "👑" : i + 1}
                </span>
                <Avatar name={p.nickname} size={i === 0 ? 52 : 38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "Cinzel,serif", fontSize: i === 0 ? 30 : 18, fontWeight: 900, color: i === 0 ? G : TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nickname}</div>
                </div>
                <div style={{ fontFamily: "Cinzel,serif", fontSize: i === 0 ? 36 : 22, fontWeight: 900, color: i === 0 ? G : TX, textAlign: "right", flexShrink: 0 }}>{p.score.toLocaleString()}<span style={{ fontSize: i === 0 ? 14 : 11, color: `${TX}44`, marginLeft: 4 }}>pts</span></div>
              </div>
            ))}
          </div>

          {/* Footer: play again votes + buttons */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, paddingTop: 4 }}>
            {nonHostPlayers.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: `${TX}44`, fontSize: 11, letterSpacing: ".2em" }}>PLAY AGAIN</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {nonHostPlayers.map((p) => (
                    <div key={p.id} style={{ width: 10, height: 10, borderRadius: "50%", background: p.is_ready ? "#4CC870" : "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", transition: "background .4s" }} />
                  ))}
                </div>
                <span style={{ fontFamily: "Cinzel,serif", fontSize: 20, fontWeight: 900, color: allVoted ? "#4CC870" : G }}>{playAgainVotes}/{nonHostPlayers.length}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 14, marginLeft: "auto" }}>
              <Btn onClick={() => void handlePlayAgain()} size="lg">PLAY AGAIN</Btn>
              <Btn onClick={() => void handleReturnToMenu()} variant="ghost" size="lg">MAIN MENU</Btn>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderByStatus = () => {
    if (!room || room.status === "lobby") return renderLobby();
    if (room.status === "playing" || room.status === "clip_playing" || room.status === "answering") return renderClipPlaying();
    if (room.status === "revealed") return renderRevealed();
    if (room.status === "worthy_playing") return renderWorthyPlaying();
    if (room.status === "leaderboard") return renderLeaderboard();
    if (room.status === "finished") return renderWinner();
    return renderLobby();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100vh", position: "relative", overflow: "hidden" }}>
      <StarField />
      <Columns />

      {renderByStatus()}

      {statusMsg && (
        <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", zIndex: 100, borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(0,0,0,.45)", padding: "6px 10px", fontSize: 12, color: `${TX}cc` }}>
          {statusMsg}
        </div>
      )}
    </div>
  );
}
