"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar, Btn, G, OPTION_COLORS, Panel, Ring, TX } from "@/components/olympus";
import { buildLeaderboard, buildRoundPayloadFromQuizEntry, computeAnswerScore, createPhaseDeadline, DEFAULT_ANSWERING_DURATION_SECONDS, getClipPlayDurationSeconds, getCountdownSeconds, getPhaseDurationSeconds, mergeQuizEntries, readStoredQuizEntries, selectQuizEntryForRound } from "@/lib/room";
import { formatSupabaseErrorMessage, getSupabaseBrowserClient, getSupabaseSetupMessage } from "@/lib/supabase";
import type { LeaderboardEntry, PlayerSession, Room, RoomPlayer, Round, RoundAnswer } from "@/types/game";

const SESSION_STORAGE_KEY = "quiz-wizz-player-session";

type RoundRow = {
  id: string;
  room_id: string;
  round_number: number;
  prompt_text: string;
  answer_options: string[];
  correct_answer: string | null;
  playback_mode: "audio-only" | "video-only" | "audio-video";
  entry_title: string | null;
  entry_artist: string | null;
  clip_start_seconds?: number | null;
  clip_end_seconds?: number | null;
};

function computeGain(isCorrect: boolean, answeredAfterMs: number | null, round: { clip_start_seconds?: number | null; clip_end_seconds?: number | null } | null) {
  if (!isCorrect) return 0;
  const clipDurationMs = getClipPlayDurationSeconds(round ?? {}) * 1000;
  const totalWindowMs = clipDurationMs + DEFAULT_ANSWERING_DURATION_SECONDS * 1000;
  return computeAnswerScore(answeredAfterMs, totalWindowMs);
}

export default function AnswerPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [session, setSession] = useState<PlayerSession | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);
  const [allRounds, setAllRounds] = useState<Round[]>([]);
  const [round, setRound] = useState<RoundRow | null>(null);
  const [answers, setAnswers] = useState<RoundAnswer[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [timer, setTimer] = useState(20);
  const clockOffsetMsRef = useRef(0); // server clock - local clock
  const [status, setStatus] = useState("Loading current phase...");

  useEffect(() => {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      setStatus("No phone session found. Join a room first.");
      return;
    }
    try {
      setSession(JSON.parse(raw) as PlayerSession);
    } catch {
      setStatus("Session invalid. Re-join the room.");
    }
  }, []);

  const loadBundle = useMemo(
    () => async (activeSession: PlayerSession) => {
      if (!supabase) return;

      try {
        const { data: roomData, error: roomError } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", activeSession.roomId)
          .maybeSingle();
        if (roomError) throw roomError;
        if (!roomData) {
          setStatus("Room not found.");
          return;
        }
        const currentRoom = roomData as Room;
        setRoom(currentRoom);

        const { data: players, error: playersError } = await supabase
          .from("room_players")
          .select("*")
          .eq("room_id", activeSession.roomId)
          .eq("is_host", false)
          .order("joined_at", { ascending: true });
        if (playersError) throw playersError;
        setRoomPlayers((players ?? []) as RoomPlayer[]);

        const { data: roundsData, error: roundsError } = await supabase
          .from("rounds")
          .select("*")
          .eq("room_id", activeSession.roomId)
          .order("round_number", { ascending: true });
        if (roundsError) throw roundsError;

        const normalizedRounds = ((roundsData ?? []).map((roundRow) => ({
          ...(roundRow as Round),
          answer_options: Array.isArray(roundRow.answer_options) ? (roundRow.answer_options as string[]) : [],
        })) as Round[]);
        setAllRounds(normalizedRounds);

        // Always reset selection eagerly — prevents stale lock-in from a previous round
        setSelected(null);

        let roundData: RoundRow | null = null;
        if (currentRoom.current_round_id) {
          roundData = (normalizedRounds.find((roundItem) => roundItem.id === currentRoom.current_round_id) as RoundRow | undefined) ?? null;

          // Race-condition guard: current_round_id is set but the round row hasn't
          // appeared in the DB yet. Retry in 400 ms rather than falling back to the
          // stale previous round.
          if (!roundData) {
            window.setTimeout(() => void loadBundle(activeSession), 400);
            return;
          }
        } else if (normalizedRounds.length > 0) {
          // No current_round_id yet — use the latest round (lobby / pre-game)
          roundData = (normalizedRounds[normalizedRounds.length - 1] as RoundRow | undefined) ?? null;
        }

        if (roundData) {
          roundData.answer_options = Array.isArray(roundData.answer_options) ? roundData.answer_options : [];
          setRound(roundData);

          const { data: allAnswers, error: answersError } = await supabase
            .from("answers")
            .select("*")
            .eq("room_id", activeSession.roomId);
          if (answersError) throw answersError;
          const normalized = (allAnswers ?? []) as RoundAnswer[];
          setAnswers(normalized);

          // Restore selection only for the CURRENT round
          const mine = normalized.find((a) => a.player_id === activeSession.playerId && a.round_id === roundData!.id);
          setSelected(mine?.answer_text ?? null);
        } else {
          setRound(null);
          setAnswers([]);
          setSelected(null);
        }

        setStatus("Ready.");
      } catch (error) {
        setStatus(formatSupabaseErrorMessage(error, "Could not load game state."));
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (!session || !supabase) return;
    void loadBundle(session);
    // Catch the case where the host advanced to clip_playing while this page was
    // mounting and the subscription hadn't been acknowledged yet (1-sec race window).
    const catchup = window.setTimeout(() => void loadBundle(session), 1500);
    return () => window.clearTimeout(catchup);
  }, [loadBundle, session, supabase]);

  useEffect(() => {
    if (!supabase || !session) return;

    const channel = supabase
      .channel(`player-room-${session.roomId}-${session.playerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${session.roomId}` }, () => {
        void loadBundle(session);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${session.roomId}` }, () => {
        void loadBundle(session);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "answers", filter: `room_id=eq.${session.roomId}` }, () => {
        void loadBundle(session);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${session.roomId}` }, () => {
        void loadBundle(session);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadBundle, session, supabase]);

  // Polling heartbeat — ensures phone stays in sync even if a subscription event is missed.
  // Also covers lobby/playing so the phone catches the game-start transition even if
  // the Supabase realtime handshake races against the 1-second 'playing' intro phase.
  useEffect(() => {
    if (!session || !supabase) return;
    const isActive = ["lobby", "playing", "clip_playing", "answering", "revealed", "worthy_playing", "finished"].includes(room?.status ?? "");
    if (!isActive) return;

    const intervalMs = (room?.status === "lobby" || room?.status === "playing") ? 2000 : 3000;
    const id = window.setInterval(() => {
      void loadBundle(session);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [loadBundle, room?.status, session, supabase]);

  useEffect(() => {
    if (!room?.phase_ends_at) return;
    // Calibrate server clock offset: phase_started_at is written by the server,
    // so comparing it to Date.now() reveals how far the local clock is off.
    if (room.phase_started_at) {
      clockOffsetMsRef.current = new Date(room.phase_started_at).getTime() - Date.now();
    }
    const serverNow = () => Date.now() + clockOffsetMsRef.current;
    // Set immediately so the display is correct from the first render
    setTimer(getCountdownSeconds(room.phase_ends_at, serverNow()) ?? 0);
    const id = window.setInterval(() => {
      const sec = getCountdownSeconds(room.phase_ends_at, serverNow()) ?? 0;
      setTimer(sec);
    }, 1000);
    return () => window.clearInterval(id);
  }, [room?.phase_ends_at]);

  const submitAnswer = async (letter: string) => {
    if (!supabase || !session || !round || selected) return;

    setSelected(letter);
    setStatus("Answer locked in.");

    const startedAt = room?.phase_started_at ? new Date(room.phase_started_at).getTime() : Date.now();
    const answeredAfterMs = Math.max(0, Date.now() - startedAt);

    try {
      const { error } = await supabase.from("answers").upsert(
        {
          room_id: session.roomId,
          round_id: round.id,
          player_id: session.playerId,
          answer_text: letter,
          answered_after_ms: answeredAfterMs,
        },
        { onConflict: "round_id,player_id" },
      );
      if (error) throw error;
    } catch (error) {
      setStatus(formatSupabaseErrorMessage(error, "Could not submit answer."));
      setSelected(null);
    }
  };

  const voteWorthy = async (worthy: boolean) => {
    if (!supabase || !session) return;

    try {
      const { error } = await supabase
        .from("room_players")
        .update({ worthy_vote: worthy })
        .eq("id", session.roomPlayerId);
      if (error) throw error;
      setStatus(worthy ? "Vote recorded: worthy." : "Vote recorded: not worthy.");
    } catch (error) {
      setStatus(formatSupabaseErrorMessage(error, "Could not submit worthy vote."));
    }
  };

  const handleReady = async () => {
    if (!supabase || !session) return;
    try {
      const { error } = await supabase
        .from("room_players")
        .update({ is_ready: true })
        .eq("id", session.roomPlayerId);
      if (error) throw error;
    } catch (error) {
      setStatus(formatSupabaseErrorMessage(error, "Could not set ready."));
    }
  };

  const handleStartGame = async () => {
    if (!supabase || !session || !room) return;
    try {
      // Load entries
      const localEntries = readStoredQuizEntries().filter((e) => e.is_active !== false);
      const { data: usedRoundsData } = await supabase.from("rounds").select("quiz_entry_id").eq("room_id", room.id);
      const usedEntryIds = new Set(((usedRoundsData ?? []) as { quiz_entry_id: string | null }[]).map((r) => r.quiz_entry_id).filter(Boolean) as string[]);
      const { data: remoteData } = await supabase.from("quiz_entries").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(50);
      const remoteEntries = ((remoteData ?? []) as Parameters<typeof mergeQuizEntries>[0]).map((e) => ({ ...e, answer_options: Array.isArray(e.answer_options) ? e.answer_options : [] }));
      const allEntries = mergeQuizEntries(remoteEntries, localEntries).filter((e) => e.is_active !== false);
      if (allEntries.length === 0) { setStatus("No quiz entries found."); return; }
      const fresh = allEntries.filter((e) => !usedEntryIds.has(e.id));
      const pick = selectQuizEntryForRound(fresh.length > 0 ? fresh : allEntries, 1);
      if (!pick) { setStatus("Could not select an entry."); return; }
      const payload = buildRoundPayloadFromQuizEntry(1, pick, "clip_playing");
      const { data: newRound, error: roundError } = await supabase.from("rounds").insert({ room_id: room.id, ...payload }).select("*").single();
      if (roundError) throw roundError;
      await supabase.from("room_players").update({ worthy_vote: null }).eq("room_id", room.id).eq("is_host", false);
      const { error: roomError } = await supabase.from("rooms").update({
        current_round_id: newRound.id,
        current_round_number: 1,
        total_rounds: room.total_rounds ?? 5,
        status: "playing",
        phase_started_at: new Date().toISOString(),
        phase_ends_at: createPhaseDeadline(getPhaseDurationSeconds("playing")),
      }).eq("id", room.id);
      if (roomError) throw roomError;
    } catch (error) {
      setStatus(formatSupabaseErrorMessage(error, "Could not start game."));
    }
  };

  const myRoomPlayer = roomPlayers.find((p) => p.player_id === session?.playerId);
  const isReady = myRoomPlayer?.is_ready === true;

  const myAnswer = answers.find((a) => a.player_id === session?.playerId && a.round_id === round?.id) ?? null;
  const isCorrect = !!myAnswer && !!round?.correct_answer && myAnswer.answer_text === round.correct_answer;
  const myGain = myAnswer ? computeGain(isCorrect, myAnswer.answered_after_ms ?? null, round) : 0;

  const leaderboard = useMemo<LeaderboardEntry[]>(() => buildLeaderboard(roomPlayers, allRounds, answers), [allRounds, answers, roomPlayers]);

  const currentRoundGainByPlayer = useMemo(() => {
    const gainMap = new Map<string, number>();
    for (const answer of answers) {
      if (!round?.id || answer.round_id !== round.id) continue;
          const correct = !!round.correct_answer && answer.answer_text === round.correct_answer;
          gainMap.set(answer.player_id, computeGain(correct, answer.answered_after_ms ?? null, round));
    }
    return gainMap;
  }, [answers, round?.correct_answer, round?.id]);

  const waitingDots = (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: G, animation: `flicker 1.6s ${i * 0.45}s ease-in-out infinite` }} />
      ))}
    </div>
  );

  const shell = (content: React.ReactNode) => (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#07051a", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse at 50% 0%,rgba(80,30,160,.25),transparent 65%)" }} />
      <div style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1, maxWidth: 460, margin: "0 auto", width: "100%" }}>{content}</div>
    </main>
  );

  const renderWaitingLobby = () =>
    shell(
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", padding: "28px 20px", gap: 22 }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: "Cinzel,serif", fontSize: 28, color: G, marginTop: 10 }}>You are in</h2>
          <p style={{ color: `${TX}66`, fontSize: 15, marginTop: 6 }}>Playing as <strong style={{ color: TX }}>{session?.nickname ?? "Player"}</strong></p>
        </div>

        <Panel style={{ textAlign: "center", padding: "20px 24px", width: "100%", position: "relative" }}>
          <MeanderLine />
          <p style={{ color: `${TX}44`, letterSpacing: ".18em", fontSize: 11, marginTop: 4 }}>ROOM</p>
          <p style={{ fontFamily: "Cinzel,serif", fontSize: 52, color: G, fontWeight: 900, letterSpacing: ".2em", lineHeight: 1 }}>{session?.roomCode ?? "----"}</p>
        </Panel>

        {isReady ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: "100%" }}>
            <div style={{ padding: "14px 36px", borderRadius: 14, background: "rgba(78,200,120,.12)", border: "2px solid #4CC87088" }}>
              <p style={{ fontFamily: "Cinzel,serif", fontSize: 22, fontWeight: 900, color: "#4CC870", letterSpacing: ".1em", margin: 0 }}>READY ✓</p>
            </div>
            <button
              type="button"
              onClick={() => void handleStartGame()}
              style={{
                padding: "16px 0",
                borderRadius: 14,
                background: `linear-gradient(135deg,#7B5000,${G},#E8C55A)`,
                border: "none",
                cursor: "pointer",
                width: "100%",
              }}
            >
              <p style={{ fontFamily: "Cinzel,serif", fontSize: 24, fontWeight: 900, color: "#07051a", letterSpacing: ".12em", margin: 0 }}>START GAME</p>
            </button>
            <p style={{ color: `${TX}33`, fontSize: 12 }}>Waiting for host to start...</p>
            {waitingDots}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleReady()}
            style={{
              padding: "18px 52px",
              borderRadius: 14,
              background: `${G}18`,
              border: `2px solid ${G}`,
              cursor: "pointer",
              width: "100%",
            }}
          >
            <p style={{ fontFamily: "Cinzel,serif", fontSize: 26, fontWeight: 900, color: G, letterSpacing: ".12em", margin: 0 }}>I'M READY</p>
          </button>
        )}
      </div>,
    );

  const renderGetReady = () =>
    shell(
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", padding: "28px 20px", gap: 18 }}>
        <p style={{ color: `${TX}44`, letterSpacing: ".3em", fontSize: 12 }}>ROUND {round?.round_number ?? ""}</p>
        <h1 style={{ fontFamily: "Cinzel,serif", fontSize: 56, fontWeight: 900, color: G, letterSpacing: ".08em", lineHeight: 1, margin: 0 }}>GET READY</h1>
        {waitingDots}
      </div>,
    );

  const renderAnswering = () => {
    const options = (round?.answer_options ?? ["Option A", "Option B", "Option C", "Option D"]).slice(0, 4);
    return shell(
      <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "14px 13px 18px", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Panel style={{ padding: "7px 14px" }}>
            <span style={{ color: `${TX}44`, fontSize: 10, letterSpacing: ".15em" }}>ROUND </span>
            <span style={{ fontFamily: "Cinzel,serif", fontSize: 16, color: G, fontWeight: 700 }}>{round?.round_number ?? "-"}</span>
          </Panel>
          <Ring value={timer} max={20} size={58} fontSize={21} />
        </div>

        <Panel style={{ padding: "11px 14px" }}>
          <p style={{ color: `${TX}44`, fontSize: 10, letterSpacing: ".2em", marginBottom: 4 }}>
            ROUND {round?.round_number ?? "-"} - NAME THE SONG
          </p>
          <p style={{ fontSize: 14, color: TX, fontWeight: 700, lineHeight: 1.3 }}>{round?.prompt_text ?? "Which song is currently playing?"}</p>
        </Panel>

        <p style={{ textAlign: "center", fontSize: 12, letterSpacing: ".12em", fontWeight: 600, color: selected ? "#4CC870" : `${TX}55` }}>
          {selected ? "LOCKED IN" : "TAP YOUR ANSWER"}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, flex: 1 }}>
          {options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            const c = OPTION_COLORS[i];
            const active = selected === opt;
            return (
              <button
                key={letter}
                type="button"
                onClick={() => void submitAnswer(opt)}
                disabled={!!selected}
                style={{
                  background: active ? `${c}30` : `${c}12`,
                  border: `2px solid ${active ? c : `${c}55`}`,
                  borderRadius: 14,
                  padding: "10px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  cursor: selected ? "default" : "pointer",
                  transform: active ? "scale(.96)" : "scale(1)",
                  boxShadow: active ? `0 0 24px ${c}44` : undefined,
                  minHeight: 130,
                }}
              >
                <span style={{ fontFamily: "Cinzel,serif", fontSize: 34, fontWeight: 900, color: active ? c : `${TX}77`, lineHeight: 1 }}>{letter}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: active ? TX : `${TX}88`, textAlign: "center", lineHeight: 1.35 }}>{opt}</span>
              </button>
            );
          })}
        </div>
      </div>,
    );
  };

  // Step 7: unified revealed screen — result on top, worthy vote on bottom
  const renderRevealed = () => {
    const myRoomPlayer = roomPlayers.find((p) => p.player_id === session?.playerId);
    const hasVoted = myRoomPlayer?.worthy_vote !== null && myRoomPlayer?.worthy_vote !== undefined;
    const votedWorthy = myRoomPlayer?.worthy_vote === true;

    return shell(
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", padding: "20px 16px 24px" }}>

        {/* Top half — result */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          {!myAnswer ? (
            // Player didn't answer in time
            <>
              <h1 style={{ fontFamily: "Cinzel,serif", fontSize: 40, fontWeight: 900, color: `${TX}55`, textAlign: "center" }}>TIME'S UP</h1>
              <Panel style={{ textAlign: "center", padding: "16px 22px", width: "100%", position: "relative" }}>
                <MeanderLine />
                <p style={{ color: `${TX}33`, fontSize: 11, letterSpacing: ".2em", marginTop: 4 }}>CORRECT ANSWER</p>
                <p style={{ fontFamily: "Cinzel,serif", fontSize: 22, color: G, fontWeight: 700, margin: "8px 0" }}>{round?.correct_answer ?? "-"}</p>
                <p style={{ color: `${TX}44`, fontSize: 12 }}>{round?.entry_title ?? ""}</p>
              </Panel>
            </>
          ) : isCorrect ? (
            <>
              <h1 style={{ fontFamily: "Cinzel,serif", fontSize: 52, fontWeight: 900, color: "#4CC870" }}>CORRECT</h1>
              <p style={{ color: `${TX}55`, fontSize: 13 }}>{round?.entry_title ?? ""}</p>
              <Panel style={{ textAlign: "center", padding: "16px 22px", width: "100%", position: "relative" }}>
                <MeanderLine />
                <p style={{ color: `${TX}33`, fontSize: 11, letterSpacing: ".2em", marginTop: 4 }}>POINTS EARNED</p>
                <p className="gold-shimmer" style={{ fontFamily: "Cinzel,serif", fontSize: 60, fontWeight: 900, margin: "4px 0", lineHeight: 1 }}>+{myGain}</p>
              </Panel>
            </>
          ) : (
            <>
              <h1 style={{ fontFamily: "Cinzel,serif", fontSize: 44, fontWeight: 900, color: "#C04040" }}>NOT QUITE</h1>
              <p style={{ color: `${TX}55`, fontSize: 13 }}>You answered <strong style={{ color: TX }}>{myAnswer.answer_text}</strong></p>
              <Panel style={{ textAlign: "center", padding: "16px 22px", width: "100%", position: "relative" }}>
                <MeanderLine />
                <p style={{ color: `${TX}33`, fontSize: 11, letterSpacing: ".2em", marginTop: 4 }}>CORRECT ANSWER</p>
                <p style={{ fontFamily: "Cinzel,serif", fontSize: 22, color: G, fontWeight: 700, margin: "8px 0" }}>{round?.correct_answer ?? "-"}</p>
                <p style={{ color: `${TX}44`, fontSize: 12 }}>{round?.entry_title ?? ""}</p>
              </Panel>
            </>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${G}33,transparent)`, margin: "16px 0" }} />

        {/* Bottom half — worthy vote */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontFamily: "Cinzel,serif", fontSize: 16, color: "#C8A0FF", letterSpacing: ".1em", textAlign: "center" }}>WORTHY OF OLYMPUS?</h2>
          <p style={{ color: `${TX}44`, fontSize: 12, marginTop: -6, textAlign: "center" }}>Was this song worthy of a full play?</p>

          {hasVoted ? (
            <div style={{ padding: "14px 24px", borderRadius: 12, background: votedWorthy ? "rgba(100,50,200,.2)" : "rgba(255,255,255,.05)", border: `1.5px solid ${votedWorthy ? "rgba(200,160,255,.5)" : "rgba(255,255,255,.12)"}`, textAlign: "center", width: "100%" }}>
              <p style={{ fontFamily: "Cinzel,serif", fontSize: 16, color: votedWorthy ? "#C8A0FF" : `${TX}55`, letterSpacing: ".08em" }}>
                {votedWorthy ? "WORTHY ✓" : "NOT WORTHY ✓"}
              </p>
              <p style={{ color: `${TX}33`, fontSize: 11, marginTop: 4 }}>Vote recorded</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9, width: "100%" }}>
              <button
                type="button"
                onClick={() => void voteWorthy(true)}
                style={{ padding: "18px", borderRadius: 12, background: "rgba(100,50,200,.15)", border: "2px solid rgba(130,80,220,.4)", cursor: "pointer", width: "100%" }}
              >
                <p style={{ fontFamily: "Cinzel,serif", fontSize: 18, fontWeight: 700, color: "#C8A0FF", letterSpacing: ".1em", margin: 0 }}>WORTHY</p>
              </button>
              <button
                type="button"
                onClick={() => void voteWorthy(false)}
                style={{ padding: "14px", borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1.5px solid rgba(255,255,255,.1)", cursor: "pointer", width: "100%" }}
              >
                <p style={{ fontSize: 13, color: `${TX}44`, fontWeight: 600, letterSpacing: ".06em", margin: 0 }}>NOT WORTHY</p>
              </button>
            </div>
          )}
        </div>
      </div>,
    );
  };

  // Step 8: worthy_playing is now a passive screen — voting already happened during revealed
  const renderWorthyPlaying = () =>
    shell(
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "28px 20px", gap: 20 }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "rgba(200,160,255,.5)", letterSpacing: ".3em", fontSize: 12, marginBottom: 8 }}>THE GODS HAVE SPOKEN</p>
          <h1 style={{ fontFamily: "Cinzel,serif", fontSize: 38, fontWeight: 900, color: "#C8A0FF", letterSpacing: ".08em", lineHeight: 1.1 }}>WORTHY!</h1>
          <p style={{ color: `${TX}44`, fontSize: 13, marginTop: 10 }}>The full song is playing on the big screen</p>
        </div>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "radial-gradient(circle at 40% 40%,rgba(140,60,220,.5),rgba(40,10,80,.9))", border: "2px solid rgba(200,160,255,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, animation: "pulse-glow 2s ease-in-out infinite" }}>
          ♪
        </div>
        <p style={{ color: `${TX}22`, fontSize: 12, letterSpacing: ".15em", textAlign: "center" }}>Next round starts automatically</p>
        {waitingDots}
      </div>,
    );

  const renderPlayAgainVote = () => {
    const winner = leaderboard[0] ?? null;
    const isWinner = winner?.playerId === session?.playerId;
    return shell(
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", padding: "28px 20px", gap: 20 }}>
        <p style={{ color: `${TX}44`, letterSpacing: ".3em", fontSize: 12 }}>GAME OVER</p>

        {winner && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: `${TX}55`, fontSize: 12, letterSpacing: ".18em", marginBottom: 6 }}>CHAMPION OF OLYMPUS</p>
            <h1 style={{ fontFamily: "Cinzel,serif", fontSize: 42, fontWeight: 900, color: G, letterSpacing: ".08em", lineHeight: 1, margin: 0 }}>{winner.nickname}</h1>
            <p style={{ fontFamily: "Cinzel,serif", fontSize: 22, color: isWinner ? "#4CC870" : TX, marginTop: 6 }}>{winner.score.toLocaleString()} pts</p>
            {isWinner && <p style={{ color: "#4CC870", fontSize: 13, letterSpacing: ".1em", marginTop: 2 }}>THAT&#39;S YOU! 🏆</p>}
          </div>
        )}

        <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${G}33,transparent)`, width: "100%" }} />

        <h2 style={{ fontFamily: "Cinzel,serif", fontSize: 28, fontWeight: 900, color: TX, letterSpacing: ".12em", margin: 0 }}>PLAY AGAIN?</h2>

        {isReady ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ padding: "14px 36px", borderRadius: 14, background: "rgba(78,200,120,.12)", border: "2px solid #4CC87088" }}>
              <p style={{ fontFamily: "Cinzel,serif", fontSize: 20, fontWeight: 900, color: "#4CC870", letterSpacing: ".1em", margin: 0 }}>VOTED YES ✓</p>
            </div>
            <p style={{ color: `${TX}33`, fontSize: 13 }}>Waiting for others...</p>
            {waitingDots}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleReady()}
            style={{
              padding: "18px 52px",
              borderRadius: 14,
              background: `${G}18`,
              border: `2px solid ${G}`,
              cursor: "pointer",
              width: "100%",
            }}
          >
            <p style={{ fontFamily: "Cinzel,serif", fontSize: 24, fontWeight: 900, color: G, letterSpacing: ".12em", margin: 0 }}>YES! PLAY AGAIN</p>
          </button>
        )}
      </div>,
    );
  };

  const renderLeaderboard = () =>
    shell(
      <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "18px 13px 16px", gap: 12 }}>
        <h2 style={{ fontFamily: "Cinzel,serif", fontSize: 26, fontWeight: 900, color: TX, textAlign: "center", letterSpacing: ".1em" }}>STANDINGS</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, overflowY: "auto" }}>
          {leaderboard.map((p, i) => {
            const isMe = p.playerId === session?.playerId;
            const gain = currentRoundGainByPlayer.get(p.playerId) ?? 0;
            return (
              <Panel key={p.playerId} style={{ padding: "11px 13px", display: "flex", alignItems: "center", gap: 10, borderColor: isMe ? `${G}99` : undefined, background: isMe ? "rgba(201,151,58,.12)" : "rgba(13,10,40,.8)" }}>
                <span style={{ width: 28, textAlign: "center", fontSize: i < 3 ? 20 : 12, fontFamily: "Cinzel,serif", color: G }}>{i + 1}</span>
                <Avatar name={p.nickname} size={32} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: isMe ? G : TX }}>{p.nickname}</span>
                  {isMe && <span style={{ fontSize: 10, color: G, marginLeft: 6, letterSpacing: ".1em" }}>YOU</span>}
                </div>
                {gain > 0 && <span style={{ color: "#4CC870", fontSize: 11, fontWeight: 600 }}>+{gain}</span>}
                <span style={{ fontFamily: "Cinzel,serif", fontSize: 14, color: i === 0 ? G : TX, minWidth: 56, textAlign: "right" }}>{p.score.toLocaleString()}</span>
              </Panel>
            );
          })}
        </div>

        <p style={{ textAlign: "center", color: `${TX}33`, fontSize: 11, letterSpacing: ".12em" }}>Next round starting soon...</p>
        {waitingDots}
      </div>,
    );

  const renderFallback = () =>
    shell(
      <div style={{ padding: "24px", textAlign: "center" }}>
        <p style={{ color: `${TX}bb` }}>{status}</p>
      </div>,
    );

  if (!room) {
    return renderFallback();
  }

  if (room.status === "lobby") {
    return renderWaitingLobby();
  }

  if (room.status === "playing") {
    return renderGetReady();
  }

  if (room.status === "clip_playing" || room.status === "answering") {
    return renderAnswering();
  }

  if (room.status === "revealed") {
    return renderRevealed();
  }

  if (room.status === "worthy_playing") {
    return renderWorthyPlaying();
  }

  if (room.status === "leaderboard") {
    return renderLeaderboard();
  }

  if (room.status === "finished") {
    return renderPlayAgainVote();
  }

  return renderFallback();
}

function MeanderLine() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: `linear-gradient(90deg,transparent,${G}66 20%,${G}66 80%,transparent)`,
      }}
    />
  );
}
