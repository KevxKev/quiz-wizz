"use client";

import { useState } from "react";
import {
  Avatar, Bolt, Btn, Columns, G, Laurel, Meander, OPTION_COLORS,
  Panel, Ring, StarField, TX,
} from "@/components/olympus";

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_PLAYERS = [
  { id: "1", player_id: "p1", nickname: "Keevy",   score: 450, gain: 150, is_host: false, is_ready: true,  worthy_vote: true  },
  { id: "2", player_id: "p2", nickname: "Darius",  score: 300, gain: 0,   is_host: false, is_ready: true,  worthy_vote: false },
  { id: "3", player_id: "p3", nickname: "Soph",    score: 250, gain: 100, is_host: false, is_ready: false, worthy_vote: null  },
  { id: "4", player_id: "p4", nickname: "Marcus",  score: 150, gain: 0,   is_host: false, is_ready: false, worthy_vote: null  },
];

const MOCK_ROOM = { code: "KEU8D", current_round_number: 2, total_rounds: 5 };

const MOCK_ROUND = {
  prompt_text: "What is the name of this song?",
  answer_options: ["Blinding Lights", "I Took A Pill In Ibiza", "Someone Like You", "Levitating"],
  correct_answer: "B",
  entry_title: "I Took A Pill In Ibiza (Seeb Remix)",
  entry_artist: "Mike Posner",
  playback_mode: "audio-video" as const,
};

const MOCK_LEADERBOARD = MOCK_PLAYERS.filter(p => !p.is_host).sort((a, b) => b.score - a.score);

// ─── Reusable mock header ────────────────────────────────────────────────────

function GameHeader() {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "8px 16px 0", zIndex: 2 }}>
      <Panel style={{ padding: "10px 22px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: `${TX}55`, fontSize: 12, letterSpacing: ".2em" }}>ROUND</span>
        <span style={{ fontFamily: "Cinzel,serif", fontSize: 26, fontWeight: 700, color: G }}>
          {MOCK_ROOM.current_round_number}<span style={{ fontSize: 16, color: `${TX}44` }}> / {MOCK_ROOM.total_rounds}</span>
        </span>
      </Panel>
      <Bolt size={20} />
      <Panel style={{ padding: "10px 22px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: `${TX}55`, fontSize: 12, letterSpacing: ".2em" }}>ROOM</span>
        <span style={{ fontFamily: "Cinzel,serif", fontSize: 22, fontWeight: 700, color: G, letterSpacing: ".2em" }}>{MOCK_ROOM.code}</span>
      </Panel>
    </div>
  );
}

// ─── Phase renderers ─────────────────────────────────────────────────────────

function PhaseLobby() {
  const joinUrl = "http://localhost:3002/join";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", padding: "28px 60px 32px", gap: 0, position: "relative", zIndex: 2 }}>
      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <Laurel size={44}>
          <h1 className="gold-shimmer flicker" style={{ fontFamily: "Cinzel,serif", fontSize: 68, fontWeight: 900, letterSpacing: ".12em", lineHeight: 1, margin: 0 }}>
            OLYMPUS NIGHT
          </h1>
        </Laurel>
        <p style={{ color: `${G}77`, fontFamily: "Cinzel,serif", fontSize: 13, letterSpacing: ".35em", marginTop: 4 }}>MUSIC QUIZ · PARTY EDITION</p>
      </div>

      <div style={{ flex: 1, display: "flex", gap: 40, alignItems: "center", minHeight: 0, marginTop: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, flexShrink: 0, width: 380 }}>
          <p style={{ color: `${TX}55`, letterSpacing: ".12em", fontSize: 13, textAlign: "center" }}>
            JOIN AT <strong style={{ color: TX }}>{joinUrl}</strong>
          </p>
          <Panel glow style={{ padding: "14px 20px", textAlign: "center", position: "relative", width: "100%" }}>
            <Meander side="top" />
            <p style={{ color: `${TX}55`, fontSize: 11, letterSpacing: ".25em", marginBottom: 4 }}>ROOM CODE</p>
            <p style={{ fontFamily: "Cinzel,serif", fontSize: 64, fontWeight: 900, letterSpacing: ".3em", color: G, lineHeight: 1 }}>{MOCK_ROOM.code}</p>
            <Meander side="bottom" />
          </Panel>
          <div style={{ width: 200, height: 200, background: "white", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: "#333", fontSize: 11, textAlign: "center", padding: 12 }}>QR code appears here at runtime</p>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: `${TX}44`, letterSpacing: ".2em", fontSize: 12 }}>PLAYERS JOINED</span>
            <span style={{ fontFamily: "Cinzel,serif", fontSize: 20, color: G }}>{MOCK_PLAYERS.filter(p => !p.is_host).length} / 8</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {MOCK_PLAYERS.filter(p => !p.is_host).map(p => (
              <Panel key={p.id} style={{ padding: "12px 10px", textAlign: "center", background: p.is_ready ? "rgba(78,200,120,.1)" : undefined, border: p.is_ready ? "1px solid #4CC87055" : undefined }}>
                <Avatar name={p.nickname} size={40} />
                <p style={{ fontFamily: "Cinzel,serif", fontSize: 13, color: p.is_ready ? "#4CC870" : TX, marginTop: 6 }}>{p.nickname}</p>
                {p.is_ready && <p style={{ color: "#4CC870", fontSize: 10, letterSpacing: ".15em" }}>READY ✓</p>}
              </Panel>
            ))}
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <span style={{ color: `${TX}33`, fontSize: 13 }}>{MOCK_PLAYERS.filter(p => p.is_ready).length} of {MOCK_PLAYERS.filter(p => !p.is_host).length} ready</span>
            <Btn size="lg">START GAME</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhaseClipPlaying({ status = "clip_playing" }: { status?: string }) {
  const isAnswering = status === "answering";
  const options = MOCK_ROUND.answer_options;
  const answeredCount = isAnswering ? 2 : 0;
  return (
    <>
      <GameHeader />
      <div style={{ flex: 1, display: "flex", gap: 0, padding: "10px 32px 12px", overflow: "hidden", width: "100%", zIndex: 2 }}>
        <div style={{ flex: 1.5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, paddingRight: 24 }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontFamily: "Cinzel,serif", fontSize: 46, fontWeight: 900, color: isAnswering ? "#E8C55A" : TX, letterSpacing: ".05em", lineHeight: 1 }}>
              {isAnswering ? "LAST CHANCE" : "WATCH AND LISTEN"}
            </h1>
            <p style={{ color: `${TX}44`, fontSize: 13, marginTop: 7, letterSpacing: ".16em" }}>
              {isAnswering ? `${answeredCount} / ${MOCK_PLAYERS.length} answered` : `Audio and video · Round ${MOCK_ROOM.current_round_number}`}
            </p>
          </div>
          {/* Video placeholder */}
          <div style={{ width: "100%", maxWidth: 780, aspectRatio: "16/9", borderRadius: 18, background: "rgba(0,0,0,.6)", border: `2px solid ${G}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: `${TX}33`, fontSize: 14, letterSpacing: ".1em" }}>▶ YouTube player</p>
          </div>
        </div>

        <div style={{ width: 1, background: `${G}18`, margin: "16px 0", flexShrink: 0 }} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, paddingLeft: 28 }}>
          <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(201,151,58,.1)", border: `1.5px solid ${G}55` }}>
            <p style={{ color: `${G}88`, fontSize: 11, letterSpacing: ".22em", marginBottom: 5 }}>QUESTION</p>
            <p style={{ fontFamily: "Cinzel,serif", fontSize: 19, fontWeight: 700, color: TX, lineHeight: 1.3 }}>{MOCK_ROUND.prompt_text}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {options.map((opt, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", borderRadius: 10, background: `${OPTION_COLORS[i]}0e`, border: `1px solid ${OPTION_COLORS[i]}38` }}>
                <span style={{ fontFamily: "Cinzel,serif", fontSize: 22, fontWeight: 900, color: OPTION_COLORS[i], width: 30, textAlign: "center", flexShrink: 0 }}>{String.fromCharCode(65 + i)}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: TX }}>{opt}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderRadius: 10, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
            <div>
              <p style={{ color: `${TX}33`, fontSize: 11, letterSpacing: ".15em", marginBottom: 4 }}>ANSWERED</p>
              <p style={{ fontFamily: "Cinzel,serif", fontSize: 28, fontWeight: 900, color: G, lineHeight: 1 }}>
                {answeredCount}<span style={{ fontSize: 15, color: `${TX}33` }}> / {MOCK_PLAYERS.length}</span>
              </p>
            </div>
            <Ring value={isAnswering ? 8 : 12} max={isAnswering ? 20 : 15} size={90} fontSize={34} />
          </div>
        </div>
      </div>
      <div style={{ padding: "0 32px 10px", display: "flex", justifyContent: "flex-end", zIndex: 2 }}>
        <Btn variant="ghost" size="sm">{isAnswering ? "REVEAL NOW" : "SKIP TO ANSWERING"}</Btn>
      </div>
    </>
  );
}

function PhaseRevealed() {
  const nonHostPlayers = MOCK_PLAYERS.filter(p => !p.is_host);
  const worthyYes = nonHostPlayers.filter(p => p.worthy_vote === true).length;
  const correctIndex = MOCK_ROUND.correct_answer.charCodeAt(0) - 65;
  const correctAnswerText = MOCK_ROUND.answer_options[correctIndex];

  const answersByPlayer = new Map([
    ["p1", { answer_text: "B" }],
    ["p2", { answer_text: "A" }],
    ["p3", { answer_text: "B" }],
    ["p4", { answer_text: "C" }],
  ]);

  return (
    <>
      <style>{`
        @keyframes revealed-glow-pulse {
          0%,100% { box-shadow: 0 0 0 2px #C9973A, 0 0 18px 3px #C9973Acc, 0 0 50px 8px #C9973A44; }
          50%      { box-shadow: 0 0 0 2px #E8C55A, 0 0 32px 7px #E8C55Aee, 0 0 80px 16px #E8C55A55; }
        }
        .revealed-player-glow { animation: revealed-glow-pulse 2.4s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", width: "100%", padding: "8px 16px 6px", zIndex: 2, gap: 16, flexShrink: 0 }}>
        <Panel style={{ padding: "8px 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ color: `${TX}55`, fontSize: 11, letterSpacing: ".2em" }}>ROUND</span>
          <span style={{ fontFamily: "Cinzel,serif", fontSize: 22, fontWeight: 700, color: G }}>
            {MOCK_ROOM.current_round_number}<span style={{ fontSize: 14, color: `${TX}44` }}> / {MOCK_ROOM.total_rounds}</span>
          </span>
        </Panel>
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ color: `${TX}44`, letterSpacing: ".3em", fontSize: 10, marginBottom: 2 }}>THE ANSWER WAS</p>
          <Laurel size={48}>
            <h1 className="gold-shimmer" style={{ fontFamily: "Cinzel,serif", fontSize: 64, fontWeight: 900, letterSpacing: ".06em", lineHeight: 1, margin: 0 }}>
              {MOCK_ROUND.correct_answer}
            </h1>
          </Laurel>
          <p style={{ fontFamily: "Cinzel,serif", fontSize: 18, color: TX, letterSpacing: ".05em", marginTop: 4 }}>{correctAnswerText}</p>
        </div>
        <Panel style={{ padding: "8px 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ color: `${TX}55`, fontSize: 11, letterSpacing: ".2em" }}>ROOM</span>
          <span style={{ fontFamily: "Cinzel,serif", fontSize: 18, fontWeight: 700, color: G, letterSpacing: ".2em" }}>{MOCK_ROOM.code}</span>
        </Panel>
      </div>

      <div style={{ flex: 1, display: "flex", gap: 20, overflow: "hidden", width: "100%", zIndex: 2, padding: "0 24px 14px" }}>
        <div style={{ flex: 3, display: "flex", flexDirection: "column", minWidth: 0, padding: 6 }}>
          <div className="revealed-player-glow" style={{ flex: 1, borderRadius: 16, overflow: "hidden", background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: `${TX}33`, fontSize: 16, letterSpacing: ".1em" }}>▶ YouTube player (full reveal)</p>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ color: `${TX}33`, fontSize: 11, letterSpacing: ".22em", textAlign: "center", flexShrink: 0 }}>STANDINGS</p>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
            {MOCK_LEADERBOARD.map((p, i) => {
              const ans = answersByPlayer.get(p.player_id);
              const correct = ans?.answer_text === MOCK_ROUND.correct_answer;
              return (
                <Panel key={p.id} style={{ padding: "9px 14px", display: "flex", alignItems: "center", gap: 8, background: i === 0 ? "rgba(201,151,58,.1)" : "rgba(13,10,40,.8)" }}>
                  <span style={{ width: 20, textAlign: "center", fontSize: i < 3 ? 15 : 11, fontFamily: "Cinzel,serif", color: G, flexShrink: 0 }}>{i + 1}</span>
                  <Avatar name={p.nickname} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "Cinzel,serif", fontSize: 13, fontWeight: 700, color: i === 0 ? G : TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nickname}</div>
                  </div>
                  {ans && (
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
          <Panel style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "rgba(200,160,255,.6)", fontSize: 10, letterSpacing: ".2em" }}>WORTHY?</span>
            <div style={{ display: "flex", gap: 4 }}>
              {nonHostPlayers.map(p => (
                <div key={p.id} style={{ width: 9, height: 9, borderRadius: "50%", background: p.worthy_vote === true ? "#C8A0FF" : p.worthy_vote === false ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.07)", border: "1px solid rgba(200,160,255,.3)" }} />
              ))}
            </div>
            <span style={{ fontFamily: "Cinzel,serif", color: "#C8A0FF", fontSize: 18, fontWeight: 700 }}>{worthyYes}/{nonHostPlayers.length}</span>
          </Panel>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingBottom: 4, flexShrink: 0 }}>
            <Ring value={7} max={15} size={80} fontSize={30} />
            <Btn variant="ghost" size="sm">SKIP</Btn>
          </div>
        </div>
      </div>
    </>
  );
}

function PhaseLeaderboard() {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", position: "relative", zIndex: 2, padding: "24px 60px 20px" }}>
        <Laurel size={48}>
          <h1 style={{ fontFamily: "Cinzel,serif", fontSize: 52, fontWeight: 900, color: TX, letterSpacing: ".1em", margin: 0 }}>STANDINGS</h1>
        </Laurel>
        <div style={{ display: "flex", gap: 24, flex: 1, marginTop: 20 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
            {MOCK_LEADERBOARD.map((p, i) => (
              <Panel key={p.id} style={{ padding: "13px 22px", display: "flex", alignItems: "center", gap: 18, background: i === 0 ? "rgba(201,151,58,.1)" : "rgba(13,10,40,.8)" }}>
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
              <Ring value={5} max={8} size={100} fontSize={40} />
            </Panel>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 14, gap: 12 }}>
          <Btn size="sm">NEXT PHASE</Btn>
        </div>
      </div>
    </>
  );
}

function PhaseWinner() {
  const sorted = [...MOCK_LEADERBOARD].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const nonHostPlayers = MOCK_PLAYERS.filter(p => !p.is_host);
  const playAgainVotes = nonHostPlayers.filter(p => p.is_ready).length;
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
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <p style={{ color: `${TX}33`, letterSpacing: ".35em", fontSize: 11, marginBottom: 2 }}>CHAMPION OF OLYMPUS</p>
          <Laurel size={52}>
            <h1 className="gold-shimmer" style={{ fontFamily: "Cinzel,serif", fontSize: 80, fontWeight: 900, letterSpacing: ".1em", lineHeight: 1, margin: 0 }}>{winner.nickname}</h1>
          </Laurel>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", padding: "4px 6px" }}>
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={i === 0 ? "winner-row-glow" : ""}
              style={{
                borderRadius: 16,
                padding: i === 0 ? "18px 28px" : "13px 24px",
                display: "flex",
                alignItems: "center",
                gap: 20,
                background: i === 0 ? "rgba(201,151,58,.15)" : "rgba(13,10,40,.8)",
                border: i === 0 ? `2px solid ${G}88` : "1px solid rgba(255,255,255,.06)",
                flexShrink: 0,
              }}
            >
              <span style={{ fontFamily: "Cinzel,serif", fontSize: i === 0 ? 36 : 20, fontWeight: 900, color: i === 0 ? G : `${TX}55`, width: 50, textAlign: "center", flexShrink: 0, lineHeight: 1 }}>
                {i === 0 ? "\uD83D\uDC51" : i + 1}
              </span>
              <Avatar name={p.nickname} size={i === 0 ? 52 : 38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "Cinzel,serif", fontSize: i === 0 ? 30 : 18, fontWeight: 900, color: i === 0 ? G : TX, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nickname}</div>
              </div>
              <div style={{ fontFamily: "Cinzel,serif", fontSize: i === 0 ? 36 : 22, fontWeight: 900, color: i === 0 ? G : TX, textAlign: "right", flexShrink: 0 }}>
                {p.score.toLocaleString()}<span style={{ fontSize: i === 0 ? 14 : 11, color: `${TX}44`, marginLeft: 4 }}>pts</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, paddingTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: `${TX}44`, fontSize: 11, letterSpacing: ".2em" }}>PLAY AGAIN</span>
            <div style={{ display: "flex", gap: 4 }}>
              {nonHostPlayers.map(p => (
                <div key={p.id} style={{ width: 10, height: 10, borderRadius: "50%", background: p.is_ready ? "#4CC870" : "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)" }} />
              ))}
            </div>
            <span style={{ fontFamily: "Cinzel,serif", fontSize: 20, fontWeight: 900, color: allVoted ? "#4CC870" : G }}>{playAgainVotes}/{nonHostPlayers.length}</span>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <Btn size="lg">PLAY AGAIN</Btn>
            <Btn variant="ghost" size="lg">MAIN MENU</Btn>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Phase definitions ────────────────────────────────────────────────────────

const PHASES = [
  { id: "lobby",        label: "Lobby" },
  { id: "clip_playing", label: "Clip Playing" },
  { id: "answering",    label: "Answering" },
  { id: "revealed",     label: "Revealed" },
  { id: "leaderboard",  label: "Leaderboard" },
  { id: "winner",       label: "Winner" },
] as const;

type PhaseId = typeof PHASES[number]["id"];

// ─── Preview page ─────────────────────────────────────────────────────────────

export default function PreviewPage() {
  const [phase, setPhase] = useState<PhaseId>("lobby");

  function renderPhase() {
    switch (phase) {
      case "lobby":        return <PhaseLobby />;
      case "clip_playing": return <PhaseClipPlaying status="clip_playing" />;
      case "answering":    return <PhaseClipPlaying status="answering" />;
      case "revealed":     return <PhaseRevealed />;
      case "leaderboard":  return <PhaseLeaderboard />;
      case "winner":       return <PhaseWinner />;
    }
  }

  return (
    <div style={{ fontFamily: "sans-serif", background: "#07051a", minHeight: "100vh" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, padding: "10px 16px", background: "rgba(0,0,0,.5)", borderBottom: "1px solid rgba(201,151,58,.25)", flexWrap: "wrap", zIndex: 100, position: "relative" }}>
        <span style={{ color: `${G}88`, fontSize: 11, letterSpacing: ".2em", alignSelf: "center", marginRight: 8 }}>PREVIEW</span>
        {PHASES.map(p => (
          <button
            key={p.id}
            onClick={() => setPhase(p.id)}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: phase === p.id ? `1.5px solid ${G}` : "1.5px solid rgba(255,255,255,.12)",
              background: phase === p.id ? `${G}22` : "rgba(255,255,255,.04)",
              color: phase === p.id ? G : `${TX}88`,
              fontFamily: "Cinzel, serif",
              fontSize: 12,
              fontWeight: phase === p.id ? 700 : 400,
              cursor: "pointer",
              letterSpacing: ".08em",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Phase viewport — matches host page dimensions */}
      <div style={{ position: "relative", height: "calc(100vh - 53px)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <StarField />
        <Columns />
        {renderPhase()}
      </div>
    </div>
  );
}
