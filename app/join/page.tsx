"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { Btn, G, Meander, Panel, TX } from "@/components/olympus";
import {
  formatSupabaseErrorMessage,
  getSupabaseBrowserClient,
  getSupabaseSetupMessage,
} from "@/lib/supabase";
import type { PlayerSession } from "@/types/game";

const SESSION_STORAGE_KEY = "quiz-wizz-player-session";

function JoinPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const prefilledRoomCode = useMemo(() => searchParams.get("room")?.toUpperCase() ?? "", [searchParams]);

  const [roomCode, setRoomCode] = useState(prefilledRoomCode);
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async () => {
    if (!supabase) {
      setStatus(getSupabaseSetupMessage());
      return;
    }

    const normalizedCode = roomCode.trim().toUpperCase();
    const trimmedNickname = nickname.trim();

    if (normalizedCode.length < 4) {
      setStatus("Enter a valid room code.");
      return;
    }

    if (trimmedNickname.length < 2) {
      setStatus("Name must be at least 2 characters.");
      return;
    }

    setIsJoining(true);
    setStatus("Joining room...");

    try {
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", normalizedCode)
        .maybeSingle();

      if (roomError) {
        throw roomError;
      }

      if (!room) {
        setStatus(`Room ${normalizedCode} not found.`);
        return;
      }

      const { data: player, error: playerError } = await supabase
        .from("players")
        .insert({ nickname: trimmedNickname })
        .select("*")
        .single();

      if (playerError) {
        throw playerError;
      }

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

      if (roomPlayerError) {
        if (roomPlayerError.code === "23505") {
          setStatus("Nickname already taken in this room.");
          return;
        }
        throw roomPlayerError;
      }

      const session: PlayerSession = {
        roomId: room.id,
        roomCode: room.code,
        playerId: player.id,
        roomPlayerId: roomPlayer.id,
        nickname: trimmedNickname,
      };

      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      router.replace("/answer");
    } catch (error) {
      setStatus(formatSupabaseErrorMessage(error, "Could not join room."));
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#07051a",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background: "radial-gradient(ellipse at 50% 0%,rgba(80,30,160,.25),transparent 65%)",
        }}
      />

      <div style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100%",
            padding: "32px 20px",
            gap: 24,
            maxWidth: 420,
            margin: "0 auto",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <h1
              className="gold-shimmer"
              style={{
                fontFamily: "Cinzel,serif",
                fontSize: 42,
                fontWeight: 900,
                letterSpacing: ".12em",
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              OLYMPUS<br />NIGHT
            </h1>
            <p style={{ color: `${TX}44`, fontSize: 11, letterSpacing: ".3em", marginTop: 10 }}>JOIN THE GAME</p>
          </div>

          <Panel
            style={{
              width: "100%",
              padding: "24px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <Meander side="top" />
            <div>
              <label style={{ fontSize: 11, letterSpacing: ".2em", color: `${TX}44`, display: "block", marginBottom: 8 }}>
                ROOM CODE
              </label>
              <input
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,.05)",
                  border: `1.5px solid ${G}44`,
                  borderRadius: 10,
                  color: G,
                  fontFamily: "Cinzel,serif",
                  outline: "none",
                  fontSize: 38,
                  letterSpacing: ".3em",
                  fontWeight: 700,
                  textAlign: "center",
                }}
                placeholder="XXXX"
                maxLength={5}
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, letterSpacing: ".2em", color: `${TX}44`, display: "block", marginBottom: 8 }}>
                YOUR NAME
              </label>
              <input
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,.05)",
                  border: `1.5px solid ${G}44`,
                  borderRadius: 10,
                  color: TX,
                  fontFamily: "Plus Jakarta Sans,sans-serif",
                  fontSize: 18,
                  textAlign: "center",
                  outline: "none",
                }}
                placeholder="Enter nickname"
                maxLength={16}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
              />
            </div>
          </Panel>

          <Btn
            onClick={() => void handleJoin()}
            size="lg"
            disabled={isJoining || roomCode.trim().length < 4 || nickname.trim().length < 2}
          >
            {isJoining ? "Joining..." : "Enter Olympus ->"}
          </Btn>

          {status && (
          <div
            style={{
              width: "100%",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.12)",
              background: "rgba(255,255,255,.04)",
              color: `${TX}bb`,
              padding: "10px 12px",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            {status}
          </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<main className="min-h-screen px-4 py-10 text-slate-50">Loading...</main>}>
      <JoinPageInner />
    </Suspense>
  );
}
