"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Btn, G, Meander, ModeBadge, Panel, TX } from "@/components/olympus";
import { TimedYouTubePlayer } from "@/components/host/TimedYouTubePlayer";
import type { TimedYouTubePlayerHandle } from "@/components/host/TimedYouTubePlayer";
import { mergeQuizEntries, readStoredQuizEntries, removeStoredQuizEntry } from "@/lib/room";
import { formatSupabaseErrorMessage, getSupabaseBrowserClient, getSupabaseSetupMessage } from "@/lib/supabase";
import type { QuizEntry } from "@/types/game";

type EntryRow = QuizEntry;

export default function EntriesPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const previewPlayerRef = useRef<TimedYouTubePlayerHandle>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading vault...");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [preview, setPreview] = useState<EntryRow | null>(null);

  const loadEntries = async () => {
    const localEntries = readStoredQuizEntries();

    if (!supabase) {
      setEntries(localEntries);
      setStatus(`${getSupabaseSetupMessage()} Showing ${localEntries.length} local entr${localEntries.length === 1 ? "y" : "ies"}.`);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("quiz_entries")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const mapped = (data ?? []).map((row) => ({ ...row, answer_options: Array.isArray(row.answer_options) ? row.answer_options : [] })) as EntryRow[];
      const merged = mergeQuizEntries(mapped, localEntries);
      setEntries(merged);
      setStatus(`Loaded ${merged.length} entries.`);
    } catch (error) {
      setEntries(localEntries);
      setStatus(`${formatSupabaseErrorMessage(error, "Could not load entries.")} Showing local entries instead.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  const filtered = entries.filter((e) => {
    const text = `${e.title ?? ""} ${e.artist ?? ""}`.toLowerCase();
    const matchSearch = text.includes(search.toLowerCase());
    const matchMode = filter === "all" || e.playback_mode === filter;
    return matchSearch && matchMode;
  });

  const removeEntry = async (id: string) => {
    removeStoredQuizEntry(id);

    if (!supabase) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setStatus("Entry removed from local vault.");
      return;
    }
    try {
      const { error } = await supabase.from("quiz_entries").delete().eq("id", id);
      if (error) throw error;
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setStatus("Entry removed.");
    } catch (error) {
      setStatus(formatSupabaseErrorMessage(error, "Could not delete entry."));
    }
  };

  return (
    <main className="entries-main" style={{ minHeight: "100vh", padding: "28px 40px", position: "relative", zIndex: 2 }}>
      <style>{`
        @media (max-width: 640px) {
          .entries-main { padding: 20px 16px !important; }
          .entries-header { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
          .entries-toolbar { flex-wrap: wrap !important; }
          .entries-search-input { width: 100% !important; }
        }
      `}</style>
      <div className="entries-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "Cinzel,serif", fontSize: 32, fontWeight: 900, color: TX, letterSpacing: ".08em", margin: 0 }}>
            Entry Vault
          </h1>
          <p style={{ color: `${TX}44`, fontSize: 13, marginTop: 4 }}>{status}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <Btn variant="ghost" size="sm">Home</Btn>
          </Link>
          <Link href="/submit" style={{ textDecoration: "none" }}>
            <Btn size="md">+ Add Entry</Btn>
          </Link>
        </div>
      </div>

      <div className="entries-toolbar" style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <input
          style={{
            padding: "9px 14px",
            background: "rgba(255,255,255,.05)",
            border: `1px solid ${G}33`,
            borderRadius: 8,
            color: TX,
            fontSize: 13,
            fontFamily: "Plus Jakarta Sans,sans-serif",
            outline: "none",
            width: 280,
          }}
          className="entries-search-input"
          placeholder="Search songs or artists..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div style={{ display: "flex", gap: 4 }}>
          {[
            { value: "all", label: "All" },
            { value: "audio-only", label: "Audio" },
            { value: "video-only", label: "Video" },
            { value: "audio-video", label: "A+V" },
          ].map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                background: filter === f.value ? G : "transparent",
                color: filter === f.value ? "#07051a" : `${TX}55`,
                border: filter === f.value ? "none" : `1px solid ${G}22`,
                letterSpacing: ".05em",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span style={{ color: `${TX}33`, fontSize: 13, marginLeft: "auto" }}>{filtered.length} shown</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
        {filtered.map((e) => (
          <Panel key={e.id} style={{ padding: "18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <ModeBadge mode={e.playback_mode} />
              <span style={{ color: `${TX}33`, fontSize: 11 }}>{e.clip_start_seconds}s-{e.clip_end_seconds}s</span>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: TX, marginBottom: 3 }}>{e.title ?? "Untitled"}</div>
              <div style={{ fontSize: 13, color: `${TX}66` }}>{e.artist ?? "Unknown Artist"}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {e.answer_options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i);
                // Support both old format (full text) and new format (letter A/B/C/D)
                const isCorrect = /^[A-D]$/i.test(e.correct_answer ?? "")
                  ? e.correct_answer?.toUpperCase() === letter
                  : (e.correct_answer ?? "").trim().toLowerCase() === opt.trim().toLowerCase();
                return (
                  <span
                    key={`${e.id}-${letter}`}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: isCorrect ? `${G}22` : "rgba(255,255,255,.05)",
                      border: `1px solid ${isCorrect ? `${G}44` : "rgba(255,255,255,.08)"}`,
                      color: isCorrect ? G : `${TX}55`,
                    }}
                  >
                    {letter}. {opt}
                  </span>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <Btn onClick={() => setPreview(e)} variant="ghost" size="sm" style={{ flex: 1, textAlign: "center", padding: "6px 0" }}>
                Preview
              </Btn>
              <Link href={`/submit?edit=${e.id}`} style={{ textDecoration: "none", flex: 1 }}>
                <Btn variant="dark" size="sm" style={{ width: "100%", textAlign: "center", padding: "6px 0" }}>Edit</Btn>
              </Link>
              <button
                type="button"
                onClick={() => void removeEntry(e.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(200,60,60,.3)",
                  background: "rgba(200,60,60,.08)",
                  color: "#C06060",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Delete
              </button>
            </div>
          </Panel>
        ))}

        {!loading && filtered.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 0", color: `${TX}33` }}>
            <div style={{ fontFamily: "Cinzel,serif", fontSize: 18 }}>The vault is empty</div>
            <p style={{ fontSize: 13, marginTop: 6 }}>No entries match your search.</p>
          </div>
        )}
      </div>

      {preview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 500,
            background: "rgba(0,0,0,.8)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setPreview(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Panel style={{ padding: 28, maxWidth: 640, width: "90%", position: "relative" }}>
              <Meander side="top" />
              <div style={{ marginBottom: 16 }}>
                <p style={{
                  fontFamily: "Cinzel,serif",
                  fontSize: 16,
                  color: `${TX}bb`,
                  letterSpacing: ".1em",
                  textAlign: "center",
                  margin: "0 0 16px",
                }}>
                  {preview.prompt_text}
                </p>
                <div style={{ width: "100%", height: 240 }}>
                  <TimedYouTubePlayer
                    ref={previewPlayerRef}
                    videoId={preview.youtube_video_id}
                    startSeconds={preview.clip_start_seconds}
                    endSeconds={preview.clip_end_seconds}
                    playbackMode={preview.playback_mode as "audio-only" | "video-only" | "audio-video"}
                    autoPlayRequestKey={preview.id}
                    onVideoEnded={() => setPreview(null)}
                    naked
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => previewPlayerRef.current?.playClip()}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: 8,
                      background: `${G}22`,
                      border: `1.5px solid ${G}55`,
                      color: G,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    ▶ Play Clip
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      background: "none",
                      border: `1px solid ${G}33`,
                      color: `${TX}55`,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>
                <p style={{ color: `${TX}33`, fontSize: 11, textAlign: "center", marginTop: 8 }}>
                  {preview.title} – {preview.artist}
                </p>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </main>
  );
}
