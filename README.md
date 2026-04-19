# Quiz Wizz

A private web-based party quiz game for home use and friend gatherings.

One browser acts as the **host screen** on a TV-connected laptop, while players join from their phones using a room code. Version 1 focuses on a fast, playable music quiz flow using **embedded YouTube clips** and one prompt type: **guess the artist**.

## Stack
- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase Realtime

## Run locally
```bash
npm install
npm run dev:lan
```

For normal home-network phone testing, use:
- Host screen: [http://192.168.2.15:3001/host](http://192.168.2.15:3001/host)
- Phone join page: [http://192.168.2.15:3001/join](http://192.168.2.15:3001/join)
- Song set up page: http://192.168.2.15:3001/submit

If you are only testing on the same computer, plain `npm run dev` is still fine.

## Supabase local setup
Create a `.env.local` file in the project root with:

```env
NEXT_PUBLIC_SITE_URL=http://192.168.2.15:3001
NEXT_PUBLIC_SUPABASE_URL=https://crhegicaguxogvjjgube.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_8vhDd7WIvT1zrOBQEHF3wQ_xkdahfx-
```

### Where to find the values
In the Supabase dashboard:
1. Open your project
2. Go to **Project Settings** → **API**
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Project API Keys** → **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### SQL to run
Open **SQL Editor** in Supabase and run the contents of:
- `supabase/schema.sql`

After saving `.env.local`, restart the app:

```bash
npm run dev:lan
```

## Planned routes
- `/` — project landing page
- `/host` — host screen
- `/join` — player join page
- `/answer` — player answer page
- `/submit` — manual quiz-entry admin page for creating real YouTube-backed rounds

## Project docs
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE.md`
- `TASKS.md`
- `DATA_MODEL.md`
- `GAME_FLOW.md`
- `SETUP_NOTES.md`

## Real quiz entry flow
1. Run the latest `supabase/schema.sql` in the Supabase SQL Editor so the `quiz_entries` table and round clip fields exist.
2. Open `/submit` and save a real YouTube-backed quiz entry.
3. Open `/host`, create a room, and click **Start round**.
4. The host will pull a saved quiz entry, auto-load the configured YouTube clip, and run the normal answer → reveal → leaderboard loop.

## Current milestone status
Working now:
- room creation
- player join
- real stored quiz entries from Supabase
- YouTube-backed round playback on the host
- answer submission
- reveal + scoring + leaderboard
