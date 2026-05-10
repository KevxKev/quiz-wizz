"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Btn, G, ModeBadge, Panel, TX } from "@/components/olympus";
import { TimedYouTubePlayer } from "@/components/host/TimedYouTubePlayer";
import {
  createLocalQuizEntry,
  mergeQuizEntries,
  readStoredQuizEntries,
  upsertStoredQuizEntry,
} from "@/lib/room";
import {
  formatSupabaseErrorMessage,
  getSupabaseBrowserClient,
  getSupabaseSetupMessage,
} from "@/lib/supabase";
import type { QuizEntry } from "@/types/game";

function parseVideoId(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const m1 = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m1?.[1]) return m1[1];
  const m2 = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return m2?.[1] ?? trimmed;
}

export default function SubmitPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [mode, setMode] = useState("audio-only");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [creator, setCreator] = useState("");
  const [category, setCategory] = useState("");
  const [videoInput, setVideoInput] = useState("");
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(15);
  const [promptText, setPromptText] = useState("Which song is currently playing?");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState("A");
  const [status, setStatus] = useState("Fill all details and save to the vault.");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const videoId = parseVideoId(videoInput);

  const setOptionAt = (idx: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const canSave =
    !!videoId &&
    title.trim().length > 0 &&
    artist.trim().length > 0 &&
    promptText.trim().length > 0 &&
    options.every((o) => o.trim().length > 0) &&
    endSeconds > startSeconds;

  const saveEntry = async () => {
    if (!supabase) {
      setStatus(getSupabaseSetupMessage());
      return;
    }

    if (!canSave) {
      setStatus("Complete all required fields before saving.");
      return;
    }

    setSaving(true);
    setStatus("Saving entry...");

    try {
      const payload = {
        title: title.trim(),
        artist: artist.trim(),
        category: category.trim() || null,
        creator: creator.trim() || null,
        youtube_video_id: videoId,
        clip_start_seconds: Math.max(0, Math.floor(startSeconds)),
        clip_end_seconds: Math.max(1, Math.floor(endSeconds)),
        playback_mode: mode,
        prompt_text: promptText.trim(),
        answer_options: options.map((o) => o.trim()),
        correct_answer: correct,
        is_active: true,
      };

      const { data, error } = await supabase.from("quiz_entries").insert(payload).select("*").single();
      if (error) throw error;

      if (data) {
        upsertStoredQuizEntry({
          ...(data as QuizEntry),
          answer_options: Array.isArray(data.answer_options) ? (data.answer_options as string[]) : options.map((o) => o.trim()),
        });
      }

      setStatus("Saved to vault.");
      setOptions(["", "", "", ""]);
      setTitle("");
      setArtist("");
      setCategory("");
      setVideoInput("");
      setStartSeconds(0);
      setEndSeconds(15);
    } catch (error) {
      const localFallback = createLocalQuizEntry({
        title: title.trim() || null,
        artist: artist.trim() || null,
        category: category.trim() || null,
        creator: creator.trim() || null,
        youtube_video_id: videoId,
        clip_start_seconds: Math.max(0, Math.floor(startSeconds)),
        clip_end_seconds: Math.max(1, Math.floor(endSeconds)),
        playback_mode: mode as "audio-only" | "video-only" | "audio-video",
        prompt_text: promptText.trim(),
        answer_options: options.map((o) => o.trim()),
        correct_answer: correct,
        is_active: true,
      });
      upsertStoredQuizEntry(localFallback);
      const mergedCount = mergeQuizEntries(readStoredQuizEntries()).length;
      setStatus(`${formatSupabaseErrorMessage(error, "Could not save entry.")} Saved locally instead. Vault local count: ${mergedCount}.`);
    } finally {
      setSaving(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: ".18em",
    color: `${TX}44`,
    display: "block",
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    background: "rgba(255,255,255,.05)",
    border: `1.5px solid ${G}33`,
    borderRadius: 8,
    color: TX,
    fontFamily: "Plus Jakarta Sans,sans-serif",
    fontSize: 14,
    outline: "none",
  };

  const sectionHead: React.CSSProperties = {
    fontFamily: "Cinzel,serif",
    fontSize: 13,
    color: `${G}99`,
    letterSpacing: ".2em",
    marginBottom: 14,
    paddingBottom: 6,
    borderBottom: `1px solid ${G}18`,
  };

  return (
    <main style={{ minHeight: "100vh", padding: "32px 40px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <Link href="/entries" style={{ textDecoration: "none" }}>
            <span
              style={{
                background: "none",
                border: `1px solid ${G}33`,
                borderRadius: 6,
                color: `${TX}55`,
                fontSize: 12,
                padding: "4px 12px",
                letterSpacing: ".08em",
              }}
            >
              {'<- Back'}
            </span>
          </Link>
          <h1 style={{ fontFamily: "Cinzel,serif", fontSize: 32, fontWeight: 900, color: TX, letterSpacing: ".08em", margin: 0 }}>
            Add Quiz Entry
          </h1>
        </div>
        <p style={{ color: `${TX}44`, fontSize: 14 }}>Create a new timed music clip for the quiz vault.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Panel style={{ padding: "22px" }}>
            <div style={sectionHead}>VIDEO SOURCE</div>
            <label style={labelStyle}>YOUTUBE URL OR VIDEO ID</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input style={inputStyle} value={videoInput} onChange={(e) => setVideoInput(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
              <Btn onClick={() => setPreview((v) => !v)} variant="ghost" size="sm">
                {preview ? "Hide" : "Preview"}
              </Btn>
            </div>
            {preview && videoId && (
              <div style={{ width: "100%", height: 220, marginTop: 8 }}>
                <TimedYouTubePlayer
                  videoId={videoId}
                  startSeconds={startSeconds}
                  endSeconds={endSeconds}
                  playbackMode={mode as "audio-only" | "video-only" | "audio-video"}
                  naked
                />
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div>
                <label style={labelStyle}>CLIP START (SECONDS)</label>
                <input type="number" style={inputStyle} value={startSeconds} onChange={(e) => setStartSeconds(Number(e.target.value || 0))} />
              </div>
              <div>
                <label style={labelStyle}>CLIP END (SECONDS)</label>
                <input type="number" style={inputStyle} value={endSeconds} onChange={(e) => setEndSeconds(Number(e.target.value || 0))} />
              </div>
            </div>
          </Panel>

          <Panel style={{ padding: "22px" }}>
            <div style={sectionHead}>PLAYBACK MODE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { value: "audio-only", label: "Audio Only" },
                { value: "video-only", label: "Video Only" },
                { value: "audio-video", label: "Audio + Video" },
              ].map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "13px 16px",
                    borderRadius: 10,
                    background: mode === m.value ? "rgba(201,151,58,.12)" : "rgba(255,255,255,.03)",
                    border: `1.5px solid ${mode === m.value ? `${G}66` : "rgba(255,255,255,.1)"}`,
                    cursor: "pointer",
                    color: TX,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{m.label}</span>
                  {mode === m.value && <span style={{ color: G }}>SELECTED</span>}
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Panel style={{ padding: "22px" }}>
            <div style={sectionHead}>SONG DETAILS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>SONG TITLE</label>
                <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>ARTIST / BAND</label>
                <input style={inputStyle} value={artist} onChange={(e) => setArtist(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>CATEGORY (OPTIONAL)</label>
                <input style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>CREATOR (OPTIONAL)</label>
                <input style={inputStyle} value={creator} onChange={(e) => setCreator(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>PROMPT TEXT</label>
                <input style={inputStyle} value={promptText} onChange={(e) => setPromptText(e.target.value)} />
              </div>
            </div>
          </Panel>

          <Panel style={{ padding: "22px" }}>
            <div style={sectionHead}>ANSWER OPTIONS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(["A", "B", "C", "D"] as const).map((letter, i) => (
                <div key={letter} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setCorrect(letter)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: correct === letter ? G : "rgba(255,255,255,.05)",
                      border: `1.5px solid ${correct === letter ? G : `${G}33`}`,
                      color: correct === letter ? "#07051a" : G,
                      fontFamily: "Cinzel,serif",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {letter}
                  </button>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={options[i]}
                    onChange={(e) => setOptionAt(i, e.target.value)}
                    placeholder={`Option ${letter}`}
                  />
                  {correct === letter && <span style={{ fontSize: 11, color: "#4CC870", fontWeight: 600 }}>Correct</span>}
                </div>
              ))}
            </div>
            <p style={{ color: `${TX}33`, fontSize: 11, marginTop: 10 }}>Selected correct answer is stored as its letter.</p>
          </Panel>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
            <ModeBadge mode={mode} />
            <Link href="/entries" style={{ textDecoration: "none" }}>
              <Btn variant="dark" size="sm">Cancel</Btn>
            </Link>
            <Btn onClick={() => void saveEntry()} size="md" disabled={saving || !canSave}>
              {saving ? "Saving..." : "Save Entry"}
            </Btn>
          </div>
          <p style={{ color: `${TX}aa`, fontSize: 13, textAlign: "right" }}>{status}</p>
        </div>
      </div>
    </main>
  );
}
