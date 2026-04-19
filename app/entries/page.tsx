"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { OlympusBackground } from "@/components/ui";
import { mergeQuizEntries, readStoredQuizEntries, removeStoredQuizEntry } from "@/lib/room";
import {
  formatSupabaseErrorMessage,
  getSupabaseBrowserClient,
} from "@/lib/supabase";
import { getPlaybackModeLabel } from "@/lib/youtube";
import type { QuizEntry } from "@/types/game";

export default function EntriesPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [entries, setEntries] = useState<QuizEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

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
          <div className="flex shrink-0 items-center gap-3">
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
                    <Link
                      href={`/submit?edit=${entry.id}`}
                      className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
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
    </main>
  );
}
