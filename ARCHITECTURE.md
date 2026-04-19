# Architecture

## High-level structure
`Quiz Wizz` will use a simple web architecture focused on fast prototyping:

- **Frontend:** Next.js + React + TypeScript + Tailwind CSS
- **Backend/data:** Supabase Postgres + Realtime + Auth-free room flow for MVP
- **Media:** Embedded YouTube playback only

## App surfaces

### 1. Host screen (`/host`)
Used on the laptop connected to the TV.

Responsibilities:
- create or reopen a room
- start the game
- load a YouTube clip
- set `start_time` and `end_time`
- choose playback mode (`audio-only`, `video-only`, `audio-video`)
- reveal answers
- award points
- advance to next round

### 2. Player join page (`/join`)
Used on phones.

Responsibilities:
- enter room code
- enter display name
- join active room

### 3. Player answer page (`/answer`)
Used on phones once the round begins.

Responsibilities:
- show round status
- submit one answer for the current prompt
- lock input when time expires or host reveals

### 4. Submission page (`/submit`)
Used before the game to add hidden quiz entries.

Responsibilities:
- submit a YouTube URL
- add artist and song metadata
- optionally add a note/category
- keep entries hidden from the host until used

## Backend responsibilities
Supabase will handle:
- room state storage
- players and answers
- hidden submissions
- round records
- realtime updates to host and phones

## Realtime event flow
Use one room-scoped realtime channel per active game.

Example events:
- `room:updated`
- `player:joined`
- `round:started`
- `answer:submitted`
- `round:revealed`
- `score:updated`

## YouTube integration
Use embedded playback only through `react-youtube` / the YouTube iframe API.

For each question we store:
- `youtube_url`
- `youtube_video_id`
- `start_seconds`
- `end_seconds`
- `playback_mode`

### Playback modes
- **audio-only:** hide video visually, keep sound on
- **video-only:** mute audio
- **audio + video:** normal playback

## MVP design decisions
To keep V1 small:
- one room host at a time
- one active round at a time
- one answer per player per round
- no permanent user accounts required initially
- simple host-controlled scoring
- QR join flow can be generated later once room codes work

## Suggested folder direction
- `app/` — routes and pages
- `components/` — reusable UI and YouTube player wrapper
- `lib/` — Supabase client, helpers, room utilities
- `types/` — shared app/game types
