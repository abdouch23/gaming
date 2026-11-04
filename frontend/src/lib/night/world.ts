// World layout for Ch1_MA_Last_Night — «الليلة الأخيرة», an Aurès douar (~140 × 100 m).
// Axes: +X east, −Z north. Terrain rises ~12 m from south to north.

export type V2 = [number, number];

export const MAP = { minX: -66, maxX: 66, minZ: -48, maxZ: 48 };

export const MAIN_PATH: V2[] = [[-75, 24], [-48, 27], [-25, 18], [-8, 14], [5, 12], [22, 10], [40, 5], [52, 2], [75, -2]];
export const START_PATH: V2[] = [[-56, 40], [-51, 33], [-47, 27]];
export const VILLAGE_PATH: V2[] = [[5, 12], [7, 2], [11, -10], [12, -22], [10, -34], [10, -44]];
export const ROCK_PATH: V2[] = [[40, 5], [38, -3], [40, -6]];
export const DITCH: V2[] = [[8, -45], [-2, -30], [-12, -12], [-20, 4], [-25, 18], [-30, 32], [-38, 52]];

export const SPAWN = { x: -55, z: 39, yaw: -0.62 };

export const CULVERT = { x: -25, z: 18 };
export const CROSSROADS = { x: 5, z: 12 };
export const SPRING = { x: 9, z: -45 };
export const ROCK = { x: 50, z: -6, half: 2.5, height: 6 };

export interface House {
  x: number; z: number; w: number; d: number; h: number;
  door: "n" | "s" | "e" | "w";
  lit?: boolean;
  zahra?: boolean;
}

export const HOUSES: House[] = [
  { x: -6, z: -8, w: 6, d: 5, h: 3.2, door: "s", zahra: true },
  { x: 1, z: -3.5, w: 5, d: 5, h: 2.9, door: "e" },
  { x: 0, z: -14, w: 6, d: 6, h: 3.4, door: "e", lit: true },
  { x: -8, z: -18.5, w: 5, d: 6, h: 3.0, door: "s" },
  { x: 2, z: -24, w: 6, d: 5, h: 3.1, door: "e" },
  { x: -5, z: -29, w: 5, d: 5, h: 2.8, door: "s" },
  { x: 18, z: -4, w: 6, d: 5, h: 3.0, door: "w" },
  { x: 17.5, z: -13, w: 5, d: 6, h: 3.3, door: "w", lit: true },
  { x: 25, z: -8.5, w: 6, d: 6, h: 3.0, door: "s" },
  { x: 18, z: -23, w: 6, d: 5, h: 3.2, door: "w" },
  { x: 25.5, z: -18.5, w: 5, d: 5, h: 2.9, door: "n" },
  { x: 16.5, z: -31, w: 5, d: 6, h: 3.0, door: "w" },
];

export interface Zone {
  id: string;
  ar: string;
  en: string;
  noteAr: string;
  noteEn: string;
  x: number; z: number; r: number;
}

// Specific places first; the gravel path is resolved separately (by distance).
export const ZONES: Zone[] = [
  { id: "ravine", ar: "الشعبة", en: "The Ravine", noteAr: "هنا تبدأ الليلة", noteEn: "The night begins here", x: -55, z: 40, r: 11 },
  { id: "culvert", ar: "القنطرة", en: "The Culvert", noteAr: "فانوس وحيد فوق الساقية", noteEn: "A lone lantern over the channel", x: CULVERT.x, z: CULVERT.z, r: 7 },
  { id: "crossroads", ar: "المفترق", en: "The Crossroads", noteAr: "حارس الدرك لا ينام", noteEn: "The gendarme never sleeps", x: CROSSROADS.x, z: CROSSROADS.z, r: 7 },
  { id: "zahra", ar: "بيت زهرة", en: "Zahra's House", noteAr: "باب موارب وضوء خافت", noteEn: "A door ajar, a faint light", x: -6, z: -5, r: 4.5 },
  { id: "rock", ar: "الصخرة الشرقية", en: "The Eastern Rock", noteAr: "من هنا تُقرأ الدورية", noteEn: "From here the patrol is read", x: ROCK.x, z: ROCK.z, r: 5 },
  { id: "spring", ar: "العين", en: "The Spring", noteAr: "عمّار ينتظر قبل الفجر", noteEn: "Ammar waits before dawn", x: SPRING.x, z: SPRING.z, r: 7 },
  { id: "alleys", ar: "أزقة الدوار", en: "The Douar Alleys", noteAr: "حظر التجوال منذ العاشرة", noteEn: "Curfew since ten o'clock", x: 10, z: -16, r: 17 },
];

export const PATH_ZONE: Zone = { id: "path", ar: "المسلك", en: "The Gravel Path", noteAr: "كل خطوة على الحصى تُسمع", noteEn: "Every step on gravel is heard", x: 0, z: 0, r: 0 };

// ---------- geometry helpers ----------
export function smoothstep(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function segDist(px: number, pz: number, a: V2, b: V2) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}

export function polyDist(px: number, pz: number, poly: V2[]) {
  let d = Infinity;
  for (let i = 0; i < poly.length - 1; i++) d = Math.min(d, segDist(px, pz, poly[i], poly[i + 1]));
  return d;
}

export function pathDist(x: number, z: number) {
  return Math.min(polyDist(x, z, MAIN_PATH), polyDist(x, z, START_PATH), polyDist(x, z, VILLAGE_PATH), polyDist(x, z, ROCK_PATH));
}

/** Natural ground before the water channel is carved. */
export function baseHeight(x: number, z: number) {
  let h = (48 - z) * 0.12;
  h += Math.sin(x * 0.045 + 1.3) * 1.4 + Math.cos(z * 0.06 + x * 0.025) * 1.0;
  h += Math.sin(x * 0.15 + z * 0.12) * 0.25 + Math.sin(x * 0.31 - z * 0.27) * 0.08;
  const dr = Math.hypot(x + 56, z - 40);
  h -= 3.2 * Math.exp(-(dr * dr) / (2 * 11 * 11)); // the ravine
  // the path is beaten flatter
  const pd = pathDist(x, z);
  h -= 0.12 * (1 - smoothstep(0.8, 2.5, pd));
  // hills enclosing the map
  const ex = Math.max(0, Math.abs(x) - 60), en = Math.max(0, -z - 44), es = Math.max(0, z - 45);
  h += ex * ex * 0.14 + en * en * 0.3 + es * es * 0.08;
  return h;
}

export function ditchDepth(x: number, z: number) {
  return 0.95 * (1 - smoothstep(0.5, 1.7, polyDist(x, z, DITCH)));
}

export function terrainHeight(x: number, z: number) {
  return baseHeight(x, z) - ditchDepth(x, z);
}

// ---------- walkable platforms (rock, ramp, culvert, house blocks) ----------
interface Platform { minX: number; maxX: number; minZ: number; maxZ: number; top: (x: number, z: number) => number }

const rockGround = baseHeight(ROCK.x, ROCK.z);
export const ROCK_TOP = rockGround + ROCK.height;
const rampStart = { x: 40.5, z: -6 };
const rampGround = baseHeight(rampStart.x, rampStart.z);

const culvertTop = baseHeight(CULVERT.x, CULVERT.z) + 0.18;

export const PLATFORMS: Platform[] = [
  // rock summit
  { minX: ROCK.x - ROCK.half, maxX: ROCK.x + ROCK.half, minZ: ROCK.z - ROCK.half, maxZ: ROCK.z + ROCK.half, top: () => ROCK_TOP },
  // rock body (steep — blocks walking, only the ramp climbs)
  { minX: ROCK.x - 3.0, maxX: ROCK.x + 3.0, minZ: ROCK.z - 3.0, maxZ: ROCK.z + 3.0, top: () => ROCK_TOP - 0.4 },
  // boulder ramp from the west
  {
    minX: rampStart.x, maxX: ROCK.x - ROCK.half, minZ: ROCK.z - 1.3, maxZ: ROCK.z + 1.3,
    top: (x) => rampGround + (ROCK_TOP - rampGround) * Math.pow((x - rampStart.x) / (ROCK.x - ROCK.half - rampStart.x), 1.05),
  },
  // stone slab bridge of the culvert
  { minX: CULVERT.x - 2.6, maxX: CULVERT.x + 2.6, minZ: CULVERT.z - 1.4, maxZ: CULVERT.z + 1.4, top: () => culvertTop },
  ...HOUSES.map((h) => {
    const g = baseHeight(h.x, h.z);
    return { minX: h.x - h.w / 2, maxX: h.x + h.w / 2, minZ: h.z - h.d / 2, maxZ: h.z + h.d / 2, top: () => g + h.h + 0.35 };
  }),
];

export const BASE_PLATFORM_COUNT = PLATFORMS.length;

/** Height the player stands on at (x, z) plus the surface type for footsteps. */
export function groundAt(x: number, z: number): { y: number; surface: "gravel" | "dirt" | "stone" | "water" } {
  let y = terrainHeight(x, z);
  let surface: "gravel" | "dirt" | "stone" | "water" = ditchDepth(x, z) > 0.6 ? "water" : pathDist(x, z) < 1.5 ? "gravel" : "dirt";
  for (const p of PLATFORMS) {
    if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
      const t = p.top(x, z);
      if (t > y) {
        y = t;
        surface = "stone";
      }
    }
  }
  return { y, surface };
}

/** Ground-type weights [grass, dirt, rock] for the ported terrain shader + grass placement. */
export function splatAt(x: number, z: number, ny: number): [number, number, number] {
  let rock = smoothstep(0.11, 0.28, 1 - ny);
  if (Math.hypot(x - ROCK.x, z - ROCK.z) < 6) rock = Math.max(rock, 0.8);
  const pd = pathDist(x, z) + Math.sin(x * 0.7 + z * 0.3) * 0.4;
  let dirt = 1 - smoothstep(1.2, 2.6, pd);
  dirt = Math.max(dirt, smoothstep(0.1, 0.6, ditchDepth(x, z)));
  const vx = Math.max(0, Math.abs(x - 10) - 19), vz = Math.max(0, Math.abs(z + 17) - 16);
  const village = 1 - smoothstep(0, 4, Math.hypot(vx, vz));
  dirt = Math.max(dirt, village * (0.72 + 0.28 * Math.sin(x * 0.5) * Math.cos(z * 0.4)));
  for (const h of HOUSES) if (Math.abs(x - h.x) < h.w / 2 + 1.3 && Math.abs(z - h.z) < h.d / 2 + 1.3) dirt = 1;
  if (Math.hypot(x - SPRING.x, z - SPRING.z) < 3) dirt = 1;
  dirt *= 1 - rock;
  return [Math.max(0, 1 - rock - dirt), dirt, rock];
}

export function zoneAt(x: number, z: number): Zone | null {
  for (const zn of ZONES) if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return zn;
  if (pathDist(x, z) < 2.5) return PATH_ZONE;
  return null;
}
