import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { LevelLighting } from './lighting/LevelLighting.js';
import { TextureLibrary, estimateVRAM } from './textures/TextureLibrary.js';
import { CityMaterials } from './materials/CityMaterials.js';
import { LAYER_COUNT } from './materials/layers.js';
import { generateLayout } from './city/CityLayout.js';
import { City } from './city/City.js';
import { Effects } from './destruction/Effects.js';
import { Demolition } from './destruction/Demolition.js';

const $ = (id) => document.getElementById(id);

/* ---------- renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.info.autoReset = false;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 4000);
camera.position.set(170, 120, 230);
const controls = new MapControls(camera, renderer.domElement);
controls.target.set(0, 15, 0);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.5; controls.minDistance = 6; controls.maxDistance = 1800;
controls.screenSpacePanning = false;

const lighting = new LevelLighting(renderer, scene, camera);
const lib = new TextureLibrary(renderer);
const mats = new CityMaterials(lib, lighting);
const effects = new Effects(scene, lighting);

let city = null, demolition = null;
const state = { tool: 'orbit', power: 1, cycle: false };

function buildCity(seed, size) {
  if (city) {
    lighting.level.remove(city.group); scene.remove(city.far); city.dispose();
    demolition.clear();
  }
  const t0 = performance.now();
  const layout = generateLayout({ seed, blocksX: size, blocksZ: size });
  city = new City(layout, mats, lib, lighting);
  city.lodDistance = +$('lod').value;
  lighting.level.add(city.group); scene.add(city.far);
  demolition = new Demolition(lighting.level, city, mats, effects, lighting);
  lighting.setBounds(city.bounds);
  lighting.rebuild();
  console.info(`city: ${layout.buildings.length} buildings in ${(performance.now() - t0).toFixed(0)} ms`);
}

/* ---------- loading ---------- */
async function generateTextures(size) {
  const ld = $('loading'); ld.classList.remove('hide');
  $('loadLabel').textContent = `توليد الخامات PBR بدقة ${size}×${size}…`;
  await lib.generate(size, 1, (f) => { $('loadBar').style.width = (f * 100).toFixed(1) + '%'; });
  ld.classList.add('hide');
  updateVRAM();
}
function updateVRAM() {
  const r = +$('texRes').value, mb = estimateVRAM(r);
  $('vram').textContent = `ذاكرة الخامات ≈ ${mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(0) + ' MB'}` + (r >= 4096 ? ' — يحتاج بطاقة رسوميات ≥ 4GB' : '') + (lib.genMs ? ` · آخر توليد ${(lib.genMs / 1000).toFixed(1)}s` : '');
}

/* ---------- input ---------- */
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  keys.add(e.code);
  if (e.code === 'Digit1') setTool('orbit'); if (e.code === 'Digit2') setTool('strike'); if (e.code === 'Digit3') setTool('implode');
});
addEventListener('keyup', (e) => keys.delete(e.code));

function setTool(t) {
  state.tool = t;
  document.querySelectorAll('input[name=tool]').forEach((r) => (r.checked = r.value === t));
  document.body.classList.toggle('aim', t !== 'orbit');
  const hint = { orbit: '', strike: 'انقر على أي مبنى أو شارع لإطلاق صاروخ', implode: 'انقر على مبنى لتفجيره تفجيراً متحكَّماً' }[t];
  $('toolHint').textContent = hint; $('toolHint').classList.toggle('on', !!hint);
}

const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || down.b !== 0) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
  down = null;
  if (moved > 6 || dt > 400 || state.tool === 'orbit' || !city) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = pick(raycaster.ray);
  if (!hit) return;
  if (state.tool === 'strike') {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const from = camera.position.clone().addScaledVector(right, 18).add(new THREE.Vector3(0, 30, 0));
    effects.launchMissile(from, hit.point, (p) => demolition.strike(p, { radius: 11, power: state.power }));
  } else if (state.tool === 'implode' && hit.building) demolition.implode(hit.building);
});

function pick(ray) {
  let best = city.raycastBuildings(ray);
  const deb = raycaster.intersectObjects(demolition.pickables(), false)[0];
  if (deb && (!best || deb.distance < best.distance)) best = { point: deb.point, distance: deb.distance };
  const gp = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  if (gp) { const d = gp.distanceTo(ray.origin); if (!best || d < best.distance) best = { point: gp, distance: d }; }
  return best;
}

/* ---------- UI bindings ---------- */
const bindRange = (id, fn) => { const el = $(id); el.addEventListener('input', () => fn(+el.value)); };
document.querySelectorAll('input[name=tool]').forEach((r) => r.addEventListener('change', () => setTool(r.value)));
bindRange('power', (v) => (state.power = v));
const fmtTime = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
bindRange('time', (v) => { lighting.setTime(v); $('timeVal').textContent = fmtTime(v); });
$('cycle').addEventListener('change', (e) => (state.cycle = e.target.checked));
bindRange('sunAz', (v) => { lighting.params.sunAzOffset = v; lighting.setTime(); });
bindRange('exposure', (v) => (lighting.params.exposure = v));
bindRange('bloom', (v) => (lighting.params.bloom = v));
bindRange('saturation', (v) => (lighting.params.saturation = v));
bindRange('contactAO', (v) => (lighting.params.contactAO = v));
bindRange('bounce', (v) => (lighting.params.bounce = v));
$('ssao').addEventListener('change', (e) => (lighting.params.ssao = e.target.checked));
$('probe').addEventListener('change', (e) => (lighting.params.probe = e.target.checked));
bindRange('weather', (v) => (mats.u.uWeather.value = v));
bindRange('normalStr', (v) => (mats.u.uNormalStr.value = v));
bindRange('lod', (v) => city && (city.lodDistance = v));
$('texRes').addEventListener('change', updateVRAM);
$('applyRes').addEventListener('click', () => generateTextures(+$('texRes').value));
$('pr').addEventListener('change', (e) => { renderer.setPixelRatio(+e.target.value); onResize(); });
$('generate').addEventListener('click', () => buildCity(+$('seed').value | 0, +$('size').value));
$('randomSeed').addEventListener('click', () => { $('seed').value = Math.floor(Math.random() * 1e6); buildCity(+$('seed').value, +$('size').value); });
$('clearDebris').addEventListener('click', () => buildCity(city.layout.seed, city.layout.blocksX));
$('collapse').addEventListener('click', () => $('panel').classList.toggle('collapsed'));

function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h); lighting.resize(w, h);
}
addEventListener('resize', onResize);

/* ---------- frame loop ---------- */
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), rgt = new THREE.Vector3(), shakeOff = new THREE.Vector3();
let fpsAcc = 0, fpsN = 0, fps = 0, statT = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  renderer.info.reset();

  // WASD pan
  if (keys.size) {
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); rgt.crossVectors(fwd, camera.up).normalize();
    const sp = Math.max(20, camera.position.distanceTo(controls.target) * 0.9) * dt, mv = new THREE.Vector3();
    if (keys.has('KeyW')) mv.add(fwd); if (keys.has('KeyS')) mv.sub(fwd); if (keys.has('KeyD')) mv.add(rgt); if (keys.has('KeyA')) mv.sub(rgt);
    mv.multiplyScalar(sp); camera.position.add(mv); controls.target.add(mv);
  }
  controls.update();
  if (state.cycle) { const t = (lighting.params.time + dt * 0.4) % 24; $('time').value = t; $('timeVal').textContent = fmtTime(t); lighting.setTime(t); }

  const camDist = camera.position.distanceTo(controls.target);
  lighting.params.shadowRadius = THREE.MathUtils.clamp(camDist * 1.1, 90, 520);
  lighting.setFocus(controls.target);
  if (city) { city.update(camera, dt); demolition.update(dt); }
  effects.update(dt, demolition ? demolition.world.gravity : 13);

  // camera shake (trauma^2), applied only for this frame's render
  const tr = demolition ? demolition.trauma : 0, s = tr * tr, tt = performance.now() * 0.001;
  shakeOff.set(Math.sin(tt * 37.1) + Math.sin(tt * 61.7) * 0.5, Math.sin(tt * 43.3 + 1.3), Math.sin(tt * 29.9 + 2.1)).multiplyScalar(s * 1.6);
  camera.position.add(shakeOff); const roll = Math.sin(tt * 23.0) * s * 0.025; camera.rotateZ(roll);
  lighting.render(dt);
  camera.rotateZ(-roll); camera.position.sub(shakeOff);

  fpsAcc += dt; fpsN++;
  if ((statT += dt) > 0.5 && city) {
    fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; statT = 0;
    const info = renderer.info;
    $('stats').textContent = [
      `FPS            ${fps.toFixed(0)}`,
      `draw calls     ${info.render.calls} (all passes)`,
      `triangles      ${(info.render.triangles / 1e6).toFixed(2)} M`,
      `buildings      ${city.layout.buildings.filter((b) => !b.demolished).length} / ${city.layout.buildings.length}`,
      `LOD0 chunks    ${city.stats.detailChunks} / ${city.chunks.length}${city.stats.building ? ' (+streaming)' : ''}`,
      `debris bodies  ${demolition.cellCount} (active ${demolition.activeCount})`,
      `textures       ${lib.size}px x ${LAYER_COUNT} layers`,
      `geometries     ${info.memory.geometries}`,
    ].join('\n');
  }
}

/* ---------- boot ---------- */
(async () => {
  buildCity(+$('seed').value, +$('size').value);
  updateVRAM();
  await generateTextures(+$('texRes').value);
  lighting.rebuild();
  frame();
})();

// debug / automation handle
window.__city = { get city() { return city; }, get demolition() { return demolition; }, lighting, camera, controls, lib, setTool, pick: (r) => pick(r) };
