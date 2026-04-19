"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { OlympusBackground } from "@/components/ui";
import {
  formatSupabaseErrorMessage,
  getSupabaseBrowserClient,
  getSupabaseProjectHost,
  getSupabaseSetupMessage,
} from "@/lib/supabase";
import type { PlayerSession } from "@/types/game";

const SESSION_STORAGE_KEY = "quiz-wizz-player-session";
const DEFAULT_STATUS_MESSAGE = "Enter the room code from the TV and choose a nickname.";
const JOIN_DEBUG_BUILD = "join-debug-v2";

type JoinState = "idle" | "loading" | "success" | "error";

function JoinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const supabaseProjectHost = getSupabaseProjectHost();
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [statusMessage, setStatusMessage] = useState(DEFAULT_STATUS_MESSAGE);
  const [joinState, setJoinState] = useState<JoinState>("idle");
  const [isJoining, setIsJoining] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [joinedRoomCode, setJoinedRoomCode] = useState<string | null>(null);
  const [debugSteps, setDebugSteps] = useState<string[]>([]);

  const logJoinStep = useCallback((label: string, details?: unknown) => {
    const timestamp = new Date().toLocaleTimeString();
    const detailText = details === undefined ? "" : ` ${JSON.stringify(details)}`;
    const entry = `${timestamp} — ${label}${detailText}`;

    console.info(`[Quiz Wizz][Join] ${label}`, details ?? "");
    setDebugSteps((current) => [...current.slice(-15), entry]);
  }, []);

  useEffect(() => {
    const prefilledRoomCode = searchParams.get("room");
    if (prefilledRoomCode) {
      setRoomCode(prefilledRoomCode.toUpperCase());
    }
  }, [searchParams]);

  useEffect(() => {
    setIsHydrated(true);
    logJoinStep("Client hydrated - join button is ready", { build: JOIN_DEBUG_BUILD });
  }, [logJoinStep]);

  const handleJoin = async () => {

    console.log("JOIN SUBMIT TRIGGERED");
    setJoinState("loading");
    logJoinStep("JOIN SUBMIT TRIGGERED");
    logJoinStep("Form submit started");

    const normalizedCode = roomCode.trim().toUpperCase();
    const trimmedNickname = nickname.trim();

    logJoinStep("Validating inputs", {
      roomCode: normalizedCode,
      nickname: trimmedNickname,
    });

    logJoinStep("Join submitted", {
      roomCode: normalizedCode,
      nickname: trimmedNickname,
    });

    if (!supabase) {
      setJoinState("error");
      setStatusMessage(getSupabaseSetupMessage());
      logJoinStep("Supabase missing");
      return;
    }

    if (normalizedCode.length < 4) {
      setJoinState("error");
      setStatusMessage("Enter a valid room code.");
      return;
    }

    if (trimmedNickname.length < 2) {
      setJoinState("error");
      setStatusMessage("Choose a nickname with at least 2 characters.");
      return;
    }

    setIsJoining(true);
    setJoinState("loading");
    setStatusMessage("Joining room...");

    try {
      logJoinStep("Looking up room", { roomCode: normalizedCode });

      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", normalizedCode)
        .maybeSingle();

      logJoinStep("Room lookup result", {
        found: Boolean(room),
        roomId: room?.id ?? null,
        roomCode: room?.code ?? null,
        error: roomError?.message ?? null,
      });

      if (roomError) {
        throw roomError;
      }

      if (!room) {
        setJoinState("error");
        setStatusMessage(`Room ${normalizedCode} was not found.`);
        return;
      }

      logJoinStep("Creating player", { nickname: trimmedNickname });

      const { data: player, error: playerError } = await supabase
        .from("players")
        .insert({ nickname: trimmedNickname })
        .select("*")
        .single();

      logJoinStep("Player insert result", {
        playerId: player?.id ?? null,
        error: playerError?.message ?? null,
      });

      if (playerError) {
        throw playerError;
      }

      if (!player) {
        throw new Error("Supabase did not return the new player record.");
      }

      logJoinStep("Linking player to room", {
        roomId: room.id,
        playerId: player.id,
      });

      const { data: roomPlayer, error: roomPlayerError } = await supabase
        .from("room_players")
        .insert({
          room_id: room.id,
          player_id: player.id,
          nickname: trimmedNickname,
          is_host: false,
        })
        .select("*")
        .single();

      logJoinStep("Room player insert result", {
        roomPlayerId: roomPlayer?.id ?? null,
        error: roomPlayerError?.message ?? null,
        errorCode: roomPlayerError?.code ?? null,
      });

      if (roomPlayerError) {
        if (roomPlayerError.code === "23505") {
          setJoinState("error");
          setStatusMessage("That nickname is already being used in this room. Try another one.");
          return;
        }

        throw roomPlayerError;
      }

      if (!roomPlayer) {
        throw new Error("Supabase did not return the room-player join record.");
      }

      const session: PlayerSession = {
        roomId: room.id,
        roomCode: room.code,
        playerId: player.id,
        roomPlayerId: roomPlayer.id,
        nickname: trimmedNickname,
      };

      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      logJoinStep("Join succeeded - session saved", {
        roomCode: room.code,
        playerId: player.id,
        roomPlayerId: roomPlayer.id,
      });

      setJoinedRoomCode(room.code);
      setJoinState("success");
      setStatusMessage(`Joined room ${room.code}. Redirecting to the answer screen...`);

      logJoinStep("Redirecting to next page", { target: `/answer?room=${room.code}` });
      logJoinStep("Redirect decision", { target: `/answer?room=${room.code}` });
      router.replace(`/answer?room=${room.code}`);

      window.setTimeout(() => {
        if (window.location.pathname === "/join") {
          logJoinStep("Fallback redirect via window.location", {
            target: `/answer?room=${room.code}`,
          });
          window.location.assign(`/answer?room=${room.code}`);
        }
      }, 500);
    } catch (error) {
      const message = formatSupabaseErrorMessage(error, "Could not join the room.");
      logJoinStep("Join failed", {
        message,
      });
      setJoinState("error");
      setStatusMessage(message);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--oly-night-base)] text-slate-50">
      <OlympusBackground showParticles />

      <div className="relative z-10 mx-auto flex w-full max-w-sm flex-col gap-5 px-4 py-8 sm:px-6">
        {/* Header */}
        <header className="pt-2 text-center">
          <h1
            className="oly-text-gold-shimmer font-black uppercase"
            style={{ fontSize: "clamp(1.1rem, 5.5vw, 2.2rem)", letterSpacing: "0.05em" }}
          >
            ✦ Olympus Night ✦
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Enter the room seal from the host screen and choose your name.
          </p>
        </header>

        {/* Supabase warning */}
        {!supabase ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {getSupabaseSetupMessage()}
          </div>
        ) : null}

        {/* Form panel */}
        <section
          className="rounded-3xl p-6"
          style={{
            background: "rgba(5,3,18,0.65)",
            border: "1px solid rgba(201,162,39,0.15)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="room-code"
                className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.3em]"
                style={{ color: "var(--oly-gold-dim)" }}
              >
                Room Seal
              </label>
              <input
                id="room-code"
                type="text"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleJoin();
                  }
                }}
                placeholder="AB123"
                className="w-full rounded-2xl px-4 py-3 text-lg uppercase tracking-[0.25em] text-white outline-none transition"
                style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(201,162,39,0.22)" }}
              />
            </div>

            <div>
              <label
                htmlFor="nickname"
                className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.3em]"
                style={{ color: "var(--oly-gold-dim)" }}
              >
                Your Name
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleJoin();
                  }
                }}
                placeholder="Your name"
                className="w-full rounded-2xl px-4 py-3 text-base text-white outline-none transition"
                style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(201,162,39,0.22)" }}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                console.log("BUTTON CLICKED");
                setStatusMessage("JOIN BUTTON CLICKED");
                setJoinState("loading");
                logJoinStep("JOIN BUTTON CLICKED");
                void handleJoin();
              }}
              disabled={isJoining || !isHydrated}
              className="w-full rounded-2xl px-5 py-4 text-base font-bold transition-all disabled:cursor-not-allowed"
              style={
                isJoining || !isHydrated
                  ? {
                      background: "rgba(30,25,50,0.80)",
                      color: "rgba(255,255,255,0.18)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }
                  : {
                      background:
                        "linear-gradient(135deg, var(--oly-gold-dim) 0%, var(--oly-gold) 50%, var(--oly-gold-bright) 100%)",
                      boxShadow: "var(--oly-glow-gold-strong)",
                      color: "#0a0800",
                      border: "none",
                    }
              }
            >
              {!isHydrated ? "Loading…" : isJoining ? "Joining the feast…" : "Enter the Feast ✦"}
            </button>
          </div>
        </section>

        {/* Join state / status */}
        {statusMessage !== DEFAULT_STATUS_MESSAGE ? (
          <section
            className={`rounded-2xl border p-4 text-sm ${
              joinState === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-50"
                : joinState === "error"
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-50"
                  : "border-white/10 bg-black/30 text-slate-300"
            }`}
          >
            <p>{statusMessage}</p>
            {joinState === "success" && joinedRoomCode ? (
              <Link
                href={`/answer?room=${joinedRoomCode}`}
                className="mt-3 inline-flex rounded-xl px-3 py-2 text-sm font-semibold transition"
                style={{ border: "1px solid rgba(201,162,39,0.35)", color: "var(--oly-gold-bright)" }}
              >
                Continue to answer screen →
              </Link>
            ) : null}
          </section>
        ) : null}

        <Link
          href="/host"
          className="text-center text-sm transition"
          style={{ color: "var(--oly-gold-dim)" }}
        >
          ← Back to host screen
        </Link>
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">Loading join page...</main>}>
      <JoinPageContent />
    </Suspense>
  );
}
