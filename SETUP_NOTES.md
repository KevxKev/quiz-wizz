# Setup Notes

## Current stack
- Next.js 16
- React 19
- TypeScript 5
- Tailwind CSS 4
- Supabase JS client
- `react-youtube` for embedded playback

## Local requirements
- Node.js 20+
- npm 10+
- A Supabase project for database + realtime
- Modern browser on laptop and phones

## Environment variables
Create a `.env.local` file from `.env.local.example`.

Use this exact local-development shape:

```env
NEXT_PUBLIC_SITE_URL=http://192.168.2.15:3001
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
# Optional later for server-side admin tasks only
SUPABASE_SERVICE_ROLE_KEY=
```

Where to find the real values:
- Supabase Dashboard → **Project Settings** → **API**
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional later:
- `SUPABASE_SERVICE_ROLE_KEY` for trusted server-side admin actions only

## Core dependencies already installed
- `next`
- `react`
- `react-dom`
- `typescript`
- `tailwindcss`
- `@supabase/supabase-js`
- `react-youtube`

## Local run commands
```bash
npm install
npm run dev:lan
```

Recommended for phone testing on your home Wi-Fi:
- Host: `http://192.168.2.15:3001/host`
- Join: `http://192.168.2.15:3001/join`

If you are only testing on the same PC, `npm run dev` is still fine.

## Near-term setup notes
1. Run the SQL in `supabase/schema.sql` inside the Supabase SQL Editor.
2. Add the required values to `.env.local`.
3. Restart the app with `npm run dev:lan`.
4. Open `/host`, create a room, and verify the banner says Supabase is detected.
5. Join from `/join` on another browser or phone and confirm the host sees the player appear in real time.

## Future notes
- Add a simple QR code generator once room codes are working.
- Keep host controls keyboard-friendly for TV/laptop use.
- Avoid adding auth until the basic party loop is fun.
