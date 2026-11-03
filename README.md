# gaming — الأوراس، 1954

Frontend-only Three.js first-person stealth chapters (Vite + React 19 + TypeScript + Tailwind), Arabic/English RTL UI.

| Route | Chapter |
|---|---|
| `/` | **الفصل الأول · The Last Night** — carry Zahra's message to Ammar before dawn (stealth, unarmed). |
| `/barracks` | **الفصل الثاني · ليلة الفاتح · Night of the First** — on the 1 km² *Khenchela 1954* map, 31 Oct 1954, Dachra Ouled Moussa: Ben Boulaïd's meeting (portrait dialogue), escape the watched dachra with your 4-man squad, password «خالد عقبة» at the cemetery, mandatory recon, Chihani's plan, infiltrate the barracks, steal the maps and key from the HQ, seize the armory, plant charges on the vehicles, withdraw at midnight. |

Chapter II design document (systems, tuning numbers, beat chart, decision matrix): [`docs/chapter-2-night-of-the-first.md`](docs/chapter-2-night-of-the-first.md).

## Run

```bash
cd frontend
yarn install        # or: npm install --no-package-lock
yarn dev            # http://localhost:5173  and  /barracks
yarn typecheck && yarn lint && yarn build
```

## Layout

- `frontend/src/lib/night/*` — Chapter I level, guards, houses, figures, audio.
- `frontend/src/lib/barracks/*` — Chapter II: `terrain.ts` (Khenchela map terrain/roads, baked fields), `map.ts` (landmarks, collision + spatial index, enterable HQ, A* nav), `soldiers.ts` (garrison AI), `squad.ts` (AI squad), `story.ts` (cast, script), `level.ts` (engine, stage gating, cinematics, performance), `audio.ts`.
- `frontend/public/portraits/*` — character portrait cards (from the supplied artwork).
- `frontend/src/lib/lighting.ts`, `frontend/src/lib/ported/*` — shared lighting/post FX, terrain, vegetation, adobe PBR kit.
- `frontend/src/pages/LastNight.tsx`, `frontend/src/pages/Barracks.tsx` — UI.
- `memory/SPEC.md` — running spec.

Test hooks: `window.__night` (Chapter I) and `window.__barracks` (`teleport`, `skipTo`, `simulate`, `applyPlan`, `focus`, `debug`). Headless browsers use low-power mode; software GL is slow (10–30 s per frame in SwiftShader).
