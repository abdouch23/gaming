# gaming — الأوراس، 1954

Frontend-only Three.js first-person stealth chapters (Vite + React 19 + TypeScript + Tailwind), Arabic/English RTL UI.

| Route | Chapter |
|---|---|
| `/` | **الفصل الأول · The Last Night** — carry Zahra's message to Ammar before dawn (stealth, unarmed). |
| `/barracks` | **الفصل الثاني · ليلة الفاتح · Night of the First** — escape the watched house, secret meetings, recon with binoculars, plan the raid, infiltrate the barracks, seize the armory, fight your way to the mountains. |

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
- `frontend/src/lib/barracks/*` — Chapter II: `map.ts` (layout, collision, line of sight, A* nav), `soldiers.ts` (garrison AI, alarm ladder, attack tokens, searchlights), `level.ts` (engine), `audio.ts`.
- `frontend/src/lib/lighting.ts`, `frontend/src/lib/ported/*` — shared lighting/post FX, terrain, vegetation, adobe PBR kit.
- `frontend/src/pages/LastNight.tsx`, `frontend/src/pages/Barracks.tsx` — UI.
- `memory/SPEC.md` — running spec.

Test hooks: `window.__night` (Chapter I) and `window.__barracks` (`teleport`, `skipTo`, `simulate`, `applyPlan`, `debug`). Headless browsers use low-power mode; software GL is slow (10–30 s per frame in SwiftShader).
