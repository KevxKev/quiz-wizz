"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { OlympusBackground } from "@/components/ui";
import { buildLeaderboard, getCountdownSeconds, getPhaseProgressPercent } from "@/lib/room";
import {
  formatSupabaseErrorMessage,
  getSupabaseBrowserClient,
  getSupabaseSetupMessage,
  isSupabaseSchemaError,
} from "@/lib/supabase";
import type { LeaderboardEntry, PlayerSession, Room, RoomPlayer, Round, RoundAnswer } from "@/types/game";

const SESSION_STORAGE_KEY = "quiz-wizz-player-session";

function getPlayerPhaseDisplay(args: {
  status?: Room["status"] | null;
  roundNumber?: number | null;
  countdownSeconds?: number | null;
  lockedAnswer?: string | null;
  readyCount?: number;
  playerCount?: number;
  winnerName?: string | null;
}) {
  const {
    status,
    roundNumber,
    countdownSeconds,
    lockedAnswer,
    readyCount = 0,
    playerCount = 0,
    winnerName,
  } = args;

  switch (status) {
    case "lobby":
      return {
        badge: "Lobby",
        title: "Get Ready",
        subtitle: `${readyCount}/${playerCount} player(s) are ready. Tap when you're set.`,
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "playing":
      return {
        badge: roundNumber ? `Round ${roundNumber}` : "Get Ready",
        title: lockedAnswer ? "Answer Locked" : "Get Ready",
        subtitle: lockedAnswer ? `You locked in: ${lockedAnswer}` : "Round is live — you can answer immediately.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "clip_playing":
      return {
        badge: roundNumber ? `Round ${roundNumber}` : "Now playing",
        title: lockedAnswer ? "Answer Locked" : "Guess the Song",
        subtitle: lockedAnswer
          ? `You locked in: ${lockedAnswer}`
          : countdownSeconds !== null
            ? `${countdownSeconds}s left while the clip plays.`
            : "The clip is playing — answer now.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "answering":
      return {
        badge: roundNumber ? `Round ${roundNumber}` : "Last chance",
        title: lockedAnswer ? "Answer Locked" : "Guess the Song",
        subtitle: lockedAnswer
          ? `You locked in: ${lockedAnswer}`
          : countdownSeconds !== null
            ? `${countdownSeconds}s left for final answers.`
            : "Final answer window is open.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "revealed":
      return {
        badge: roundNumber ? `Round ${roundNumber}` : "Reveal",
        title: "Correct Answer",
        subtitle: "Vote on whether the full song should play!",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "worthy_playing":
      return {
        badge: "Worthy!",
        title: "✦ The gods have spoken",
        subtitle: "The full song is playing on the TV. Next round soon.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "leaderboard":
      return {
        badge: "Scores",
        title: "Leaderboard",
        subtitle: "Scores are updating for the next round.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    case "finished":
      return {
        badge: "Game over",
        title: winnerName ? `${winnerName} wins!` : "Final results",
        subtitle: "The game is finished. Check the final leaderboard below.",
        classes: "border-white/10 bg-black/40 text-slate-100",
      };
    default:
      return {
        badge: "Olympus Night",
        title: "Waiting for the game",
        subtitle: "Stay on this page while the host gets things ready.",
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

function AnswerPageContent() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const searchParams = useSearchParams();
  const requestedRoomCode = searchParams.get("room")?.toUpperCase() ?? "";

  const [session, setSession] = useState<PlayerSession | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [lockedAnswer, setLockedAnswer] = useState<string | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Waiting for the lobby to open.");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingReady, setIsUpdatingReady] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [, setDebugSteps] = useState<string[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [worthyVote, setWorthyVote] = useState<boolean | null>(null);
  const [isVoting, setIsVoting] = useState(false);

  // Track when the clip answering window opens so we can record answer speed
  const clipStartedAtMsRef = useRef<number | null>(null);
  const trackedClipRoundIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!round?.id) {
      clipStartedAtMsRef.current = null;
      trackedClipRoundIdRef.current = null;
      return;
    }
    // New round — reset timer
    if (round.id !== trackedClipRoundIdRef.current) {
      trackedClipRoundIdRef.current = round.id;
      clipStartedAtMsRef.current = null;
    }
    // Start timer when clip first becomes answerable
    if ((room?.status === "clip_playing" || room?.status === "playing") && clipStartedAtMsRef.current === null) {
      clipStartedAtMsRef.current = Date.now();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id, room?.status]);

  const logAnswerStep = useCallback((label: string, details?: unknown) => {
    const timestamp = new Date().toLocaleTimeString();
    const detailText = details === undefined ? "" : ` ${JSON.stringify(details)}`;
    const entry = `${timestamp} - ${label}${detailText}`;

    console.info(`[Quiz Wizz][Answer] ${label}`, details ?? "");
    setDebugSteps((current) => [...current.slice(-14), entry]);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 100);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!storedSession) {
      setStatusMessage(
        requestedRoomCode
          ? `Join room ${requestedRoomCode} first from the join page.`
          : "Join a room first from the join page.",
      );
      logAnswerStep("No saved player session found", { requestedRoomCode });
      return;
    }

    try {
      const parsedSession = JSON.parse(storedSession) as PlayerSession;
      setSession(parsedSession);
      logAnswerStep("Player session loaded", {
        nickname: parsedSession.nickname,
        roomCode: parsedSession.roomCode,
      });
    } catch {
      setStatusMessage("Could not read your saved player session. Rejoin from the join page.");
      logAnswerStep("Failed to parse saved session");
    }
  }, [logAnswerStep, requestedRoomCode]);

  const loadPlayerState = useCallback(async () => {
    if (!supabase || !session) {
      return;
    }

    logAnswerStep("Loading player state", {
      roomId: session.roomId,
      playerId: session.playerId,
    });

    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", session.roomId)
      .maybeSingle();

    if (roomError) {
      setStatusMessage(formatSupabaseErrorMessage(roomError, "Could not load the room."));
      return;
    }

    if (!roomData) {
      setStatusMessage("This room no longer exists.");
      return;
    }

    const normalizedRoom = roomData as Room;
    setRoom(normalizedRoom);

    const [roomPlayersResult, roundsResult, answersResult] = await Promise.all([
      supabase
        .from("room_players")
        .select("*")
        .eq("room_id", session.roomId)
        .eq("is_host", false)
        .order("joined_at", { ascending: true }),
      supabase
        .from("rounds")
        .select("*")
        .eq("room_id", session.roomId)
        .order("round_number", { ascending: true }),
      supabase.from("answers").select("*").eq("room_id", session.roomId),
    ]);

    if (roomPlayersResult.error) {
      setStatusMessage(formatSupabaseErrorMessage(roomPlayersResult.error, "Could not load the lobby players."));
      return;
    }

    const normalizedPlayers = (roomPlayersResult.data ?? []) as RoomPlayer[];
    setRoomPlayers(normalizedPlayers);

    const myRoomPlayer = normalizedPlayers.find(
      (player) => player.id === session.roomPlayerId || player.player_id === session.playerId,
    );
    setIsPlayerReady(Boolean(myRoomPlayer?.is_ready));
    setWorthyVote(myRoomPlayer?.worthy_vote ?? null);

    const normalizedRounds = ((roundsResult.data ?? []).map((roundRow) => ({
      ...(roundRow as Round),
      answer_options: Array.isArray(roundRow.answer_options) ? (roundRow.answer_options as string[]) : [],
    })) as Round[]);

    const allAnswers = (answersResult.data ?? []) as RoundAnswer[];
    const nextLeaderboard = buildLeaderboard(normalizedPlayers, normalizedRounds, allAnswers);
    setLeaderboard(nextLeaderboard);

    if (normalizedRoom.status === "lobby") {
      setRound(null);
      setLockedAnswer(null);
      setStatusMessage(
        myRoomPlayer?.is_ready
          ? "You are marked ready. Wait for the host to start the game."
          : "Lobby open. Tap the ready button when you are ready to play.",
      );
      logAnswerStep("Lobby state visible", {
        players: normalizedPlayers.length,
        readyPlayers: normalizedPlayers.filter((player) => Boolean(player.is_ready)).length,
      });
      return;
    }

    const activeRound = normalizedRoom.current_round_id
      ? normalizedRounds.find((roundItem) => roundItem.id === normalizedRoom.current_round_id) ?? null
      : null;

    if (!activeRound) {
      setRound(null);
      setLockedAnswer(null);
      setStatusMessage(
        normalizedRoom.status === "finished"
          ? `Game finished. Winner: ${normalizedRoom.winner_name ?? "to be decided"}.`
          : "Waiting for the next round to load.",
      );
      return;
    }

    setRound(activeRound);
    logAnswerStep("Round visible on player screen", {
      roundNumber: activeRound.round_number,
      roundState: activeRound.state,
      roomStatus: normalizedRoom.status,
      optionCount: activeRound.answer_options.length,
    });

    const selectedAnswer =
      allAnswers.find((answer) => answer.round_id === activeRound.id && answer.player_id === session.playerId)?.answer_text ?? null;
    setLockedAnswer(selectedAnswer);

    const isCorrect = Boolean(selectedAnswer && activeRound.correct_answer && selectedAnswer === activeRound.correct_answer);

    if (normalizedRoom.status === "playing") {
      setStatusMessage(selectedAnswer ? `Answer locked: ${selectedAnswer}` : "Round is live — you can already answer now.");
      return;
    }

    if (normalizedRoom.status === "clip_playing") {
      setStatusMessage(selectedAnswer ? `Answer locked: ${selectedAnswer}` : "Guess now while the clip is playing.");
      return;
    }

    if (normalizedRoom.status === "answering") {
      setStatusMessage(selectedAnswer ? `Answer locked: ${selectedAnswer}` : "Final chance — choose one answer before time runs out.");
      return;
    }

    if (normalizedRoom.status === "revealed") {
      setStatusMessage(
        selectedAnswer
          ? isCorrect
            ? `Correct! You picked ${selectedAnswer}.`
            : `Incorrect. You picked ${selectedAnswer}.`
          : `Time is up. Correct answer: ${activeRound.correct_answer ?? "not set"}.`,
      );
      return;
    }

    if (normalizedRoom.status === "worthy_playing") {
      setStatusMessage("The song is worthy! Enjoy the full video on the TV.");
      return;
    }

    if (normalizedRoom.status === "leaderboard") {
      setStatusMessage(
        selectedAnswer
          ? isCorrect
            ? `Correct! Leaderboard is updating now.`
            : `Leaderboard is updating. Correct answer: ${activeRound.correct_answer ?? "not set"}.`
          : `Leaderboard is updating. Correct answer: ${activeRound.correct_answer ?? "not set"}.`,
      );
      return;
    }

    if (normalizedRoom.status === "finished") {
      setStatusMessage(
        `Game over! Winner: ${normalizedRoom.winner_name ?? nextLeaderboard[0]?.nickname ?? "to be decided"}.`,
      );
    }
  }, [logAnswerStep, session, supabase]);

  useEffect(() => {
    if (!supabase || !session) {
      return;
    }

    void loadPlayerState();

    const channel = supabase
      .channel(`player-room-${session.roomId}-${session.playerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${session.roomId}` },
        () => {
          void loadPlayerState();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${session.roomId}` },
        () => {
          void loadPlayerState();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${session.roomId}` },
        () => {
          void loadPlayerState();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "answers", filter: `room_id=eq.${session.roomId}` },
        () => {
          void loadPlayerState();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadPlayerState, session, supabase]);

  const countdownSeconds = useMemo(
    () => getCountdownSeconds(room?.phase_ends_at ?? null, nowMs),
    [nowMs, room?.phase_ends_at],
  );
  const readyCount = roomPlayers.filter((player) => Boolean(player.is_ready)).length;
  const isLobby = room?.status === "lobby";
  const isAnswering = Boolean(room && round && (room.status === "playing" || room.status === "clip_playing" || room.status === "answering"));
  const isActivePlayPhase = Boolean(room && round && (room.status === "playing" || room.status === "clip_playing" || room.status === "answering"));
  const isRevealState = Boolean(
    round &&
      (room?.status === "revealed" ||
        room?.status === "leaderboard" ||
        room?.status === "worthy_playing" ||
        room?.status === "finished" ||
        round.state === "revealed" ||
        round.state === "leaderboard" ||
        round.state === "closed"),
  );
  const winnerName = room?.winner_name ?? leaderboard[0]?.nickname ?? null;
  const phaseDisplay = useMemo(
    () =>
      getPlayerPhaseDisplay({
        status: room?.status,
        roundNumber: round?.round_number ?? null,
        countdownSeconds,
        lockedAnswer,
        readyCount,
        playerCount: roomPlayers.length,
        winnerName,
      }),
    [countdownSeconds, lockedAnswer, readyCount, room?.status, roomPlayers.length, round?.round_number, winnerName],
  );
  const phaseProgressPercent = useMemo(
    () => getPhaseProgressPercent(room?.phase_started_at ?? null, room?.phase_ends_at ?? null, nowMs),
    [nowMs, room?.phase_ends_at, room?.phase_started_at],
  );

  const handleReadyToggle = async () => {
    if (!supabase) {
      setStatusMessage(getSupabaseSetupMessage());
      return;
    }

    if (!session || !room) {
      setStatusMessage("Join a room first.");
      return;
    }

    setIsUpdatingReady(true);

    try {
      const nextReadyState = !isPlayerReady;
      const { error } = await supabase
        .from("room_players")
        .update({ is_ready: nextReadyState })
        .eq("id", session.roomPlayerId);

      if (error) {
        throw error;
      }

      setIsPlayerReady(nextReadyState);
      setStatusMessage(nextReadyState ? "You are marked ready. Waiting for the host to start." : "You are marked not ready.");
      logAnswerStep("Ready state changed", { isReady: nextReadyState });
      await loadPlayerState();
    } catch (error) {
      const message = isSupabaseSchemaError(error)
        ? `${formatSupabaseErrorMessage(error, "Could not update your ready status.")} Run the updated \`supabase/schema.sql\` once to enable lobby ready tracking.`
        : formatSupabaseErrorMessage(error, "Could not update your ready status.");
      setStatusMessage(message);
      logAnswerStep("Ready update failed", { message });
    } finally {
      setIsUpdatingReady(false);
    }
  };

  const handleWorthyVote = async (vote: boolean) => {
    if (!supabase || !session || !room || room.status !== "revealed") return;
    if (worthyVote !== null) return; // already voted

    setIsVoting(true);
    try {
      const { error } = await supabase
        .from("room_players")
        .update({ worthy_vote: vote })
        .eq("id", session.roomPlayerId);

      if (error) throw error;
      setWorthyVote(vote);
      logAnswerStep("Worthy vote submitted", { vote });
    } catch (error) {
      logAnswerStep("Worthy vote failed", { message: String(error) });
    } finally {
      setIsVoting(false);
    }
  };

  const handleAnswerSelect = async (answerText: string) => {
    if (!supabase) {
      setStatusMessage(getSupabaseSetupMessage());
      return;
    }

    if (!session || !room || !round) {
      setStatusMessage("Join a room and wait for the host to start a round.");
      return;
    }

    if (!isAnswering) {
      setStatusMessage("Answering is not open right now.");
      return;
    }

    if (lockedAnswer) {
      setStatusMessage(`Answer already locked: ${lockedAnswer}`);
      return;
    }

    setIsSubmitting(true);
    setLockedAnswer(answerText);
    setStatusMessage(`Answer locked: ${answerText}`);
    logAnswerStep("Submitting answer", {
      answer: answerText,
      roundId: round.id,
    });

    try {
      const answeredAfterMs = clipStartedAtMsRef.current !== null ? Date.now() - clipStartedAtMsRef.current : null;
      const { error } = await supabase.from("answers").insert({
        room_id: room.id,
        round_id: round.id,
        player_id: session.playerId,
        answer_text: answerText,
        answered_after_ms: answeredAfterMs,
      });

      if (error) {
        if (error.code === "23505") {
          setStatusMessage("You already submitted an answer for this round.");
          await loadPlayerState();
          return;
        }

        throw error;
      }

      setStatusMessage(`Answer locked: ${answerText}`);
      logAnswerStep("Answer locked", { answer: answerText });
    } catch (error) {
      setLockedAnswer(null);
      const message = formatSupabaseErrorMessage(error, "Could not submit your answer.");
      setStatusMessage(message);
      logAnswerStep("Answer submit failed", { message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={`relative overflow-hidden bg-[var(--oly-night-base)] text-slate-50 ${isActivePlayPhase ? "h-screen px-3 py-3 sm:px-4" : "min-h-screen px-4 py-8 sm:px-6"}`}>
      <OlympusBackground showParticles />
      <div className={`relative z-10 mx-auto ${isActivePlayPhase ? "flex h-full w-full max-w-xl flex-col gap-3" : "flex w-full max-w-2xl flex-col gap-6"}`}>
        {isLobby ? (
          <section
            className="rounded-3xl p-6"
            style={{ background: "rgba(5,3,18,0.65)", border: "1px solid rgba(201,162,39,0.15)", backdropFilter: "blur(8px)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.5em]" style={{ color: "var(--oly-gold-dim)" }}>✦ Olympus Night ✦</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Get Ready</h1>
            <p className="mt-2 text-sm text-slate-300">{session ? `${session.nickname} in room ${session.roomCode}` : "Join a room first to play."}</p>
            {!supabase ? (
              <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
                {getSupabaseSetupMessage()}
              </div>
            ) : null}
            <div className="mt-5 rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(201,162,39,0.12)" }}>
              <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--oly-gold-dim)" }}>Players ready</p>
              <p className="mt-2 text-2xl font-bold text-white">{readyCount}/{roomPlayers.length}</p>
              <button
                type="button"
                onClick={handleReadyToggle}
                disabled={isUpdatingReady}
                className="mt-4 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed"
              style={
                isPlayerReady
                  ? { background: "rgba(201,162,39,0.12)", color: "var(--oly-gold-bright)", border: "1px solid rgba(201,162,39,0.30)" }
                  : { background: "linear-gradient(135deg, var(--oly-gold-dim) 0%, var(--oly-gold) 50%, var(--oly-gold-bright) 100%)", color: "#0a0800", boxShadow: "var(--oly-glow-gold)" }
              }
              >
                {isUpdatingReady ? "Updating..." : isPlayerReady ? "Mark not ready" : "I'm ready"}
              </button>
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {roomPlayers.length === 0 ? (
                <li className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">No players joined yet.</li>
              ) : (
                roomPlayers.map((player) => (
                  <li key={player.id} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100">
                    <span>{player.nickname}</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em]`}
                    style={player.is_ready
                      ? { background: "rgba(201,162,39,0.15)", color: "var(--oly-gold-bright)" }
                      : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)" }
                    }
                  >
                    {player.is_ready ? "Ready" : "Waiting"}
                  </span>
                  </li>
                ))
              )}
            </ul>
          </section>
        ) : null}

        {isActivePlayPhase && round ? (
          <section className="flex h-full flex-col rounded-3xl p-4" style={{ background: "rgba(5,3,18,0.70)", border: "1px solid rgba(201,162,39,0.15)", backdropFilter: "blur(8px)" }}>
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
              <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                <span>{lockedAnswer ? "Answer Locked" : "Guess the Song"}</span>
                <span className="text-white">{countdownSeconds !== null ? `${countdownSeconds}s` : "--"}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
                <div
                  className={`h-full rounded-full transition-[width] duration-100`}
                  style={{ width: `${phaseProgressPercent}%`, background: lockedAnswer ? "var(--oly-gold)" : room?.status === "answering" ? "#f59e0b" : "#a78bfa" }}
                />
              </div>
            </div>

            <div className="mt-3 rounded-2xl px-4 py-3 text-center" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(201,162,39,0.12)" }}>
              <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--oly-gold-dim)" }}>Question</p>
              <h2 className="mt-2 text-lg font-semibold text-white">{round.prompt_text}</h2>
            </div>

            <div className="mt-3 flex-1">
              <div className="grid h-full gap-3 sm:grid-cols-2">
                {round.answer_options.map((option, index) => {
                  const isLockedChoice = lockedAnswer === option;
                  const isCorrectChoice = isRevealState && round.correct_answer === option;
                  const isWrongChoice = isRevealState && round.correct_answer !== option;

                  return (
                    <button
                      key={`${round.id}-${index}-${option}`}
                      type="button"
                      onClick={() => handleAnswerSelect(option)}
                      disabled={Boolean(lockedAnswer) || isSubmitting || !isAnswering}
                      className="touch-manipulation rounded-2xl px-4 py-4 text-left text-base font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-90"
                      style={
                        isCorrectChoice
                          ? { border: "1px solid rgba(201,162,39,0.7)", background: "rgba(201,162,39,0.18)", color: "var(--oly-gold-bright)" }
                          : isWrongChoice
                            ? { border: "1px solid rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.10)", color: "#fca5a5" }
                            : isLockedChoice
                              ? { border: "1px solid rgba(201,162,39,0.45)", background: "rgba(201,162,39,0.10)", color: "var(--oly-gold-bright)" }
                              : { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.35)", color: "white" }
                      }
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {!isLobby && !isActivePlayPhase && round ? (
          <section
            className="rounded-3xl p-6"
            style={{ background: "rgba(5,3,18,0.65)", border: "1px solid rgba(201,162,39,0.15)", backdropFilter: "blur(8px)" }}
          >
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(201,162,39,0.20)" }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.4em]" style={{ color: "var(--oly-gold-dim)" }}>{phaseDisplay.badge}</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{phaseDisplay.title}</h2>
              <p className="mt-2 text-sm text-slate-400">{phaseDisplay.subtitle}</p>
            </div>

            <div className="mt-4 rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(201,162,39,0.12)" }}>
              <h3 className="text-lg font-semibold text-white">{round.prompt_text}</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {round.answer_options.map((option, index) => {
                  const isCorrectChoice = round.correct_answer === option;

                  return (
                    <div
                      key={`${round.id}-${index}-${option}`}
                      className="rounded-2xl px-4 py-3 text-sm font-semibold"
                      style={
                        isCorrectChoice
                          ? { border: "1px solid rgba(201,162,39,0.7)", background: "rgba(201,162,39,0.15)", color: "var(--oly-gold-bright)" }
                          : { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.45)" }
                      }
                    >
                      {option}
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="mt-4 text-sm text-slate-300">{statusMessage}</p>

            {/* ── Worthy vote (only during revealed phase) ──────────────── */}
            {room?.status === "revealed" ? (
              <div className="mt-4 rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.40)", border: "1px solid rgba(201,162,39,0.25)" }}>
                <p className="text-center text-[10px] font-semibold uppercase tracking-[0.4em]" style={{ color: "var(--oly-gold-dim)" }}>Vote</p>
                <h3 className="mt-1 text-center text-base font-bold text-white">Is this song worthy of the gods?</h3>
                {worthyVote !== null ? (
                  <p className="mt-3 text-center text-sm" style={{ color: "var(--oly-gold-bright)" }}>
                    {worthyVote ? "✦ You voted: Worthy!" : "You voted: Not worthy"}
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => void handleWorthyVote(true)}
                      disabled={isVoting}
                      className="rounded-2xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed"
                      style={{ background: "linear-gradient(135deg, var(--oly-gold-dim) 0%, var(--oly-gold-bright) 100%)", color: "#0a0800" }}
                    >
                      ✦ Worthy!
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleWorthyVote(false)}
                      disabled={isVoting}
                      className="rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed"
                      style={{ background: "rgba(0,0,0,0.30)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)" }}
                    >
                      Not worthy
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {/* ── Worthy playing: overlay message ─────────────────────── */}
            {room?.status === "worthy_playing" ? (
              <div className="mt-4 rounded-2xl py-5 text-center" style={{ background: "linear-gradient(135deg, rgba(10,6,30,0.95), rgba(30,20,60,0.95))", border: "2px solid rgba(201,162,39,0.40)", boxShadow: "0 0 30px rgba(201,162,39,0.15)" }}>
                <p className="text-2xl">🎵</p>
                <p className="mt-2 text-sm font-bold" style={{ color: "var(--oly-gold-bright)" }}>✦ The gods have spoken!</p>
                <p className="mt-1 text-xs text-slate-400">The full song is playing on the TV now.</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {!isActivePlayPhase && (room?.status === "revealed" || room?.status === "leaderboard" || room?.status === "worthy_playing" || room?.status === "finished") && leaderboard.length > 0 ? (
          <section
            className="rounded-3xl p-5 text-sm text-slate-100"
            style={{ background: "linear-gradient(135deg, rgba(10,6,30,0.97) 0%, rgba(20,14,50,0.97) 100%)", border: "2px solid rgba(201,162,39,0.45)", backdropFilter: "blur(12px)", boxShadow: "0 0 40px rgba(201,162,39,0.18), 0 0 80px rgba(201,162,39,0.08)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.4em]" style={{ color: "var(--oly-gold-dim)" }}>
                  {room?.status === "finished" ? "Final Result" : "Scores"}
                </p>
                <h2 className="mt-1 text-xl font-bold text-white">
                  {room?.status === "finished" ? "Final Leaderboard" : "Leaderboard"}
                </h2>
              </div>
              {winnerName ? (
                <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgba(201,162,39,0.18)", color: "var(--oly-gold-bright)", border: "1px solid rgba(201,162,39,0.35)" }}>
                  🏆 {winnerName}
                </span>
              ) : null}
            </div>
            <ul className="mt-4 space-y-2">
              {leaderboard.map((entry, index) => {
                const isFinished = room?.status === "finished";
                const speedVal = isFinished ? entry.avgAnswerMs : entry.lastRoundAnswerMs;
                return (
                  <li
                    key={entry.roomPlayerId}
                    className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold"
                    style={
                      index === 0
                        ? { background: "rgba(201,162,39,0.15)", border: "1px solid rgba(201,162,39,0.40)", color: "var(--oly-gold-bright)" }
                        : { background: "rgba(0,0,0,0.30)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.75)" }
                    }
                  >
                    <span>#{index + 1} {entry.nickname}</span>
                    <span className="flex items-center gap-2">
                      {speedVal != null ? (
                        <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>{isFinished ? "avg " : ""}{fmtSpeed(speedVal)}</span>
                      ) : null}
                      <span style={{ color: index === 0 ? "var(--oly-gold-bright)" : "rgba(255,255,255,0.55)" }}>{fmtScore(entry.score)} pt</span>
                    </span>
                  </li>
                );
              })}

            </ul>
            {room?.status === "finished" ? (
              <Link
                href="/join"
                className="mt-5 inline-flex rounded-2xl px-4 py-2.5 text-sm font-semibold transition"
                style={{ border: "1px solid rgba(201,162,39,0.30)", color: "var(--oly-gold-dim)" }}
              >
                Back to join screen
              </Link>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

export default function AnswerPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">Loading player screen...</main>}>
      <AnswerPageContent />
    </Suspense>
  );
}

