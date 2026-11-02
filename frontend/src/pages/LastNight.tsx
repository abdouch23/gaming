import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Eye } from "lucide-react";
import { NightLevel, type HudState, type Ending } from "@/lib/night/level";
import { NightAudio } from "@/lib/night/audio";
import type { Zone } from "@/lib/night/world";

const CONTROLS: { key: string; ar: string; en: string }[] = [
  { key: "W A S D", ar: "تحرّك", en: "Move" },
  { key: "Shift", ar: "ركض", en: "Run" },
  { key: "C", ar: "انحناء", en: "Crouch" },
  { key: "E", ar: "تفاعل", en: "Interact" },
  { key: "Space", ar: "قفز", en: "Jump" },
  { key: "Esc", ar: "توقّف", en: "Pause" },
];

interface Line { who: "زهرة" | "عمّار" | "أنت"; ar: string; en: string }
const ZAHRA_INTRO: Line[] = [
  { who: "زهرة", ar: "تأخّرت. ظننتُ أن الدرك أمسكوا بك.", en: "You're late. I thought the gendarmes had you." },
  { who: "أنت", ar: "المسلك مراقَب. هل الرسالة جاهزة؟", en: "The path is watched. Is the message ready?" },
  { who: "زهرة", ar: "جاهزة. لكن اسمع: الدورية غيّرت طريقها الليلة. الشبكة تقول إنها تقف عند القنطرة ثم تعود… لستُ متأكدة.", en: "It is. But listen: the patrol changed its route tonight. The network says it stops at the culvert, then turns back… I'm not sure." },
];
const ZAHRA_AFTER: Record<"promise" | "rush", Line[]> = {
  promise: [
    { who: "زهرة", ar: "إذن خذ الممرّ خلف الجدار الغربي، فتحتُه لك. لا يعرفه الدرك.", en: "Then take the passage behind the west wall, I've opened it for you. The gendarmes don't know it." },
    { who: "زهرة", ar: "راقبهم من الصخرة الشرقية، ثم اذهب إلى عمّار عند العين.", en: "Watch them from the Eastern Rock, then go to Ammar at the spring." },
  ],
  rush: [{ who: "زهرة", ar: "كما تشاء… الرسالة لعمّار عند العين. لا تَمُت من أجلها.", en: "As you wish… The message is for Ammar at the spring. Don't die for it." }],
};
const ammarLines = (observed: boolean): Line[] => [
  { who: "عمّار", ar: "وصلت أخيراً. الرسالة؟", en: "You made it. The message?" },
  observed
    ? { who: "أنت", ar: "هذه هي. ورأيتُ الدورية بعينيّ: تقف عند القنطرة ثم تعود إلى المفترق.", en: "Here. And I saw the patrol with my own eyes: it stops at the culvert, then returns to the crossroads." }
    : { who: "أنت", ar: "هذه هي. الشبكة تقول إن الدورية تقف عند القنطرة.", en: "Here. The network says the patrol stops at the culvert." },
  observed
    ? { who: "عمّار", ar: "هذا ما نحتاجه. سنتحرّك قبل الفجر.", en: "That's what we need. We move before dawn." }
    : { who: "عمّار", ar: "معلومة لم يتحقّق منها أحد… سنتحرّك على عجل، ونرجو ألا نخطئ.", en: "Unverified… We'll move in haste, and hope we're not wrong." },
];

type Dialogue = { who: "zahra" | "ammar"; lines: Line[]; i: number; choice: "promise" | "rush" | null };

export default function LastNight() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef<NightLevel | null>(null);
  const audioRef = useRef<NightAudio | null>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const markerDistRef = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [entered, setEntered] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [zone, setZone] = useState<Zone | null>(null);
  const [zoneKey, setZoneKey] = useState(0);
  const [hud, setHud] = useState<HudState | null>(null);
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [caught, setCaught] = useState<"caught" | "dawn" | null>(null);
  const [toast, setToast] = useState<number>(0);
  const [ending, setEnding] = useState<Ending | null>(null);
  const [crouchOn, setCrouchOn] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [isTouch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const audio = new NightAudio();
    audioRef.current = audio;
    const lowPower = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820 || navigator.webdriver;
    let level: NightLevel | null = null;
    try {
      level = new NightLevel(canvas, {
        lowPower,
        onReady: () => setReady(true),
        onActiveChange: (v) => setActive(v),
        onStep: (s, l) => audio.step(s, l),
        onZone: (z) => {
          setZone(z);
          setZoneKey((k) => k + 1);
        },
        onHud: setHud,
        onDialogue: (who) => {
          const observed = levelRef.current?.game.observed ?? false;
          setDialogue({ who, lines: who === "zahra" ? ZAHRA_INTRO : ammarLines(observed), i: 0, choice: null });
        },
        onCaught: (r) => {
          setCaught(r);
          window.setTimeout(() => setCaught(null), 2800);
        },
        onCheckpoint: () => setToast((n) => n + 1),
        onEnding: (e) => setEnding(e),
      });
      levelRef.current = level;
      level.setMarkerEl(markerRef.current, markerDistRef.current);
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
      setSoundOn(true);
      await audio.start();
    }
  };

  const advance = () => {
    const d = dialogue;
    const lvl = levelRef.current;
    if (!d || !lvl) return;
    if (d.i < d.lines.length - 1) return setDialogue({ ...d, i: d.i + 1 });
    if (d.who === "zahra" && !d.choice) return; // waiting for a choice
    setDialogue(null);
    if (d.who === "zahra" && d.choice) {
      lvl.resolveZahra(d.choice);
      lvl.enter();
    } else lvl.finishAmmar();
  };
  const choose = (c: "promise" | "rush") => {
    if (!dialogue) return;
    setDialogue({ ...dialogue, choice: c, lines: [...dialogue.lines, { who: "أنت", ar: c === "promise" ? "أعدكِ أن أتحقّق بعينيّ أولاً." : "لا وقت. أثق بالشبكة.", en: c === "promise" ? "I promise to see it with my own eyes first." : "No time. I trust the network." }, ...ZAHRA_AFTER[c]], i: dialogue.i + 1 });
  };

  const line = dialogue ? dialogue.lines[dialogue.i] : null;
  const awaitingChoice = !!dialogue && dialogue.who === "zahra" && !dialogue.choice && dialogue.i === dialogue.lines.length - 1;
  const showOverlay = !active && !dialogue && !ending;
  const susp = hud?.suspicion ?? 0;
  const playing = active && !dialogue && !ending;

  return (
    <main data-testid="last-night-level" className="fixed inset-0 overflow-hidden bg-black select-none">
      <canvas ref={canvasRef} data-testid="level-canvas" className="absolute inset-0 h-full w-full touch-none" />

      {webglError && (
        <p data-testid="webgl-error" className="absolute inset-0 z-50 grid place-items-center text-sm text-white/60" dir="rtl">
          WebGL غير متاح على هذا الجهاز · WebGL is not available on this device
        </p>
      )}
      <div aria-hidden className={`pointer-events-none absolute inset-0 z-40 bg-black transition-opacity duration-[2400ms] ease-out ${ready ? "opacity-0" : "opacity-100"}`} />

      {/* Objective marker (moved by the engine every frame) */}
      <div ref={markerRef} data-testid="objective-marker" className="pointer-events-none absolute top-0 left-0 z-10 opacity-0 transition-opacity duration-500">
        <div className="-translate-1/2 flex flex-col items-center gap-1">
          <span className="size-3 rotate-45 border border-amber-200/80 bg-amber-200/20 shadow-[0_0_12px_rgba(255,200,120,0.6)]" />
          <span ref={markerDistRef} className="text-[10px] tracking-wider text-amber-100/70 tabular-nums" />
        </div>
      </div>

      {playing && <span data-testid="crosshair" className="pointer-events-none absolute top-1/2 left-1/2 z-10 size-[5px] -translate-1/2 rounded-full bg-white/55 shadow-[0_0_6px_rgba(180,210,255,0.6)]" />}

      {/* Interaction prompt */}
      {playing && hud?.prompt && (
        <button type="button" data-testid="interact-prompt" onClick={() => levelRef.current?.interact()} dir="rtl" className="absolute top-[58%] left-1/2 z-20 -translate-x-1/2 rounded-full border border-amber-100/25 bg-black/50 px-4 py-2 text-sm text-amber-50 backdrop-blur-md transition-transform duration-200 hover:scale-105">
          <kbd className="ml-2 rounded border border-white/30 px-1.5 font-mono text-[11px]">E</kbd>
          {hud.prompt.ar} <span className="text-xs text-white/45" dir="ltr">· {hud.prompt.en}</span>
        </button>
      )}

      {/* Suspicion meter */}
      {playing && susp > 0.02 && (
        <div data-testid="suspicion-meter" dir="rtl" className="pointer-events-none absolute top-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5">
          <Eye className={`size-5 ${susp > 0.45 ? "text-red-400" : "text-amber-200/80"}`} strokeWidth={1.6} />
          <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full transition-[width] duration-150 ${susp > 0.45 ? "bg-red-500" : "bg-amber-300"}`} style={{ width: `${Math.min(1, susp) * 100}%` }} />
          </div>
          <span className="text-[11px] text-white/60">{susp > 0.45 ? "انتبهوا لك! · They noticed you" : "ريبة · Suspicion"}</span>
        </div>
      )}

      {/* Observation progress */}
      {playing && hud && hud.stage === "observe" && hud.observe > 0 && (
        <div data-testid="observe-progress" className="pointer-events-none absolute top-[62%] left-1/2 z-20 w-48 -translate-x-1/2 text-center" dir="rtl">
          <div className="h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-sky-200/80" style={{ width: `${hud.observe * 100}%` }} /></div>
          <p className="mt-1.5 text-[11px] text-sky-100/70">تراقب الدورية… · Observing the patrol…</p>
        </div>
      )}

      {/* Visibility */}
      {playing && hud && (
        <div data-testid="visibility-indicator" dir="rtl" className="pointer-events-none absolute bottom-7 left-7 z-20 flex items-center gap-2.5 rounded-full bg-black/35 px-3.5 py-2 backdrop-blur-md">
          <span className={`size-2.5 rounded-full ${hud.visibility === "lit" ? "bg-amber-300 shadow-[0_0_10px_rgba(255,200,90,0.9)]" : hud.visibility === "shadow" ? "bg-sky-300/60" : "bg-white/15"}`} />
          <span className="text-xs text-white/70">{hud.visibility === "lit" ? "مكشوف · Exposed" : hud.visibility === "shadow" ? "في الظل · In shadow" : "مختبئ · Hidden"}</span>
          {hud.hasMessage && <span className="mr-2 rounded bg-amber-200/15 px-1.5 text-[10px] text-amber-100/80">✉ الرسالة</span>}
        </div>
      )}

      {/* Sound toggle */}
      <button type="button" data-testid="sound-toggle-button" aria-label={soundOn ? "كتم الصوت · Mute" : "تشغيل الصوت · Play sound"} aria-pressed={soundOn} onClick={toggleSound}
        className="group absolute top-6 left-6 z-30 grid size-12 place-items-center rounded-full bg-white/[0.12] text-white/85 backdrop-blur-md transition-[background-color,transform] duration-300 hover:scale-105 hover:bg-white/20 active:scale-95">
        {soundOn ? <Volume2 className="size-5" strokeWidth={1.6} /> : <VolumeX className="size-5" strokeWidth={1.6} />}
        {soundOn && <span className="night-ping absolute inset-0 rounded-full" />}
      </button>

      {/* Clock + objective */}
      <div data-testid="night-clock" dir="rtl" className="pointer-events-none absolute top-7 right-7 z-30 max-w-[19rem] text-right">
        <div className="font-arabic-display text-3xl leading-none text-sky-50/85 tabular-nums">{hud?.clock ?? "23:12"}</div>
        <div className="mt-1.5 text-[11px] tracking-wide text-sky-100/45">حظر التجوال · الفجر 04:45 · Dawn</div>
        {entered && hud && hud.stage !== "ended" && (
          <div data-testid="objective-text" className="mt-4 border-r-2 border-amber-200/60 pr-3">
            <p className="text-sm leading-snug text-white/85">{hud.objAr}</p>
            <p className="mt-0.5 text-[11px] text-white/40" dir="ltr">{hud.objEn}</p>
            {hud.subAr && <p className="mt-1.5 text-[11px] leading-snug text-amber-100/50">{hud.subAr}</p>}
          </div>
        )}
      </div>

      {/* Place card */}
      {zone && playing && (
        <div key={zoneKey} data-testid="zone-card" dir="rtl" className="night-zone pointer-events-none absolute right-8 bottom-10 z-20 max-w-xs text-right">
          <div className="mb-2 h-px w-16 bg-gradient-to-l from-amber-200/70 to-transparent" />
          <h2 data-testid="zone-name-ar" className="font-arabic-display text-4xl leading-tight text-white/90">{zone.ar}</h2>
          <p className="mt-0.5 text-xs tracking-[0.3em] text-sky-100/55 uppercase" dir="ltr">{zone.en}</p>
          <p className="mt-3 text-sm text-white/60">{zone.noteAr}</p>
        </div>
      )}

      {toast > 0 && <p key={toast} data-testid="checkpoint-toast" dir="rtl" className="night-zone pointer-events-none absolute bottom-24 left-1/2 z-20 -translate-x-1/2 text-xs tracking-widest text-amber-100/70">✦ تم الحفظ · Checkpoint</p>}

      {/* Mobile action buttons */}
      {isTouch && playing && (
        <div className="absolute right-6 bottom-28 z-30 flex flex-col gap-3">
          <button type="button" data-testid="crouch-toggle-button" onClick={() => { const v = !crouchOn; setCrouchOn(v); levelRef.current?.setCrouchToggle(v); }}
            className={`size-14 rounded-full text-xs backdrop-blur-md ${crouchOn ? "bg-sky-200/30 text-white" : "bg-white/10 text-white/70"}`}>انحناء</button>
        </div>
      )}

      {/* Caught / dawn */}
      {caught && (
        <div data-testid="caught-overlay" dir="rtl" className="night-rise absolute inset-0 z-40 grid place-items-center bg-black/80">
          <div className="text-center">
            <h2 className="font-arabic-display text-5xl text-red-200/90">{caught === "dawn" ? "طلع الفجر" : "أمسكوا بك"}</h2>
            <p className="mt-2 text-sm text-white/50" dir="ltr">{caught === "dawn" ? "Dawn broke before the message arrived" : "You were caught"}</p>
            <p className="mt-5 text-xs text-white/40">العودة إلى آخر نقطة حفظ · Back to the last checkpoint</p>
          </div>
        </div>
      )}

      {/* Dialogue */}
      {dialogue && line && (
        <div data-testid="dialogue-panel" dir="rtl" className="absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black via-black/85 to-transparent px-6 pt-24 pb-10">
          <div className="mx-auto max-w-2xl">
            <p data-testid="dialogue-speaker" className={`text-xs tracking-widest ${line.who === "أنت" ? "text-sky-200/70" : "text-amber-200/80"}`}>{line.who}</p>
            <p data-testid="dialogue-line" className="font-arabic-display mt-2 text-2xl leading-relaxed text-white/90">{line.ar}</p>
            <p className="mt-1 text-sm text-white/40" dir="ltr">{line.en}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {awaitingChoice ? (
                <>
                  <button type="button" data-testid="choice-promise-button" onClick={() => choose("promise")} className="rounded-full border border-amber-200/40 bg-amber-100/10 px-5 py-2.5 text-sm text-amber-50 transition-[background-color,transform] duration-200 hover:scale-[1.03] hover:bg-amber-100/20">
                    أعِدها بالتحقّق بنفسك <span className="text-xs text-white/45" dir="ltr">· Promise to verify (slower, safer)</span>
                  </button>
                  <button type="button" data-testid="choice-rush-button" onClick={() => choose("rush")} className="rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm text-white/80 transition-[background-color,transform] duration-200 hover:scale-[1.03] hover:bg-white/10">
                    اعتمد على الشبكة واستعجل <span className="text-xs text-white/45" dir="ltr">· Trust the network (faster)</span>
                  </button>
                </>
              ) : (
                <button type="button" data-testid="dialogue-next-button" onClick={advance} className="rounded-full bg-amber-100/90 px-6 py-2.5 text-sm font-semibold text-stone-950 transition-transform duration-200 hover:scale-[1.03]">
                  {dialogue.i < dialogue.lines.length - 1 ? "تابع · Continue" : dialogue.who === "zahra" ? "انطلق · Go" : "سلّم الرسالة · Hand it over"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ending */}
      {ending && (
        <div data-testid="ending-screen" dir="rtl" className="night-rise absolute inset-0 z-50 flex items-center bg-gradient-to-l from-black via-black/85 to-black/40">
          <div className="mr-[8vw] max-w-lg px-6">
            <p className="text-xs tracking-[0.25em] text-amber-200/60">نهاية الفصل الأول · End of Chapter I</p>
            <h1 data-testid="ending-title" className="font-arabic-display mt-3 text-6xl leading-tight text-white">{ending.holds ? "الشبكة صامدة" : "الشبكة متوترة"}</h1>
            <p className="mt-1 text-sm tracking-[0.35em] text-sky-100/55 uppercase" dir="ltr">{ending.holds ? "The Network Holds" : "The Network Is Tense"}</p>
            <p className="mt-6 text-[15px] leading-relaxed text-white/70">
              {ending.holds ? "وصلت الرسالة ومعها الحقيقة. عمّار ورجاله يتحرّكون بثقة قبل أول ضوء." : ending.observed ? "وصلت الرسالة، لكن الثقة اهتزّت هذه الليلة." : "وصلت الرسالة، لكن أحداً لم يتحقّق مما فيها. ستتحرّك الشبكة على عجل."}
            </p>
            <dl data-testid="ending-stats" className="mt-6 grid grid-cols-3 gap-4 text-center">
              <div className="rounded-xl bg-white/5 p-3"><dt className="text-[11px] text-white/45">الثقة · Trust</dt><dd className="mt-1 text-2xl text-white">{ending.trust}</dd></div>
              <div className="rounded-xl bg-white/5 p-3"><dt className="text-[11px] text-white/45">الإمساك · Caught</dt><dd className="mt-1 text-2xl text-white">{ending.catches}</dd></div>
              <div className="rounded-xl bg-white/5 p-3"><dt className="text-[11px] text-white/45">الوقت · Time</dt><dd className="mt-1 text-2xl text-white tabular-nums">{ending.clock}</dd></div>
            </dl>
            <button type="button" data-testid="replay-button" onClick={() => window.location.reload()} className="mt-8 rounded-full bg-amber-100/90 px-7 py-3 text-[15px] font-semibold text-stone-950 transition-transform duration-200 hover:scale-[1.03]">أعد الليلة · Play again</button>
            <a href="/barracks" data-testid="next-chapter-link" className="mt-8 mr-3 inline-block rounded-full border border-amber-100/40 px-7 py-3 text-[15px] text-amber-50 transition-transform duration-200 hover:scale-[1.03]">الفصل الثاني · Chapter II →</a>
          </div>
        </div>
      )}

      {/* Start / pause screen */}
      <div data-testid="start-overlay" dir="rtl" className={`absolute inset-0 z-30 flex items-center bg-gradient-to-l from-black/85 via-black/55 to-transparent transition-opacity duration-700 ${showOverlay ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <div className="night-rise mr-[7vw] max-w-md px-6">
          <p className="text-xs tracking-[0.25em] text-amber-200/60">الفصل الأول · Chapter I</p>
          <h1 data-testid="level-title" className="font-arabic-display mt-3 text-6xl leading-[1.15] text-white sm:text-7xl">الليلة الأخيرة</h1>
          <p className="mt-1 text-sm tracking-[0.45em] text-sky-100/55 uppercase" dir="ltr">The Last Night</p>
          <p className="mt-6 text-[15px] leading-relaxed text-white/70">الأوراس · ليلة 31 أكتوبر 1954. خذ رسالة زهرة وأوصلها إلى عمّار عند العين قبل الفجر، دون أن يراك الدرك. الظل صديقك، والحصى يفضحك.</p>
          <p className="mt-1 text-xs leading-relaxed text-white/40" dir="ltr">Aurès · 31 October 1954. Carry Zahra's message to Ammar at the spring before dawn, unseen. Shadows hide you; gravel betrays you.</p>
          <button type="button" data-testid="enter-level-button" onClick={enter} disabled={!ready || webglError}
            className="mt-8 inline-flex items-center gap-3 rounded-full bg-amber-100/90 px-7 py-3 text-[15px] font-semibold text-stone-950 shadow-[0_0_40px_rgba(255,190,110,0.25)] transition-[background-color,transform,box-shadow] duration-300 hover:scale-[1.03] hover:bg-amber-50 active:scale-[0.98] disabled:opacity-40">
            {entered ? "تابع · Resume" : "ادخل الليل · Enter the night"}
          </button>
          <a href="/barracks" data-testid="chapter2-link" className="mr-4 text-xs text-white/40 underline-offset-4 hover:underline">الفصل الثاني · Chapter II ←</a>
          {isTouch ? (
            <p data-testid="touch-help" className="mt-7 text-xs leading-relaxed text-white/45">اسحب يسار الشاشة للمشي، ويمينها للنظر · Drag left to walk, right to look</p>
          ) : (
            <ul data-testid="controls-help" className="mt-8 grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs text-white/55">
              {CONTROLS.map((c) => (
                <li key={c.key} className="flex items-center gap-2.5">
                  <kbd dir="ltr" className="min-w-11 rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-center font-mono text-[10px] text-white/75">{c.key}</kbd>
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
