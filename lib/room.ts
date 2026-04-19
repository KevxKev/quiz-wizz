import type {
  LeaderboardEntry,
  QuizEntry,
  RoomPlayer,
  RoomStatus,
  Round,
  RoundAnswer,
  RoundState,
} from "@/types/game";

export const DEFAULT_ANSWERING_DURATION_SECONDS = 6;
export const DEFAULT_REVEAL_DURATION_SECONDS = 2;
export const DEFAULT_REPLAY_OVERLAP_SECONDS = 2;
export const DEFAULT_REPLAY_EXTENSION_SECONDS = 17;
export const DEFAULT_REPLAY_DURATION_SECONDS =
  DEFAULT_REPLAY_OVERLAP_SECONDS + DEFAULT_REPLAY_EXTENSION_SECONDS;
export const DEFAULT_ROUND_INTRO_DURATION_SECONDS = 1;
export const DEFAULT_LEADERBOARD_DURATION_SECONDS = 7;
export const DEFAULT_WORTHY_PLAYING_MAX_SECONDS = 360;
const MIN_CLIP_PLAY_DURATION_SECONDS = 5;

const QUIZ_ENTRY_STORAGE_KEY = "quiz-wizz-quiz-entries-v1";

function normalizeQuizEntry(entry: QuizEntry): QuizEntry {
  return {
    ...entry,
    answer_options: Array.isArray(entry.answer_options) ? entry.answer_options : [],
    is_active: entry.is_active ?? true,
  };
}

export function readStoredQuizEntries(): QuizEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(QUIZ_ENTRY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as QuizEntry[];
    return Array.isArray(parsed) ? parsed.map((entry) => normalizeQuizEntry(entry)) : [];
  } catch {
    return [];
  }
}

export function upsertStoredQuizEntry(entry: QuizEntry) {
  if (typeof window === "undefined") {
    return [] as QuizEntry[];
  }

  const normalizedEntry = normalizeQuizEntry(entry);
  const existing = readStoredQuizEntries();
  const nextEntries = [normalizedEntry, ...existing.filter((item) => item.id !== normalizedEntry.id)]
    .sort((left, right) => (right.created_at ?? "").localeCompare(left.created_at ?? ""));

  window.localStorage.setItem(QUIZ_ENTRY_STORAGE_KEY, JSON.stringify(nextEntries));
  return nextEntries;
}

export function removeStoredQuizEntry(entryId: string) {
  if (typeof window === "undefined") {
    return [] as QuizEntry[];
  }

  const nextEntries = readStoredQuizEntries().filter((entry) => entry.id !== entryId);
  window.localStorage.setItem(QUIZ_ENTRY_STORAGE_KEY, JSON.stringify(nextEntries));
  return nextEntries;
}

export function mergeQuizEntries(...entryGroups: QuizEntry[][]) {
  const entryById = new Map<string, QuizEntry>();

  for (const group of entryGroups) {
    for (const entry of group) {
      entryById.set(entry.id, normalizeQuizEntry(entry));
    }
  }

  return [...entryById.values()].sort((left, right) => (right.created_at ?? "").localeCompare(left.created_at ?? ""));
}

export function createLocalQuizEntry(entry: Omit<QuizEntry, "id"> & { id?: string }) {
  const entryId = entry.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return normalizeQuizEntry({
    ...entry,
    id: entryId,
    created_at: entry.created_at ?? new Date().toISOString(),
  });
}

export function generateRoomCode(length = 5): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < length; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
}

export function selectQuizEntryForRound(entries: QuizEntry[], roundNumber: number): QuizEntry | null {
  if (entries.length === 0) {
    return null;
  }

  return entries[(roundNumber - 1) % entries.length] ?? null;
}

export function buildRoundPayloadFromQuizEntry(
  roundNumber: number,
  entry: QuizEntry,
  state: RoundState = "clip_playing",
) {
  return {
    round_number: roundNumber,
    quiz_entry_id: entry.id.startsWith("local-") ? null : entry.id,
    prompt_text: entry.prompt_text,
    answer_options: [...entry.answer_options],
    correct_answer: entry.correct_answer,
    youtube_video_id: entry.youtube_video_id,
    clip_start_seconds: entry.clip_start_seconds,
    clip_end_seconds: entry.clip_end_seconds,
    playback_mode: entry.playback_mode,
    entry_title: entry.title ?? null,
    entry_artist: entry.artist ?? null,
    entry_category: entry.category ?? null,
    state,
  };
}

export function getClipPlayDurationSeconds(round: Pick<Round, "clip_start_seconds" | "clip_end_seconds">) {
  const startSeconds = Math.max(0, round.clip_start_seconds ?? 0);
  const endSeconds = Math.max(startSeconds + 1, round.clip_end_seconds ?? startSeconds + 15);
  return Math.max(MIN_CLIP_PLAY_DURATION_SECONDS, endSeconds - startSeconds);
}

export function getPhaseDurationSeconds(
  phase: RoomStatus,
  round?: Pick<Round, "clip_start_seconds" | "clip_end_seconds"> | null,
) {
  switch (phase) {
    case "playing":
      return DEFAULT_ROUND_INTRO_DURATION_SECONDS;
    case "clip_playing":
      return getClipPlayDurationSeconds(round ?? {});
    case "answering":
      return DEFAULT_ANSWERING_DURATION_SECONDS;
    case "revealed":
      return DEFAULT_REVEAL_DURATION_SECONDS + DEFAULT_REPLAY_DURATION_SECONDS;
    case "leaderboard":
      return DEFAULT_LEADERBOARD_DURATION_SECONDS;
    case "worthy_playing":
      return DEFAULT_WORTHY_PLAYING_MAX_SECONDS;
    default:
      return 0;
  }
}

export function createPhaseDeadline(durationSeconds: number, from = new Date()) {
  return new Date(from.getTime() + durationSeconds * 1000).toISOString();
}

export function getCountdownSeconds(phaseEndsAt?: string | null, nowMs = Date.now()) {
  if (!phaseEndsAt) {
    return null;
  }

  const diffMs = new Date(phaseEndsAt).getTime() - nowMs;
  return Math.max(0, Math.ceil(diffMs / 1000));
}

export function getPhaseProgressPercent(
  phaseStartedAt?: string | null,
  phaseEndsAt?: string | null,
  nowMs = Date.now(),
) {
  if (!phaseStartedAt || !phaseEndsAt) {
    return 100;
  }

  const startedAtMs = new Date(phaseStartedAt).getTime();
  const endsAtMs = new Date(phaseEndsAt).getTime();
  const totalDurationMs = Math.max(1, endsAtMs - startedAtMs);
  const remainingMs = Math.max(0, endsAtMs - nowMs);

  return Math.max(0, Math.min(100, (remainingMs / totalDurationMs) * 100));
}

export function getReplayWindow(round: Pick<Round, "clip_start_seconds" | "clip_end_seconds">) {
  const startSeconds = Math.max(0, round.clip_start_seconds ?? 0);
  const endSeconds = Math.max(startSeconds + 1, round.clip_end_seconds ?? startSeconds + 15);
  const replayStartSeconds = Math.max(startSeconds, endSeconds - DEFAULT_REPLAY_OVERLAP_SECONDS);
  const replayEndSeconds = Math.max(replayStartSeconds + 1, endSeconds + DEFAULT_REPLAY_EXTENSION_SECONDS);

  return {
    startSeconds: replayStartSeconds,
    endSeconds: replayEndSeconds,
  };
}

export function isRoundAnsweringOpen(status?: RoomStatus | null) {
  return status === "clip_playing" || status === "answering";
}

export function getRoomStatusLabel(status: RoomStatus) {
  switch (status) {
    case "lobby":
      return "Lobby";
    case "playing":
      return "Round intro";
    case "clip_playing":
      return "Clip playing";
    case "answering":
      return "Answering";
    case "revealed":
      return "Reveal";
    case "leaderboard":
      return "Leaderboard";
    case "worthy_playing":
      return "Worthy moment";
    case "finished":
      return "Finished";
    default:
      return status;
  }
}

export function buildLeaderboard(players: RoomPlayer[], rounds: Round[], answers: RoundAnswer[]): LeaderboardEntry[] {
  const roundById = new Map(rounds.map((round) => [round.id, round]));
  const entries = players
    .filter((player) => !player.is_host)
    .map<LeaderboardEntry>((player) => ({
      playerId: player.player_id,
      roomPlayerId: player.id,
      nickname: player.nickname,
      score: 0,
      correctCount: 0,
      answeredCount: 0,
    }));

  const entryByPlayerId = new Map(entries.map((entry) => [entry.playerId, entry]));

  for (const answer of answers) {
    const entry = entryByPlayerId.get(answer.player_id);
    const round = roundById.get(answer.round_id);

    if (!entry || !round) {
      continue;
    }

    if (round.state !== "revealed" && round.state !== "leaderboard" && round.state !== "closed") {
      continue;
    }

    entry.answeredCount += 1;

    if (round.correct_answer && answer.answer_text === round.correct_answer) {
      entry.score += 1;
      entry.correctCount += 1;
    }
  }

  return entries.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (right.correctCount !== left.correctCount) {
      return right.correctCount - left.correctCount;
    }

    return left.nickname.localeCompare(right.nickname);
  });
}

export function summarizeRoundReveal(players: RoomPlayer[], round: Round | null, answers: RoundAnswer[]) {
  if (!round?.correct_answer) {
    return {
      correctCount: 0,
      correctPlayerNames: [] as string[],
    };
  }

  const playerNameById = new Map(players.map((player) => [player.player_id, player.nickname]));
  const correctPlayerNames = answers
    .filter((answer) => answer.answer_text === round.correct_answer)
    .map((answer) => playerNameById.get(answer.player_id) ?? "Unknown player");

  return {
    correctCount: correctPlayerNames.length,
    correctPlayerNames,
  };
}
