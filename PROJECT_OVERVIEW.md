# Quiz Wizz — Project Overview

## What this app is
`Quiz Wizz` is a private, browser-based party quiz game for use at home or at friends' houses. One laptop acts as the host screen on a TV, while players join from their phones using a room code or QR code.

The quiz prompt for each round is a timed YouTube clip. In version 1, the only gameplay mode is **guess the artist**.

## Version 1 goal
Ship the **smallest playable version** quickly.

### In scope for V1
- Host screen webpage
- Phone join page
- Phone answer page
- Hidden submission page for friends to add quiz entries
- Timed YouTube playback using embedded video only
- Playback modes:
  - audio only
  - video only
  - audio + video
- Real-time sync between host and phones
- Basic score tracking
- One question type: `guess the artist`

### Non-goals for V1
- Native mobile apps
- Apple TV app
- Audio upload or video upload
- Downloading or rehosting YouTube content
- Multiple quiz modes at launch
- Complex moderation or admin systems
- Fancy animations before gameplay is working

## Product rules
- Keep scope tight.
- Prefer simple decisions that help V1 ship faster.
- Optimize for a playable home party experience first.
- Build hidden submissions so the host can still be surprised.

## Success criteria for the first playable build
A host can:
1. create a room,
2. load a YouTube clip with start/end times,
3. choose playback mode,
4. let players join from phones,
5. collect answers in real time,
6. reveal the correct artist,
7. award points and continue to the next round.
