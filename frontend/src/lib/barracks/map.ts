// Chapter II level layout — «ليلة الفاتح · Night of the First».
// +X east, −Z north. The barracks compound reproduces the user's "Barracks Courtyard" blueprint
// (perimeter 68 × 62, HQ, mess, guardroom, six barracks, four towers, motor pool) shifted 55 m north.
// South of it: the watched village; west: the oued (dry riverbed), the Kef ridge and the olive mill.
import type { Surface } from "@/lib/night/audio";
import type { House } from "@/lib/night/world";

export type V2 = [number, number];
export const MAP = { minX: -96, maxX: 96, minZ: -108, maxZ: 92 };

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
export function polyDist(x: number, z: number, poly: V2[]) {
  let d = Infinity;
  for (let i = 0; i < poly.length - 1; i++) d = Math.min(d, segDist(x, z, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1]));
  return d;
}

// ---------------- compound (blueprint coordinates + 55 m north) ----------------
export const CZ = -55;
export const COMPOUND = { minX: -34, maxX: 34, minZ: CZ - 32, maxZ: CZ + 30 }; // z −87 … −25
export const GATE = { x: 0, z: COMPOUND.maxZ, half: 4 };
export const COMPOUND_Y = 1.2;

// ---------------- landmarks ----------------
export const SPAWN = { x: 24, z: 76, yaw: Math.PI / 2 };
export const SAFEHOUSE = { x: 24, z: 70 };
export const CEMETERY = { x: -40, z: 50 };
export const MESSAOUD = { x: -39.8, z: 51.4 };
export const KEF = { x: -46, z: -12, r: 11, h: 7.5 }; // observation ridge
export const KEF_TOP = { x: -44, z: -17 };
export const MILL = { x: -74, z: -30 };
export const RABAH_DOOR = { x: -68.2, z: -26.6 };
export const LAKHDAR = { x: -67.4, z: -31.6 };
export const TABLE = { x: -66, z: -33.2 };
export const RALLY = { x: -80, z: -99 };
export const CHECKPOINT = { x: 2, z: 14 };

export const DRAIN = { x: COMPOUND.minX, z: -47.5 }; // crawl gap in the west fence
export const WIRE = { x: 17, z: COMPOUND.minZ }; // north fence section that can be cut
export const GENERATOR = { x: -29.5, z: -80 };
export const ARMORY = { x: 24, z: -80, w: 8, d: 6 };
export const ARMORY_DOOR = { x: 24, z: -76.4 };
export const GUARDROOM = { x: 14, z: -30, w: 9, d: 6 };
export const OFFICER = { x: 14, z: -34.3 };
export const RACKS: V2[] = [[21.2, -81.9], [24, -81.9], [26.8, -81.9]];
export const DIVERSION_FIRE = { x: -3, z: -12 };
export const PHONE_POLE = { x: -12, z: -19 };

// the oued: dry riverbed from the village edge to the mountains (the guerrilla's highway)
export const OUED: V2[] = [[-22, 70], [-30, 56], [-42, 36], [-54, 14], [-58, -6], [-60, -28], [-58, -50], [-64, -72], [-74, -90], [-82, -106]];
// roads / paths (dirt)
export const ROAD: V2[] = [[6, 90], [6, 58], [4, 30], [2, 14], [0, -10], [0, GATE.z + 2], [0, CZ]];
export const STREET: V2[] = [[-24, 58], [-6, 56], [6, 58], [22, 61], [40, 60]];
export const ALLEY: V2[] = [[17, 75.5], [4, 77], [-10, 76], [-18, 72], [-23, 68]];
export const FIELD_PATH: V2[] = [[-16, 47], [-26, 49], [-33, 50]];
export const MILL_PATH: V2[] = [[-64, -24], [-70, -26]];
export const PERIM: V2[] = [[-38, -22], [38, -22], [38, -91], [-38, -91], [-38, -22]];

// ---------------- terrain ----------------
function base(x: number, z: number) {
  return 0.022 * -z + 1.1 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038) + 0.45 * Math.sin(x * 0.13 + z * 0.09);
}
function flatMask(x: number, z: number, x0: number, x1: number, z0: number, z1: number, fall: number) {
  const dx = Math.max(0, x0 - x, x - x1), dz = Math.max(0, z0 - z, z - z1);
  return 1 - smoothstep(0, fall, Math.hypot(dx, dz));
}
export function ouedDepth(x: number, z: number) {
  return 2.3 * (1 - smoothstep(2.2, 5.5, polyDist(x, z, OUED)));
}
export function terrainHeight(x: number, z: number) {
  let h = base(x, z);
  // compound pad and village terraces are levelled
  h += (COMPOUND_Y - h) * flatMask(x, z, COMPOUND.minX - 4, COMPOUND.maxX + 4, COMPOUND.minZ - 4, COMPOUND.maxZ + 4, 10);
  const vy = base(8, 60);
  h += (vy - h) * flatMask(x, z, -26, 42, 38, 82, 8) * 0.9;
  const my = base(MILL.x, MILL.z) + 0.4;
  h += (my - h) * flatMask(x, z, MILL.x - 7, MILL.x + 6, MILL.z - 6, MILL.z + 6, 5);
  // the Kef: an elongated ridge with a flattish crest
  const kd = Math.hypot((x - KEF.x) / 1.25, (z - KEF.z) / 1.0);
  h += KEF.h * (1 - smoothstep(KEF.r * 0.25, KEF.r, kd)) + 0.6 * Math.sin(x * 0.7) * Math.sin(z * 0.6) * (1 - smoothstep(0, KEF.r, kd));
  // mountains rise to the north-west behind the rally point
  h += 9 * smoothstep(-80, -108, z) * smoothstep(-20, -70, x);
  h -= ouedDepth(x, z);
  return h;
}

export const ROAD_SETS: V2[][] = [ROAD, STREET, ALLEY, FIELD_PATH, MILL_PATH, PERIM];
export function roadDist(x: number, z: number) {
  let d = Infinity;
  for (const r of ROAD_SETS) d = Math.min(d, polyDist(x, z, r));
  return d;
}

export function insideCompound(x: number, z: number, pad = 0) {
  return x > COMPOUND.minX - pad && x < COMPOUND.maxX + pad && z > COMPOUND.minZ - pad && z < COMPOUND.maxZ + pad;
}

/** splat weights [grass, dirt, rock] for the ported terrain shader */
export function splatAt(x: number, z: number, ny: number): [number, number, number] {
  let rock = smoothstep(0.12, 0.3, 1 - ny);
  const kd = Math.hypot((x - KEF.x) / 1.25, z - KEF.z);
  if (kd < KEF.r * 0.55) rock = Math.max(rock, 0.55 + 0.3 * Math.sin(x * 1.3 + z));
  let dirt = 1 - smoothstep(1.4, 3.0, roadDist(x, z) + Math.sin(x * 0.7 + z * 0.3) * 0.5);
  dirt = Math.max(dirt, smoothstep(0.3, 1.2, ouedDepth(x, z)));
  if (insideCompound(x, z, 1.5)) dirt = 1;
  dirt = Math.max(dirt, flatMask(x, z, -24, 40, 40, 80, 3) * (0.7 + 0.3 * Math.sin(x * 0.5) * Math.cos(z * 0.4)));
  if (Math.hypot(x - MILL.x, z - MILL.z) < 7) dirt = 1;
  for (const b of BOXES) if (b.kind === "solid" && x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1) dirt = 1;
  dirt *= 1 - rock;
  return [Math.max(0, 1 - rock - dirt), dirt, rock];
}

// ---------------- buildings & collision ----------------
export type BoxKind = "solid" | "fence" | "crawl" | "low" | "cover"; // cover: blocks sight only (bushes)
export interface Box {
  x0: number; x1: number; z0: number; z1: number;
  y0: number; top: number;
  kind: BoxKind;
  id?: string;
  off?: boolean; // removed at runtime (cut wire)
}
export const BOXES: Box[] = [];
const box = (cx: number, cz: number, w: number, d: number, h: number, kind: BoxKind = "solid", id?: string, y0?: number) => {
  const g = y0 ?? terrainHeight(cx, cz);
  const b: Box = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: g - 0.6, top: g + h, kind, id };
  BOXES.push(b);
  return b;
};

export interface Building { id: string; x: number; z: number; w: number; d: number; h: number; door: "n" | "s" | "e" | "w"; ar: string; en: string; kind: "barracks" | "hq" | "mess" | "guard" | "armory" | "shed" }
export const BUILDINGS: Building[] = [
  { id: "hq", x: 0, z: CZ - 24, w: 22, d: 8, h: 4.6, door: "s", ar: "القيادة", en: "HQ", kind: "hq" },
  { id: "mess", x: -14, z: CZ + 25, w: 9, d: 6.5, h: 3.8, door: "n", ar: "المطعم", en: "Mess hall", kind: "mess" },
  { id: "guard", x: GUARDROOM.x, z: GUARDROOM.z, w: GUARDROOM.w, d: GUARDROOM.d, h: 3.6, door: "n", ar: "غرفة الحرس", en: "Guardroom", kind: "guard" },
  ...[-11.5, 0, 11.5].map((dz, i) => ({ id: `b${i + 1}`, x: -24, z: CZ + dz, w: 12, d: 7, h: 3.9, door: "e" as const, ar: `المهجع ${i + 1}`, en: `Barracks ${i + 1}`, kind: "barracks" as const })),
  ...[-11.5, 0, 11.5].map((dz, i) => ({ id: `b${i + 4}`, x: 24, z: CZ + dz, w: 12, d: 7, h: 3.9, door: "w" as const, ar: `المهجع ${i + 4}`, en: `Barracks ${i + 4}`, kind: "barracks" as const })),
  { id: "armory", x: ARMORY.x, z: ARMORY.z, w: ARMORY.w, d: ARMORY.d, h: 3.4, door: "s", ar: "مخزن السلاح", en: "Armory", kind: "armory" },
  { id: "gen", x: GENERATOR.x, z: GENERATOR.z - 1.6, w: 4, d: 3, h: 2.6, door: "s", ar: "المولّد", en: "Generator", kind: "shed" },
];
export const TOWERS: V2[] = [[COMPOUND.minX + 1, COMPOUND.minZ + 1], [COMPOUND.maxX - 1, COMPOUND.minZ + 1], [COMPOUND.minX + 1, COMPOUND.maxZ - 1], [COMPOUND.maxX - 1, COMPOUND.maxZ - 1]];
export const TOWER_H = 6.2;
export const TRUCKS: { x: number; z: number; rot: number }[] = [{ x: 31, z: CZ - 9, rot: 0 }, { x: 31, z: CZ + 8, rot: 0 }, { x: -6, z: -17, rot: Math.PI / 2 }];
export const CRATES: V2[] = [[-31, CZ + 10], [30.5, CZ - 24], [-6, CZ - 29.5], [9, -41], [-9, -66]];
export const DRUMS: V2[] = [[-31, CZ + 18], [31, CZ - 18], [14, CZ - 29.5], [-27.5, -77]];
export const FLAG = { x: 0, z: CZ + 5 };

// village (adobe houses from Chapter I's kit)
export const VILLAGE: House[] = [
  { x: 24, z: 70, w: 7, d: 6, h: 3.3, door: "n", lit: true }, // the safe house (watched)
  { x: 14, z: 68, w: 6, d: 5, h: 3.1, door: "n" },
  { x: 33, z: 69, w: 5.5, d: 5, h: 3.0, door: "n" },
  { x: 1, z: 66, w: 6.5, d: 5.5, h: 3.2, door: "n", lit: true },
  { x: -12, z: 64, w: 6, d: 5, h: 3.1, door: "n" },
  { x: -3, z: 50, w: 7, d: 5, h: 3.3, door: "s", lit: true }, // café — the informer sits outside
  { x: 12, z: 50, w: 5.5, d: 5, h: 3.0, door: "s" },
  { x: 28, z: 52, w: 6, d: 5.5, h: 3.2, door: "s" },
  { x: -16, z: 50, w: 5, d: 4.5, h: 3.0, door: "s" },
  { x: MILL.x, z: MILL.z, w: 8, d: 6.5, h: 3.5, door: "e", lit: true }, // the olive mill
];
export const INFORMER = { x: -2.5, z: 54.2 };

export const MOON_DIR_ARR = [0.32, 0.45, 0.83] as const; // moon in the south-east sky

// ---- populate collision ----
for (const b of BUILDINGS) {
  if (b.kind === "armory") continue;
  box(b.x, b.z, b.w, b.d, b.h + 1.6, "solid", b.id, COMPOUND_Y);
}
// armory: enterable shell with a south doorway (door id toggles)
{
  const { x, z, w, d } = ARMORY, t = 0.4, H = 3.4;
  box(x, z - d / 2 + t / 2, w, t, H, "solid", "armory", COMPOUND_Y);
  box(x - w / 2 + t / 2, z, t, d, H, "solid", "armory", COMPOUND_Y);
  box(x + w / 2 - t / 2, z, t, d, H, "solid", "armory", COMPOUND_Y);
  box(x - 2.45, z + d / 2 - t / 2, w / 2 - 0.9, t, H, "solid", "armory", COMPOUND_Y);
  box(x + 2.45, z + d / 2 - t / 2, w / 2 - 0.9, t, H, "solid", "armory", COMPOUND_Y);
  box(ARMORY_DOOR.x, ARMORY_DOOR.z, 1.8, 0.3, 2.4, "solid", "armory-door", COMPOUND_Y);
  for (const [rx, rz] of RACKS) box(rx, rz, 1.8, 0.7, 1.9, "solid", "rack", COMPOUND_Y);
}
for (const [tx, tz] of TOWERS) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(tx + sx * 1.1, tz + sz * 1.1, 0.3, 0.3, TOWER_H, "solid", "tower", COMPOUND_Y);
}
for (const t of TRUCKS) {
  const along = Math.abs(Math.sin(t.rot)) > 0.5;
  box(t.x, t.z, along ? 6.6 : 2.4, along ? 2.4 : 6.6, 2.7, "solid", "truck");
}
for (const [x, z] of CRATES) {
  box(x, z, 2.2, 1.2, 0.95, "low", "crate");
  box(x + 0.4, z - 0.05, 1.1, 1.1, 1.9, "low", "crate");
}
for (const [x, z] of DRUMS) box(x, z, 1.5, 1.5, 0.95, "low", "drum");
box(FLAG.x, FLAG.z, 2.6, 2.6, 0.35, "low", "flag");
box(-10, -76, 6, 0.6, 0.9, "low", "sandbag");
box(GATE.x - 6.5, GATE.z + 3.2, 3.2, 0.9, 1.1, "low", "sandbag");
box(GATE.x + 6.5, GATE.z + 3.2, 3.2, 0.9, 1.1, "low", "sandbag");
// perimeter fence (see-through wire) with gate gap, cut-able north section and the drain crawl
{
  const { minX, maxX, minZ, maxZ } = COMPOUND, t = 0.25, H = 2.8;
  const seg = (x0: number, z0: number, x1: number, z1: number, id?: string, kind: BoxKind = "fence") => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    return box(cx, cz, Math.max(t, Math.abs(x1 - x0)), Math.max(t, Math.abs(z1 - z0)), H, kind, id, COMPOUND_Y);
  };
  seg(minX, maxZ, GATE.x - GATE.half, maxZ);
  seg(GATE.x + GATE.half, maxZ, maxX, maxZ);
  seg(minX, minZ, WIRE.x - 1.6, minZ);
  seg(WIRE.x - 1.6, minZ, WIRE.x + 1.6, minZ, "wire");
  seg(WIRE.x + 1.6, minZ, maxX, minZ);
  seg(minX, minZ, minX, DRAIN.z - 1);
  seg(minX, DRAIN.z + 1, minX, maxZ);
  BOXES.push({ x0: minX - 0.6, x1: minX + 0.6, z0: DRAIN.z - 1, z1: DRAIN.z + 1, y0: COMPOUND_Y - 1, top: COMPOUND_Y + H, kind: "crawl", id: "drain" });
  seg(maxX, minZ, maxX, maxZ);
}
// safe-house courtyard walls (back gate opens west onto the back lane)
{
  const g = terrainHeight(SAFEHOUSE.x, SAFEHOUSE.z);
  const wall = (cx: number, cz: number, w: number, d: number) => box(cx, cz, w, d, 1.7, "solid", "court", g);
  wall(SAFEHOUSE.x, 80, 12, 0.4);
  wall(SAFEHOUSE.x + 6, 76.5, 0.4, 7);
  wall(SAFEHOUSE.x - 6, 78.5, 0.4, 3);
  wall(SAFEHOUSE.x - 6, 73.4, 0.4, 0.8);
}
for (const h of VILLAGE) box(h.x, h.z, h.w, h.d, h.h + 1.2, "solid", "house");
// cemetery low wall with a gap facing the alley
{
  const g = terrainHeight(CEMETERY.x, CEMETERY.z);
  const wall = (cx: number, cz: number, w: number, d: number) => box(cx, cz, w, d, 1.15, "low", "cemetery", g);
  wall(CEMETERY.x, CEMETERY.z - 7, 16, 0.5);
  wall(CEMETERY.x - 8, CEMETERY.z, 0.5, 14);
  wall(CEMETERY.x + 8, CEMETERY.z - 3.5, 0.5, 7);
  wall(CEMETERY.x - 3, CEMETERY.z + 7, 10, 0.5);
  box(CEMETERY.x - 1.5, CEMETERY.z - 2, 4, 4, 3.4, "solid", "marabout");
}

export const NAV_BLOCKERS = () => BOXES.filter((b) => !b.off && b.kind !== "crawl" && b.kind !== "cover");

/** blocked-for-walking test used by player and soldiers */
export function solidAt(x: number, z: number, footY: number, crouched: boolean, r = 0.3) {
  for (const b of BOXES) {
    if (b.off || b.kind === "cover") continue;
    if (x + r < b.x0 || x - r > b.x1 || z + r < b.z0 || z - r > b.z1) continue;
    if (b.kind === "crawl") {
      if (!crouched) return true;
      continue;
    }
    if (b.top > footY + 0.55 && b.y0 < footY + 1.7) return true;
  }
  return false;
}

export interface Ground { y: number; surface: Surface }
/** walkable height under (x,z) for a body whose feet are at footY */
export function groundAt(x: number, z: number, footY = Infinity): Ground {
  let y = terrainHeight(x, z);
  let surface: Surface = roadDist(x, z) < 1.8 || insideCompound(x, z, 2) ? "gravel" : ouedDepth(x, z) > 1.2 ? "stone" : "dirt";
  for (const b of BOXES) {
    if (b.off || b.kind === "crawl" || b.kind === "fence" || b.kind === "cover") continue;
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    if (b.top > y && b.top <= footY + 0.6) {
      y = b.top;
      surface = "stone";
    }
  }
  return { y, surface };
}

/** segment vs boxes + terrain — true when the view is clear */
export function lineClear(ax: number, ay: number, az: number, bx: number, by: number, bz: number, terrain = true) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (const b of BOXES) {
    if (b.off || b.kind === "fence" || b.kind === "crawl") continue;
    let t0 = 0, t1 = 1;
    const slab = (o: number, d: number, lo: number, hi: number) => {
      if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
      let u = (lo - o) / d, v = (hi - o) / d;
      if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u);
      t1 = Math.min(t1, v);
      return t0 <= t1;
    };
    if (slab(ax, dx, b.x0, b.x1) && slab(az, dz, b.z0, b.z1) && slab(ay, dy, b.y0, b.top) && t1 > 0.001 && t0 < 0.999) return false;
  }
  if (terrain) {
    const len = Math.hypot(dx, dz);
    const n = Math.ceil(len / 1.5);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (terrainHeight(ax + dx * t, az + dz * t) > ay + dy * t + 0.05) return false;
    }
  }
  return true;
}

// ---------------- zones ----------------
export interface Zone { id: string; ar: string; en: string; noteAr: string; x: number; z: number; r: number }
export const ZONES: Zone[] = [
  { id: "safe", ar: "البيت المراقَب", en: "The Watched House", noteAr: "مخبر عند المقهى وعيناه على الباب.", x: SAFEHOUSE.x, z: SAFEHOUSE.z + 4, r: 7 },
  { id: "street", ar: "الشارع", en: "The Street", noteAr: "دورية الدرك تمرّ كل بضع دقائق.", x: 6, z: 57, r: 9 },
  { id: "cemetery", ar: "مقبرة سيدي عبد الله", en: "Sidi Abdallah Cemetery", noteAr: "هنا ينتظر مسعود، رجل الاتصال.", x: CEMETERY.x, z: CEMETERY.z, r: 9 },
  { id: "oued", ar: "الوادي اليابس", en: "The Dry Oued", noteAr: "طريق المجاهدين: لا يراك أحد من الأعلى.", x: -55, z: 5, r: 8 },
  { id: "kef", ar: "كاف الغراب", en: "Crow's Kef", noteAr: "من القمة تُرى الثكنة كلّها.", x: KEF_TOP.x, z: KEF_TOP.z, r: 6 },
  { id: "mill", ar: "معصرة الزيتون", en: "The Olive Mill", noteAr: "مقرّ الخلية الليلة.", x: MILL.x, z: MILL.z, r: 9 },
  { id: "checkpoint", ar: "الحاجز", en: "The Checkpoint", noteAr: "حاجز الطريق إلى الثكنة.", x: CHECKPOINT.x, z: CHECKPOINT.z, r: 7 },
  { id: "yard", ar: "ساحة العَلَم", en: "Parade Ground", noteAr: "مكشوفة تحت المصابيح.", x: 0, z: CZ, r: 12 },
  { id: "armory", ar: "مخزن السلاح", en: "The Armory", noteAr: "هدف الليلة.", x: ARMORY.x, z: ARMORY.z, r: 5 },
  { id: "rally", ar: "مسلك الجبل", en: "Mountain Trail", noteAr: "نقطة التجمّع.", x: RALLY.x, z: RALLY.z, r: 8 },
];
export function zoneAt(x: number, z: number) {
  return ZONES.find((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r) ?? null;
}

// ---------------- navigation grid (A*) ----------------
const CELL = 1;
const NW = Math.ceil((MAP.maxX - MAP.minX) / CELL), NH = Math.ceil((MAP.maxZ - MAP.minZ) / CELL);
let navGrid: Uint8Array | null = null;
export function rebuildNav() {
  const g = new Uint8Array(NW * NH);
  for (const b of NAV_BLOCKERS()) {
    const i0 = Math.max(0, Math.floor((b.x0 - 0.45 - MAP.minX) / CELL)), i1 = Math.min(NW - 1, Math.floor((b.x1 + 0.45 - MAP.minX) / CELL));
    const j0 = Math.max(0, Math.floor((b.z0 - 0.45 - MAP.minZ) / CELL)), j1 = Math.min(NH - 1, Math.floor((b.z1 + 0.45 - MAP.minZ) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j * NW + i] = 1;
  }
  navGrid = g;
}
const cellOf = (x: number, z: number) => [Math.min(NW - 1, Math.max(0, Math.floor((x - MAP.minX) / CELL))), Math.min(NH - 1, Math.max(0, Math.floor((z - MAP.minZ) / CELL)))];
const centre = (i: number, j: number): V2 => [MAP.minX + (i + 0.5) * CELL, MAP.minZ + (j + 0.5) * CELL];

function nearestFree(i: number, j: number) {
  const g = navGrid!;
  if (!g[j * NW + i]) return [i, j];
  for (let r = 1; r < 6; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < NW && b < NH && !g[b * NW + a]) return [a, b];
      }
  return [i, j];
}

/** grid A* with octile moves, then string-pulled with straight-line checks */
export function findPath(fx: number, fz: number, tx: number, tz: number, maxNodes = 9000): V2[] | null {
  if (!navGrid) rebuildNav();
  const g = navGrid!;
  const [si, sj] = nearestFree(...(cellOf(fx, fz) as [number, number]));
  const [ti, tj] = nearestFree(...(cellOf(tx, tz) as [number, number]));
  const start = sj * NW + si, goal = tj * NW + ti;
  const gs = new Map<number, number>([[start, 0]]);
  const from = new Map<number, number>();
  const heap: [number, number][] = [[0, start]];
  const h = (n: number) => {
    const dx = Math.abs((n % NW) - ti), dz = Math.abs(Math.floor(n / NW) - tj);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  const push = (item: [number, number]) => {
    heap.push(item);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  let visited = 0;
  while (heap.length && visited++ < maxNodes) {
    const [, cur] = pop();
    if (cur === goal) break;
    const ci = cur % NW, cj = Math.floor(cur / NW), cg = gs.get(cur)!;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= NW || nj >= NH) continue;
        const n = nj * NW + ni;
        if (g[n]) continue;
        if (di && dj && (g[cj * NW + ni] || g[nj * NW + ci])) continue;
        const ng = cg + (di && dj ? 1.414 : 1);
        if (ng < (gs.get(n) ?? Infinity)) {
          gs.set(n, ng);
          from.set(n, cur);
          push([ng + h(n), n]);
        }
      }
  }
  if (!from.has(goal) && start !== goal) return null;
  const cells: V2[] = [];
  for (let n = goal; n !== start; n = from.get(n)!) cells.push(centre(n % NW, Math.floor(n / NW)));
  cells.reverse();
  cells.push([tx, tz]);
  // string pulling over the grid
  const out: V2[] = [];
  let anchor: V2 = [fx, fz];
  for (let i = 0; i < cells.length; i++) {
    const next = cells[i + 1];
    if (next && gridClear(anchor[0], anchor[1], next[0], next[1])) continue;
    out.push(cells[i]);
    anchor = cells[i];
  }
  return out;
}
function gridClear(ax: number, az: number, bx: number, bz: number) {
  const g = navGrid!;
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
  for (let k = 0; k <= n; k++) {
    const [i, j] = cellOf(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
    if (g[j * NW + i]) return false;
  }
  return true;
}
