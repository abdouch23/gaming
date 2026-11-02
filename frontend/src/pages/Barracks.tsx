import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX, Eye, Heart, KeyRound, Siren, Map as MapIcon } from "lucide-react";
import { BarracksLevel, type HudState, type Ending, type Plan, type Entry, type Diversion, type Who, type MapState } from "@/lib/barracks/level";
import { BarracksAudio } from "@/lib/barracks/audio";
import type { Zone } from "@/lib/barracks/map";

const CONTROLS: { key: string; ar: string; en: string }[] = [
  { key: "W A S D", ar: "تحرّك", en: "Move" },
  { key: "Shift", ar: "ركض (يُسمَع)", en: "Run (loud)" },
  { key: "C", ar: "انحناء / زحف", en: "Crouch / crawl" },
  { key: "E", ar: "تفاعل (امسك)", en: "Interact (hold)" },
  { key: "F", ar: "إسكات من الخلف", en: "Takedown from behind" },
  { key: "B / RMB", ar: "منظار وتعليم", en: "Binoculars & mark" },
  { key: "LMB · R", ar: "إطلاق · تلقيم", en: "Fire · Reload" },
  { key: "G", ar: "إشارة للخلية", en: "Signal the cell" },
  { key: "M", ar: "الخريطة", en: "Map" },
  { key: "Esc", ar: "توقّف", en: "Pause" },
];

interface Line { who: string; ar: string; en: string; you?: boolean }
const MESSAOUD: Line[] = [
  { who: "مسعود", ar: "خرجتَ من تحت أعينهم؟ جيّد. المخبر عند المقهى يبيع أسماءنا بفنجان قهوة.", en: "You got out from under their eyes? Good. The informer at the café sells our names for a cup of coffee." },
  { who: "أنت", you: true, ar: "قالوا إن الخلية تنتظرني الليلة.", en: "They said the cell is waiting for me tonight." },
  { who: "مسعود", ar: "عند معصرة الزيتون. اتبع الوادي، لا يراك أحد من الأعلى. الحارس سيسألك: «هل انحنت الزيتونة؟» فتجيب: «ليس هذا العام». لا تخطئ.", en: "At the olive mill. Follow the oued; no one sees you from above. The sentry will ask: “Has the olive tree bowed?” You answer: “Not this year.” Don't get it wrong." },
  { who: "مسعود", ar: "وخذ منظاري. من كاف الغراب تُرى الثكنة كلّها. كل حارس تعدّه الآن رصاصة لن تُطلَق عليك بعد ساعة.", en: "And take my binoculars. From Crow's Kef you see the whole barracks. Every guard you count now is a bullet not fired at you in an hour." },
  { who: "مسعود", ar: "آخر شيء: ضابط الحراسة يغفو أمام غرفة الحرس، ومفتاح المخزن على حزامه.", en: "One last thing: the duty officer dozes outside the guardroom, and the armory key hangs from his belt." },
];
const RABAH_Q: Line = { who: "رابح", ar: "قف! …هل انحنت الزيتونة؟", en: "Halt! …Has the olive tree bowed?" };
const ANSWERS = [
  { id: "a", ar: "الزيتونة صامدة.", en: "The olive tree stands.", ok: false },
  { id: "b", ar: "ليس هذا العام.", en: "Not this year.", ok: true },
  { id: "c", ar: "أرسلني مسعود.", en: "Messaoud sent me.", ok: false },
];
const lakhdarLines = (ok: boolean, tagged: number, total: number): Line[] => [
  ok
    ? { who: "رابح", ar: "ادخل يا أخي. سي لخضر ينتظرك.", en: "Come in, brother. Si Lakhdar is waiting." }
    : { who: "رابح", ar: "…ليست هذه الكلمة. لولا أن مسعود وصفك لي لأطلقت. ادخل — لكن سي لخضر سيعرف.", en: "…That's not the word. If Messaoud hadn't described you I'd have fired. Go in — but Si Lakhdar will know." },
  { who: "سي لخضر", ar: "الليلة أول نوفمبر. في كل الأوراس يضرب الإخوة في الساعة نفسها. ونحن؟ نحن نأخذ السلاح من ثكنتهم.", en: "Tonight is the first of November. All over the Aurès our brothers strike at the same hour. And us? We take the weapons from their barracks." },
  tagged >= Math.ceil(total / 2)
    ? { who: "سي لخضر", ar: `عددتَ ${tagged} من حرّاسهم؟ هذا عمل رجل يعرف الحرب. علّمناهم على الخريطة.`, en: `You counted ${tagged} of their guards? That's a man who knows war. They're on the map.` }
    : tagged > 0
      ? { who: "سي لخضر", ar: `${tagged} فقط من ${total}… سنمشي ونحن نرى نصف الطريق.`, en: `Only ${tagged} of ${total}… we'll walk seeing half the road.` }
      : { who: "سي لخضر", ar: "لم تراقبهم؟ سنمشي إذن ونحن نصف عميان.", en: "You didn't watch them? Then we go half-blind." },
  ...(ok ? [] : [{ who: "سي لخضر", ar: "ورابح يقول إنك نسيت كلمة السرّ. سعيد لن يكمن في الوادي ليغطّي رجلاً لا نعرفه.", en: "And Rabah says you forgot the password. Saïd won't lie in the oued to cover a man we don't know." }]),
  { who: "سي لخضر", ar: "انظر إلى الخريطة. اختر من أين تدخل، وماذا نفعل نحن لنفتح لك الطريق.", en: "Look at the map. Choose where you go in, and what we do to open the way." },
];

const ENTRIES: { id: Entry; ar: string; en: string; noteAr: string; noteEn: string; stealth: number; speed: number; danger: number }[] = [
  { id: "drain", ar: "قناة الصرف", en: "The drain", noteAr: "ازحف تحت السياج الغربي. صامت، لكن ضوء البرج الجنوبي الغربي يمسح الحقل أمامها.", noteEn: "Crawl under the west fence. Silent — but the south-west searchlight sweeps the field in front.", stealth: 3, speed: 1, danger: 1 },
  { id: "wire", ar: "السلك الشمالي", en: "The north wire", noteAr: "رابح يعطيك المقصّ. خلف المخزن مباشرة: أقصر طريق، تحت البرج الشمالي الشرقي. القطع 4 ثوانٍ.", noteEn: "Rabah hands you the cutters. Right behind the armory — shortest, under the north-east tower. 4 s to cut.", stealth: 2, speed: 3, danger: 2 },
  { id: "gate", ar: "الهجوم على الباب", en: "Gate assault", noteAr: "الخلية تهاجم الباب عند إشارتك (G). حرب مفتوحة: صفّارة الإنذار فوراً، والجنود يتّجهون إلى الباب.", noteEn: "The cell storms the gate on your signal (G). Open war: siren at once, soldiers converge on the gate.", stealth: 0, speed: 2, danger: 3 },
];
const DIVERSIONS: { id: Diversion; ar: string; en: string; noteAr: string; noteEn: string }[] = [
  { id: "fire", ar: "نار عند الطريق", en: "Fire on the road", noteAr: "عند إشارتك (G) يُشعل سعيد كومة تبن؛ حرّاس الباب ودورية الساحة يخرجون لرؤيتها 75 ثانية.", noteEn: "On your signal (G) Saïd lights a haystack; gate sentries and the yard patrol leave to look for 75 s." },
  { id: "phone", ar: "قطع الهاتف", en: "Cut the phone", noteAr: "سعيد يقطع خطّ الهاتف قبل الهجوم: إن دوّت الصفّارة، لن تصل شاحنة التعزيزات.", noteEn: "Saïd cuts the line first: if the siren sounds, no reinforcement truck arrives." },
  { id: "cover", ar: "تغطية الانسحاب", en: "Cover the retreat", noteAr: "سعيد يكمن عند مخرج الوادي ويطلق النار على من يلاحقك.", noteEn: "Saïd lies in ambush at the oued and fires on your pursuers." },
];

type Dialogue = { who: Who; lines: Line[]; i: number; awaiting: boolean };

// ---------------- tactical map (planning board + M map) ----------------
function TacticalMap({ plan, live, full }: { plan: Plan | null; live: MapState | null; full?: boolean }) {
  const L = useMemo(() => BarracksLevel.layout(), []);
  const vb = full ? "-96 -108 192 200" : "-98 -110 150 102";
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
  const route: Record<Entry, [number, number][]> = {
    drain: [[-66, -30], [-60, -40], [-50, -47.5], [L.DRAIN.x - 1, L.DRAIN.z]],
    wire: [[-66, -30], [-62, -60], [-62, -92], [L.WIRE.x, -92], [L.WIRE.x, L.WIRE.z]],
    gate: [[-66, -30], [-50, -14], [-18, -8], [L.GATE.x, L.GATE.z + 2]],
  };
  const c = L.COMPOUND;
  return (
    <svg viewBox={vb} className="h-full w-full" data-testid={full ? "map-svg" : "plan-svg"}>
      <defs>
        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="rgba(207,230,238,0.06)" strokeWidth="0.3" /></pattern>
      </defs>
      <rect x="-200" y="-200" width="400" height="400" fill="url(#grid)" />
      <path d={path(L.OUED)} fill="none" stroke="rgba(120,170,200,0.35)" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx={L.KEF.x} cy={L.KEF.z} rx={L.KEF.r * 1.25} ry={L.KEF.r} fill="rgba(200,190,160,0.08)" stroke="rgba(200,190,160,0.35)" strokeDasharray="1.5 1.5" strokeWidth="0.4" />
      <text x={L.KEF.x} y={L.KEF.z + 1} fontSize="2.6" fill="rgba(230,220,190,0.6)" textAnchor="middle">كاف الغراب</text>
      <rect x={L.MILL.x - 4} y={L.MILL.z - 3.25} width="8" height="6.5" fill="rgba(232,176,74,0.35)" />
      <text x={L.MILL.x} y={L.MILL.z + 7} fontSize="2.6" fill="rgba(232,176,74,0.85)" textAnchor="middle">المعصرة</text>
      <circle cx={L.RALLY.x} cy={L.RALLY.z} r="3" fill="none" stroke="rgba(140,230,170,0.8)" strokeWidth="0.6" />
      <text x={L.RALLY.x + 4} y={L.RALLY.z + 1} fontSize="2.6" fill="rgba(140,230,170,0.85)">التجمّع</text>
      {/* compound */}
      <rect x={c.minX} y={c.minZ} width={c.maxX - c.minX} height={c.maxZ - c.minZ} fill="rgba(207,230,238,0.04)" stroke="rgba(207,230,238,0.5)" strokeWidth="0.4" strokeDasharray="1 0.6" />
      <rect x="-17" y="-72" width="34" height="34" fill="rgba(207,230,238,0.04)" />
      {L.BUILDINGS.map((b) => (
        <g key={b.id}>
          <rect x={b.x - b.w / 2} y={b.z - b.d / 2} width={b.w} height={b.d} fill={b.kind === "armory" ? "rgba(232,176,74,0.55)" : "rgba(207,230,238,0.18)"} stroke="rgba(207,230,238,0.45)" strokeWidth="0.25" />
          <text x={b.x} y={b.z + 0.9} fontSize={b.kind === "barracks" ? 2.2 : 2.4} fill="rgba(240,240,230,0.75)" textAnchor="middle">{b.kind === "barracks" ? b.id.slice(1) : b.ar}</text>
        </g>
      ))}
      {L.TOWERS.map(([x, z], i) => (
        <g key={i}>
          {(i === 1 || i === 2) && <circle cx={x} cy={z} r="30" fill="rgba(220,235,255,0.04)" stroke="rgba(220,235,255,0.25)" strokeWidth="0.3" strokeDasharray="1 1" />}
          <rect x={x - 1.4} y={z - 1.4} width="2.8" height="2.8" fill="rgba(220,235,255,0.6)" />
        </g>
      ))}
      <circle cx={L.GENERATOR.x} cy={L.GENERATOR.z} r="1.2" fill="#6dff7a" opacity={live?.generatorOff ? 0.2 : 0.8} />
      <circle cx={L.DIVERSION_FIRE.x} cy={L.DIVERSION_FIRE.z} r="1.4" fill="#ff8a3a" opacity={plan?.diversion === "fire" ? 0.9 : 0.25} />
      <circle cx={L.PHONE_POLE.x} cy={L.PHONE_POLE.z} r="1" fill="#cfe6ee" opacity={plan?.diversion === "phone" ? 0.9 : 0.25} />
      {/* entries */}
      {(["drain", "wire", "gate"] as Entry[]).map((e) => (
        <path key={e} d={path(route[e])} fill="none" stroke={plan?.entry === e ? "#e8b04a" : "rgba(232,176,74,0.22)"} strokeWidth={plan?.entry === e ? 0.9 : 0.5} strokeDasharray="2 1.2" />
      ))}
      <circle cx={L.DRAIN.x} cy={L.DRAIN.z} r="1.6" fill="none" stroke="#e8b04a" strokeWidth="0.5" />
      <circle cx={L.WIRE.x} cy={L.WIRE.z} r="1.6" fill="none" stroke="#e8b04a" strokeWidth="0.5" opacity={live?.wireCut ? 0.3 : 1} />
      <circle cx={L.GATE.x} cy={L.GATE.z} r="1.6" fill="none" stroke="#e8b04a" strokeWidth="0.5" />
      {full && (
        <g>
          {L.VILLAGE.slice(0, -1).map((h, i) => <rect key={i} x={h.x - h.w / 2} y={h.z - h.d / 2} width={h.w} height={h.d} fill={i === 0 ? "rgba(232,176,74,0.45)" : "rgba(207,230,238,0.16)"} />)}
          <rect x={L.CEMETERY.x - 8} y={L.CEMETERY.z - 7} width="16" height="14" fill="none" stroke="rgba(207,230,238,0.35)" strokeWidth="0.4" />
          <text x={L.CEMETERY.x} y={L.CEMETERY.z + 11} fontSize="2.6" fill="rgba(240,240,230,0.6)" textAnchor="middle">المقبرة</text>
          <text x="10" y="88" fontSize="3" fill="rgba(240,240,230,0.5)" textAnchor="middle">القرية</text>
          <rect x={L.CHECKPOINT.x - 3} y={L.CHECKPOINT.z - 0.5} width="6" height="1" fill="rgba(255,120,90,0.6)" />
        </g>
      )}
      {/* live layer */}
      {live?.beams.map((b, i) => <circle key={i} cx={b.x} cy={b.z} r="3.8" fill="rgba(230,240,255,0.25)" />)}
      {live?.soldiers.map((s, i) => (
        <g key={i} transform={`translate(${s.x} ${s.z}) rotate(${(-s.yaw * 180) / Math.PI})`}>
          {s.state === "down" ? (
            <text fontSize="2.4" fill="rgba(180,180,180,0.7)" textAnchor="middle" y="0.8">✕</text>
          ) : (
            <>
              <path d="M0 0 L-5 9 A10 10 0 0 0 5 9 Z" fill={s.state === "hunt" || s.state === "alert" ? "rgba(255,74,61,0.25)" : "rgba(255,193,74,0.14)"} />
              <circle r="1" fill={s.state === "hunt" || s.state === "alert" ? "#ff4a3d" : "#ffc14a"} />
            </>
          )}
        </g>
      ))}
      {live?.allies.map((a, i) => <circle key={i} cx={a.x} cy={a.z} r="1" fill="#8ce6aa" />)}
      {live?.objective && <rect x={live.objective.x - 1.2} y={live.objective.z - 1.2} width="2.4" height="2.4" transform={`rotate(45 ${live.objective.x} ${live.objective.z})`} fill="none" stroke="#ffe1aa" strokeWidth="0.5" />}
      {live && (
        <g transform={`translate(${live.player.x} ${live.player.z}) rotate(${(-live.player.yaw * 180) / Math.PI})`}>
          <path d="M0 -2.6 L1.7 1.8 L0 0.9 L-1.7 1.8 Z" fill="#fff" />
        </g>
      )}
    </svg>
  );
}

function Stars({ n, of = 3, tone }: { n: number; of?: number; tone: string }) {
  return <span className={tone}>{"●".repeat(n)}<span className="text-white/15">{"●".repeat(of - n)}</span></span>;
}

export default function Barracks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef<BarracksLevel | null>(null);
  const audioRef = useRef<BarracksAudio | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [entered, setEntered] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [zone, setZone] = useState<Zone | null>(null);
  const [zoneKey, setZoneKey] = useState(0);
  const [hud, setHud] = useState<HudState | null>(null);
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<Plan>({ entry: "drain", diversion: "fire" });
  const [passwordOk, setPasswordOk] = useState(true);
  const [caught, setCaught] = useState<"caught" | "killed" | null>(null);
  const [toasts, setToasts] = useState<{ id: number; ar: string; en: string }[]>([]);
  const [hurt, setHurt] = useState(0);
  const [ending, setEnding] = useState<Ending | null>(null);
  const [crouchOn, setCrouchOn] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [live, setLive] = useState<MapState | null>(null);
  const [isTouch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);

  const toastSeq = useRef(0);
  const toast = (ar: string, en: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-2), { id, ar, en }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const audio = new BarracksAudio();
    audioRef.current = audio;
    const lowPower = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820 || navigator.webdriver;
    let level: BarracksLevel | null = null;
    try {
      level = new BarracksLevel(canvas, {
        lowPower,
        audio,
        onReady: () => setReady(true),
        onActiveChange: (v) => setActive(v),
        onStep: (s, l) => audio.step(s, l),
        onZone: (z) => {
          setZone(z);
          setZoneKey((k) => k + 1);
        },
        onHud: setHud,
        onDialogue: (who) => {
          levelRef.current?.pause();
          setDialogue(who === "messaoud" ? { who, lines: MESSAOUD, i: 0, awaiting: false } : { who, lines: [RABAH_Q], i: 0, awaiting: true });
        },
        onCaught: (r) => {
          setCaught(r);
          window.setTimeout(() => setCaught(null), 2800);
        },
        onCheckpoint: () => toast("✦ تمّ الحفظ", "Checkpoint"),
        onToast: toast,
        onDamage: () => setHurt((n) => n + 1),
        onEnding: (e) => setEnding(e),
      });
      levelRef.current = level;
      level.setOverlay(overlayRef.current);
    } catch {
      setWebglError(true);
      setReady(true);
    }
    return () => {
      level?.dispose();
      audio.dispose();
      levelRef.current = null;
      audioRef.current = null;
    };
  }, []);

  // M toggles the tactical map (the night keeps moving while you read it)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && levelRef.current && entered) setMapOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entered]);
  useEffect(() => {
    if (!mapOpen && !planning) return;
    const tick = () => levelRef.current && setLive(levelRef.current.mapState());
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [mapOpen, planning]);

  const enter = async () => {
    levelRef.current?.enter();
    if (!entered) {
      setEntered(true);
      setSoundOn(true);
      await audioRef.current?.start();
    }
  };
  const toggleSound = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (soundOn) {
      audio.stop();
      setSoundOn(false);
    } else {
      await audio.start();
      setSoundOn(true);
    }
  };

  const line = dialogue ? dialogue.lines[dialogue.i] : null;
  const advance = () => {
    if (!dialogue) return;
    if (dialogue.i < dialogue.lines.length - 1) {
      setDialogue({ ...dialogue, i: dialogue.i + 1 });
      return;
    }
    const lvl = levelRef.current;
    setDialogue(null);
    if (dialogue.who === "messaoud") {
      lvl?.resolveMessaoud();
      lvl?.enter();
    } else {
      setPlan((p) => ({ ...p, diversion: !passwordOk && p.diversion === "cover" ? "fire" : p.diversion }));
      setPlanning(true);
    }
  };
  const answer = (a: (typeof ANSWERS)[number]) => {
    if (!dialogue) return;
    const lvl = levelRef.current;
    lvl?.resolveRabah(a.ok);
    setPasswordOk(a.ok);
    const t = lvl?.taggedCount() ?? { tagged: 0, total: 11 };
    setDialogue({ ...dialogue, awaiting: false, i: 1, lines: [RABAH_Q, { who: "أنت", you: true, ar: a.ar, en: a.en }, ...lakhdarLines(a.ok, t.tagged, t.total)] });
  };
  const confirmPlan = () => {
    setPlanning(false);
    levelRef.current?.applyPlan(plan);
    levelRef.current?.enter();
  };

  const playing = active && entered && !dialogue && !planning && !ending;
  const showOverlay = !active && !dialogue && !planning && !ending && !caught;
  const susp = hud?.suspicion ?? 0;

  return (
    <main data-testid="barracks-page" className="relative h-screen w-full overflow-hidden bg-black text-white select-none">
      <canvas ref={canvasRef} data-testid="level-canvas" className="absolute inset-0 h-full w-full" />
      <canvas ref={overlayRef} data-testid="marker-overlay" className="pointer-events-none absolute inset-0 z-10 h-full w-full" />
      {!ready && <div className="absolute inset-0 z-50 grid place-items-center bg-black"><p className="animate-pulse text-sm text-white/50" dir="rtl">…تحميل الليل · Loading the night</p></div>}
      {webglError && <div data-testid="webgl-error" className="absolute inset-0 z-50 grid place-items-center bg-black text-sm text-white/60">WebGL غير متاح · WebGL is unavailable</div>}

      {/* binoculars vignette */}
      {hud?.binoculars && playing && (
        <div data-testid="binocular-view" className="pointer-events-none absolute inset-0 z-10" style={{ background: "radial-gradient(ellipse 34% 42% at 38% 50%, transparent 92%, #000 94%), radial-gradient(ellipse 34% 42% at 62% 50%, transparent 92%, #000 94%)", backgroundBlendMode: "multiply" }}>
          <div className="absolute bottom-[14%] left-1/2 -translate-x-1/2 text-center text-xs text-amber-100/70" dir="rtl">
            ثبّت النظر على جندي لتعليمه · Hold your gaze on a soldier to mark him — {hud.tagged}/{hud.tagTotal}
          </div>
        </div>
      )}
      {hurt > 0 && <div key={hurt} className="night-hurt pointer-events-none absolute inset-0 z-10" style={{ boxShadow: "inset 0 0 160px rgba(200,20,10,0.65)", animation: "night-zone 0.9s ease-out both" }} />}
      {hud && playing && hud.health < 45 && <div className="pointer-events-none absolute inset-0 z-10 animate-pulse" style={{ boxShadow: `inset 0 0 ${200 - hud.health * 2}px rgba(140,0,0,0.55)` }} />}

      {playing && !hud?.binoculars && <span data-testid="crosshair" className="pointer-events-none absolute top-1/2 left-1/2 z-10 size-[5px] -translate-1/2 rounded-full bg-white/55 shadow-[0_0_6px_rgba(180,210,255,0.6)]" />}

      {/* prompt + hold */}
      {playing && hud?.prompt && (
        <button type="button" data-testid="interact-prompt" onPointerDown={() => levelRef.current?.setTouchButton("interact", true)} onPointerUp={() => levelRef.current?.setTouchButton("interact", false)} onPointerLeave={() => levelRef.current?.setTouchButton("interact", false)} dir="rtl"
          className={`absolute top-[58%] left-1/2 z-20 -translate-x-1/2 overflow-hidden rounded-full border px-4 py-2 text-sm backdrop-blur-md ${hud.prompt.blocked ? "border-white/10 bg-black/40 text-white/45" : "border-amber-100/25 bg-black/50 text-amber-50"}`}>
          {hud.hold > 0 && <span className="absolute inset-y-0 right-0 bg-amber-200/25" style={{ width: `${hud.hold * 100}%` }} />}
          <span className="relative">
            {!hud.prompt.blocked && <kbd className="ml-2 rounded border border-white/30 px-1.5 font-mono text-[11px]">{hud.prompt.hold ? "امسك E" : "E"}</kbd>}
            {hud.prompt.ar} <span className="text-xs text-white/45" dir="ltr">· {hud.prompt.en}</span>
          </span>
        </button>
      )}
      {playing && hud?.takedown && !hud.prompt && (
        <div data-testid="takedown-hint" dir="rtl" className="pointer-events-none absolute top-[58%] left-1/2 z-20 -translate-x-1/2 rounded-full border border-red-200/30 bg-black/55 px-4 py-2 text-sm text-red-50 backdrop-blur-md">
          <kbd className="ml-2 rounded border border-white/30 px-1.5 font-mono text-[11px]">F</kbd>أسكته من الخلف <span className="text-xs text-white/45" dir="ltr">· Silent takedown</span>
        </div>
      )}
      {playing && hud?.crawl && (
        <p className="pointer-events-none absolute top-[64%] left-1/2 z-20 -translate-x-1/2 text-xs text-sky-100/70" dir="rtl">ازحف منحنياً (C) · Crouch (C) to crawl through</p>
      )}

      {/* suspicion + shout */}
      {playing && (susp > 0.02 || (hud?.shout ?? 0) > 0) && (
        <div data-testid="suspicion-meter" dir="rtl" className="pointer-events-none absolute top-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5">
          <Eye className={`size-5 ${susp > 0.45 ? "text-red-400" : "text-amber-200/80"}`} strokeWidth={1.6} />
          <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full transition-[width] duration-150 ${susp > 0.45 ? "bg-red-500" : "bg-amber-300"}`} style={{ width: `${Math.min(1, susp) * 100}%` }} />
          </div>
          {(hud?.shout ?? 0) > 0 ? (
            <span className="text-[11px] font-semibold text-red-300">!يصرخ — أسكته قبل الإنذار · Silence him before the alarm</span>
          ) : (
            <span className="text-[11px] text-white/60">{susp >= 1 ? "رأوك! · Spotted" : susp > 0.45 ? "انتبهوا لك! · They noticed you" : "ريبة · Suspicion"}</span>
          )}
        </div>
      )}
      {playing && hud && hud.alarm >= 1 && (
        <div data-testid="alarm-banner" dir="rtl" className={`pointer-events-none absolute top-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1 text-xs ${hud.alarm >= 2 ? "bg-red-900/60 text-red-100" : "bg-amber-900/50 text-amber-100"}`}>
          <Siren className={`size-3.5 ${hud.alarm >= 2 ? "animate-pulse" : ""}`} />
          {hud.alarm >= 2 ? "إنذار عام · ALARM" : "بحث · Searching"}
          {hud.reinforceIn > 0 && <span className="text-white/60">· تعزيزات {hud.reinforceIn}ث</span>}
        </div>
      )}

      {/* vitals + weapon */}
      {playing && hud && (
        <div data-testid="vitals" dir="rtl" className="pointer-events-none absolute bottom-7 left-7 z-20 flex flex-col items-start gap-2">
          <div className="flex items-center gap-2.5 rounded-full bg-black/35 px-3.5 py-2 backdrop-blur-md">
            <span className={`size-2.5 rounded-full ${hud.visibility === "lit" ? "bg-amber-300 shadow-[0_0_10px_rgba(255,200,90,0.9)]" : hud.visibility === "shadow" ? "bg-sky-300/60" : "bg-white/15"}`} />
            <span data-testid="visibility-indicator" className="text-xs text-white/70">{hud.visibility === "lit" ? "مكشوف · Exposed" : hud.visibility === "shadow" ? "في الظل · In shadow" : "مختبئ · Hidden"}</span>
            {hud.hasKey && <KeyRound className="mr-1 size-3.5 text-amber-200" />}
            {hud.rifles > 0 && <span className="mr-1 rounded bg-amber-200/15 px-1.5 text-[10px] text-amber-100/90">⚑ {hud.rifles} بندقية</span>}
            {hud.signal === "ready" && <span className="mr-1 rounded bg-emerald-300/15 px-1.5 text-[10px] text-emerald-100/90">G إشارة</span>}
          </div>
          {hud.weapon && (
            <div className="flex items-center gap-3 rounded-xl bg-black/35 px-3.5 py-2 backdrop-blur-md">
              <Heart className={`size-4 ${hud.health < 40 ? "text-red-400" : "text-white/60"}`} />
              <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-red-400/80" style={{ width: `${hud.health}%` }} /></div>
              <span data-testid="ammo" className="text-xs text-white/75 tabular-nums" dir="ltr">{hud.weapon.reloading ? "…" : hud.weapon.mag} / {hud.weapon.reserve}</span>
              <span className="text-[10px] text-white/40">{hud.weapon.name}</span>
            </div>
          )}
        </div>
      )}

      <button type="button" data-testid="sound-toggle-button" aria-label={soundOn ? "كتم الصوت · Mute" : "تشغيل الصوت · Play sound"} aria-pressed={soundOn} onClick={toggleSound}
        className="group absolute top-6 left-6 z-30 grid size-12 place-items-center rounded-full bg-white/[0.12] text-white/85 backdrop-blur-md transition-[background-color,transform] duration-300 hover:scale-105 hover:bg-white/20 active:scale-95">
        {soundOn ? <Volume2 className="size-5" strokeWidth={1.6} /> : <VolumeX className="size-5" strokeWidth={1.6} />}
      </button>
      {entered && (
        <button type="button" data-testid="map-toggle-button" aria-label="الخريطة · Map" onClick={() => setMapOpen((v) => !v)}
          className="absolute top-20 left-6 z-30 grid size-12 place-items-center rounded-full bg-white/[0.12] text-white/85 backdrop-blur-md hover:bg-white/20">
          <MapIcon className="size-5" strokeWidth={1.6} />
        </button>
      )}

      {/* clock + objective */}
      <div data-testid="night-clock" dir="rtl" className="pointer-events-none absolute top-7 right-7 z-30 max-w-[20rem] text-right">
        <div className="font-arabic-display text-3xl leading-none text-sky-50/85 tabular-nums">{hud?.clock ?? "01:10"}</div>
        <div className="mt-1.5 text-[11px] tracking-wide text-sky-100/45">ليلة 1 نوفمبر 1954 · Night of 1 November</div>
        {entered && hud && hud.stage !== "ended" && (
          <div data-testid="objective-text" className="mt-4 border-r-2 border-amber-200/60 pr-3">
            <p className="text-sm leading-snug text-white/85">{hud.objAr}</p>
            <p className="mt-0.5 text-[11px] text-white/40" dir="ltr">{hud.objEn}</p>
            {hud.subAr && <p data-testid="objective-sub" className="mt-1.5 text-[11px] leading-snug text-amber-100/55">{hud.subAr}</p>}
          </div>
        )}
      </div>

      {zone && playing && (
        <div key={zoneKey} data-testid="zone-card" dir="rtl" className="night-zone pointer-events-none absolute right-8 bottom-10 z-20 max-w-xs text-right">
          <div className="mb-2 h-px w-16 bg-gradient-to-l from-amber-200/70 to-transparent" />
          <h2 className="font-arabic-display text-4xl leading-tight text-white/90">{zone.ar}</h2>
          <p className="mt-0.5 text-xs tracking-[0.3em] text-sky-100/55 uppercase" dir="ltr">{zone.en}</p>
          <p className="mt-3 text-sm text-white/60">{zone.noteAr}</p>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5" dir="rtl">
        {toasts.map((t) => (
          <p key={t.id} data-testid="toast" className="night-zone rounded-full bg-black/45 px-3 py-1 text-xs text-amber-50/85 backdrop-blur">{t.ar} <span className="text-white/40" dir="ltr">· {t.en}</span></p>
        ))}
      </div>

      {/* touch */}
      {isTouch && playing && (
        <div className="absolute right-6 bottom-28 z-30 grid grid-cols-2 gap-3">
          <button type="button" data-testid="crouch-toggle-button" onClick={() => { const v = !crouchOn; setCrouchOn(v); levelRef.current?.setCrouchToggle(v); }} className={`size-14 rounded-full text-xs backdrop-blur-md ${crouchOn ? "bg-sky-200/30 text-white" : "bg-white/10 text-white/70"}`}>انحناء</button>
          {hud?.hasBinoculars && <button type="button" onPointerDown={() => levelRef.current?.setTouchButton("binoc", true)} onPointerUp={() => levelRef.current?.setTouchButton("binoc", false)} className="size-14 rounded-full bg-white/10 text-xs text-white/70 backdrop-blur-md">منظار</button>}
          {hud?.weapon && <button type="button" onPointerDown={() => levelRef.current?.setTouchButton("fire", true)} onPointerUp={() => levelRef.current?.setTouchButton("fire", false)} className="size-14 rounded-full bg-red-400/20 text-xs text-white backdrop-blur-md">نار</button>}
          {hud?.takedown && <button type="button" onClick={() => levelRef.current?.takedown()} className="size-14 rounded-full bg-red-200/20 text-xs text-white backdrop-blur-md">إسكات</button>}
        </div>
      )}

      {/* tactical map */}
      {mapOpen && entered && !planning && (
        <div data-testid="map-overlay" dir="rtl" className="absolute inset-0 z-30 grid place-items-center bg-black/55 p-6 backdrop-blur-[2px]" onClick={() => setMapOpen(false)}>
          <div className="aspect-[192/200] h-[86vh] max-w-full rounded-2xl border border-white/10 bg-[#020a0e]/90 p-3">
            <TacticalMap plan={plan} live={live} full />
          </div>
          <p className="absolute bottom-4 text-xs text-white/40">M للإغلاق — الليل لا يتوقّف وأنت تقرأ · M to close — the night doesn't stop while you read</p>
        </div>
      )}

      {caught && (
        <div data-testid="caught-overlay" dir="rtl" className="night-rise absolute inset-0 z-40 grid place-items-center bg-black/80">
          <div className="text-center">
            <h2 className="font-arabic-display text-5xl text-red-200/90">{caught === "killed" ? "سقطت" : "أمسكوا بك"}</h2>
            <p className="mt-2 text-sm text-white/50" dir="ltr">{caught === "killed" ? "You fell" : "You were caught"}</p>
            <p className="mt-5 text-xs text-white/40">العودة إلى آخر نقطة حفظ · Back to the last checkpoint</p>
          </div>
        </div>
      )}

      {dialogue && line && (
        <div data-testid="dialogue-panel" dir="rtl" className="absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black via-black/85 to-transparent px-6 pt-24 pb-10">
          <div className="mx-auto max-w-2xl">
            <p data-testid="dialogue-speaker" className={`text-xs tracking-widest ${line.you ? "text-sky-200/70" : "text-amber-200/80"}`}>{line.who}</p>
            <p data-testid="dialogue-line" className="font-arabic-display mt-2 text-2xl leading-relaxed text-white/90">{line.ar}</p>
            <p className="mt-1 text-sm text-white/40" dir="ltr">{line.en}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {dialogue.awaiting ? (
                ANSWERS.map((a) => (
                  <button key={a.id} type="button" data-testid={`password-${a.id}`} onClick={() => answer(a)} className="rounded-full border border-amber-200/40 bg-amber-100/10 px-5 py-2.5 text-sm text-amber-50 transition-[background-color,transform] duration-200 hover:scale-[1.03] hover:bg-amber-100/20">
                    «{a.ar}» <span className="text-xs text-white/45" dir="ltr">· {a.en}</span>
                  </button>
                ))
              ) : (
                <button type="button" data-testid="dialogue-next-button" onClick={advance} className="rounded-full bg-amber-100/90 px-6 py-2.5 text-sm font-semibold text-stone-950 transition-transform duration-200 hover:scale-[1.03]">
                  {dialogue.i < dialogue.lines.length - 1 ? "تابع · Continue" : dialogue.who === "messaoud" ? "إلى المعصرة · To the mill" : "إلى الخريطة · To the map"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* planning board */}
      {planning && (
        <div data-testid="planning-board" dir="rtl" className="night-rise absolute inset-0 z-40 flex flex-col gap-4 overflow-y-auto bg-[#020a0e]/95 p-5 lg:flex-row">
          <div className="min-h-[50vh] flex-1 rounded-2xl border border-white/10 bg-black/40 p-2 lg:min-h-0"><TacticalMap plan={plan} live={live ? { ...live, player: { x: -9999, z: 0, yaw: 0 } } : null} /></div>
          <div className="w-full shrink-0 lg:w-[26rem]">
            <p className="text-xs tracking-[0.25em] text-amber-200/60">خطة الليلة · Tonight's plan</p>
            <h2 className="font-arabic-display mt-1 text-4xl text-white">معصرة الزيتون</h2>
            <p className="mt-1 text-xs text-white/45">الحرّاس المعلَّمون: {hud?.tagged ?? 0}/{hud?.tagTotal ?? 0} · Marked guards appear on the map and through walls</p>
            <h3 className="mt-5 text-sm text-amber-100/80">١ · المدخل <span className="text-white/35" dir="ltr">Entry</span></h3>
            <div className="mt-2 grid gap-2">
              {ENTRIES.map((e) => (
                <button key={e.id} type="button" data-testid={`entry-${e.id}`} aria-pressed={plan.entry === e.id} onClick={() => setPlan({ ...plan, entry: e.id })}
                  className={`rounded-xl border p-3 text-right transition-colors ${plan.entry === e.id ? "border-amber-200/60 bg-amber-100/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] text-white">{e.ar} <span className="text-xs text-white/40" dir="ltr">{e.en}</span></span>
                    <span className="flex gap-2 text-[10px] text-white/45">تسلّل <Stars n={e.stealth} tone="text-sky-300" /> سرعة <Stars n={e.speed} tone="text-amber-300" /> خطر <Stars n={e.danger} tone="text-red-400" /></span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-white/60">{e.noteAr}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-white/35" dir="ltr">{e.noteEn}</p>
                </button>
              ))}
            </div>
            <h3 className="mt-5 text-sm text-amber-100/80">٢ · دور سعيد <span className="text-white/35" dir="ltr">Saïd's role</span></h3>
            <div className="mt-2 grid gap-2">
              {DIVERSIONS.map((d) => {
                const locked = d.id === "cover" && !passwordOk;
                return (
                  <button key={d.id} type="button" data-testid={`diversion-${d.id}`} disabled={locked} aria-pressed={plan.diversion === d.id} onClick={() => setPlan({ ...plan, diversion: d.id })}
                    className={`rounded-xl border p-3 text-right transition-colors disabled:opacity-35 ${plan.diversion === d.id ? "border-amber-200/60 bg-amber-100/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
                    <span className="text-[15px] text-white">{d.ar} <span className="text-xs text-white/40" dir="ltr">{d.en}</span></span>
                    <p className="mt-1 text-xs leading-relaxed text-white/60">{locked ? "سعيد لا يثق بك بعد — كلمة السرّ كانت خاطئة." : d.noteAr}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-white/35" dir="ltr">{locked ? "Saïd doesn't trust you — wrong password." : d.noteEn}</p>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/45">في كل الخطط: المولّد في الزاوية الشمالية الغربية يُطفئ كل أضواء الثكنة، والانسحاب إلى مسلك الجبل عبر الوادي.</p>
            <button type="button" data-testid="confirm-plan-button" onClick={confirmPlan} className="mt-5 w-full rounded-full bg-amber-100/90 px-6 py-3 text-[15px] font-semibold text-stone-950 transition-transform duration-200 hover:scale-[1.02]">نتوكّل على الله · Commit to the plan</button>
          </div>
        </div>
      )}

      {ending && (
        <div data-testid="ending-screen" dir="rtl" className="night-rise absolute inset-0 z-50 flex items-center bg-gradient-to-l from-black via-black/85 to-black/40">
          <div className="mr-[8vw] max-w-lg px-6">
            <p className="text-xs tracking-[0.25em] text-amber-200/60">نهاية الفصل الثاني · End of Chapter II</p>
            <h1 data-testid="ending-title" className="font-arabic-display mt-3 text-6xl leading-tight text-white">{ending.ghost ? "ضربة الشبح" : ending.rifles >= 8 ? "حرب العصابات" : "نجاة بالسلاح"}</h1>
            <p className="mt-1 text-sm tracking-[0.35em] text-sky-100/55 uppercase" dir="ltr">{ending.ghost ? "The Ghost Strike" : ending.rifles >= 8 ? "Guerrilla War" : "Out With the Guns"}</p>
            <p className="mt-6 text-[15px] leading-relaxed text-white/70">
              {ending.ghost
                ? "دخلتَ وخرجتَ كالظل. حين دوّت صفّارتهم كان السلاح في الجبل."
                : ending.rifles >= 8
                  ? "دوّى الرصاص في الثكنة، لكن الخلية انسحبت بالسلاح إلى الجبل. هكذا تبدأ حرب العصابات."
                  : "نجوتَ، لكن معظم البنادق بقيت في الرفوف. ستحتاج الجبال إلى أكثر من هذا."}
            </p>
            <dl data-testid="ending-stats" className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                ["البنادق · Rifles", ending.rifles],
                ["إسكات · Takedowns", ending.takedowns],
                ["قتلى · Kills", ending.kills],
                ["معلَّمون · Marked", `${ending.tagged}/${ending.tagTotal}`],
                ["سقوط · Falls", ending.deaths],
                ["الوقت · Time", ending.clock],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-white/5 p-3"><dt className="text-[11px] text-white/45">{k}</dt><dd className="mt-1 text-2xl text-white tabular-nums">{v}</dd></div>
              ))}
            </dl>
            <button type="button" data-testid="replay-button" onClick={() => window.location.reload()} className="mt-8 rounded-full bg-amber-100/90 px-7 py-3 text-[15px] font-semibold text-stone-950 transition-transform duration-200 hover:scale-[1.03]">أعد الليلة · Play again</button>
          </div>
        </div>
      )}

      <div data-testid="start-overlay" dir="rtl" className={`absolute inset-0 z-30 flex items-center bg-gradient-to-l from-black/85 via-black/55 to-transparent transition-opacity duration-700 ${showOverlay ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <div className="night-rise mr-[7vw] max-w-lg px-6">
          <p className="text-xs tracking-[0.25em] text-amber-200/60">الفصل الثاني · Chapter II</p>
          <h1 data-testid="level-title" className="font-arabic-display mt-3 text-6xl leading-[1.15] text-white sm:text-7xl">ليلة الفاتح</h1>
          <p className="mt-1 text-sm tracking-[0.45em] text-sky-100/55 uppercase" dir="ltr">Night of the First</p>
          <p className="mt-6 text-[15px] leading-relaxed text-white/70">بيتك مراقَب. اخرج دون أن يراك المخبر، التقِ رجل الاتصال في المقبرة، ثم الخلية في معصرة الزيتون. ضعوا الخطة، ادخلوا الثكنة، خذوا السلاح… واصعدوا به إلى الجبل.</p>
          <p className="mt-1 text-xs leading-relaxed text-white/40" dir="ltr">Your house is watched. Slip past the informer, meet the contact at the cemetery and the cell at the olive mill. Plan, get inside the barracks, seize the weapons — and carry them to the mountains.</p>
          <button type="button" data-testid="enter-level-button" onClick={enter} disabled={!ready || webglError}
            className="mt-8 inline-flex items-center gap-3 rounded-full bg-amber-100/90 px-7 py-3 text-[15px] font-semibold text-stone-950 shadow-[0_0_40px_rgba(255,190,110,0.25)] transition-[background-color,transform,box-shadow] duration-300 hover:scale-[1.03] hover:bg-amber-50 active:scale-[0.98] disabled:opacity-40">
            {entered ? "تابع · Resume" : "ادخل الليل · Enter the night"}
          </button>
          <a href="/" className="mr-4 text-xs text-white/40 underline-offset-4 hover:underline">← الفصل الأول · Chapter I</a>
          {isTouch ? (
            <p data-testid="touch-help" className="mt-7 text-xs leading-relaxed text-white/45">اسحب يسار الشاشة للمشي، ويمينها للنظر · Drag left to walk, right to look</p>
          ) : (
            <ul data-testid="controls-help" className="mt-8 grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs text-white/55">
              {CONTROLS.map((c) => (
                <li key={c.key} className="flex items-center gap-2.5">
                  <kbd dir="ltr" className="min-w-14 rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-center font-mono text-[10px] text-white/75">{c.key}</kbd>
                  <span>{c.ar}</span>
                  <span className="text-white/30" dir="ltr">{c.en}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
