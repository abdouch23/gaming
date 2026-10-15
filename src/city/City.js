// City runtime: chunked meshes, distance-based LOD streaming (LOD0 built progressively under a per-frame
// time budget), instant building removal (index ranges collapse), ray picking and static colliders.
import * as THREE from 'three';
import { GeoBuilder } from './GeoBuilder.js';
import { buildSimple, buildDetailed, makeBuilding } from './BuildingGenerator.js';
import { buildGround, buildFarGround, StreetProps } from './Streets.js';
import { Trees } from './Trees.js';

const CHUNK_M = 190; // chunk cell size (metres)

export class City {
  constructor(layout, materials, lib, lighting) {
    this.layout = layout; this.mats = materials;
    this.group = new THREE.Group(); this.group.name = 'city';
    this.lodDistance = 320;
    this.budgetMs = 6;
    this.stats = { detailChunks: 0, building: 0 };

    const ground = new THREE.Mesh(buildGround(layout), materials.world);
    ground.receiveShadow = true; this.group.add(ground);
    this.far = new THREE.Mesh(buildFarGround(), materials.world); this.far.receiveShadow = true; // outside the AO level
    this.props = new StreetProps(layout, lighting); this.group.add(this.props.group);
    this.props.group.traverse((o) => (o.userData.noAO = true)); // moving / thin props stay out of the height field
    lighting.patch(this.props.group);
    this.trees = new Trees(layout, lighting); this.group.add(this.trees.group);
    this.trees.group.traverse((o) => (o.userData.noAO = true));
    this.lighting = lighting;

    // chunks: spatial cells over block centroids
    const cells = new Map();
    for (const b of layout.blocks) {
      if (!b.buildings.length) continue;
      const k = Math.floor(b.cx / CHUNK_M) + ',' + Math.floor(b.cz / CHUNK_M);
      if (!cells.has(k)) cells.set(k, []); cells.get(k).push(b);
    }
    this.chunks = [];
    for (const blocks of cells.values()) {
      const buildings = blocks.flatMap((b) => b.buildings);
      const box = new THREE.Box3(); buildings.forEach((b) => box.union(b.box));
      const ch = { buildings, box, simple: null, detail: null, job: null, dist: 0 };
      buildings.forEach((b) => (b.chunk = ch));
      this._buildSimple(ch);
      this.chunks.push(ch);
    }
    this.bounds = new THREE.Box3();
    layout.buildings.forEach((b) => this.bounds.union(b.box));
    const B = layout.bounds, m = layout.maxW;
    this.bounds.expandByPoint(new THREE.Vector3(B.minX - m, 0, B.minZ - m)).expandByPoint(new THREE.Vector3(B.maxX + m, 1, B.maxZ + m));
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3();
  }

  _buildSimple(ch) {
    const G = new GeoBuilder(8192);
    for (const b of ch.buildings) {
      const i0 = G.ni; if (!b.demolished) buildSimple(b, G); b.rSimple = [i0, G.ni - i0];
    }
    if (ch.simple) { this.group.remove(ch.simple); ch.simple.geometry.dispose(); }
    const m = new THREE.Mesh(G.build(), this.mats.world);
    m.castShadow = m.receiveShadow = true; m.userData.chunk = ch;
    ch.simple = m; this.group.add(m);
  }

  _startDetail(ch) { ch.job = { G: new GeoBuilder(1 << 16), Gg: new GeoBuilder(1 << 14), k: 0 }; }
  _stepDetail(ch, deadline) {
    const J = ch.job;
    while (J.k < ch.buildings.length && performance.now() < deadline) {
      const b = ch.buildings[J.k++], i0 = J.G.ni, g0 = J.Gg.ni;
      if (!b.demolished) buildDetailed(b, J.G, J.Gg);
      b.rDetail = [i0, J.G.ni - i0]; b.rGlass = [g0, J.Gg.ni - g0];
    }
    if (J.k < ch.buildings.length) return false;
    const grp = new THREE.Group();
    const o = new THREE.Mesh(J.G.build(), this.mats.worldDetail); o.castShadow = o.receiveShadow = true;
    const g = new THREE.Mesh(J.Gg.build(), this.mats.glass); g.receiveShadow = true;
    grp.add(o, g); grp.userData.chunk = ch; grp.visible = false;
    ch.detail = grp; ch.job = null; this.group.add(grp);
    return true;
  }
  _disposeDetail(ch) {
    if (!ch.detail) return;
    this.group.remove(ch.detail); ch.detail.children.forEach((m) => m.geometry.dispose()); ch.detail = null;
  }

  /** streaming + LOD switch, call once per frame */
  update(camera, dt) {
    const cp = camera.position, lod = this.lodDistance, band = this.mats.u.uLodBand.value;
    this.mats.u.uLodDist.value = lod;
    for (const ch of this.chunks) ch.dist = ch.box.distanceToPoint(cp);
    const want = this.chunks.filter((c) => c.dist < lod && !c.detail).sort((a, b) => a.dist - b.dist);
    const deadline = performance.now() + this.budgetMs;
    let active = this.chunks.find((c) => c.job);
    if (!active && want.length) { active = want[0]; this._startDetail(active); }
    if (active) this._stepDetail(active, deadline);
    let n = 0;
    for (const ch of this.chunks) {
      if (ch.detail && ch.dist > lod * 1.6) this._disposeDetail(ch);
      // LOD0 and LOD1 overlap inside the fade band; the shaders dither them per pixel by distance
      const far = ch.box.getCenter(this._v).distanceTo(cp) + ch.box.getSize(this._v2).length() / 2;
      const showDetail = !!ch.detail && ch.dist < lod;
      if (ch.detail) ch.detail.visible = showDetail;
      ch.simple.visible = !showDetail || far > lod - band;
      ch.simple.material = showDetail ? this.mats.worldFadeOut : this.mats.world;
      ch.simple.castShadow = !showDetail; // LOD0 casts the whole chunk's shadow
      if (showDetail) n++;
    }
    this.stats.detailChunks = n; this.stats.building = this.chunks.filter((c) => c.job).length;
    this.props.update(dt);
    this.trees.update(camera, dt);
  }

  /** remove a building instantly by collapsing its index ranges (no rebuild hitch) */
  hideBuilding(b) {
    b.demolished = true;
    const ch = b.chunk, zero = (mesh, r) => {
      if (!mesh || !r || !r[1]) return;
      mesh.geometry.index.array.fill(0, r[0], r[0] + r[1]); mesh.geometry.index.needsUpdate = true;
    };
    zero(ch.simple, b.rSimple);
    if (ch.detail) { zero(ch.detail.children[0], b.rDetail); zero(ch.detail.children[1], b.rGlass); }
    if (ch.job) { /* buildings not yet emitted are skipped; already emitted ones are zeroed when the job ends */
      const job = ch.job, k = ch.buildings.indexOf(b);
      if (k < job.k) job.G.i.fill(0, b.rDetail[0], b.rDetail[0] + b.rDetail[1]), job.Gg.i.fill(0, b.rGlass[0], b.rGlass[0] + b.rGlass[1]);
    }
  }

  /** rebuild one building with new options (style, floors, seed) — used by the editor */
  replaceBuilding(old, changes) {
    const o = { ...old.opts, ...changes };
    if (changes.style && !changes.floors) delete o.floors;
    const b = makeBuilding(o);
    b.block = old.block; b.chunk = old.chunk;
    const swap = (arr) => { const i = arr.indexOf(old); if (i >= 0) arr[i] = b; };
    swap(this.layout.buildings); swap(old.block.buildings); swap(old.chunk.buildings);
    this._refreshChunk(old.chunk);
    return b;
  }
  removeBuilding(b) {
    b.demolished = true; b.removed = true;
    this._refreshChunk(b.chunk);
  }
  _refreshChunk(ch) {
    ch.box.makeEmpty(); ch.buildings.forEach((x) => ch.box.union(x.box));
    this._buildSimple(ch);
    ch.job = null; this._disposeDetail(ch); // LOD0 re-streams next frame
    this.bounds.union(ch.box);
    this.lighting.setBounds(this.bounds); this.lighting.rebuild();
  }

  /** ray against intact building volumes (tiers + roof box), returns {building, point, normal, distance} */
  raycastBuildings(ray, maxDist = 5000) {
    let best = null; const lr = new THREE.Ray(), box = new THREE.Box3(), hit = new THREE.Vector3();
    for (const b of this.layout.buildings) {
      if (b.demolished) continue;
      const d0 = ray.distanceToPoint(b.box.getCenter(this._v)); if (d0 > b.box.getSize(hit).length()) continue;
      lr.copy(ray).applyMatrix4(b.inverse);
      const boxes = b.tiers.map((t) => box.clone().set(new THREE.Vector3(t.ox - t.w / 2, t.y0, t.oz - t.d / 2), new THREE.Vector3(t.ox + t.w / 2, t.y1, t.oz + t.d / 2)));
      if (b.roofH) { const t = b.tiers[b.tiers.length - 1]; boxes.push(box.clone().set(new THREE.Vector3(t.ox - t.w / 2 + 0.8, t.y1, t.oz - t.d / 2 + 0.8), new THREE.Vector3(t.ox + t.w / 2 - 0.8, t.y1 + b.roofH * 0.7, t.oz + t.d / 2 - 0.8))); }
      for (const bx of boxes) {
        if (!lr.intersectBox(bx, hit)) continue;
        const wp = hit.clone().applyMatrix4(b.matrix), dist = wp.distanceTo(ray.origin);
        if (dist < maxDist && (!best || dist < best.distance)) best = { building: b, point: wp, distance: dist };
      }
    }
    return best;
  }

  /** intact building boxes near a point (world AABBs per tier) for debris collisions */
  collidersNear(x, z, r, out) {
    out.length = 0;
    for (const b of this.layout.buildings) {
      if (b.demolished) continue;
      const bx = b.box; if (x < bx.min.x - r || x > bx.max.x + r || z < bx.min.z - r || z > bx.max.z + r) continue;
      if (!b.tierBoxes) b.tierBoxes = b.tiers.map((t) => { // world AABB of the rotated tier
        const pts = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [t.y0, t.y1]) pts.push(new THREE.Vector3(t.ox + sx * t.w / 2, y, t.oz + sz * t.d / 2).applyMatrix4(b.matrix));
        return new THREE.Box3().setFromPoints(pts);
      });
      for (const tb of b.tierBoxes) out.push(tb);
    }
    return out;
  }

  buildingsNear(p, r) {
    return this.layout.buildings.filter((b) => !b.demolished && b.box.distanceToPoint(p) < r);
  }

  dispose() {
    this.group.traverse((o) => { if (o.geometry && !o.parent?.name?.includes('trees')) o.geometry.dispose(); });
    this.trees.dispose();
    this.far.geometry.dispose();
  }
}
