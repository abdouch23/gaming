import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { LevelLighting } from './lighting/LevelLighting.js';
import { TextureLibrary, estimateVRAM } from './textures/TextureLibrary.js';
import { CityMaterials } from './materials/CityMaterials.js';
import { LAYER_COUNT } from './materials/layers.js';
import { generateLayout, DEFAULT_PARAMS, PRESETS } from './city/CityLayout.js';
import { City } from './city/City.js';
import { STYLES } from './city/BuildingGenerator.js';
import { Effects } from './destruction/Effects.js';
import { Demolition } from './destruction/Demolition.js';
import { FirstPerson } from './player/FirstPerson.js';
import { exportCity } from './export/EngineExport.js';

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
controls.maxPolarAngle = 1.5; controls.minDistance = 6; controls.maxDistance = 2200;
controls.screenSpacePanning = false;

const lighting = new LevelLighting(renderer, scene, camera);
const lib = new TextureLibrary(renderer);
const mats = new CityMaterials(lib, lighting);
const effects = new Effects(scene, lighting);

const fps = new FirstPerson(camera, renderer.domElement, effects.audio);
let city = null, demolition = null, selected = null;
const state = { tool: 'orbit', power: 1, cycle: false };

/* ---------- city parameters ---------- */
const STYLE_NAMES = { haussmann: 'هوسماني', brick: 'طوب', office: 'مكاتب', tower: 'أبراج', townhouse: 'منازل' };
const PARAM_UI = [
  ['size', 'عدد البلوكات / الحلقات', 3, 16, 1],
  ['blockSize', 'حجم البلوك (م)', 40, 160, 1],
  ['blockAspect', 'نسبة عمق البلوك', 0.4, 1.6, 0.05],
  ['avenueW', 'عرض الشارع الرئيسي', 12, 36, 0.5],
  ['streetW', 'عرض الشارع الفرعي', 7, 20, 0.5],
  ['avenueEvery', 'شارع رئيسي كل', 1, 6, 1],
  ['sidewalk', 'عرض الرصيف', 2, 9, 0.25],
  ['cornerR', 'استدارة الزوايا', 0.5, 18, 0.5],
  ['rotation', 'دوران الشبكة (°)', 0, 90, 1],
  ['jitter', 'تشوه عضوي', 0, 0.45, 0.01],
  ['curve', 'انحناء الشوارع', 0, 1, 0.05],
  ['downtown', 'حجم وسط المدينة', 0, 0.9, 0.01],
  ['towerDensity', 'كثافة الأبراج', 0, 3, 0.05],
  ['heightScale', 'ارتفاع المباني', 0.4, 2.5, 0.05],
  ['density', 'كثافة المباني', 0.3, 1, 0.05],
  ['parks', 'نسبة الحدائق', 0, 0.4, 0.01],
  ['trees', 'كثافة الأشجار', 0, 2.5, 0.05],
  ['cars', 'كثافة السيارات', 0, 2.5, 0.05],
  ['lampSpacing', 'تباعد أعمدة الإنارة', 14, 60, 1],
];
const params = structuredClone(DEFAULT_PARAMS);

function buildParamUI() {
  const box = $('params');
  for (const [k, label, min, max, step] of PARAM_UI) {
    const l = document.createElement('label');
    l.innerHTML = `${label} <input type="range" id="p_${k}" min="${min}" max="${max}" step="${step}" /><span id="v_${k}"></span>`;
    box.appendChild(l);
    const el = l.querySelector('input');
    el.addEventListener('input', () => { params[k] = +el.value; $('v_' + k).textContent = fmt(+el.value); $('preset').value = ''; scheduleGen(); });
  }
  const st = $('styleToggles');
  for (const s of Object.keys(STYLES)) {
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" id="s_${s}" /> ${STYLE_NAMES[s]}`;
    st.appendChild(l);
    l.querySelector('input').addEventListener('change', (e) => { params.styles[s] = e.target.checked; $('preset').value = ''; scheduleGen(); });
  }
  for (const [k, pr] of Object.entries(PRESETS)) { const o = document.createElement('option'); o.value = k; o.textContent = pr.label; $('preset').appendChild(o); }
  $('preset').addEventListener('change', (e) => {
    const pr = PRESETS[e.target.value]; if (!pr) return;
    const { label, ...rest } = pr; void label;
    Object.assign(params, structuredClone(rest)); syncParamUI(); buildCity();
  });
  $('p_type').addEventListener('change', (e) => { params.type = e.target.value; $('preset').value = ''; scheduleGen(); });
  $('p_seed').addEventListener('change', (e) => { params.seed = +e.target.value | 0; scheduleGen(); });
}
const fmt = (v) => (Math.abs(v) >= 10 || Number.isInteger(v) ? String(Math.round(v * 10) / 10) : v.toFixed(2));
function syncParamUI() {
  for (const [k] of PARAM_UI) { $('p_' + k).value = params[k]; $('v_' + k).textContent = fmt(params[k]); }
  for (const s of Object.keys(STYLES)) $('s_' + s).checked = !!params.styles[s];
  $('p_type').value = params.type; $('p_seed').value = params.seed;
}
let genTimer = 0;
function scheduleGen() { if (!$('autoGen').checked) return; clearTimeout(genTimer); genTimer = setTimeout(buildCity, 350); }

function buildCity() {
  select(null);
  if (city) { lighting.level.remove(city.group); scene.remove(city.far); city.dispose(); demolition.clear(); }
  const t0 = performance.now();
  const layout = generateLayout(params);
  city = new City(layout, mats, lib, lighting);
  city.lodDistance = +$('lod').value; city.trees.lodDist = +$('treeLod').value;
  city.trees.uniforms.uWind.value = +$('wind').value;
  lighting.level.add(city.group); scene.add(city.far);
  demolition = new Demolition(lighting.level, city, mats, effects, lighting);
  lighting.setBounds(city.bounds);
  lighting.lumina.setCity(layout);
  lighting.rebuild();
  lighting.resetExposure();
  fps.setWorld(city, demolition);
  drawMinimap(true);
  console.info(`city: ${layout.buildings.length} buildings, ${layout.trees.length} trees in ${(performance.now() - t0).toFixed(0)} ms`);
}

/* ---------- minimap ---------- */
const STYLE_COL = { haussmann: '#d9c9a8', brick: '#b0634a', office: '#9aa3ad', tower: '#6fa6d6', townhouse: '#e8b98a' };
let mapCache = null, mapXf = null;
function drawMinimap(rebuild) {
  const cv = $('minimap'), g = cv.getContext('2d'), W = cv.width;
  if (rebuild || !mapCache) {
    const B = city.layout.bounds, m = city.layout.maxW, span = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) + 2 * m;
    const s = W / span, cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;
    mapXf = { s, cx, cz, W };
    const X = (x) => (x - cx) * s + W / 2, Z = (z) => (z - cz) * s + W / 2;
    const off = document.createElement('canvas'); off.width = off.height = W; const o = off.getContext('2d');
    o.fillStyle = '#3c4a34'; o.fillRect(0, 0, W, W);
    o.fillStyle = '#2b2e33'; o.beginPath(); city.layout.hull.forEach((p, i) => (i ? o.lineTo(X(p[0]), Z(p[1])) : o.moveTo(X(p[0]), Z(p[1])))); o.closePath();
    o.lineWidth = m * s; o.strokeStyle = '#2b2e33'; o.lineJoin = 'round'; o.fill(); o.stroke();
    const poly = (P, fill) => { o.fillStyle = fill; o.beginPath(); P.forEach((p, i) => (i ? o.lineTo(X(p[0]), Z(p[1])) : o.moveTo(X(p[0]), Z(p[1])))); o.closePath(); o.fill(); };
    for (const b of city.layout.blocks) { poly(b.curb, '#8d8a84'); if (b.lawn) poly(b.lot, b.park ? '#4f7a3c' : '#5f7f4a'); }
    for (const b of city.layout.buildings) {
      if (b.removed) continue;
      const c = Math.cos(b.angle), sn = Math.sin(b.angle), pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const lx = (u * b.w) / 2, lz = (v * b.d) / 2; return [b.cx + lx * c + lz * sn, b.cz - lx * sn + lz * c]; });
      poly(pts, b.demolished ? '#5a5048' : STYLE_COL[b.style]);
    }
    o.fillStyle = '#2f6d2a'; for (const t of city.layout.trees) { o.beginPath(); o.arc(X(t.x), Z(t.z), Math.max(0.8, 2.2 * s * t.s), 0, 7); o.fill(); }
    mapCache = off;
  }
  g.drawImage(mapCache, 0, 0);
  const { s, cx, cz } = mapXf, X = (x) => (x - cx) * s + W / 2, Z = (z) => (z - cz) * s + W / 2;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const p = fps.active ? camera.position : controls.target, a = Math.atan2(dir.z, dir.x);
  g.fillStyle = 'rgba(255,177,92,.25)'; g.beginPath(); g.moveTo(X(camera.position.x), Z(camera.position.z));
  g.arc(X(camera.position.x), Z(camera.position.z), 40, a - 0.45, a + 0.45); g.closePath(); g.fill();
  g.fillStyle = '#ffb15c'; g.beginPath(); g.arc(X(p.x), Z(p.z), 4, 0, 7); g.fill();
  if (selected) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(X(selected.cx), Z(selected.cz), 7, 0, 7); g.stroke(); }
}
$('minimap').addEventListener('click', (e) => {
  if (!mapXf) return;
  const r = e.target.getBoundingClientRect(), k = mapXf.W / r.width;
  const x = ((e.clientX - r.left) * k - mapXf.W / 2) / mapXf.s + mapXf.cx, z = ((e.clientY - r.top) * k - mapXf.W / 2) / mapXf.s + mapXf.cz;
  if (fps.active) { fps.teleport(x, z); return; }
  const d = new THREE.Vector3(x - controls.target.x, 0, z - controls.target.z);
  controls.target.add(d); camera.position.add(d);
});

/* ---------- loading ---------- */
async function generateTextures(size) {
  const ld = $('loading'); ld.classList.remove('hide');
  $('loadLabel').textContent = `توليد الخامات PBR بدقة ${size}×${size}…`;
  await lib.generate(size, 1, (f) => { $('loadBar').style.width = (f * 100).toFixed(1) + '%'; });
  lighting.lumina.setAlbedo(lib.avgAlbedo);
  lighting.rebuild();
  ld.classList.add('hide');
  updateVRAM();
}
function updateVRAM() {
  const r = +$('texRes').value, mb = estimateVRAM(r);
  $('vram').textContent = `ذاكرة الخامات ≈ ${mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(0) + ' MB'}` + (r >= 4096 ? ' — يحتاج بطاقة رسوميات ≥ 4GB' : '') + (lib.genMs ? ` · آخر توليد ${(lib.genMs / 1000).toFixed(1)}s` : '');
}

/* ---------- building editor ---------- */
const selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffb15c, depthTest: false, transparent: true }));
selBox.renderOrder = 10; selBox.visible = false; selBox.userData.noAO = true; scene.add(selBox);
function select(b) {
  selected = b && !b.demolished ? b : null;
  $('inspector').classList.toggle('hidden', !selected);
  selBox.visible = !!selected;
  if (!selected) return;
  const h = b.H + b.roofH;
  selBox.matrix.copy(b.matrix).multiply(new THREE.Matrix4().makeTranslation(0, h / 2, 0)).multiply(new THREE.Matrix4().makeScale(b.w + 0.6, h + 0.6, b.d + 0.6));
  selBox.matrixAutoUpdate = false;
  $('inspTitle').textContent = `مبنى #${b.id} — ${STYLE_NAMES[b.style]} · ${b.floors} طوابق · ${b.w.toFixed(0)}×${b.d.toFixed(0)} م`;
  $('inspStyle').value = b.style; $('inspFloors').value = b.floors; $('inspFloorsVal').textContent = b.floors;
}
const editApply = (changes) => { if (!selected) return; select(city.replaceBuilding(selected, changes)); drawMinimap(true); };
$('inspStyle').addEventListener('change', (e) => editApply({ style: e.target.value }));
$('inspFloors').addEventListener('input', (e) => { $('inspFloorsVal').textContent = e.target.value; });
$('inspFloors').addEventListener('change', (e) => editApply({ floors: +e.target.value }));
$('inspRandom').addEventListener('click', () => editApply({ seed: (Math.random() * 2 ** 31) >>> 0 }));
$('inspDelete').addEventListener('click', () => { if (!selected) return; city.removeBuilding(selected); select(null); drawMinimap(true); });
$('inspImplode').addEventListener('click', () => { if (!selected) return; const b = selected; select(null); demolition.implode(b); });

/* ---------- input ---------- */
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  keys.add(e.code);
  if (e.code === 'KeyF') { toggleWalk(); return; }
  if (fps.active && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
  const t = { Digit1: 'orbit', Digit2: 'edit', Digit3: 'strike', Digit4: 'implode' }[e.code]; if (t) setTool(t);
  if (e.code === 'Delete' && selected) $('inspDelete').click();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

/* ---------- FPS walk mode ---------- */
function toggleWalk() {
  if (!city) return;
  if (!fps.active) {
    fps.enter(controls);
    if (state.tool === 'orbit') setTool('strike');
    document.body.classList.add('walking');
    fps.lock();
  } else {
    fps.exit(controls);
    document.body.classList.remove('walking', 'paused');
    $('fpsOverlay').classList.add('hidden');
  }
  lighting.syncCamera();
  $('crosshair').classList.toggle('hidden', !fps.active);
  $('fpsHud').classList.toggle('hidden', !fps.active);
  $('walkBtn').textContent = fps.active ? '🛑 خروج من وضع المشي (F)' : '🚶 وضع المشي FPS (F)';
}
fps.onLockChange = (locked) => {
  const paused = fps.active && !locked;
  $('fpsOverlay').classList.toggle('hidden', !paused);
  document.body.classList.toggle('paused', paused);
  if (!locked) keys.clear();
};
$('walkBtn').addEventListener('click', toggleWalk);
$('walkExit').addEventListener('click', (e) => { e.stopPropagation(); toggleWalk(); });
$('fpsOverlay').addEventListener('click', () => fps.lock());
$('sens').addEventListener('input', (e) => (fps.sens = +e.target.value));

function setTool(t) {
  state.tool = t;
  document.querySelectorAll('input[name=tool]').forEach((r) => (r.checked = r.value === t));
  document.body.classList.toggle('aim', t !== 'orbit');
  if (t !== 'edit') select(null);
  const hint = fps.active ? '' : { orbit: '', edit: 'انقر على مبنى لتعديل طرازه وعدد طوابقه أو حذفه', strike: 'انقر على أي مبنى أو شارع لإطلاق صاروخ', implode: 'انقر على مبنى لتفجيره تفجيراً متحكَّماً' }[t];
  $('toolHint').textContent = hint; $('toolHint').classList.toggle('on', !!hint);
}

const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (fps.active) { // crosshair interaction
    down = null;
    if (!fps.locked) { fps.lock(); return; }
    if (e.button === 0) useTool(0, 0);
    return;
  }
  down = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || down.b !== 0) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
  down = null;
  if (moved > 6 || dt > 400 || state.tool === 'orbit' || !city) return;
  useTool((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});

function useTool(nx, ny) {
  if (state.tool === 'orbit' || !city) return;
  ndc.set(nx, ny);
  raycaster.setFromCamera(ndc, camera);
  const hit = pick(raycaster.ray);
  if (state.tool === 'edit') { select(hit && hit.building); return; }
  if (!hit) return;
  if (state.tool === 'strike') {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const from = fps.active // launcher on the shoulder vs. offscreen artillery
      ? camera.position.clone().addScaledVector(right, 0.45).add(new THREE.Vector3(0, -0.3, 0)).addScaledVector(raycaster.ray.direction, 0.8)
      : camera.position.clone().addScaledVector(right, 18).add(new THREE.Vector3(0, 30, 0));
    effects.launchMissile(from, hit.point, (p) => demolition.strike(p, { radius: 11, power: state.power }));
  } else if (state.tool === 'implode' && hit.building) demolition.implode(hit.building);
}

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
$('autoExp').addEventListener('change', (e) => { lighting.params.autoExposure = e.target.checked; lighting.resetExposure(); });
bindRange('bloom', (v) => (lighting.params.bloom = v));
bindRange('saturation', (v) => (lighting.params.saturation = v));
bindRange('contactAO', (v) => (lighting.params.contactAO = v));
bindRange('bounce', (v) => (lighting.params.bounce = v));
$('ssao').addEventListener('change', (e) => (lighting.params.ssao = e.target.checked));
$('probe').addEventListener('change', (e) => (lighting.params.probe = e.target.checked));
bindRange('weather', (v) => (mats.u.uWeather.value = v));
for (const k of ['gi', 'spec', 'godRays', 'fog', 'clouds', 'glare']) bindRange(k, (v) => (lighting.params[k] = v));
$('lumina').addEventListener('change', (e) => (lighting.params.lumina = e.target.checked));
$('pom').addEventListener('change', (e) => (mats.u.uPomOn.value = e.target.checked ? 1 : 0));
$('farSh').addEventListener('change', (e) => (lighting.lumina.u.uLmFarSh.value = e.target.checked ? 1 : 0));
// scalability presets: Lumina ranges / steps, POM, shadow resolution, SSAO
const QUALITY = {
  low: { steps: 6, near: 60, mid: 220, pom: 0, shadow: 2048 },
  medium: { steps: 8, near: 100, mid: 320, pom: 1, shadow: 2048 },
  high: { steps: 10, near: 140, mid: 450, pom: 1, shadow: 4096 },
  epic: { steps: 14, near: 220, mid: 700, pom: 1, shadow: 4096 },
};
$('quality').addEventListener('change', (e) => {
  const q = QUALITY[e.target.value], u = lighting.lumina.u, sun = lighting.sun;
  u.uLmSteps.value = q.steps; u.uLmNear.value = q.near; u.uLmMid.value = q.mid;
  mats.u.uPomOn.value = q.pom; $('pom').checked = !!q.pom;
  if (sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.set(q.shadow, q.shadow); lighting.opts.shadowMap = q.shadow; if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
});
bindRange('wet', (v) => (mats.u.uWet.value = v));
bindRange('detail', (v) => (mats.u.uDetail.value = v));
bindRange('wind', (v) => city && (city.trees.uniforms.uWind.value = v));
bindRange('normalStr', (v) => (mats.u.uNormalStr.value = v));
bindRange('lod', (v) => city && (city.lodDistance = v));
bindRange('treeLod', (v) => city && (city.trees.lodDist = v));
$('texRes').addEventListener('change', updateVRAM);
$('applyRes').addEventListener('click', () => generateTextures(+$('texRes').value));
$('pr').addEventListener('change', (e) => { renderer.setPixelRatio(+e.target.value); onResize(); });
$('generate').addEventListener('click', buildCity);
$('randomSeed').addEventListener('click', () => { params.seed = Math.floor(Math.random() * 1e6); syncParamUI(); buildCity(); });
$('clearDebris').addEventListener('click', buildCity);
$('collapse').addEventListener('click', () => $('panel').classList.toggle('collapsed'));

function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h); lighting.resize(w, h);
}
addEventListener('resize', onResize);

/* ---------- game-engine export ---------- */
$('exRadius').addEventListener('input', (e) => ($('exRadiusVal').textContent = e.target.value));
let exporting = false;
async function runExport() {
  if (exporting || !city) return null;
  exporting = true; $('exBtn').disabled = true;
  const opts = {
    target: $('exTarget').value, region: $('exRegion').value, radius: +$('exRadius').value, texRes: +$('exRes').value,
    center: (fps.active ? camera.position : controls.target).clone(),
    collision: $('exCol').checked, markings: $('exMarks').checked, trees: $('exTrees').checked, props: $('exProps').checked,
  };
  try {
    const { zip, stats } = await exportCity({ city, trees: city.trees, opts, onStatus: (msg, f) => ($('exStatus').textContent = `${msg} ${Math.round(f * 100)}%`) });
    const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    const a = document.createElement('a'); a.href = url; a.download = `aaa-city-${opts.target}-${city.layout.seed}.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    $('exStatus').textContent = `✓ ${stats.buildings} مبنى · ${stats.materials} خامة · glb ${stats.glbMB.toFixed(1)} MB · ${stats.seconds.toFixed(0)}s`;
    return stats;
  } catch (err) {
    console.error(err); $('exStatus').textContent = 'فشل التصدير: ' + err.message; return null;
  } finally { exporting = false; $('exBtn').disabled = false; }
}
$('exBtn').addEventListener('click', runExport);

/* ---------- frame loop ---------- */
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), rgt = new THREE.Vector3(), shakeOff = new THREE.Vector3(), fpsFocus = new THREE.Vector3(), fpsFwd = new THREE.Vector3();
let fpsAcc = 0, fpsN = 0, frameRate = 0, statT = 0, mapT = 0;

function frame() {
  requestAnimationFrame(frame);
  if (exporting) { clock.getDelta(); return; } // export owns the main thread; resume without a time jump
  const dt = Math.min(clock.getDelta(), 0.05);
  renderer.info.reset();

  if (fps.active) fps.update(dt, keys);
  else if (keys.size) { // WASD pan
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); rgt.crossVectors(fwd, camera.up).normalize();
    const sp = Math.max(20, camera.position.distanceTo(controls.target) * 0.9) * dt, mv = new THREE.Vector3();
    if (keys.has('KeyW')) mv.add(fwd); if (keys.has('KeyS')) mv.sub(fwd); if (keys.has('KeyD')) mv.add(rgt); if (keys.has('KeyA')) mv.sub(rgt);
    mv.multiplyScalar(sp); camera.position.add(mv); controls.target.add(mv);
  }
  if (!fps.active) controls.update();
  if (state.cycle) { const t = (lighting.params.time + dt * 0.4) % 24; $('time').value = t; $('timeVal').textContent = fmtTime(t); lighting.setTime(t); }

  // interiors seen through windows by day scale with daylight (keeps them plausible under auto exposure)
  mats.u.uDay.value = THREE.MathUtils.clamp(0.06 * lighting.sun.intensity, 0.03, 0.3);
  if (fps.active) { // tight, sharp shadow box ahead of the player
    lighting.params.shadowRadius = 75;
    lighting.setFocus(fpsFocus.copy(camera.position).addScaledVector(fps.forward(fpsFwd).setY(0).normalize(), 30).setY(0));
    $('fpsHud').textContent = `${(fps.speed * 3.6).toFixed(0)} km/h · tool: ${state.tool} · F exit`;
  } else {
    const camDist = camera.position.distanceTo(controls.target);
    lighting.params.shadowRadius = THREE.MathUtils.clamp(camDist * 1.1, 90, 520);
    lighting.setFocus(controls.target);
  }
  if (city) { city.update(camera, dt); demolition.update(dt); }
  effects.update(dt, demolition ? demolition.world.gravity : 13);

  // camera shake (trauma^2), applied only for this frame's render
  const tr = demolition ? demolition.trauma : 0, s = tr * tr, tt = performance.now() * 0.001;
  shakeOff.set(Math.sin(tt * 37.1) + Math.sin(tt * 61.7) * 0.5, Math.sin(tt * 43.3 + 1.3), Math.sin(tt * 29.9 + 2.1)).multiplyScalar(s * 1.6);
  camera.position.add(shakeOff); const roll = Math.sin(tt * 23.0) * s * 0.025; camera.rotateZ(roll);
  lighting.render(dt);
  camera.rotateZ(-roll); camera.position.sub(shakeOff);

  if ((mapT += dt) > 0.2 && city) { mapT = 0; drawMinimap(false); }
  fpsAcc += dt; fpsN++;
  if ((statT += dt) > 0.5 && city) {
    frameRate = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; statT = 0;
    const info = renderer.info;
    $('stats').textContent = [
      `FPS            ${frameRate.toFixed(0)}`,
      `draw calls     ${info.render.calls} (all passes)`,
      `triangles      ${(info.render.triangles / 1e6).toFixed(2)} M`,
      `buildings      ${city.layout.buildings.filter((b) => !b.demolished).length} / ${city.layout.buildings.length}`,
      `trees          ${city.trees.count}`,
      `roads          ${city.layout.chains.length} segments, ${city.layout.intersections.length} junctions`,
      `LOD0 chunks    ${city.stats.detailChunks} / ${city.chunks.length}${city.stats.building ? ' (+streaming)' : ''}`,
      `debris bodies  ${demolition.cellCount} (active ${demolition.activeCount})`,
      `textures       ${lib.size}px x ${LAYER_COUNT} layers`,
    ].join('\n');
  }
}

/* ---------- boot ---------- */
(async () => {
  buildParamUI(); syncParamUI();
  buildCity();
  updateVRAM();
  await generateTextures(+$('texRes').value);
  lighting.rebuild();
  frame();
})();

// debug / automation handle
window.__city = { runExport, renderer, fps, toggleWalk, keys, get city() { return city; }, get demolition() { return demolition; }, lighting, camera, controls, lib, mats, params, setTool, select, buildCity, syncParamUI, pick: (r) => pick(r) };
