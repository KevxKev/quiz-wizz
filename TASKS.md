# Tasks

## Phase 0 — Setup ✅
- [x] Create Next.js + TypeScript + Tailwind app
- [x] Add Supabase and YouTube dependencies
- [x] Create planning and architecture docs

## Phase 1 — First implementation priority
Build the host playback prototype first.

- [ ] Create `/host` page layout
- [ ] Add embedded YouTube player component
- [ ] Parse YouTube URL into `videoId`
- [ ] Support configurable `start_seconds` and `end_seconds`
- [ ] Add playback mode toggle:
  - [ ] audio only
  - [ ] video only
  - [ ] audio + video
- [ ] Add simple local host controls: play, pause, stop, reset clip

## Phase 2 — Basic multiplayer loop
- [ ] Create room code flow
- [ ] Create `/join` page
- [ ] Create `/answer` page
- [ ] Connect host and phones with Supabase Realtime
- [ ] Show live player list on host screen
- [ ] Lock answers when round ends

## Phase 3 — Quiz data and submissions
- [ ] Create submission form at `/submit`
- [ ] Save hidden entries to Supabase
- [ ] Let host choose from hidden submissions without spoilers
- [ ] Store correct artist answer per round

## Phase 4 — Scoring and reveal
- [ ] Reveal correct answer on host screen
- [ ] Mark which players were correct
- [ ] Update scores
- [ ] Show leaderboard
- [ ] Add next-round flow

## Phase 5 — Make it party-ready
- [ ] Add QR code join link
- [ ] Improve mobile layout
- [ ] Add better loading/error states
- [ ] Add empty-state seed data for testing
- [ ] Polish host controls for couch/TV use

## Recommended implementation order
1. Host page + YouTube timed playback
2. Room state in Supabase
3. Join flow
4. Answer submission flow
5. Reveal + score tracking
6. Hidden submissions
