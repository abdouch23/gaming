// Adobe village houses built from the ported PBR kit (adobe_house_pbr.html):
// bevelled plaster walls with real door/window openings, dark (or warmly lit) interiors,
// roof slabs with capstones, protruding vigas, plank doors with iron bands, shutters, steps and clay pots.
import * as THREE from "three";
import { createAdobeKit } from "@/lib/ported/adobe";
import { mulberry32 } from "@/lib/lighting";
import { baseHeight, type House } from "@/lib/night/world";

type Kit = ReturnType<typeof createAdobeKit>;

export interface BuiltHouse {
  group: THREE.Group;
  /** world position just outside the door */
  doorstep: THREE.Vector3;
}

const ROT: Record<House["door"], number> = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

export function buildHouses(scene: THREE.Scene, houses: House[], low: boolean, heightAt: (x: number, z: number) => number = baseHeight) {
  const k: Kit = createAdobeKit(low ? 256 : 512);
  const rng = mulberry32(404);
  const interiorDark = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1 });
  const interiorWarm = new THREE.MeshStandardMaterial({ color: 0x0a0604, emissive: 0xff8a3a, emissiveIntensity: 0.55, roughness: 1 });
  const capGeo = k.slab(0.55, 0.18, 0.42, 0.04);
  const caps: THREE.Matrix4[] = [];
  const built: BuiltHouse[] = [];
  const dummy = new THREE.Object3D();

  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  houses.forEach((h, idx) => {
    const ns = h.door === "n" || h.door === "s";
    const span = ns ? h.w : h.d;
    const depth = ns ? h.d : h.w;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => heightAt(h.x + (sx * h.w) / 2, h.z + (sz * h.d) / 2));
    const g0 = heightAt(h.x, h.z);
    const sink = g0 - Math.min(...corners) + 0.5; // walls run below ground on the slope
    const wh = h.h;
    const H = wh + sink;
    const yc = (wh - sink) / 2;
    const wallMat = idx % 3 === 1 ? k.Lm : k.A;

    const grp = new THREE.Group();
    grp.position.set(h.x, g0, h.z);
    grp.rotation.y = ROT[h.door];
    scene.add(grp);

    // openings (slab-local coordinates, centred on the wall)
    const doorX = (rng() - 0.5) * Math.max(0, span - 2.6);
    const bottom = -H / 2 + sink;
    const winX = doorX > 0 ? doorX - 1.6 : doorX + 1.6;
    const hasWin = span > 4.2;
    const holes: number[][] = [[doorX - 0.47, bottom + 0.04, doorX + 0.47, bottom + 1.9]];
    if (hasWin) holes.push([winX - 0.32, bottom + 1.15, winX + 0.32, bottom + 1.7]);
    const T = 0.4;
    add(grp, k.U(k.slab(span, H, T, 0.05, holes), 0.6), wallMat, 0, yc, depth / 2 - T / 2);
    add(grp, k.U(k.slab(span, H, T, 0.05), 0.6, 0.6, 0.3, 0.2), wallMat, 0, yc, -depth / 2 + T / 2);
    const sideHoles = h.lit ? [[-0.3, bottom + 1.2, 0.3, bottom + 1.62]] : [];
    add(grp, k.U(k.slab(depth - 2 * T + 0.02, H, T, 0.05, sideHoles), 0.6, 0.6, 0.5, 0.1), wallMat, span / 2 - T / 2, yc, 0, Math.PI / 2);
    add(grp, k.U(k.slab(depth - 2 * T + 0.02, H, T, 0.05), 0.6, 0.6, 0.1, 0.6), wallMat, -span / 2 + T / 2, yc, 0, Math.PI / 2);

    // interior volume seen through the openings
    const lit = h.lit || h.zahra;
    const inner = new THREE.Mesh(new THREE.BoxGeometry(span - 2 * T - 0.1, wh - 0.1, depth - 2 * T - 0.1), lit ? interiorWarm : interiorDark);
    inner.position.set(0, wh / 2, 0);
    grp.add(inner);
    if (lit) {
      const glow = new THREE.PointLight(0xff8f40, h.zahra ? 2.2 : 1.2, 5, 2);
      glow.position.set(0, 1.4, 0);
      grp.add(glow);
    }

    // roof slab + capstones + optional upper block
    add(grp, k.U(k.slab(span + 0.35, 0.26, depth + 0.35, 0.06), 0.6), wallMat, 0, wh + 0.13, 0);
    for (let x = -span / 2; x <= span / 2 + 0.01; x += 0.5) {
      for (const z of [depth / 2 + 0.05, -depth / 2 - 0.05]) caps.push(capMatrix(grp, dummy, x, wh + 0.3 + rng() * 0.03, z, (rng() - 0.5) * 0.15, rng));
    }
    for (let z = -depth / 2 + 0.4; z < depth / 2 - 0.2; z += 0.5) {
      for (const x of [span / 2 + 0.05, -span / 2 - 0.05]) caps.push(capMatrix(grp, dummy, x, wh + 0.3 + rng() * 0.03, z, Math.PI / 2 + (rng() - 0.5) * 0.15, rng));
    }
    if (rng() < 0.45) add(grp, k.U(k.slab(1.6, 0.9, 1.4, 0.07), 0.6, 0.6, 0.4, 0.4), wallMat, (rng() - 0.5) * (span - 2), wh + 0.7, -depth / 4);

    // vigas through the front wall
    const viga = k.U(k.cyl(0.07, 0.07, 0.75), 1, 0.5);
    for (let i = 0; i < 4; i++) add(grp, viga, k.B, -span / 2 + 0.7 + (i * (span - 1.4)) / 3, wh - 0.22 + (rng() - 0.5) * 0.06, depth / 2 + 0.12, 0, Math.PI / 2);

    // door frame + plank door with iron bands (Zahra's stands ajar)
    const fz = depth / 2 + 0.03;
    add(grp, k.slab(0.12, 1.95, 0.16, 0.02), k.W, doorX - 0.53, 0.98, fz);
    add(grp, k.slab(0.12, 1.95, 0.16, 0.02), k.W, doorX + 0.53, 0.98, fz);
    add(grp, k.U(k.slab(1.3, 0.14, 0.22, 0.025), 1, 1, 0.3, 0.2), k.W, doorX, 1.98, fz);
    const door = new THREE.Group();
    door.position.set(doorX - 0.46, 0.06, depth / 2 - 0.08);
    door.rotation.y = h.zahra ? -0.95 : 0;
    grp.add(door);
    for (let i = 0; i < 4; i++) add(door, k.U(k.slab(0.225, 1.82, 0.07, 0.012), 1, 1, rng(), rng()), k.Wo, 0.115 + i * 0.2255, 0.91, 0);
    for (const y of [0.32, 0.95, 1.58]) add(door, k.slab(0.9, 0.09, 0.02, 0.005), k.iron, 0.45, y, 0.045);
    // steps
    add(grp, k.U(k.slab(1.4, 0.16, 0.6, 0.04), 0.8), k.S, doorX, 0.06, depth / 2 + 0.35);

    // window: frame + two shutters
    if (hasWin) {
      add(grp, k.U(k.slab(0.85, 0.08, 0.22, 0.02), 0.8), k.S, winX, 1.13, fz + 0.04);
      for (const sg of [-1, 1]) {
        const sh = new THREE.Group();
        sh.position.set(winX + sg * 0.33, 1.43, fz + 0.06);
        sh.rotation.y = sg * (0.4 + rng() * 1.1);
        grp.add(sh);
        add(sh, k.U(k.slab(0.32, 0.56, 0.045, 0.01), 1, 1, rng(), rng()), k.Wo, -sg * 0.16, 0, 0);
      }
    }
    // clay pots by the door
    if (rng() < 0.6) {
      const pot = add(grp, k.potG, k.P, doorX + 0.95, 0, depth / 2 + 0.45, rng() * 6);
      pot.scale.setScalar(0.55 + rng() * 0.3);
    }

    const local = new THREE.Vector3(doorX, 0, depth / 2 + 0.9);
    grp.updateMatrixWorld();
    const doorstep = local.applyMatrix4(grp.matrixWorld);
    built.push({ group: grp, doorstep });
  });

  const capInst = new THREE.InstancedMesh(capGeo, k.S, caps.length);
  caps.forEach((m, i) => capInst.setMatrixAt(i, m));
  capInst.castShadow = capInst.receiveShadow = true;
  scene.add(capInst);
  return { built, kit: k };
}

function capMatrix(grp: THREE.Group, dummy: THREE.Object3D, x: number, y: number, z: number, ry: number, rng: () => number) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, ry, 0);
  dummy.scale.set(0.8 + rng() * 0.5, 0.8 + rng() * 0.5, 1);
  dummy.updateMatrix();
  grp.updateMatrixWorld();
  return new THREE.Matrix4().multiplyMatrices(grp.matrixWorld, dummy.matrix);
}
