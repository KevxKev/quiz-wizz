# Data Model

## MVP approach
Keep the schema simple and centered around rooms, rounds, players, submissions, and answers.

## Proposed tables

### `rooms`
Represents an active or historical game room.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | primary key |
| `code` | `text` | short join code, unique |
| `name` | `text` | optional room label |
| `status` | `text` | `lobby`, `playing`, `revealed`, `finished` |
| `current_round_number` | `int` | starts at 0 |
| `created_at` | `timestamptz` | default now() |

### `players`
Phone participants inside a room.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | primary key |
| `room_id` | `uuid` | foreign key to `rooms.id` |
| `name` | `text` | display name |
| `score` | `int` | default 0 |
| `is_host` | `boolean` | usually false |
| `joined_at` | `timestamptz` | default now() |

### `submissions`
Hidden quiz entries submitted by friends.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | primary key |
| `room_id` | `uuid` | nullable if stored globally later |
| `submitted_by_name` | `text` | optional nickname |
| `youtube_url` | `text` | original link |
| `youtube_video_id` | `text` | parsed value |
| `artist_name` | `text` | correct answer for V1 |
| `song_title` | `text` | optional helper metadata |
| `start_seconds` | `int` | playback start |
| `end_seconds` | `int` | playback end |
| `playback_mode` | `text` | `audio-only`, `video-only`, `audio-video` |
| `status` | `text` | `pending`, `used`, `archived` |
| `created_at` | `timestamptz` | default now() |

### `rounds`
Represents a played round in a room.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | primary key |
| `room_id` | `uuid` | foreign key |
| `round_number` | `int` | 1-based order |
| `submission_id` | `uuid` | source hidden entry |
| `prompt_type` | `text` | V1 always `guess-the-artist` |
| `state` | `text` | `queued`, `active`, `revealed`, `closed` |
| `correct_artist` | `text` | stored for reveal |
| `started_at` | `timestamptz` | nullable |
| `revealed_at` | `timestamptz` | nullable |

### `answers`
One submitted answer per player per round.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | primary key |
| `round_id` | `uuid` | foreign key |
| `player_id` | `uuid` | foreign key |
| `answer_text` | `text` | player's guess |
| `is_correct` | `boolean` | set on reveal |
| `submitted_at` | `timestamptz` | default now() |

## Shared TypeScript direction
Recommended enums / unions:
- `RoomStatus = 'lobby' | 'playing' | 'revealed' | 'finished'`
- `PlaybackMode = 'audio-only' | 'video-only' | 'audio-video'`
- `RoundState = 'queued' | 'active' | 'revealed' | 'closed'`

## MVP notes
- Keep scoring stored directly on `players.score` at first.
- Only support one prompt type in V1.
- Add categories, packs, and moderation later if the game proves fun.
