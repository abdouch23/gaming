// City runtime: chunked meshes, distance-based LOD streaming (LOD0 built progressively under a per-frame
// time budget), instant building removal (index ranges collapse), ray picking and static colliders.
import * as THREE from 'three';
import { GeoBuilder } from './GeoBuilder.js';
import { buildSimple, buildDetailed } from './BuildingGenerator.js';
import { buildGround, buildFarGround, buildMarkings, StreetProps } from './Streets.js';

const CHUNK = 2; // blocks per chunk side

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
    this.markings = buildMarkings(layout, lib); this.group.add(this.markings);
    this.props = new StreetProps(layout, lighting); this.group.add(this.props.group);
    lighting.patch(this.props.group); lighting.patch(this.markings);

    // chunks
    const nx = Math.ceil(layout.blocksX / CHUNK), nz = Math.ceil(layout.blocksZ / CHUNK);
    this.chunks = [];
    for (let ci = 0; ci < nx; ci++) for (let cj = 0; cj < nz; cj++) {
      const blocks = layout.blocks.filter((b) => Math.floor(b.i / CHUNK) === ci && Math.floor(b.j / CHUNK) === cj);
      const buildings = blocks.flatMap((b) => b.buildings);
      if (!buildings.length) continue;
      const box = new THREE.Box3(); buildings.forEach((b) => box.union(b.box));
      const ch = { buildings, box, simple: null, detail: null, job: null, dist: 0 };
      buildings.forEach((b) => (b.chunk = ch));
      this._buildSimple(ch);
      this.chunks.push(ch);
    }
    this.bounds = new THREE.Box3();
    layout.buildings.forEach((b) => this.bounds.union(b.box));
    this.bounds.expandByPoint(new THREE.Vector3(-layout.totX / 2, 0, -layout.totZ / 2)).expandByPoint(new THREE.Vector3(layout.totX / 2, 0, layout.totZ / 2));
    this._v = new THREE.Vector3();
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
    const o = new THREE.Mesh(J.G.build(), this.mats.world); o.castShadow = o.receiveShadow = true;
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
    const cp = camera.position, lod = this.lodDistance;
    for (const ch of this.chunks) ch.dist = ch.box.distanceToPoint(cp);
    const want = this.chunks.filter((c) => c.dist < lod && !c.detail).sort((a, b) => a.dist - b.dist);
    const deadline = performance.now() + this.budgetMs;
    let active = this.chunks.find((c) => c.job);
    if (!active && want.length) { active = want[0]; this._startDetail(active); }
    if (active) this._stepDetail(active, deadline);
    let n = 0;
    for (const ch of this.chunks) {
      if (ch.detail && ch.dist > lod * 1.6) this._disposeDetail(ch);
      const showDetail = !!ch.detail && ch.dist < lod + 15;
      if (ch.detail) ch.detail.visible = showDetail;
      ch.simple.visible = !showDetail;
      if (showDetail) n++;
    }
    this.stats.detailChunks = n; this.stats.building = this.chunks.filter((c) => c.job).length;
    this.props.update(dt);
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
      if (!b.tierBoxes) b.tierBoxes = b.tiers.map((t) => new THREE.Box3().setFromPoints([
        new THREE.Vector3(t.ox - t.w / 2, t.y0, t.oz - t.d / 2).applyMatrix4(b.matrix), new THREE.Vector3(t.ox + t.w / 2, t.y1, t.oz + t.d / 2).applyMatrix4(b.matrix)]));
      for (const tb of b.tierBoxes) out.push(tb);
    }
    return out;
  }

  buildingsNear(p, r) {
    return this.layout.buildings.filter((b) => !b.demolished && b.box.distanceToPoint(p) < r);
  }

  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.far.geometry.dispose();
  }
}
