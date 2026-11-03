# الليلة الأخيرة · The Last Night — first-person night level (Ch1_MA_Last_Night)

Frontend-only Three.js experience (no backend endpoints, no auth, no persistence). Single route `*` → `pages/LastNight.tsx`.
Now a **complete stealth gameplay loop** (user request: «نظام لعب متكامل») using the buildings, terrain, grass and trees from the user's two HTML files. Replaced the earlier "End of Abyss" corridor.

## Files
- `src/lib/lighting.ts` — shared cinematic lighting system (from the corridor scene): noise textures, volumetric shaft shader,
  glow sprites, camera-wrapped particle field, bloom + teal grade/vignette/grain post stack, Flicker.
- `src/lib/night/world.ts` — layout data from the PDF (~132×96 m, +X east, −Z north, terrain rises ~12 m to the north):
  paths, water channel (الساقية), 12 houses, culvert, crossroads, eastern rock (6 m, boulder ramp from west), spring (العين),
  zones, `groundAt()` (terrain + platforms → walk height + surface), `zoneAt()`.
- `src/lib/night/level.ts` — NightLevel: sky dome w/ clouds, stars, moon + corona, distant ridges, moon directional light
  with shadows following the player, 2 lantern posts (culvert, crossroads), Zahra's door-ajar light, lit windows, Ammar's oil lamp,
  moon shafts (billboards fading near), dust motes, olive/cypress/prickly pear, stone walls (collidable), figures.
  FPS controller: pointer lock (falls back to keyboard if lock refused), WASD/arrows, Shift run, C/Ctrl crouch, Space jump,
  Esc pause; touch: left half drag = walk, right half = look. Step-height collision (houses/walls/rock sides block; ramp walkable).
  Dev hook: `window.__night.teleport(x, z, yaw, pitch)`.
- `src/lib/night/figures.ts` — silhouettes: Zahra (door of her house), Ammar (spring), gendarme at crossroads, patrol pair (one smoking) on the path east.
- `src/lib/night/audio.ts` — synthesized wind, distant dogs, owl, surface-aware footsteps (gravel/dirt/stone/water). Starts on first "Enter".

## UI (RTL Arabic + English)
Start/pause overlay (title, date line, Enter/Resume, controls), crosshair, sound toggle, night clock (23:12, +1 min / 10 s), place cards on entering zones.

## Download
`/last-night.zip` (frontend/public) — source snapshot without node_modules.

## Gameplay (v3)
- Ported modules: `src/lib/ported/greenworld.ts` (terrain splat shader, LOD grass+flowers, procedural oak/conifer/bush trees, rocks) and `src/lib/ported/adobe.ts` (procedural PBR plaster/lime/stone/wood, bevelled slabs with openings, pots). `src/lib/night/houses.ts` builds the 12 adobe houses from them.
- `src/lib/night/guards.ts`: 2-man patrol crossroads⇄culvert (hand lantern, pauses 35 s / 25 s), post guard at crossroads sweeping ±70°. Vision 15 m / 90° + line of sight; suspicion meter; gravel noise; crouch-in-shadow invisible beyond 3 m.
- Stages: reach culvert → reach Zahra (E) → dialogue choice promise (+3 trust, opens west-wall passage at (-15,-20), stage observe) / rush (stage deliver) → observe: crouch atop Eastern Rock looking at patrol 6 s (+4 trust, checkpoint) → deliver to Ammar (E) → ending. Holds if observed && trust(+2 if never caught) ≥ 10, else Tense.
- Checkpoints: start, after Zahra, after observation. Caught or dawn (04:45, 1 game-min / 2.5 s) → back to checkpoint (catches persist).
- Test hooks: `window.__night` (teleport, game, interact, resolveZahra, finishAmmar). Headless browsers auto-use low-power mode; first load ~35 s in software GL.

## Chapter II — «ليلة الفاتح · Night of the First» (`/barracks`)
User request: full gameplay system + tightly designed mini-level: escape surveillance → secret meetings → planning → attack the barracks → seize weapons (stealth, guerrilla, firefight, escape). Barracks layout from the user's "Barracks Courtyard – Level Design" blueprint, shifted 55 m north.
- Beats: watched safe house (informer, gendarme patrol, lantern post) → Messaoud at the cemetery (password, binoculars, key intel) → optional recon from Crow's Kef (mark guards) → Rabah password + Si Lakhdar at the olive mill → planning board (entry: drain / north wire / gate assault; Saïd: fire diversion / cut phone / cover retreat; wrong password locks "cover") → infiltrate (key from dozing officer or 6 s forced lock, optional generator = lights out) → 3 racks × 4 rifles → 25 s discovery timer → siren, sleepers, reinforcements unless phone cut → rally point on the mountain trail. Endings: Ghost / Guerrilla War / Out With the Guns.
- Systems: light/shadow/noise perception with terrain line of sight, AI states (calm/investigate/alert/hunt/search/divert/down), bodies, 2.6 s shout window, alarm ladder 0–3, attack tokens (max 3 shooters), searchlights, allies' covering fire, pistol/MAS-36, takedowns, checkpoints (start/meet/plan/inside/armory).
- Full design doc: `docs/chapter-2-night-of-the-first.md`. Test hooks: `window.__barracks`.

### Chapter II v2 (follow-up request: tight progression, squad AI, HQ intel, vehicle charges, no stutter, AAA story with portraits)
- Prologue at the Ben Chaïba house (Dachra Ouled Moussa, 31 Oct 1954) with Ben Boulaïd, Chihani, Laghrour, Adjoul, Boucetta; password «خالد عقبة». Portrait cards in `public/portraits/` (cropped from the user's artwork), cinematic camera focus per line, letterbox, typewriter.
- Stages: prologue → escape → meet (Mroud Al-Azawi, password) → recon (mark 5 from Crow's Kef, moved to (-76,6) out of tower range) → plan (Chihani) → infiltrate → hq (maps + safe key; optional informers' register, radio) → armory (key-only iron door, squad within 12 m) → sabotage (3 charges) → exfil (60 s timer, explosion at "00:00", ending at rally). Restricted zone around the compound before the plan (6 s → "compromised").
- Squad (`squad.ts`): Laghrour + Adjoul from the start, Azawi joins at the cemetery; formation follow, posture mirroring, Q follow/hold, Z silent strike on marked unaware soldiers, covering fire after the siren; invisible to guards before the siren.
- Performance: static mesh batching, shader precompile, dynamic resolution, A* budget, grass streaming budget, HUD diffing.
