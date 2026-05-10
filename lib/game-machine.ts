import type { RoomStatus } from "@/types/game";

// Normal flow: lobby → clip_playing → answering → revealed → (worthy_playing | clip_playing | finished)
// leaderboard is kept in the type but is not used in normal play.
export type GameEvent = "CREATE_ROOM" | "START_GAME" | "CLIP_END" | "ALL_ANSWERED" | "REVEAL" | "WORTHY" | "NEXT_ROUND" | "FINISH";

const TRANSITIONS: Record<RoomStatus, Partial<Record<GameEvent, RoomStatus>>> = {
  lobby: { START_GAME: "clip_playing" },
  playing: { CLIP_END: "answering" },
  clip_playing: { CLIP_END: "answering", ALL_ANSWERED: "answering" },
  answering: { REVEAL: "revealed" },
  revealed: { WORTHY: "worthy_playing", NEXT_ROUND: "clip_playing", FINISH: "finished" },
  leaderboard: { NEXT_ROUND: "clip_playing", FINISH: "finished" },
  worthy_playing: { NEXT_ROUND: "clip_playing", FINISH: "finished" },
  finished: {},
};

export function nextStatus(current: RoomStatus, event: GameEvent): RoomStatus {
  return TRANSITIONS[current][event] ?? current;
}

export function initialStatus(): RoomStatus {
  return "lobby";
}
