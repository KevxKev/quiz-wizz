"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { OlympusBackground } from "@/components/ui";

import {
  createLocalQuizEntry,
  mergeQuizEntries,
  readStoredQuizEntries,
  removeStoredQuizEntry,
  upsertStoredQuizEntry,
} from "@/lib/room";
import {
  formatSupabaseErrorMessage,
  getSupabaseBrowserClient,
  getSupabaseSetupMessage,
  isSupabaseSchemaError,
} from "@/lib/supabase";
import { parseClockInputToSeconds } from "@/lib/time";
import { getPlaybackModeLabel, parseYouTubeVideoId, validateClipRange } from "@/lib/youtube";
import type { PlaybackMode, QuizEntry } from "@/types/game";

const DEFAULT_OPTIONS = ["", "", "", ""];

export default function SubmitPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const lastFetchedVideoIdRef = useRef<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("https://www.youtube.com/watch?v=M7lc1UVf-VE");
  const [startTimeInput, setStartTimeInput] = useState("00:00");
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("audio-video");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [creator, setCreator] = useState("");
  const [category, setCategory] = useState("Music");
  const [questionText, setQuestionText] = useState("Which artist performs this clip?");
  const [answerOptions, setAnswerOptions] = useState<string[]>([...DEFAULT_OPTIONS]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [statusMessage, setStatusMessage] = useState("Create a real quiz entry here, then start a room round from `/host`.");
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [savedEntries, setSavedEntries] = useState<QuizEntry[]>([]);
  const [editingEntry, setEditingEntry] = useState<QuizEntry | null>(null);

  const parsedVideoId = useMemo(() => parseYouTubeVideoId(youtubeUrl), [youtubeUrl]);
  const startSeconds = useMemo(() => parseClockInputToSeconds(startTimeInput), [startTimeInput]);
  // End time is always start + 15 seconds — fixed snippet length
  const endSeconds = startSeconds !== null ? startSeconds + 15 : null;

  const validationMessage = useMemo(() => {
    if (!parsedVideoId) {
      return "Enter a valid YouTube URL or raw 11-character video ID.";
    }

    if (startSeconds === null) {
      return "Use `mm:ss` format for the start time, for example `00:10` or `01:05`.";
    }

    return null;
  }, [parsedVideoId, startSeconds]);

  const usableOptions = answerOptions.map((option) => option.trim()).filter(Boolean);

  // Auto-fetch video title and artist from YouTube oEmbed when a valid video ID is pasted
  useEffect(() => {
    if (!parsedVideoId || parsedVideoId === lastFetchedVideoIdRef.current) return;
    lastFetchedVideoIdRef.current = parsedVideoId;
    setIsFetchingMeta(true);
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${parsedVideoId}&format=json`)
      .then((r) => r.json() as Promise<{ title?: string; author_name?: string }>)
      .then((data) => {
        const videoTitle = data.title ?? "";
        const channelName = data.author_name ?? "";
        const dashIdx = videoTitle.indexOf(" - ");
        if (dashIdx !== -1) {
          setArtist(videoTitle.slice(0, dashIdx).trim());
          setTitle(videoTitle.slice(dashIdx + 3).trim());
        } else {
          setTitle(videoTitle);
          setArtist(channelName);
        }
      })
      .catch(() => { /* silently fail */ })
      .finally(() => setIsFetchingMeta(false));
  }, [parsedVideoId]);

  const loadSavedEntries = useCallback(async () => {
    const localEntries = readStoredQuizEntries();

    if (!supabase) {
      setSavedEntries(localEntries.slice(0, 8));
      return;
    }

    const { data, error } = await supabase
      .from("quiz_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error || !data) {
      setSavedEntries(localEntries.slice(0, 8));
      return;
    }

    const remoteEntries = (data as QuizEntry[]).map((entry) => ({
      ...entry,
      answer_options: Array.isArray(entry.answer_options) ? (entry.answer_options as string[]) : [],
    }));

    setSavedEntries(mergeQuizEntries(remoteEntries, localEntries).slice(0, 8));
  }, [supabase]);

  useEffect(() => {
    void loadSavedEntries();
  }, [loadSavedEntries]);

  const handleOptionChange = (index: number, value: string) => {
    setAnswerOptions((current) => current.map((option, optionIndex) => (optionIndex === index ? value : option)));
  };

  const handleEditEntry = (entry: QuizEntry) => {
    setEditingEntry(entry);
    setYoutubeUrl(`https://www.youtube.com/watch?v=${entry.youtube_video_id}`);
    setStartTimeInput(String(Math.floor((entry.clip_start_seconds ?? 0) / 60)).padStart(2, "0") + ":" + String((entry.clip_start_seconds ?? 0) % 60).padStart(2, "0"));
    setPlaybackMode(entry.playback_mode ?? "audio-video");
    setTitle(entry.title ?? "");
    setArtist(entry.artist ?? "");
    setCreator(entry.creator ?? "");
    setCategory(entry.category ?? "Music");
    setQuestionText(entry.prompt_text);
    const opts = [...entry.answer_options];
    while (opts.length < 4) opts.push("");
    setAnswerOptions(opts.slice(0, 4));
    setCorrectAnswer(entry.correct_answer ?? "");
    setStatusMessage(`Editing: ${entry.title || entry.prompt_text}`);
    lastFetchedVideoIdRef.current = entry.youtube_video_id;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    setTitle("");
    setArtist("");
    setCreator("");
    setCategory("Music");
    setQuestionText("Which artist performs this clip?");
    setAnswerOptions([...DEFAULT_OPTIONS]);
    setCorrectAnswer("");
    setYoutubeUrl("https://www.youtube.com/watch?v=M7lc1UVf-VE");
    setStartTimeInput("00:00");
    setPlaybackMode("audio-video");
    setStatusMessage("Edit cancelled. Create a new quiz entry here.");
  };

  const handleDeleteEntry = async (entry: QuizEntry) => {
    setDeletingEntryId(entry.id);
    setStatusMessage(`Deleting ${entry.title || entry.prompt_text}...`);

    try {
      if (supabase && !entry.id.startsWith("local-")) {
        const { error } = await supabase.from("quiz_entries").delete().eq("id", entry.id);

        if (error) {
          throw error;
        }
      }

      removeStoredQuizEntry(entry.id);
      setStatusMessage(`Deleted ${entry.title || entry.prompt_text}.`);
      await loadSavedEntries();
    } catch (error) {
      setStatusMessage(formatSupabaseErrorMessage(error, "Could not delete the quiz entry."));
    } finally {
      setDeletingEntryId(null);
    }
  };

  const handleCreateEntry = async () => {
    if (!supabase) {
      setStatusMessage(getSupabaseSetupMessage());
      return;
    }

    if (validationMessage || !parsedVideoId || startSeconds === null || endSeconds === null) {
      setStatusMessage(validationMessage ?? "Check the YouTube clip settings and try again.");
      return;
    }

    if (!creator.trim()) {
      setStatusMessage("Enter your name in the Creator field before saving.");
      return;
    }

    if (!questionText.trim()) {
      setStatusMessage("Enter the question text for this quiz entry.");
      return;
    }

    if (usableOptions.length !== 4) {
      setStatusMessage("Fill in all four answer choices before saving.");
      return;
    }

    if (!correctAnswer || !usableOptions.includes(correctAnswer)) {
      setStatusMessage("Pick which of the four answers is correct.");
      return;
    }

    setIsSaving(true);
    setStatusMessage(editingEntry ? "Updating quiz entry..." : "Saving quiz entry...");

    try {
      const payload = {
        title: title.trim() || null,
        artist: artist.trim() || null,
        creator: creator.trim(),
        category: category.trim() || null,
        youtube_video_id: parsedVideoId,
        clip_start_seconds: startSeconds,
        clip_end_seconds: endSeconds,
        playback_mode: playbackMode,
        prompt_text: questionText.trim(),
        answer_options: usableOptions,
        correct_answer: correctAnswer,
        is_active: true,
      };

      if (editingEntry) {
        // ── Update existing entry ────────────────────────────────────
        const updatedEntry: QuizEntry = { ...editingEntry, ...payload };

        if (supabase && !editingEntry.id.startsWith("local-")) {
          const { error } = await supabase
            .from("quiz_entries")
            .update(payload)
            .eq("id", editingEntry.id);

          if (error) {
            throw error;
          }
        }

        upsertStoredQuizEntry(updatedEntry);
        setEditingEntry(null);
        setStatusMessage("Quiz entry updated successfully.");
        setTitle("");
        setArtist("");
        setCreator("");
        setCategory("Music");
        setQuestionText("Which artist performs this clip?");
        setAnswerOptions([...DEFAULT_OPTIONS]);
        setCorrectAnswer("");
        await loadSavedEntries();
      } else {
        // ── Create new entry ─────────────────────────────────────────
        const { data, error } = await supabase
          .from("quiz_entries")
          .insert(payload)
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        upsertStoredQuizEntry({
          ...(data as QuizEntry),
          answer_options: Array.isArray(data.answer_options) ? (data.answer_options as string[]) : usableOptions,
        });

        setStatusMessage("Quiz entry saved to Supabase and will stay available for future rounds.");
        setTitle("");
        setArtist("");
        setCreator("");
        setCategory("Music");
        setQuestionText("Which artist performs this clip?");
        setAnswerOptions([...DEFAULT_OPTIONS]);
        setCorrectAnswer("");
        await loadSavedEntries();
      }
    } catch (error) {
      const fallbackEntry = createLocalQuizEntry({
        title: title.trim() || null,
        artist: artist.trim() || null,
        creator: creator.trim() || null,
        category: category.trim() || null,
        youtube_video_id: parsedVideoId,
        clip_start_seconds: startSeconds ?? 0,
        clip_end_seconds: endSeconds ?? 15,
        playback_mode: playbackMode,
        prompt_text: questionText.trim(),
        answer_options: usableOptions,
        correct_answer: correctAnswer,
        is_active: true,
      });

      upsertStoredQuizEntry(fallbackEntry);

      const message = formatSupabaseErrorMessage(error, "Could not save the quiz entry.");
      setStatusMessage(
        isSupabaseSchemaError(error)
          ? `${message} The entry was still saved locally on this browser, so you can use it right away from /host.`
          : `${message} The entry was also cached locally on this browser as a fallback.`,
      );
      await loadSavedEntries();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--oly-night-base)] px-4 py-10 text-slate-50 sm:px-6">
      <OlympusBackground showParticles />
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header
          className="rounded-3xl p-6"
          style={{ background: "rgba(5,3,18,0.65)", border: "1px solid rgba(201,162,39,0.15)", backdropFilter: "blur(8px)" }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.5em]" style={{ color: "var(--oly-gold-dim)" }}>✦ &nbsp; Olympus Night &nbsp; ✦</p>
          <h1 className="mt-2 text-3xl font-bold">Add Sacred Entries</h1>
          <p className="mt-2 text-sm text-slate-300">
            Save reusable question content here, then start a room round from the host screen.
          </p>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section
            className="rounded-3xl p-6"
            style={{ background: "rgba(5,3,18,0.65)", border: "1px solid rgba(201,162,39,0.15)", backdropFilter: "blur(8px)" }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="youtube-url" className="mb-2 block text-sm font-semibold text-slate-200">
                  YouTube URL or video ID
                </label>
                <input
                  id="youtube-url"
                  type="text"
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </div>

              <div>
                <label htmlFor="start-time" className="mb-2 block text-sm font-semibold text-slate-200">
                  Start time (`mm:ss`)
                </label>
                <input
                  id="start-time"
                  type="text"
                  value={startTimeInput}
                  onChange={(event) => setStartTimeInput(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </div>

              <div>
                <label htmlFor="playback-mode" className="mb-2 block text-sm font-semibold text-slate-200">
                  Play mode
                </label>
                <select
                  id="playback-mode"
                  value={playbackMode}
                  onChange={(event) => setPlaybackMode(event.target.value as PlaybackMode)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                >
                  <option value="audio-only">Audio only</option>
                  <option value="video-only">Video only</option>
                  <option value="audio-video">Audio + video</option>
                </select>
              </div>

              <div>
                <label htmlFor="entry-title" className="mb-2 block text-sm font-semibold text-slate-200">
                  Song title {isFetchingMeta ? <span className="text-[10px] font-normal text-slate-400">(fetching…)</span> : null}
                </label>
                <input
                  id="entry-title"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Never Gonna Give You Up"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </div>

              <div>
                <label htmlFor="artist" className="mb-2 block text-sm font-semibold text-slate-200">
                  Artist {isFetchingMeta ? <span className="text-[10px] font-normal text-slate-400">(fetching…)</span> : null}
                </label>
                <input
                  id="artist"
                  type="text"
                  value={artist}
                  onChange={(event) => setArtist(event.target.value)}
                  placeholder="Rick Astley"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </div>

              <div>
                <label htmlFor="creator" className="mb-2 block text-sm font-semibold text-slate-200">
                  Created by <span className="text-rose-400">*</span>
                </label>
                <input
                  id="creator"
                  type="text"
                  value={creator}
                  onChange={(event) => setCreator(event.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </div>

              <div>
                <label htmlFor="category" className="mb-2 block text-sm font-semibold text-slate-200">
                  Category (optional)
                </label>
                <input
                  id="category"
                  type="text"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Music"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="question-text" className="mb-2 block text-sm font-semibold text-slate-200">
                  Question text
                </label>
                <textarea
                  id="question-text"
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </div>

              {answerOptions.map((option, index) => (
                <div key={`answer-option-${index}`}>
                  <label htmlFor={`answer-option-${index}`} className="mb-2 block text-sm font-semibold text-slate-200">
                    Answer {index + 1}
                  </label>
                  <input
                    id={`answer-option-${index}`}
                    type="text"
                    value={option}
                    onChange={(event) => handleOptionChange(index, event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                  />
                </div>
              ))}

              <div className="md:col-span-2">
                <label htmlFor="correct-answer" className="mb-2 block text-sm font-semibold text-slate-200">
                  Correct answer
                </label>
                <select
                  id="correct-answer"
                  value={correctAnswer}
                  onChange={(event) => setCorrectAnswer(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                >
                  <option value="">Select the correct choice</option>
                  {usableOptions.map((option, index) => (
                    <option key={`correct-${index}-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${validationMessage ? "border-rose-500/40 bg-rose-500/10 text-rose-100" : "border-white/10 bg-black/25 text-slate-300"}`}>
              {validationMessage
                ? validationMessage
                : `Video ID: ${parsedVideoId} • starts at ${startSeconds}s • 15s clip • ${getPlaybackModeLabel(playbackMode)}`}
            </div>

            <div className="mt-4 rounded-2xl border border-white/8 bg-black/25 p-4 text-sm text-slate-300">
              {statusMessage}
            </div>

            {editingEntry ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCreateEntry}
                  disabled={isSaving || !supabase}
                  className="flex-1 rounded-2xl px-5 py-3 text-sm font-bold transition-all disabled:cursor-not-allowed"
                  style={{
                    background: "linear-gradient(135deg, #b8860b 0%, var(--oly-gold) 50%, var(--oly-gold-bright) 100%)",
                    boxShadow: "var(--oly-glow-gold)",
                    color: "#0a0800",
                  }}
                >
                  {isSaving ? "Updating…" : "Update sacred entry"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded-2xl px-4 py-3 text-sm font-semibold transition"
                  style={{ border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)" }}
                >
                  Cancel edit
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleCreateEntry}
                disabled={isSaving || !supabase}
                className="mt-4 w-full rounded-2xl px-5 py-3 text-sm font-bold transition-all disabled:cursor-not-allowed"
                style={
                  isSaving || !supabase
                    ? { background: "rgba(30,25,50,0.80)", color: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.06)" }
                    : {
                        background: "linear-gradient(135deg, var(--oly-gold-dim) 0%, var(--oly-gold) 50%, var(--oly-gold-bright) 100%)",
                        boxShadow: "var(--oly-glow-gold)",
                        color: "#0a0800",
                      }
                }
              >
                {isSaving ? "Saving entry…" : "Save sacred entry ✦"}
              </button>
            )}
          </section>

          <aside className="space-y-6">
            <section
              className="rounded-3xl p-5"
              style={{ background: "rgba(5,3,18,0.65)", border: "1px solid rgba(201,162,39,0.15)", backdropFilter: "blur(8px)" }}
            >
              <h2 className="text-lg font-bold" style={{ color: "var(--oly-gold-bright)" }}>Recent sacred entries</h2>
              <p className="mt-1 text-sm text-slate-400">Stored entries are reusable across rooms and persist in Supabase once saved there.</p>

              {savedEntries.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No entries saved yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {savedEntries.map((entry) => (
                    <li key={entry.id} className="rounded-2xl p-3 text-sm" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(201,162,39,0.10)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{entry.title || entry.prompt_text}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {entry.artist || "Unknown artist"} • {entry.category || "Uncategorized"}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEditEntry(entry)}
                            disabled={editingEntry?.id === entry.id || deletingEntryId === entry.id}
                            className="rounded-lg px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                            style={{ border: "1px solid rgba(201,162,39,0.30)", color: "var(--oly-gold-bright)" }}
                          >
                            {editingEntry?.id === entry.id ? "Editing…" : "Edit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteEntry(entry)}
                            disabled={deletingEntryId === entry.id}
                            className="rounded-lg border border-rose-500/40 px-2 py-1 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingEntryId === entry.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {entry.youtube_video_id} • starts {entry.clip_start_seconds}s • 15s clip • {getPlaybackModeLabel(entry.playback_mode)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {entry.creator ? `By ${entry.creator} · ` : ""}Stored in {entry.id.startsWith("local-") ? "this browser fallback" : "Supabase"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <Link
                href="/entries"
                className="mt-5 flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition"
                style={{ border: "1px solid rgba(201,162,39,0.25)", color: "var(--oly-gold-dim)" }}
              >
                See all entries →
              </Link>
            </section>

            <section
              className="rounded-3xl p-5 text-sm text-slate-200"
              style={{ background: "rgba(5,3,18,0.55)", border: "1px solid rgba(201,162,39,0.13)", backdropFilter: "blur(6px)" }}
            >
              <p>Next step after saving:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-300">
                <li>Open `/host`</li>
                <li>Create a room</li>
                <li>Click <span className="font-semibold text-white">Start round</span></li>
                <li>The saved YouTube-backed entry will drive the round</li>
              </ol>
              <Link href="/host" className="mt-4 inline-flex text-sm font-semibold" style={{ color: "var(--oly-gold-bright)" }}>
                Go to host screen →
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
