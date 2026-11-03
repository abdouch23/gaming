// Chapter II level layout — «ليلة الفاتح · Night of the First».
// +X east, −Z north. The barracks compound reproduces the user's "Barracks Courtyard" blueprint
// (perimeter 68 × 62, HQ, mess, guardroom, six barracks, four towers, motor pool) shifted 55 m north.
// South of it: the watched village; west: the oued (dry riverbed), the Kef ridge and the olive mill.
import type { Surface } from "@/lib/night/audio";
import type { House } from "@/lib/night/world";
import { bakeFields, fieldHeight, fieldRoad, fieldOued, addLane, H0, KOFF, ROADS } from "@/lib/barracks/terrain";

export type V2 = [number, number];
export const MAP = { minX: -300, maxX: 650, minZ: -330, maxZ: 640 }; // ~1 km², the Khenchela 1954 map

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

// ---------------- landmarks (world = Khenchela map + KOFF; the army barracks is the compound) ----------------
// the dachra (rally point of the map file, Chaabet el Ghoula) — 630 m from the barracks
export const DV = { x: -182, z: 487 }; // offset of the dachra block layout
const dv = (x: number, z: number) => ({ x: x + DV.x, z: z + DV.z });
export const SPAWN = { ...dv(24, 76), yaw: Math.PI / 2 };
export const SAFEHOUSE = dv(24, 70);
export const CEMETERY = { x: -178, z: 412 };
export const MESSAOUD = { x: -177.8, z: 413.4 };
export const KEF = { x: -112, z: 34, r: 17, h: 21 }; // observation ridge, 140 m from the yard, out of the towers' reach
export const KEF_TOP = { x: -108, z: 29 };
export const MILL = { x: -246, z: 104 }; // the olive mill, hidden on the oued bank 280 m from the barracks
export const RABAH_DOOR = { x: -240.2, z: 107.4 };
export const LAKHDAR = { x: -239.4, z: 102.4 };
export const TABLE = { x: -238, z: 100.8 };
export const RALLY = { x: -185, z: -240 }; // the map's dispersal point (نقطة التفرق)
export const CHECKPOINT = { x: 2, z: 14 };
// the other targets of the night in Khenchela (from the map file) — struck by other squads at midnight
export const TOWN = {
  hakim: { x: -20 + KOFF.x, z: -10 + KOFF.z, r: 40, ar: "دار الحاكم", en: "Administrator's house" },
  gend: { x: 230 + KOFF.x, z: -250 + KOFF.z, r: 52, ar: "ثكنة الدرك", en: "Gendarmerie" },
  police: { x: 170 + KOFF.x, z: 120 + KOFF.z, r: 30, ar: "مركز الشرطة", en: "Police station" },
  power: { x: 340 + KOFF.x, z: 330 + KOFF.z, r: 26, ar: "المحوّل الكهربائي", en: "Power transformer" },
};

export const DRAIN = { x: COMPOUND.minX, z: -47.5 }; // crawl gap in the west fence
export const WIRE = { x: 17, z: COMPOUND.minZ }; // north fence section that can be cut
export const GENERATOR = { x: -29.5, z: -80 };
export const ARMORY = { x: 24, z: -80, w: 8, d: 6 };
export const ARMORY_DOOR = { x: 24, z: -76.4 };
export const GUARDROOM = { x: 14, z: -30, w: 9, d: 6 };
// HQ (P.C.) — enterable: hall + commander's office (W), radio room (SE), records (NE)
export const HQ = { x: 0, z: CZ - 24, w: 22, d: 8, h: 4.2 };
export const HQ_DOOR = { x: 0, z: HQ.z + HQ.d / 2 };
export const HQ_WINDOW = { x: 6, z: HQ.z - HQ.d / 2 }; // breach low in the back wall (1.25 m), crouch to pass
export const HQ_ITEMS = {
  maps: { x: -7.5, z: -80.6, ar: "خرائط المواقع", en: "Outpost maps" },
  safe: { x: -10.1, z: -77.2, ar: "خزنة القائد", en: "Commander's safe" },
  records: { x: 9.6, z: -80.4, ar: "سجلّ المخبرين", en: "Informers' register" },
  radio: { x: 9.4, z: -77.0, ar: "جهاز اللاسلكي", en: "Radio set" },
};
export const RESTRICT_PAD = 7; // no approaching the compound before the plan
export const OFFICER = { x: 14, z: -34.3 };
export const RACKS: V2[] = [[21.2, -81.9], [24, -81.9], [26.8, -81.9]];
export const DIVERSION_FIRE = { x: -3, z: -12 };
export const PHONE_POLE = { x: -12, z: -19 };

// the oued: dry riverbed from the dachra down past the mill and the Kef to the dispersal point (the guerrilla's highway)
export const OUED: V2[] = [[-204, 557], [-210, 500], [-205, 420], [-215, 330], [-226, 240], [-232, 160], [-228, 108], [-200, 70], [-160, 36], [-138, 6], [-104, -30], [-80, -62], [-92, -110], [-140, -170], [-182, -232]];
// lanes we add to the map's road network
export const STREET: V2[] = [[-24, 58], [-6, 56], [6, 58], [22, 61], [40, 60]].map(([x, z]) => [x + DV.x, z + DV.z] as V2);
export const ALLEY: V2[] = [[17, 75.5], [4, 77], [-10, 76], [-18, 72], [-23, 68]].map(([x, z]) => [x + DV.x, z + DV.z] as V2);
export const FIELD_PATH: V2[] = [[-198, 534], [-197, 490], [-190, 445], [-180, 422]];
export const MILL_PATH: V2[] = [[-228, 110], [-240, 106]];
export const PERIM: V2[] = [[-38, -22], [38, -22], [38, -91], [-38, -91], [-38, -22]];
addLane(STREET, 2);
addLane(ALLEY, 1.5);
addLane(FIELD_PATH, 1.2);
addLane(MILL_PATH, 1.2);
addLane(PERIM, 1.6);
addLane([[0, 7], [0, -10], [0, -23]], 3);

const ARMY_RAW = H0(-250, -230);
bakeFields({
  base: (x, z) => H0(x - KOFF.x, z - KOFF.z) - ARMY_RAW + COMPOUND_Y,
  pads: [
    { x: 0, z: -55, r: 0, fall: 16, y: COMPOUND_Y, rect: [-40, 40, -93, -19] },
    { x: -158, z: 548, r: 0, fall: 12, rect: [-210, -138, 524, 572] },
    { x: CEMETERY.x, z: CEMETERY.z, r: 9, fall: 8 },
    { x: MILL.x, z: MILL.z, r: 9, fall: 7 },
    { x: RALLY.x, z: RALLY.z, r: 14, fall: 20 },
    ...Object.values(TOWN).map((t) => ({ x: t.x, z: t.z, r: t.r, fall: 34 })),
  ],
  oued: OUED,
  bumps: [{ x: KEF.x, z: KEF.z, r: KEF.r, h: KEF.h, sx: 1.25 }],
});

function flatMask(x: number, z: number, x0: number, x1: number, z0: number, z1: number, fall: number) {
  const dx = Math.max(0, x0 - x, x - x1), dz = Math.max(0, z0 - z, z - z1);
  return 1 - smoothstep(0, fall, Math.hypot(dx, dz));
}
export function ouedDepth(x: number, z: number) {
  return fieldOued(x, z);
}
export function terrainHeight(x: number, z: number) {
  return fieldHeight(x, z);
}
export const ROAD_SETS: V2[][] = ROADS.map((r) => r.pts.map((p) => [p.x, p.z] as V2));
/** distance to the nearest road edge (0 on the road) */
export function roadDist(x: number, z: number) {
  return fieldRoad(x, z);
}

export function insideCompound(x: number, z: number, pad = 0) {
  return x > COMPOUND.minX - pad && x < COMPOUND.maxX + pad && z > COMPOUND.minZ - pad && z < COMPOUND.maxZ + pad;
}

/** splat weights [grass, dirt, rock] for the ported terrain shader */
export function splatAt(x: number, z: number, ny: number): [number, number, number] {
  let rock = smoothstep(0.12, 0.3, 1 - ny);
  const kd = Math.hypot((x - KEF.x) / 1.25, z - KEF.z);
  if (kd < KEF.r * 0.55) rock = Math.max(rock, 0.55 + 0.3 * Math.sin(x * 1.3 + z));
  let dirt = 1 - smoothstep(0, 1.6, roadDist(x, z) + Math.sin(x * 0.7 + z * 0.3) * 0.5);
  dirt = Math.max(dirt, smoothstep(0.3, 1.2, ouedDepth(x, z)));
  if (insideCompound(x, z, 1.5)) dirt = 1;
  dirt = Math.max(dirt, flatMask(x, z, -206, -142, 527, 569, 3) * (0.7 + 0.3 * Math.sin(x * 0.5) * Math.cos(z * 0.4)));
  if (Math.hypot(x - MILL.x, z - MILL.z) < 7) dirt = 1;
  for (const b of boxesIn(x - 1, z - 1, x + 1, z + 1)) if (b.kind === "solid" && b.id !== "tree" && x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1) dirt = 1;
  dirt *= 1 - rock;
  return [Math.max(0, 1 - rock - dirt), dirt, rock];
}

// ---------------- buildings & collision ----------------
export type BoxKind = "solid" | "fence" | "crawl" | "low" | "cover" | "roof"; // cover: blocks sight only (bushes); roof: ceilings (sight + moon shadow only)
export interface Box {
  x0: number; x1: number; z0: number; z1: number;
  y0: number; top: number;
  kind: BoxKind;
  id?: string;
  off?: boolean; // removed at runtime (cut wire)
  q?: number; // query stamp (spatial index dedupe)
}
export const BOXES: Box[] = [];
const box = (cx: number, cz: number, w: number, d: number, h: number, kind: BoxKind = "solid", id?: string, y0?: number) => {
  const g = y0 ?? terrainHeight(cx, cz);
  const b: Box = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: g - 0.6, top: g + h, kind, id };
  BOXES.push(b);
  return b;
};

export interface Building { id: string; x: number; z: number; w: number; d: number; h: number; door: "n" | "s" | "e" | "w"; ar: string; en: string; kind: "barracks" | "hq" | "mess" | "guard" | "armory" | "shed" }
export const insideHQ = (x: number, z: number) => Math.abs(x - HQ.x) < HQ.w / 2 && Math.abs(z - HQ.z) < HQ.d / 2;
export const BUILDINGS: Building[] = [
  { id: "hq", x: 0, z: CZ - 24, w: 22, d: 8, h: 4.2, door: "s", ar: "القيادة", en: "HQ", kind: "hq" },
  { id: "mess", x: -14, z: CZ + 25, w: 9, d: 6.5, h: 3.8, door: "n", ar: "المطعم", en: "Mess hall", kind: "mess" },
  { id: "guard", x: GUARDROOM.x, z: GUARDROOM.z, w: GUARDROOM.w, d: GUARDROOM.d, h: 3.6, door: "n", ar: "غرفة الحرس", en: "Guardroom", kind: "guard" },
  ...[-11.5, 0, 11.5].map((dz, i) => ({ id: `b${i + 1}`, x: -24, z: CZ + dz, w: 12, d: 7, h: 3.9, door: "e" as const, ar: `المهجع ${i + 1}`, en: `Barracks ${i + 1}`, kind: "barracks" as const })),
  ...[-11.5, 0, 11.5].map((dz, i) => ({ id: `b${i + 4}`, x: 24, z: CZ + dz, w: 12, d: 7, h: 3.9, door: "w" as const, ar: `المهجع ${i + 4}`, en: `Barracks ${i + 4}`, kind: "barracks" as const })),
  { id: "armory", x: ARMORY.x, z: ARMORY.z, w: ARMORY.w, d: ARMORY.d, h: 3.4, door: "s", ar: "مخزن السلاح", en: "Armory", kind: "armory" },
  { id: "gen", x: GENERATOR.x, z: GENERATOR.z - 1.6, w: 4, d: 3, h: 2.6, door: "s", ar: "المولّد", en: "Generator", kind: "shed" },
];
export const TOWERS: V2[] = [[COMPOUND.minX + 1, COMPOUND.minZ + 1], [COMPOUND.maxX - 1, COMPOUND.minZ + 1], [COMPOUND.minX + 1, COMPOUND.maxZ - 1], [COMPOUND.maxX - 1, COMPOUND.maxZ - 1]];
export const TOWER_H = 6.2;
export const TRUCKS: { x: number; z: number; rot: number; ar: string; en: string }[] = [
  { x: 32, z: CZ - 9, rot: 0, ar: "شاحنة GMC", en: "GMC truck" },
  { x: 32, z: CZ + 8, rot: 0, ar: "شاحنة GMC", en: "GMC truck" },
  { x: 24, z: -35, rot: 0, ar: "شاحنة الدورية", en: "Patrol truck" },
];
export const CHARGE_TIMER = 60;
export const CRATES: V2[] = [[-31, CZ + 10], [30.5, CZ - 24], [-6, CZ - 29.5], [9, -41], [-9, -66]];
export const DRUMS: V2[] = [[-31, CZ + 18], [31, CZ - 18], [14, CZ - 29.5], [-27.5, -77]];
export const FLAG = { x: 0, z: CZ + 5 };

// village (adobe houses from Chapter I's kit)
const DACHRA: House[] = ([
  { x: 24, z: 70, w: 7, d: 6, h: 3.3, door: "n", lit: true }, // the Ben Chaïba house (watched)
  { x: 14, z: 68, w: 6, d: 5, h: 3.1, door: "n" },
  { x: 33, z: 69, w: 5.5, d: 5, h: 3.0, door: "n" },
  { x: 1, z: 66, w: 6.5, d: 5.5, h: 3.2, door: "n", lit: true },
  { x: -12, z: 64, w: 6, d: 5, h: 3.1, door: "n" },
  { x: -3, z: 50, w: 7, d: 5, h: 3.3, door: "s", lit: true }, // café — the informer sits outside
  { x: 12, z: 50, w: 5.5, d: 5, h: 3.0, door: "s" },
  { x: 28, z: 52, w: 6, d: 5.5, h: 3.2, door: "s" },
  { x: -16, z: 50, w: 5, d: 4.5, h: 3.0, door: "s" },
] as House[]).map((h) => ({ ...h, x: h.x + DV.x, z: h.z + DV.z }));

/** Khenchela town houses lining the main roads around the administrator's house */
function townHouses() {
  const out: House[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const r of ROADS) {
    if (r.t !== "main") continue;
    for (let i = 4; i < r.pts.length - 4; i += 5) {
      const p = r.pts[i], q = r.pts[i + 1];
      const near = Math.min(...Object.values(TOWN).map((t) => Math.hypot(p.x - t.x, p.z - t.z) - t.r));
      const core = Math.hypot(p.x - TOWN.hakim.x, p.z - TOWN.hakim.z) < 230 || Math.hypot(p.x - TOWN.police.x, p.z - TOWN.police.z) < 120;
      if (!core || near < 8 || rnd() < 0.25) continue;
      const tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1;
      for (const side of [-1, 1]) {
        if (rnd() < 0.3) continue;
        const w = 6 + rnd() * 3, d = 5 + rnd() * 2.5, off = r.hw + 3 + d / 2 + rnd() * 2;
        const x = p.x - (tz / tl) * off * side, z = p.z + (tx / tl) * off * side;
        const door: House["door"] = Math.abs(tz) > Math.abs(tx) ? (side > 0 ? "e" : "w") : side > 0 ? "s" : "n";
        const ww = door === "e" || door === "w" ? d : w, dd = door === "e" || door === "w" ? w : d;
        if (out.some((o) => Math.abs(o.x - x) < (o.w + ww) / 2 + 1.5 && Math.abs(o.z - z) < (o.d + dd) / 2 + 1.5)) continue;
        if (fieldRoad(x, z) < Math.max(ww, dd) / 2) continue;
        out.push({ x, z, w: ww, d: dd, h: 3.2 + rnd() * 1.6, door, lit: rnd() < 0.35 });
      }
    }
  }
  return out;
}
export const TOWN_HOUSES = townHouses();
export const VILLAGE: House[] = [...DACHRA, { x: MILL.x, z: MILL.z, w: 8, d: 6.5, h: 3.5, door: "e", lit: true }, ...TOWN_HOUSES];
export const INFORMER = dv(-2.5, 54.2);

export const MOON_DIR_ARR = [0.32, 0.45, 0.83] as const; // moon in the south-east sky

// ---- populate collision ----
for (const b of BUILDINGS) {
  if (b.kind === "armory" || b.kind === "hq") continue;
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
  BOXES.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: COMPOUND_Y + H, top: COMPOUND_Y + H + 0.3, kind: "roof", id: "armory-roof" });
}
// HQ shell: outer walls with front door, broken rear window, partitions with doorways, roof
{
  const { x, z, w, d, h } = HQ, t = 0.3, Y = COMPOUND_Y;
  const zs = z + d / 2 - t / 2, zn = z - d / 2 + t / 2;
  const wall = (cx: number, cz: number, ww: number, dd: number) => box(cx, cz, ww, dd, h, "solid", "hq", Y);
  const spanX = (x0: number, x1: number, cz: number) => wall((x0 + x1) / 2, cz, x1 - x0, t);
  const spanZ = (z0: number, z1: number, cx: number) => wall(cx, (z0 + z1) / 2, t, z1 - z0);
  spanX(x - w / 2, HQ_DOOR.x - 0.8, zs);
  spanX(HQ_DOOR.x + 0.8, x + w / 2, zs);
  spanX(x - w / 2, HQ_WINDOW.x - 0.8, zn);
  spanX(HQ_WINDOW.x + 0.8, x + w / 2, zn);
  BOXES.push({ x0: HQ_WINDOW.x - 0.8, x1: HQ_WINDOW.x + 0.8, z0: zn - t / 2 - 0.2, z1: zn + t / 2 + 0.2, y0: Y + 1.25, top: Y + h, kind: "crawl", id: "hq-window" });
  spanZ(z - d / 2, z + d / 2, x - w / 2 + t / 2);
  spanZ(z - d / 2, z + d / 2, x + w / 2 - t / 2);
  for (const px of [-3, 3]) {
    spanZ(z - d / 2, z - 0.8, px);
    spanZ(z + 0.8, z + d / 2, px);
  }
  spanX(3, 6.2, z);
  spanX(7.8, x + w / 2, z);
  BOXES.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: Y + h, top: Y + h + 0.5, kind: "roof", id: "hq-roof" });
  // furniture
  box(-7.5, -81.7, 2, 0.9, 0.8, "low", "desk", Y);
  box(-10.3, -77.2, 0.8, 0.8, 1.2, "low", "safe", Y);
  box(1.8, -82.1, 1.6, 0.8, 0.8, "low", "desk", Y);
  box(10.2, -81.2, 0.7, 2.4, 2, "solid", "cabinet", Y);
  box(3.6, -81.5, 0.6, 2, 2, "solid", "cabinet", Y);
  box(10.2, -77, 0.9, 1.8, 0.85, "low", "radio", Y);
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
  wall(SAFEHOUSE.x, SAFEHOUSE.z + 10, 12, 0.4);
  wall(SAFEHOUSE.x + 6, SAFEHOUSE.z + 6.5, 0.4, 7);
  wall(SAFEHOUSE.x - 6, SAFEHOUSE.z + 8.5, 0.4, 3);
  wall(SAFEHOUSE.x - 6, SAFEHOUSE.z + 3.4, 0.4, 0.8);
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

// the town's targets: blocks and walls after the map file
export const TOWN_BLOCKS: { x: number; z: number; w: number; d: number; h: number; c: number; wall?: boolean }[] = [];
{
  const T = TOWN;
  const B = (p: { x: number; z: number }, ox: number, oz: number, w: number, d: number, h: number, c: number) => {
    TOWN_BLOCKS.push({ x: p.x + ox, z: p.z + oz, w, d, h, c });
    box(p.x + ox, p.z + oz, w, d, h + 0.6, "solid", "town");
  };
  const ring = (p: { x: number; z: number }, ox: number, oz: number, w: number, d: number, h: number, c: number, gap: number) => {
    const cx = p.x + ox, cz = p.z + oz, t = 0.6;
    const seg = (x: number, z: number, ww: number, dd: number) => {
      TOWN_BLOCKS.push({ x, z, w: ww, d: dd, h, c, wall: true });
      box(x, z, ww, dd, h, "solid", "town");
    };
    seg(cx, cz - d / 2, w, t);
    seg(cx - w / 2, cz, t, d);
    seg(cx + w / 2, cz, t, d);
    seg(cx - w / 4 - gap / 4, cz + d / 2, (w - gap) / 2, t);
    seg(cx + w / 4 + gap / 4, cz + d / 2, (w - gap) / 2, t);
  };
  B(T.hakim, 0, 0, 24, 16, 8, 0xd8cbb0);
  ring(T.hakim, 0, 2, 44, 36, 2.6, 0xb9ab8e, 8);
  B(T.gend, 0, 0, 40, 20, 7, 0x8fa0b8);
  B(T.gend, 30, -8, 12, 12, 5, 0x7d8ea6);
  ring(T.gend, 0, 2, 76, 50, 3, 0x6f7a8e, 12);
  B(T.gend, -34, 20, 5, 5, 12, 0x6f7a8e);
  B(T.police, 0, 0, 22, 14, 6, 0xb3a6c4);
  ring(T.police, 0, 3, 38, 28, 2.5, 0x8a7d9c, 10);
  B(T.power, 0, 0, 8, 8, 4, 0xaa9a3e);
  ring(T.power, 0, 0, 22, 22, 3, 0x6e6420, 6);
  for (const dx of [-6, 0, 6]) B(T.power, dx, -10.5, 1.6, 1.6, 6, 0xd8c24a);
}

// ---- spatial index over BOXES (8 m cells; rebuilt lazily whenever the list changes) ----
const GC = 8, GX0 = MAP.minX - 40, GZ0 = MAP.minZ - 40;
const GW = Math.ceil((MAP.maxX - MAP.minX + 80) / GC), GH = Math.ceil((MAP.maxZ - MAP.minZ + 80) / GC);
let grid: Box[][] = [];
let gridLen = -1;
let qStamp = 1;
function ensureIndex() {
  if (gridLen === BOXES.length) return;
  grid = Array.from({ length: GW * GH }, () => []);
  for (const b of BOXES) {
    const i0 = Math.max(0, Math.floor((b.x0 - GX0) / GC)), i1 = Math.min(GW - 1, Math.floor((b.x1 - GX0) / GC));
    const j0 = Math.max(0, Math.floor((b.z0 - GZ0) / GC)), j1 = Math.min(GH - 1, Math.floor((b.z1 - GZ0) / GC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * GW + i].push(b);
  }
  gridLen = BOXES.length;
}
/** boxes overlapping an AABB (deduplicated) */
export function boxesIn(x0: number, z0: number, x1: number, z1: number): Box[] {
  ensureIndex();
  const q = ++qStamp, out: Box[] = [];
  const i0 = Math.max(0, Math.floor((x0 - GX0) / GC)), i1 = Math.min(GW - 1, Math.floor((x1 - GX0) / GC));
  const j0 = Math.max(0, Math.floor((z0 - GZ0) / GC)), j1 = Math.min(GH - 1, Math.floor((z1 - GZ0) / GC));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++)
      for (const b of grid[j * GW + i]) {
        if (b.q === q) continue;
        b.q = q;
        out.push(b);
      }
  return out;
}
/** boxes in the cells a segment passes through */
function boxesAlong(ax: number, az: number, bx: number, bz: number): Box[] {
  ensureIndex();
  const q = ++qStamp, out: Box[] = [];
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (GC * 0.45)));
  let li = -1, lj = -1;
  for (let k = 0; k <= n; k++) {
    const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
    const ci = Math.floor((x - GX0) / GC), cj = Math.floor((z - GZ0) / GC);
    if (ci === li && cj === lj) continue;
    li = ci;
    lj = cj;
    for (let j = cj - 1; j <= cj + 1; j++)
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
        for (const b of grid[j * GW + i]) {
          if (b.q === q) continue;
          b.q = q;
          out.push(b);
        }
      }
  }
  return out;
}

export const NAV_BLOCKERS = () => BOXES.filter((b) => !b.off && b.kind !== "crawl" && b.kind !== "cover" && b.kind !== "roof");

/** blocked-for-walking test used by player and soldiers */
export function solidAt(x: number, z: number, footY: number, crouched: boolean, r = 0.3) {
  for (const b of boxesIn(x - r, z - r, x + r, z + r)) {
    if (b.off || b.kind === "cover" || b.kind === "roof") continue;
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
  for (const b of boxesIn(x, z, x, z)) {
    if (b.off || b.kind === "crawl" || b.kind === "fence" || b.kind === "cover" || b.kind === "roof") continue;
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
  for (const b of boxesAlong(ax, az, bx, bz)) {
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
  { id: "safe", ar: "دشرة أولاد موسى", en: "Dachra Ouled Moussa", noteAr: "بيت بن شايبة — والبوشكارة عند المقهى.", x: SAFEHOUSE.x, z: SAFEHOUSE.z + 4, r: 8 },
  { id: "street", ar: "شارع الدشرة", en: "The Dachra Street", noteAr: "دورية الدرك تمرّ كل بضع دقائق.", x: 6 + DV.x, z: 57 + DV.z, r: 9 },
  { id: "cemetery", ar: "مقبرة سيدي عبد الله", en: "Sidi Abdallah Cemetery", noteAr: "هنا ينتظر مرود العزوي.", x: CEMETERY.x, z: CEMETERY.z, r: 9 },
  { id: "oued", ar: "الوادي اليابس", en: "The Dry Oued", noteAr: "طريق المجاهدين: لا يراك أحد من الأعلى.", x: -215, z: 300, r: 10 },
  { id: "oued2", ar: "الوادي اليابس", en: "The Dry Oued", noteAr: "يمرّ تحت كاف الغراب نحو الثكنة.", x: -160, z: 36, r: 9 },
  { id: "kef", ar: "كاف الغراب", en: "Crow's Kef", noteAr: "من القمة تُرى الثكنة كلّها.", x: KEF_TOP.x, z: KEF_TOP.z, r: 6 },
  { id: "mill", ar: "معصرة الزيتون", en: "The Olive Mill", noteAr: "مقرّ الفوج الليلة.", x: MILL.x, z: MILL.z, r: 10 },
  { id: "checkpoint", ar: "الحاجز", en: "The Checkpoint", noteAr: "حاجز طريق خنشلة إلى الثكنة.", x: CHECKPOINT.x, z: CHECKPOINT.z, r: 7 },
  { id: "yard", ar: "ساحة العَلَم", en: "Parade Ground", noteAr: "مكشوفة تحت المصابيح.", x: 0, z: CZ, r: 12 },
  { id: "armory", ar: "مخزن السلاح", en: "The Armory", noteAr: "هدف الليلة.", x: ARMORY.x, z: ARMORY.z, r: 5 },
  { id: "rally", ar: "نقطة التفرّق", en: "Dispersal Point", noteAr: "من هنا يتفرّق الفوج في الجبل.", x: RALLY.x, z: RALLY.z, r: 10 },
  ...Object.entries(TOWN).map(([id, t]) => ({ id, ar: t.ar, en: t.en, noteAr: "خنشلة — هدف فوج آخر الليلة.", x: t.x, z: t.z, r: t.r + 6 })),
];
export function zoneAt(x: number, z: number) {
  return ZONES.find((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r) ?? null;
}

// ---------------- navigation grid (A*) ----------------
const CELL = 0.5;
const NW = Math.ceil((MAP.maxX - MAP.minX) / CELL), NH = Math.ceil((MAP.maxZ - MAP.minZ) / CELL);
let navGrid: Uint8Array | null = null;
export function rebuildNav() {
  const g = new Uint8Array(NW * NH);
  for (const b of NAV_BLOCKERS()) {
    const P = 0.3; // body radius
    const i0 = Math.max(0, Math.floor((b.x0 - P - MAP.minX) / CELL)), i1 = Math.min(NW - 1, Math.floor((b.x1 + P - MAP.minX) / CELL));
    const j0 = Math.max(0, Math.floor((b.z0 - P - MAP.minZ) / CELL)), j1 = Math.min(NH - 1, Math.floor((b.z1 + P - MAP.minZ) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j * NW + i] = 1;
  }
  navGrid = g;
}
const cellOf = (x: number, z: number) => [Math.min(NW - 1, Math.max(0, Math.floor((x - MAP.minX) / CELL))), Math.min(NH - 1, Math.max(0, Math.floor((z - MAP.minZ) / CELL)))];
const centre = (i: number, j: number): V2 => [MAP.minX + (i + 0.5) * CELL, MAP.minZ + (j + 0.5) * CELL];

function nearestFree(i: number, j: number) {
  const g = navGrid!;
  if (!g[j * NW + i]) return [i, j];
  for (let r = 1; r < 10; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < NW && b < NH && !g[b * NW + a]) return [a, b];
      }
  return [i, j];
}

/** grid A* with octile moves, then string-pulled with straight-line checks */
export function findPath(fx: number, fz: number, tx: number, tz: number, maxNodes = 30000): V2[] | null {
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
