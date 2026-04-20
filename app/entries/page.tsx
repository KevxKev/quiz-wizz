"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_PLAYER_DEBUG_STATE,
  TimedYouTubePlayer,
  type PlayerDebugState,
  type TimedYouTubePlayerHandle,
} from "@/components/host/TimedYouTubePlayer";
import { OlympusBackground } from "@/components/ui";
import { createLocalQuizEntry, mergeQuizEntries, readStoredQuizEntries, removeStoredQuizEntry, upsertStoredQuizEntry } from "@/lib/room";
import {
  formatSupabaseErrorMessage,
  getSupabaseBrowserClient,
} from "@/lib/supabase";
import { getPlaybackModeLabel } from "@/lib/youtube";
import type { QuizEntry } from "@/types/game";

const SAMPLE_ENTRY: Omit<QuizEntry, "id" | "created_at"> = {
  title: "Never Gonna Give You Up",
  artist: "Rick Astley",
  category: "Pop",
  youtube_video_id: "dQw4w9WgXcQ",
  clip_start_seconds: 42,
  clip_end_seconds: 57,
  playback_mode: "audio-video",
  prompt_text: "Which artist performs this song?",
  answer_options: ["Rick Astley", "George Michael", "Elton John", "David Bowie"],
  correct_answer: "Rick Astley",
  is_active: true,
  creator: "sample",
};

type PreviewPhase = "playing" | "revealed" | "closed";

export default function EntriesPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [entries, setEntries] = useState<QuizEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isAddingSample, setIsAddingSample] = useState(false);

  // Preview modal state
  const [previewEntry, setPreviewEntry] = useState<QuizEntry | null>(null);
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>("closed");
  const [previewLockedAnswer, setPreviewLockedAnswer] = useState<string | null>(null);
  const previewPlayerRef = useRef<TimedYouTubePlayerHandle | null>(null);
  const [, setPreviewDebug] = useState<PlayerDebugState>(DEFAULT_PLAYER_DEBUG_STATE);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    const localEntries = readStoredQuizEntries();

    if (!supabase) {
      setEntries(localEntries);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("quiz_entries")
      .select("*")
      .order("created_at", { ascending: false });

    if (error || !data) {
      setEntries(localEntries);
      setIsLoading(false);
      return;
    }

    const remoteEntries = (data as QuizEntry[]).map((entry) => ({
      ...entry,
      answer_options: Array.isArray(entry.answer_options) ? (entry.answer_options as string[]) : [],
    }));

    setEntries(mergeQuizEntries(remoteEntries, localEntries));
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const handleDelete = async (entry: QuizEntry) => {
    setDeletingEntryId(entry.id);
    try {
      if (!entry.id.startsWith("local-") && supabase) {
        const { error } = await supabase.from("quiz_entries").delete().eq("id", entry.id);
        if (error) throw error;
      }
      removeStoredQuizEntry(entry.id);
      setEntries((current) => current.filter((e) => e.id !== entry.id));
      setStatusMessage("Entry deleted.");
    } catch (error) {
      setStatusMessage(formatSupabaseErrorMessage(error, "Could not delete entry."));
    } finally {
      setDeletingEntryId(null);
    }
  };

  const handleAddSample = async () => {
    setIsAddingSample(true);
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from("quiz_entries")
          .insert(SAMPLE_ENTRY)
          .select("*")
          .single();
        if (error) throw error;
        const saved = { ...(data as QuizEntry), answer_options: Array.isArray((data as QuizEntry).answer_options) ? (data as QuizEntry).answer_options : [] };
        setEntries((current) => [saved, ...current]);
        setStatusMessage("Sample entry added to Supabase.");
      } else {
        const local = createLocalQuizEntry(SAMPLE_ENTRY);
        upsertStoredQuizEntry(local);
        setEntries((current) => [local, ...current]);
        setStatusMessage("Sample entry saved locally (no Supabase).");
      }
    } catch (error) {
      setStatusMessage(formatSupabaseErrorMessage(error, "Could not add sample entry."));
    } finally {
      setIsAddingSample(false);
    }
  };

  const openPreview = (entry: QuizEntry) => {
    setPreviewEntry(entry);
    setPreviewLockedAnswer(null);
    setPreviewPhase("playing");
  };

  const closePreview = () => {
    previewPlayerRef.current?.stopPlayback();
    setPreviewPhase("closed");
    setPreviewEntry(null);
    setPreviewLockedAnswer(null);
  };

  const handlePreviewVideoEnded = () => {
    setPreviewPhase("revealed");
  };

  const handlePreviewAnswer = (option: string) => {
    if (previewLockedAnswer || previewPhase !== "playing") return;
    setPreviewLockedAnswer(option);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--oly-night-base)] px-4 py-10 text-slate-50 sm:px-6">
      <OlympusBackground showParticles />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.5em]"
              style={{ color: "var(--oly-gold-dim)" }}
            >
              ✦ &nbsp; Olympus Night &nbsp; ✦
            </p>
            <h1 className="mt-1 text-3xl font-bold text-white">The Sacred Vault</h1>
            <p className="mt-1 text-sm text-slate-400">
              {isLoading ? "Loading entries…" : `${entries.length} entr${entries.length === 1 ? "y" : "ies"} stored`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href="/submit"
              className="rounded-2xl px-4 py-2.5 text-sm font-semibold transition"
              style={{
                background:
                  "linear-gradient(135deg, var(--oly-gold-dim) 0%, var(--oly-gold) 50%, var(--oly-gold-bright) 100%)",
                color: "#0a0800",
                boxShadow: "var(--oly-glow-gold)",
              }}
            >
              + Add entry
            </Link>
            <Link
              href="/host"
              className="rounded-2xl px-4 py-2.5 text-sm font-semibold transition"
              style={{ border: "1px solid rgba(201,162,39,0.25)", color: "var(--oly-gold-dim)" }}
            >
              Host screen
            </Link>
          </div>
        </header>

        {/* Status message */}
        {statusMessage ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-300">
            {statusMessage}
          </div>
        ) : null}

        {/* Entry list */}
        {isLoading ? (
          <div
            className="flex items-center justify-center rounded-3xl py-16 text-sm"
            style={{ background: "rgba(5,3,18,0.55)", border: "1px solid rgba(201,162,39,0.12)" }}
          >
            <p style={{ color: "var(--oly-gold-dim)" }}>Summoning the vault…</p>
          </div>
        ) : entries.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-3xl py-16 text-center"
            style={{ background: "rgba(5,3,18,0.55)", border: "1px solid rgba(201,162,39,0.12)" }}
          >
            <p className="text-3xl opacity-20">⚗</p>
            <p className="text-sm text-slate-500">The vault is empty. Add sacred entries to begin.</p>
            <Link
              href="/submit"
              className="mt-2 rounded-2xl px-4 py-2 text-sm font-semibold"
              style={{ border: "1px solid rgba(201,162,39,0.30)", color: "var(--oly-gold-bright)" }}
            >
              Add first entry →
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry, index) => (
              <li
                key={entry.id}
                className="rounded-2xl p-4"
                style={{
                  background: "rgba(5,3,18,0.60)",
                  border: "1px solid rgba(201,162,39,0.12)",
                  backdropFilter: "blur(6px)",
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="shrink-0 text-xs font-semibold tabular-nums"
                        style={{ color: "var(--oly-gold-dim)" }}
                      >
                        #{index + 1}
                      </span>
                      <p className="truncate font-semibold text-white">
                        {entry.title || entry.prompt_text}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {entry.artist || "Unknown artist"} &bull; {entry.category || "Uncategorized"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.youtube_video_id} &bull; {entry.clip_start_seconds}s &rarr;{" "}
                      {entry.clip_end_seconds}s &bull; {getPlaybackModeLabel(entry.playback_mode)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {entry.id.startsWith("local-") ? "Browser fallback" : "Supabase"} &bull;{" "}
                      {entry.answer_options.filter(Boolean).length} options
                    </p>
                  </div>

                  {/* Right: actions */}
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => openPreview(entry)}
                      className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
                      style={{ background: "rgba(201,162,39,0.12)", border: "1px solid rgba(201,162,39,0.40)", color: "var(--oly-gold-bright)" }}
                    >
                      ▶ Preview
                    </button>
                    <Link
                      href={`/submit?edit=${entry.id}`}
                      className="rounded-lg px-3 py-1.5 text-center text-[11px] font-semibold transition"
                      style={{ border: "1px solid rgba(201,162,39,0.30)", color: "var(--oly-gold-bright)" }}
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDelete(entry)}
                      disabled={deletingEntryId === entry.id}
                      className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingEntryId === entry.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="text-center text-xs text-slate-600">
          {entries.length} total &bull;{" "}
          {entries.filter((e) => !e.id.startsWith("local-")).length} in Supabase &bull;{" "}
          {entries.filter((e) => e.id.startsWith("local-")).length} local only
        </p>
      </div>

      {/* ── Preview modal ──────────────────────────────────────────────────── */}
      {previewEntry && previewPhase !== "closed" ? (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: "linear-gradient(135deg, #000005 0%, #050312 60%, #0a0520 100%)" }}
        >
          {/* Top bar */}
          <div className="flex flex-none items-center justify-between gap-4 px-5 py-3" style={{ borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.4em]" style={{ color: "var(--oly-gold-dim)" }}>
                ✦ Test Preview
              </p>
              <p className="mt-0.5 text-sm font-bold text-white">{previewEntry.title || previewEntry.prompt_text}</p>
            </div>
            <button
              type="button"
              onClick={closePreview}
              className="rounded-2xl px-4 py-2 text-sm font-semibold transition"
              style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.40)", color: "#fca5a5" }}
            >
              ✕ Close
            </button>
          </div>

          {/* Content */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 xl:flex-row xl:overflow-hidden">
            {/* Video player */}
            <div className="min-h-0 flex-1">
              <TimedYouTubePlayer
                ref={previewPlayerRef}
                videoId={previewEntry.youtube_video_id}
                startSeconds={previewEntry.clip_start_seconds}
                endSeconds={previewPhase === "revealed" ? 3600 : previewEntry.clip_end_seconds}
                playbackMode={previewPhase === "revealed" ? "audio-video" : previewEntry.playback_mode}
                autoPlayRequestKey={`preview-${previewEntry.id}-${previewPhase}`}
                spoilerGuard={previewPhase === "playing"}
                highlighted={previewPhase === "playing"}
                onVideoEnded={handlePreviewVideoEnded}
                onDebugChange={setPreviewDebug}
              />
            </div>

            {/* Question + answers */}
            <div className="flex w-full flex-col gap-4 xl:w-80">
              <div className="rounded-3xl p-5" style={{ background: "rgba(5,3,18,0.80)", border: "1px solid rgba(201,162,39,0.20)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em]" style={{ color: "var(--oly-gold-dim)" }}>
                  {previewPhase === "playing" ? "Clip playing" : "✦ Revealed"}
                </p>
                <h2 className="mt-2 text-xl font-bold text-white">{previewEntry.prompt_text}</h2>

                <div className="mt-4 grid gap-2">
                  {previewEntry.answer_options.filter(Boolean).map((option) => {
                    const isCorrect = previewEntry.correct_answer === option;
                    const isLocked = previewLockedAnswer === option;
                    const isRevealed = previewPhase === "revealed";
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handlePreviewAnswer(option)}
                        disabled={Boolean(previewLockedAnswer) || isRevealed}
                        className="rounded-2xl px-4 py-3 text-left text-sm font-semibold transition disabled:cursor-default"
                        style={
                          isRevealed && isCorrect
                            ? { border: "1px solid rgba(201,162,39,0.7)", background: "rgba(201,162,39,0.18)", color: "var(--oly-gold-bright)" }
                            : isRevealed && !isCorrect
                              ? { border: "1px solid rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.12)", color: "#fca5a5" }
                              : isLocked
                                ? { border: "1px solid rgba(201,162,39,0.45)", background: "rgba(201,162,39,0.10)", color: "var(--oly-gold-bright)" }
                                : { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.35)", color: "white" }
                        }
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>

                {previewPhase === "playing" && !previewLockedAnswer ? (
                  <p className="mt-3 text-center text-xs text-slate-500">Click an answer to lock it in</p>
                ) : null}

                {previewPhase === "playing" && previewLockedAnswer ? (
                  <p className="mt-3 text-center text-xs" style={{ color: "var(--oly-gold-dim)" }}>
                    Locked: {previewLockedAnswer} — waiting for clip to end…
                  </p>
                ) : null}

                {previewPhase === "revealed" ? (
                  <div className="mt-4 rounded-2xl px-4 py-3 text-center text-sm" style={{ border: "1px solid rgba(201,162,39,0.40)", background: "rgba(201,162,39,0.10)" }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--oly-gold-dim)" }}>Correct answer</p>
                    <p className="mt-1 text-lg font-bold" style={{ color: "var(--oly-gold-bright)" }}>{previewEntry.correct_answer}</p>
                    {previewLockedAnswer ? (
                      <p className="mt-1 text-xs text-slate-400">
                        You answered: <span style={{ color: previewLockedAnswer === previewEntry.correct_answer ? "var(--oly-gold-bright)" : "#fca5a5" }}>{previewLockedAnswer}</span>
                        {previewLockedAnswer === previewEntry.correct_answer ? " ✓ Correct!" : " ✗ Wrong"}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">No answer selected</p>
                    )}
                    <button
                      type="button"
                      onClick={closePreview}
                      className="mt-4 w-full rounded-2xl px-4 py-2.5 text-sm font-bold transition"
                      style={{ background: "linear-gradient(135deg, var(--oly-gold-dim) 0%, var(--oly-gold-bright) 100%)", color: "#0a0800" }}
                    >
                      Close preview
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
