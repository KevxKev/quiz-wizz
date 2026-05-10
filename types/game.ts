export type PlaybackMode = "audio-only" | "video-only" | "audio-video";

export type RoomStatus =
  | "lobby"
  | "playing"
  | "clip_playing"
  | "answering"
  | "revealed"
  | "leaderboard"
  | "worthy_playing"
  | "finished";

export type RoundState =
  | "queued"
  | "active"
  | "clip_playing"
  | "answering"
  | "revealed"
  | "leaderboard"
  | "closed";

export interface Room {
  id: string;
  code: string;
  status: RoomStatus;
  current_round_id?: string | null;
  current_round_number: number;
  total_rounds?: number | null;
  phase_started_at?: string | null;
  phase_ends_at?: string | null;
  winner_name?: string | null;
  created_at?: string;
}

export interface Player {
  id: string;
  nickname: string;
  created_at?: string;
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  player_id: string;
  nickname: string;
  is_host: boolean;
  is_ready?: boolean | null;
  worthy_vote?: boolean | null;
  joined_at?: string;
}

export interface QuizEntry {
  id: string;
  title?: string | null;
  artist?: string | null;
  category?: string | null;
  creator?: string | null;
  youtube_video_id: string;
  clip_start_seconds: number;
  clip_end_seconds: number;
  playback_mode: PlaybackMode;
  prompt_text: string;
  answer_options: string[];
  correct_answer: string;
  is_active?: boolean;
  created_at?: string;
}

export interface Round {
  id: string;
  room_id: string;
  round_number: number;
  quiz_entry_id?: string | null;
  prompt_text: string;
  answer_options: string[];
  correct_answer?: string | null;
  youtube_video_id?: string | null;
  clip_start_seconds?: number | null;
  clip_end_seconds?: number | null;
  playback_mode?: PlaybackMode | null;
  entry_title?: string | null;
  entry_artist?: string | null;
  entry_category?: string | null;
  state: RoundState;
  created_at?: string;
}

export interface RoundAnswer {
  id: string;
  room_id: string;
  round_id: string;
  player_id: string;
  answer_text: string;
  answered_after_ms?: number | null;
  created_at?: string;
}

export interface LeaderboardEntry {
  playerId: string;
  roomPlayerId: string;
  nickname: string;
  score: number;
  correctCount: number;
  answeredCount: number;
  avgAnswerMs?: number | null;
  lastRoundAnswerMs?: number | null;
}

export interface PlayerSession {
  roomId: string;
  roomCode: string;
  playerId: string;
  roomPlayerId: string;
  nickname: string;
}
