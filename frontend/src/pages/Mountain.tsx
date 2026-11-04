import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX, Eye, Heart, Wind, Snowflake, Map as MapIcon, User, Dog } from "lucide-react";
import { MountainLevel, type MHud, type MEnding, type MMapState, type Route } from "@/lib/mountain/level";
import { BarracksAudio } from "@/lib/barracks/audio";
import { MCAST, M_INTRO, M_DISCLAIMER, M_CAPTION, BRIDGE, FORK_LINES, ROUTE_CHOICE, AFTER_CHOICE, LOSS, NARRATOR, type MLine, type MSpeaker } from "@/lib/mountain/story";

const CONTROLS: { key: string; ar: string; en: string }[] = [
  { key: "W A S D", ar: "تحرّك", en: "Move" },
  { key: "E (امسك)", ar: "احمل / ضع لخضر", en: "Carry / set down" },
  { key: "C", ar: "انحناء", en: "Crouch" },
  { key: "Shift", ar: "ركض (دون حمل)", en: "Run (not carrying)" },
  { key: "LMB · R", ar: "إطلاق · تلقيم", en: "Fire · Reload" },
  { key: "M", ar: "الخريطة", en: "Map" },
];

type Dlg = { kind: "bridge" | "fork" | "after" | "loss"; lines: MLine[]; i: number; choosing: boolean };

function Portrait({ who }: { who: MSpeaker }) {
  const c = MCAST[who];
  if (!c.portrait)
    return (
      <div className="grid aspect-[346/521] w-36 place-items-center rounded-lg border border-amber-200/30 bg-gradient-to-b from-stone-800 to-stone-950 sm:w-48 md:w-56">
        <User className="size-1/3 text-amber-100/30" strokeWidth={1} />
      </div>
    );
  return <img src={c.portrait} alt={c.ar} className="w-36 rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.7)] select-none sm:w-48 md:w-56" draggable={false} />;
}

function useTypewriter(text: string) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = window.setInterval(() => setN((v) => (v >= text.length ? v : v + 2)), 20);
    return () => window.clearInterval(id);
  }, [text]);
  return [Math.min(n, text.length), () => setN(text.length)] as const;
}

function DialogueView({ d, quiet, onNext, onChoose }: { d: Dlg; quiet: boolean; onNext: () => void; onChoose: (r: Route) => void }) {
  const line = d.lines[d.i];
  const [n, complete] = useTypewriter(line.ar);
  const done = n >= line.ar.length;
  const c = MCAST[line.who];
  const next = useCallback(() => (done ? onNext() : complete()), [done, onNext, complete]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === "Space" || e.code === "Enter") && !d.choosing) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, d.choosing]);
  // the loss scene: subtitles only — no portraits, no buttons, nothing that looks like a game
  if (quiet)
    return (
      <div data-testid="dialogue-panel" dir="rtl" className="absolute inset-0 z-40" onClick={next}>
        <div className="absolute inset-x-0 bottom-[12vh] text-center">
          <p data-testid="dialogue-line" className="font-arabic-display mx-auto max-w-2xl px-6 text-2xl leading-relaxed text-white/85" style={{ textShadow: "0 2px 14px #000" }}>
            {line.ar.slice(0, n)}
            <span className="opacity-0">{line.ar.slice(n)}</span>
          </p>
          <p className={`mt-2 text-sm text-white/35 transition-opacity duration-700 ${done ? "opacity-100" : "opacity-0"}`} dir="ltr">{line.en}</p>
        </div>
      </div>
    );
  return (
    <div data-testid="dialogue-panel" dir="rtl" className="absolute inset-0 z-40" onClick={() => !d.choosing && next()}>
      <div className="cine-bar pointer-events-none absolute inset-x-0 top-0 h-[9vh] bg-black" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent px-5 pt-28 pb-[calc(9vh+0.5rem)] sm:px-10">
        <div className="mx-auto flex max-w-5xl items-end gap-5 sm:gap-8">
          <div key={line.who} className="portrait-in relative -mb-2 shrink-0">
            <Portrait who={line.who} />
          </div>
          <div className="min-w-0 flex-1 pb-2">
            <div key={`n-${line.who}`} className="portrait-in">
              <p data-testid="dialogue-speaker" className={`font-arabic-display text-2xl sm:text-3xl ${line.who === "you" ? "text-sky-100" : "text-amber-100"}`}>{c.ar}</p>
              <p className="mt-0.5 text-[11px] tracking-[0.2em] text-white/40 uppercase" dir="ltr">{c.en} · {c.roleEn}</p>
            </div>
            <p data-testid="dialogue-line" className="font-arabic-display mt-3 min-h-[4.5rem] text-xl leading-relaxed text-white/90 sm:text-2xl">
              {line.ar.slice(0, n)}
              <span className="opacity-0">{line.ar.slice(n)}</span>
            </p>
            <p className={`mt-1 text-sm text-white/40 transition-opacity duration-500 ${done ? "opacity-100" : "opacity-0"}`} dir="ltr">{line.en}</p>
            <div className="mt-5 flex flex-wrap gap-3" onClick={(e) => e.stopPropagation()}>
              {d.choosing && done ? (
                ROUTE_CHOICE.map((r) => (
                  <button key={r.id} type="button" data-testid={`route-${r.id}`} onClick={() => onChoose(r.id)} className="rounded-full border border-amber-200/40 bg-amber-100/10 px-5 py-2.5 text-sm text-amber-50 transition-[background-color,transform] duration-200 hover:scale-[1.03] hover:bg-amber-100/20">
                    {r.ar} <span className="text-xs text-white/45" dir="ltr">· {r.en}</span>
                  </button>
                ))
              ) : !d.choosing ? (
                <button type="button" data-testid="dialogue-next-button" onClick={next} className="rounded-full bg-amber-100/90 px-6 py-2.5 text-sm font-semibold text-stone-950 transition-transform duration-200 hover:scale-[1.03]">
                  {!done ? "تخطَّ · Skip" : d.i < d.lines.length - 1 ? "تابع · Continue" : d.kind === "bridge" ? "إلى الجبل · Into the mountains" : "تابع · Continue"}
                </button>
              ) : null}
              <span className="self-center text-[10px] text-white/25" dir="ltr">Space / Enter</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MountainMap({ live }: { live: MMapState | null }) {
  const L = useMemo(() => MountainLevel.layout(), []);
  const p = (pts: [number, number][]) => pts.map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`).join(" ");
  return (
    <svg viewBox={`${L.PLAY.minX - 10} ${L.PLAY.minZ - 10} ${L.PLAY.maxX - L.PLAY.minX + 20} ${L.PLAY.maxZ - L.PLAY.minZ + 20}`} className="h-full w-full" data-testid="mountain-map-svg">
      {L.COLD_ZONES.map((c, i) => <path key={`cold${i}`} d={p(c.pts) + "Z"} fill={`rgba(190,215,255,${0.06 + c.k * 0.06})`} stroke="rgba(190,215,255,0.35)" strokeDasharray="2 2" strokeWidth="0.5" />)}
      <path d={p(L.VALLEY)} fill="none" stroke={live?.route === "ridge" ? "rgba(90,150,230,0.25)" : "rgba(90,150,230,0.85)"} strokeWidth="2.2" strokeDasharray="4 2" />
      <path d={p(L.RIDGE)} fill="none" stroke={live?.route === "valley" ? "rgba(40,190,130,0.25)" : "rgba(40,190,130,0.85)"} strokeWidth="2.2" strokeDasharray="4 2" />
      <path d={p(L.PATROL)} fill="none" stroke="rgba(240,110,60,0.8)" strokeWidth="1.4" />
      <circle cx={L.OBSERVER.x} cy={L.OBSERVER.z} r="3" fill="none" stroke="rgba(230,70,60,0.85)" strokeWidth="1" />
      {[L.CACHE_VALLEY, L.CACHE_RIDGE].map((c, i) => <rect key={`cache${i}`} x={c.x - 2} y={c.z - 2} width="4" height="4" fill="rgba(230,210,150,0.8)" />)}
      <ellipse cx={L.FORK.x} cy={L.FORK.z} rx="6" ry="4" fill="rgba(220,220,210,0.25)" stroke="rgba(220,220,210,0.6)" strokeWidth="0.6" />
      <rect x={L.SHELTER.x - 5} y={L.SHELTER.z - 4} width="10" height="7" fill="rgba(255,180,80,0.5)" stroke="rgba(255,190,90,0.9)" strokeWidth="0.6" />
      {L.HOUSES.map((h, i) => <rect key={`h${i}`} x={h.x - h.w / 2} y={h.z - h.d / 2} width={h.w} height={h.d} fill="rgba(207,230,238,0.25)" />)}
      <text x={L.SHELTER.x} y={L.SHELTER.z - 7} fontSize="6" fill="rgba(255,210,140,0.95)" textAnchor="middle">الملجأ</text>
      <text x={L.FORK.x} y={L.FORK.z + 10} fontSize="5" fill="rgba(240,240,230,0.8)" textAnchor="middle">المفترق</text>
      <text x="92" y="-40" fontSize="6" fill="rgba(120,170,240,0.95)" textAnchor="middle">الوادي</text>
      <text x="-108" y="-50" fontSize="6" fill="rgba(80,210,150,0.95)" textAnchor="middle">الحافة</text>
      <text x="0" y="54" fontSize="5" fill="rgba(240,240,230,0.6)" textAnchor="middle">طرف البلدة</text>
      {live?.guards.map((g, i) => (
        <g key={`g${i}`} transform={`translate(${g.x} ${g.z}) rotate(${(-g.yaw * 180) / Math.PI})`}>
          <path d="M0 0 L-6 14 A15 15 0 0 0 6 14 Z" fill={g.alert ? "rgba(255,74,61,0.3)" : "rgba(255,193,74,0.18)"} />
          <circle r="1.8" fill={g.alert ? "#ff4a3d" : "#ffc14a"} />
        </g>
      ))}
      {live && <circle cx={live.dog.x} cy={live.dog.z} r="1.4" fill="#d7a36b" />}
      {live && <circle cx={live.lakhdar.x} cy={live.lakhdar.z} r="1.8" fill="#9cf0b6" />}
      {live && <circle cx={live.ammar.x} cy={live.ammar.z} r="1.4" fill="#8ce6aa" />}
      {live && (
        <g transform={`translate(${live.player.x} ${live.player.z}) rotate(${(-live.player.yaw * 180) / Math.PI}) scale(1.6)`}>
          <path d="M0 -2.6 L1.7 1.8 L0 0.9 L-1.7 1.8 Z" fill="#fff" />
        </g>
      )}
      <g transform={`translate(${L.PLAY.minX + 4} ${L.PLAY.maxZ - 2})`}>
        <rect width="20" height="1" fill="rgba(240,240,230,0.6)" />
        <text x="10" y="-2" fontSize="4" fill="rgba(240,240,230,0.6)" textAnchor="middle">20 م</text>
      </g>
    </svg>
  );
}

export default function Mountain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef<MountainLevel | null>(null);
  const audioRef = useRef<BarracksAudio | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(false);
  const [entered, setEntered] = useState(false);
  const [intro, setIntro] = useState<null | "text" | "caption">(null);
  const [introStep, setIntroStep] = useState(0);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [hud, setHud] = useState<MHud | null>(null);
  const [barks, setBarks] = useState<{ id: number; who: MSpeaker; ar: string; en: string }[]>([]);
  const [toasts, setToasts] = useState<{ id: number; ar: string; en: string }[]>([]);
  const [fail, setFail] = useState<null | "caught" | "killed">(null);
  const [hurt, setHurt] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [live, setLive] = useState<MMapState | null>(null);
  const [silence, setSilence] = useState(false);
  const [narr, setNarr] = useState(-1);
  const [ending, setEnding] = useState<MEnding | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [crouchOn, setCrouchOn] = useState(false);
  const [isTouch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const seq = useRef(0);
  const hudKey = useRef("");

  const toast = (ar: string, en: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, ar, en }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };
  const bark = (who: MSpeaker, ar: string, en: string) => {
    const id = ++seq.current;
    setBarks((b) => [...b.slice(-1), { id, who, ar, en }]);
    window.setTimeout(() => setBarks((b) => b.filter((x) => x.id !== id)), 6500);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const audio = new BarracksAudio();
    audioRef.current = audio;
    const lowPower = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820 || navigator.webdriver;
    let level: MountainLevel | null = null;
    let cancelled = false;
    MountainLevel.create(canvas, {
      lowPower,
      audio,
      onReady: () => setReady(true),
      onActiveChange: setActive,
      onHud: (h) => {
        const k = JSON.stringify(h);
        if (k !== hudKey.current) {
          hudKey.current = k;
          setHud(h);
        }
      },
      onBark: bark,
      onToast: toast,
      onCheckpoint: () => toast("✦ تمّ الحفظ", "Checkpoint"),
      onFail: (w) => {
        setFail(w);
        window.setTimeout(() => setFail(null), 2800);
      },
      onDamage: () => setHurt((n) => n + 1),
      onDialogue: (kind) => {
        levelRef.current?.pause();
        if (kind === "fork") setDlg({ kind: "fork", lines: FORK_LINES, i: 0, choosing: false });
        else setDlg({ kind: "loss", lines: LOSS, i: 0, choosing: false });
      },
    })
      .then((l) => {
        if (cancelled) return l.dispose();
        level = l;
        levelRef.current = l;
        l.setOverlay(overlayRef.current);
      })
      .catch(() => {
        setError(true);
        setReady(true);
      });
    return () => {
      cancelled = true;
      level?.dispose();
      audio.dispose();
      levelRef.current = null;
    };
  }, []);

  // camera follows the speaker; at the fork it reads the terrain line by line
  useEffect(() => {
    if (!dlg) return;
    const l = dlg.lines[dlg.i], lvl = levelRef.current;
    if (!lvl) return;
    if (dlg.kind === "fork") lvl.focus(dlg.i === 0 ? "fork-shelter" : dlg.i === 1 ? "fork-valley" : dlg.i === 2 ? "fork-ridge" : "lakhdar");
    else if (dlg.kind !== "loss") lvl.focus(l.who);
    // the loss scene keeps one still frame: no cuts
  }, [dlg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && entered && !dlg && !intro && !silence && narr < 0) setMapOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entered, dlg, intro, silence, narr]);
  useEffect(() => {
    if (!mapOpen) return;
    const tick = () => levelRef.current && setLive(levelRef.current.mapState());
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [mapOpen]);

  const begin = async () => {
    setEntered(true);
    setSoundOn(true);
    setIntro("text");
    setIntroStep(0);
    levelRef.current?.startBridge();
    await audioRef.current?.start();
  };
  const introNext = () => {
    if (introStep < M_INTRO.length - 1) return setIntroStep((s) => s + 1);
    setIntro("caption");
    window.setTimeout(() => {
      setIntro(null);
      setDlg({ kind: "bridge", lines: BRIDGE, i: 0, choosing: false });
    }, 3800);
  };
  const advance = () => {
    if (!dlg) return;
    const lvl = levelRef.current;
    if (dlg.i < dlg.lines.length - 1) {
      setDlg({ ...dlg, i: dlg.i + 1 });
      return;
    }
    if (dlg.kind === "fork") {
      setDlg({ ...dlg, choosing: true });
      return;
    }
    setDlg(null);
    if (dlg.kind === "bridge") {
      lvl?.endBridge();
      lvl?.enter();
    } else if (dlg.kind === "after") {
      lvl?.enter();
    } else if (dlg.kind === "loss") {
      // then silence: no HUD, no text, just the fire
      setSilence(true);
      lvl?.endLoss();
      window.setTimeout(() => {
        setSilence(false);
        setNarr(0);
      }, 9000);
    }
  };
  const choose = (r: Route) => {
    const lvl = levelRef.current;
    lvl?.chooseRoute(r);
    setDlg({ kind: "after", lines: AFTER_CHOICE[r], i: 0, choosing: false });
  };
  const narrNext = () => {
    if (narr < NARRATOR.length - 1) return setNarr(narr + 1);
    setNarr(-1);
    const e = levelRef.current?.finish();
    if (e) setEnding(e);
  };
  const toggleSound = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (soundOn) {
      a.stop();
      setSoundOn(false);
    } else {
      await a.start();
      setSoundOn(true);
    }
  };

  const quietScene = hud?.stage === "loss" || hud?.stage === "dawn" || silence || narr >= 0;
  const playing = active && entered && !dlg && !intro && !ending && !quietScene;
  const showStart = !active && !dlg && !intro && !ending && !fail && !quietScene;

  return (
    <main data-testid="mountain-page" className="relative h-screen w-full overflow-hidden bg-black text-white select-none">
      <canvas ref={canvasRef} data-testid="level-canvas" className="absolute inset-0 h-full w-full" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" />
      {!ready && <div className="absolute inset-0 z-50 grid place-items-center bg-black"><p className="animate-pulse text-sm text-white/50" dir="rtl">…تحميل تضاريس الأوراس · Loading the Aurès terrain</p></div>}
      {error && <div data-testid="webgl-error" className="absolute inset-0 z-50 grid place-items-center bg-black text-sm text-white/60">تعذّر تحميل المستوى · Could not load the level</div>}

      {/* cold & exhaustion on the image itself */}
      {playing && hud && (
        <>
          <div className="pointer-events-none absolute inset-0 z-10" style={{ boxShadow: `inset 0 0 ${80 + hud.cold * 180}px rgba(170,200,240,${hud.cold * 0.35})` }} />
          <div className="pointer-events-none absolute inset-0 z-10" style={{ boxShadow: `inset 0 0 ${hud.exhaustion * 2.2}px rgba(0,0,0,${hud.exhaustion / 160})` }} />
        </>
      )}
      {hurt > 0 && playing && <div key={hurt} className="pointer-events-none absolute inset-0 z-10" style={{ boxShadow: "inset 0 0 160px rgba(200,20,10,0.65)", animation: "night-zone 0.9s ease-out both" }} />}
      {playing && !hud?.carrying && <span className="pointer-events-none absolute top-1/2 left-1/2 z-10 size-[5px] -translate-1/2 rounded-full bg-white/50" />}

      {playing && hud?.prompt && (
        <button type="button" data-testid="interact-prompt" onPointerDown={() => levelRef.current?.setTouchInteract(true)} onPointerUp={() => levelRef.current?.setTouchInteract(false)} onPointerLeave={() => levelRef.current?.setTouchInteract(false)} dir="rtl"
          className={`absolute top-[58%] left-1/2 z-20 max-w-[90vw] -translate-x-1/2 overflow-hidden rounded-full border px-4 py-2 text-sm backdrop-blur-md ${hud.prompt.blocked ? "border-white/10 bg-black/40 text-white/55" : "border-amber-100/25 bg-black/50 text-amber-50"}`}>
          {hud.hold > 0 && <span className="absolute inset-y-0 right-0 bg-amber-200/25" style={{ width: `${hud.hold * 100}%` }} />}
          <span className="relative">
            {!hud.prompt.blocked && <kbd className="ml-2 rounded border border-white/30 px-1.5 font-mono text-[11px]">{hud.prompt.hold ? "امسك E" : "E"}</kbd>}
            {hud.prompt.ar} <span className="text-xs text-white/45" dir="ltr">· {hud.prompt.en}</span>
          </span>
        </button>
      )}

      {playing && hud && (hud.suspicion > 0.02 || hud.dog) && (
        <div data-testid="suspicion-meter" dir="rtl" className="pointer-events-none absolute top-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <Eye className={`size-5 ${hud.suspicion > 0.45 ? "text-red-400" : "text-amber-200/80"}`} strokeWidth={1.6} />
            {hud.dog && <Dog className="size-5 animate-pulse text-amber-300" strokeWidth={1.6} />}
          </div>
          <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${hud.suspicion > 0.45 ? "bg-red-500" : "bg-amber-300"}`} style={{ width: `${Math.min(1, hud.suspicion) * 100}%` }} /></div>
          <span className="text-[11px] text-white/60">{hud.dog ? "الكلب يشتمّ أثرك — ادخل الماء · The dog has your scent — get into the water" : hud.suspicion >= 1 ? "رأوك! · Spotted" : "ريبة · Suspicion"}</span>
        </div>
      )}

      {/* vitals */}
      {playing && hud && (
        <div data-testid="vitals" dir="rtl" className="pointer-events-none absolute bottom-7 left-7 z-20 flex flex-col items-start gap-2">
          <div className="flex items-center gap-3 rounded-2xl bg-black/40 px-3.5 py-2.5 backdrop-blur-md">
            <img src={MCAST.lakhdar.face} alt="" className={`size-9 rounded-full border object-cover ${hud.carrying ? "border-emerald-300/70" : "border-amber-300/70"}`} />
            <div className="leading-tight">
              <p className="text-[11px] text-white/80">{hud.carrying ? "تحمل لخضر" : "لخضر على الأرض"}</p>
              <p className="text-[10px] text-white/40" dir="ltr">{hud.carrying ? "Carrying Lakhdar · no run, jump or climb" : "Lakhdar is on the ground"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl bg-black/35 px-3.5 py-2 backdrop-blur-md">
            <Wind className="size-4 text-white/60" />
            <div className="w-28">
              <div className="h-1 overflow-hidden rounded-full bg-white/10"><div data-testid="exhaustion-bar" className="h-full bg-amber-200/80" style={{ width: `${hud.exhaustion}%` }} /></div>
              <p className="mt-1 text-[10px] text-white/45">الإرهاق · Exhaustion {Math.round(hud.exhaustion)}</p>
            </div>
            {hud.cold > 0 && <Snowflake className="size-4 text-sky-200" />}
            <span className={`size-2 rounded-full ${hud.visibility === "lit" ? "bg-amber-300" : hud.visibility === "shadow" ? "bg-sky-300/60" : "bg-white/15"}`} />
            <span data-testid="visibility-indicator" className="text-[11px] text-white/60">{hud.visibility === "lit" ? "مكشوف" : hud.visibility === "shadow" ? "في الظل" : "مختبئ"}</span>
            {hud.water && <span className="rounded bg-sky-300/15 px-1.5 text-[10px] text-sky-100">في الماء</span>}
          </div>
          {(hud.health < 100 || hud.ammo) && (
            <div className="flex items-center gap-3 rounded-xl bg-black/35 px-3.5 py-2 backdrop-blur-md">
              <Heart className={`size-4 ${hud.health < 40 ? "text-red-400" : "text-white/60"}`} />
              <div className="h-1 w-20 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-red-400/80" style={{ width: `${hud.health}%` }} /></div>
              {hud.ammo && <span className="text-xs text-white/70 tabular-nums" dir="ltr">MAS-36 {hud.ammo.mag} / {hud.ammo.reserve}</span>}
            </div>
          )}
        </div>
      )}

      {entered && !dlg && !quietScene && (
        <div className="pointer-events-none absolute top-36 left-6 z-20 flex w-[22rem] max-w-[80vw] flex-col gap-2" dir="rtl">
          {barks.map((b) => (
            <div key={b.id} data-testid="bark" className="bark-in flex items-start gap-3 rounded-xl border border-white/10 bg-black/55 p-2.5 backdrop-blur-md">
              {MCAST[b.who].face ? <img src={MCAST[b.who].face} alt="" className="size-11 shrink-0 rounded-lg object-cover" /> : <div className="size-11 shrink-0 rounded-lg bg-white/10" />}
              <div className="min-w-0">
                <p className="text-[11px] text-amber-200/80">{MCAST[b.who].ar}</p>
                <p className="text-[13px] leading-snug text-white/85">{b.ar}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-white/35" dir="ltr">{b.en}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!quietScene && (
        <button type="button" data-testid="sound-toggle-button" aria-label="Sound" onClick={toggleSound} className="absolute top-6 left-6 z-30 grid size-12 place-items-center rounded-full bg-white/[0.12] text-white/85 backdrop-blur-md hover:bg-white/20">
          {soundOn ? <Volume2 className="size-5" strokeWidth={1.6} /> : <VolumeX className="size-5" strokeWidth={1.6} />}
        </button>
      )}
      {entered && !intro && !quietScene && (
        <button type="button" data-testid="map-toggle-button" aria-label="Map" onClick={() => setMapOpen((v) => !v)} className="absolute top-20 left-6 z-30 grid size-12 place-items-center rounded-full bg-white/[0.12] text-white/85 backdrop-blur-md hover:bg-white/20">
          <MapIcon className="size-5" strokeWidth={1.6} />
        </button>
      )}

      {playing && hud && hud.objAr && (
        <div data-testid="objective-text" dir="rtl" className="pointer-events-none absolute top-7 right-7 z-30 max-w-[21rem] text-right">
          <div className="text-[11px] tracking-wide text-sky-100/45">نوفمبر 1954 · جبال الأوراس</div>
          <div className="mt-3 border-r-2 border-amber-200/60 pr-3">
            <p className="text-sm leading-snug text-white/85">{hud.objAr}</p>
            <p className="mt-0.5 text-[11px] text-white/40" dir="ltr">{hud.objEn}</p>
            {hud.subAr && <p className="mt-1.5 text-[11px] leading-snug text-amber-100/55">{hud.subAr}</p>}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5" dir="rtl">
        {!quietScene && toasts.map((t) => <p key={t.id} data-testid="toast" className="night-zone rounded-full bg-black/45 px-3 py-1 text-xs text-amber-50/85 backdrop-blur">{t.ar} <span className="text-white/40" dir="ltr">· {t.en}</span></p>)}
      </div>

      {isTouch && playing && (
        <div className="absolute right-6 bottom-28 z-30 flex flex-col gap-3">
          <button type="button" onClick={() => { const v = !crouchOn; setCrouchOn(v); levelRef.current?.setCrouchToggle(v); }} className={`size-14 rounded-full text-xs backdrop-blur-md ${crouchOn ? "bg-sky-200/30 text-white" : "bg-white/10 text-white/70"}`}>انحناء</button>
        </div>
      )}

      {mapOpen && entered && (
        <div data-testid="map-overlay" dir="rtl" className="absolute inset-0 z-30 grid place-items-center bg-black/60 p-6 backdrop-blur-[2px]" onClick={() => setMapOpen(false)}>
          <div className="aspect-[270/196] w-[min(92vw,140vh)] rounded-2xl border border-white/10 bg-[#020a0e]/90 p-3"><MountainMap live={live} /></div>
          <p className="absolute bottom-4 text-xs text-white/40">M للإغلاق · M to close</p>
        </div>
      )}

      {fail && (
        <div data-testid="caught-overlay" dir="rtl" className="night-rise absolute inset-0 z-40 grid place-items-center bg-black/80">
          <div className="text-center">
            <h2 className="font-arabic-display text-5xl text-red-200/90">{fail === "killed" ? "سقطت" : "أمسكوا بك"}</h2>
            <p className="mt-5 text-xs text-white/40">العودة إلى آخر نقطة حفظ — لخضر بجانبك · Back to the last checkpoint, Lakhdar beside you</p>
          </div>
        </div>
      )}

      {intro && (
        <div data-testid="intro" dir="rtl" className={`absolute inset-0 z-40 ${intro === "text" ? "bg-black/85" : "bg-transparent"}`} onClick={() => intro === "text" && introNext()}>
          <div className="cine-bar pointer-events-none absolute inset-x-0 top-0 h-[9vh] bg-black" />
          <div className="cine-bar pointer-events-none absolute inset-x-0 bottom-0 h-[9vh] bg-black" />
          {intro === "text" ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col justify-center gap-5 px-8 py-[11vh]">
              {M_INTRO.slice(0, introStep + 1).map((p, i) => (
                <div key={i} className={`night-rise ${i < introStep ? "opacity-45" : ""}`} style={{ animationDelay: "0s" }}>
                  <p className={`font-arabic-display leading-relaxed text-white/90 ${i === 0 ? "text-3xl text-amber-100" : "text-xl"}`}>{p.ar}</p>
                  <p className="mt-1 text-xs text-white/35" dir="ltr">{p.en}</p>
                </div>
              ))}
              {introStep >= M_INTRO.length - 1 && <p className="night-rise mt-6 text-[11px] text-white/35">{M_DISCLAIMER.ar} <span dir="ltr">· {M_DISCLAIMER.en}</span></p>}
              <button type="button" data-testid="intro-next-button" onClick={(e) => { e.stopPropagation(); introNext(); }} className="mt-4 self-start rounded-full border border-amber-100/30 px-6 py-2 text-sm text-amber-50/90 hover:bg-white/5">
                {introStep < M_INTRO.length - 1 ? "تابع · Continue" : "نقطة التفرّق · Dispersal point"}
              </button>
            </div>
          ) : (
            <div className="caption-in absolute right-[8vw] bottom-[16vh] text-right">
              <p className="font-arabic-display text-4xl text-white/90">{M_CAPTION.ar}</p>
              <p className="mt-1 text-sm tracking-[0.3em] text-amber-100/60">{M_CAPTION.sub}</p>
              <p className="mt-1 text-xs text-white/40" dir="ltr">{M_CAPTION.en}</p>
            </div>
          )}
        </div>
      )}

      {dlg && <DialogueView d={dlg} quiet={dlg.kind === "loss"} onNext={advance} onChoose={choose} />}

      {narr >= 0 && (
        <div data-testid="narrator" dir="rtl" className="absolute inset-0 z-40 grid place-items-center bg-black/35" onClick={narrNext}>
          <div key={narr} className="night-rise max-w-2xl px-8 text-center">
            <p className="font-arabic-display text-2xl leading-relaxed text-white/90" style={{ textShadow: "0 2px 18px #000" }}>{NARRATOR[narr].ar}</p>
            <p className="mt-3 text-sm text-white/45" dir="ltr">{NARRATOR[narr].en}</p>
            <button type="button" data-testid="narrator-next-button" onClick={(e) => { e.stopPropagation(); narrNext(); }} className="mt-8 rounded-full border border-white/20 px-5 py-2 text-xs text-white/60 hover:bg-white/5">تابع · Continue</button>
          </div>
        </div>
      )}

      {ending && (
        <div data-testid="ending-screen" dir="rtl" className="night-rise absolute inset-0 z-50 flex items-center overflow-y-auto bg-gradient-to-l from-black via-black/85 to-black/40">
          <div className="mr-[6vw] max-w-xl px-6 py-10">
            <p className="text-xs tracking-[0.25em] text-amber-200/60">نهاية الفصل · End of the chapter</p>
            <h1 data-testid="ending-title" className="font-arabic-display mt-3 text-6xl leading-tight text-white">الطريق إلى الجبل</h1>
            <p className="mt-1 text-sm tracking-[0.35em] text-sky-100/55 uppercase" dir="ltr">The Road to the Mountain</p>
            <p className="mt-6 text-[15px] leading-relaxed text-white/70">
              {ending.route === "valley" ? "اخترتم الوادي، الأقصر والأكثر انكشافاً." : "اخترتم الحافة، الأطول والأبرد."} حملتَ لخضر حتى النار. وفي الملجأ، بقي عمّار وصالح وحدهما مع الفجر.
            </p>
            <dl data-testid="ending-stats" className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                ["الطريق · Route", ending.route === "valley" ? "الوادي" : "الحافة"],
                ["الإرهاق · Exhaustion", ending.exhaustion],
                ["الشكّ · Doubt", ending.doubt],
                ["الدقائق · Minutes", ending.minutes],
                ["المؤن · Supplies", ending.supplies],
                ["الطلقات · Shots", ending.shots],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-white/5 p-3"><dt className="text-[11px] text-white/45">{k}</dt><dd className="mt-1 text-2xl text-white tabular-nums">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-4 text-[11px] text-white/35">الإرهاق والشكّ يُنقلان إلى الفصل التالي · Exhaustion and doubt carry into the next chapter</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" data-testid="replay-button" onClick={() => window.location.reload()} className="rounded-full bg-amber-100/90 px-7 py-3 text-[15px] font-semibold text-stone-950 hover:scale-[1.03]">أعد المستوى · Play again</button>
              <a href="/barracks" className="rounded-full border border-white/20 px-6 py-3 text-sm text-white/70 hover:bg-white/5">← ليلة الفاتح · Night of the First</a>
            </div>
          </div>
        </div>
      )}

      <div data-testid="start-overlay" dir="rtl" className={`absolute inset-0 z-30 flex items-center bg-gradient-to-l from-black/90 via-black/60 to-transparent transition-opacity duration-700 ${showStart ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <div className="night-rise mr-[7vw] max-w-lg px-6">
          <p className="text-xs tracking-[0.25em] text-amber-200/60">المستوى الثاني · Level 2</p>
          <h1 data-testid="level-title" className="font-arabic-display mt-3 text-6xl leading-[1.15] text-white sm:text-7xl">الطريق إلى الجبل</h1>
          <p className="mt-1 text-sm tracking-[0.45em] text-sky-100/55 uppercase" dir="ltr">The Road to the Mountain</p>
          <p className="mt-6 text-[15px] leading-relaxed text-white/70">بعد ليلة الفاتح، يتفرّق الفوج في الجبال. احمل لخضر الجريح إلى ملجأ الرعاة قبل أن يصعد الدرك بالكلاب: الوادي أقصر ومراقَب، والحافة أطول وأبرد.</p>
          <p className="mt-1 text-xs leading-relaxed text-white/40" dir="ltr">After the Night of the First, the squad scatters into the mountains. Carry the wounded Lakhdar to the shepherds' shelter before the gendarmes come up with dogs: the valley is shorter and watched, the ridge longer and colder.</p>
          <button type="button" data-testid="enter-level-button" onClick={entered ? () => levelRef.current?.enter() : begin} disabled={!ready || error}
            className="mt-8 inline-flex items-center gap-3 rounded-full bg-amber-100/90 px-7 py-3 text-[15px] font-semibold text-stone-950 shadow-[0_0_40px_rgba(255,190,110,0.25)] hover:scale-[1.03] disabled:opacity-40">
            {entered ? "تابع · Resume" : "ابدأ · Begin"}
          </button>
          <a href="/barracks" className="mr-4 text-xs text-white/40 underline-offset-4 hover:underline">← المستوى الأول · Level 1</a>
          {!isTouch && (
            <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-white/55">
              {CONTROLS.map((c) => (
                <li key={c.key} className="flex items-center gap-2.5">
                  <kbd dir="ltr" className="min-w-14 rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-center font-mono text-[10px] text-white/75">{c.key}</kbd>
                  <span>{c.ar}</span>
                  <span className="text-white/30" dir="ltr">{c.en}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-6 text-[10px] text-white/30" dir="ltr">Terrain: real elevation of the Aurès west of Khenchela (SRTM-derived, AWS Terrain Tiles)</p>
        </div>
      </div>
    </main>
  );
}
