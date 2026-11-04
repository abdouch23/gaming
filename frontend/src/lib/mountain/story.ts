// «الطريق إلى الجبل» — script. Continues from the dispersal point of «ليلة الفاتح».
// Per the design document, the level itself has no historical figure: Ammar and Lakhdar are fictional
// (fic_aures_fighter_03). The bridge scene before the level is with Abbas Laghrour, as in the previous level.
import type { Character } from "@/lib/barracks/story";
import { CAST as BARRACKS_CAST } from "@/lib/barracks/story";

export type MSpeaker = "laghrour" | "ammar" | "lakhdar" | "you";
export const MCAST: Record<MSpeaker, Character> = {
  laghrour: BARRACKS_CAST.laghrour,
  ammar: { ar: "عمّار", en: "Ammar", roleAr: "مجاهد · راعٍ من الجبل", roleEn: "Mujahid · a shepherd from these mountains", portrait: "/portraits/ammar.svg", face: "/portraits/ammar-face.svg" },
  lakhdar: { ar: "لخضر", en: "Lakhdar", roleAr: "مجاهد جريح · من أفواج خنشلة", roleEn: "Wounded mujahid · Khenchela squads", portrait: "/portraits/lakhdar.svg", face: "/portraits/lakhdar-face.svg" },
  you: { ar: "صالح", en: "Salah", roleAr: "أنت", roleEn: "You" },
};

export interface MLine { who: MSpeaker; ar: string; en: string }

export const M_INTRO: { ar: string; en: string }[] = [
  { ar: "الفاتح من نوفمبر 1954. بعد منتصف الليل.", en: "1 November 1954. After midnight." },
  { ar: "انفجرت مركبات الثكنة، وانطفأت خنشلة. وفي كل الأوراس دوّى الرصاص في الساعة نفسها.", en: "The barracks' vehicles burned, and Khenchela went dark. All over the Aurès, rifles spoke at the same hour." },
  { ar: "عند نقطة التفرّق، يتوزّع الرجال على الجبال قبل أن يطلع الفجر وتبدأ المطاردة.", en: "At the dispersal point the men scatter into the mountains before dawn, and before the hunt begins." },
];
export const M_DISCLAIMER = { ar: "عمّار ولخضر وصالح شخصيات متخيَّلة. الأماكن والتضاريس حقيقية — جبال الأوراس غرب خنشلة.", en: "Ammar, Lakhdar and Salah are fictional. The places and the terrain are real — the Aurès west of Khenchela." };
export const M_CAPTION = { ar: "جبال الأوراس · غرب خنشلة", sub: "1 نوفمبر 1954 · قبل الفجر · 1690 م", en: "The Aurès mountains · west of Khenchela" };

export const BRIDGE: MLine[] = [
  { who: "laghrour", ar: "هنا نفترق. عجول والعزوي معي إلى جبل شيليا. أما أنت…", en: "This is where we split. Adjoul and Azawi come with me to Djebel Chélia. As for you…" },
  { who: "laghrour", ar: "هذا لخضر، من فوج الدرك. أصابته رصاصة عند السور، ونزف طوال الطريق. لا يقدر على المشي.", en: "This is Lakhdar, from the gendarmerie squad. A bullet found him at the wall, and he bled the whole way here. He can't walk." },
  { who: "ammar", ar: "أنا عمّار. رعيتُ الغنم في هذه الجبال عشرين سنة. فوق السفح ملجأ رعاة، وفيه حطب.", en: "I'm Ammar. I grazed sheep on these mountains for twenty years. There's a shepherds' shelter up the slope, with firewood." },
  { who: "laghrour", ar: "احمله أنت يا صالح، وعمّار يدلّك. الدرك سيصعدون بالكلاب عند الفجر.", en: "You carry him, Salah, and Ammar shows the way. The gendarmes will come up with dogs at first light." },
  { who: "lakhdar", ar: "اتركوني… سأبطئكم.", en: "Leave me… I'll slow you down." },
  { who: "you", ar: "لا أحد يبقى هنا. قم، خذ بكتفي.", en: "Nobody stays here. Up — take my shoulder." },
  { who: "laghrour", ar: "الطلقة الواحدة الآن تجلب عليكم الجبل كلّه. اقتصدوا في كل شيء. الله معكم.", en: "One shot now brings the whole mountain down on you. Spare everything. God be with you." },
];

export const FORK_LINES: MLine[] = [
  { who: "ammar", ar: "من هنا يتفرّق الطريق. انظر: الملجأ هناك، فوق، تحت الصخرة.", en: "The path splits here. Look: the shelter, up there, under the rock." },
  { who: "ammar", ar: "شرقاً الوادي: أقصر، فيه ماء وشجيرات… لكن الدرك يمشون على ضفّته، ومعهم كلب.", en: "East, the valley: shorter, water and brush… but the gendarmes walk its bank, and they have a dog." },
  { who: "ammar", ar: "غرباً الحافة: أطول وأعلى، والريح هناك تقطع العظم. لا أحد يحرسها — البرد يكفيهم.", en: "West, the ridge: longer and higher, and the wind up there cuts to the bone. Nobody guards it — the cold does it for them." },
  { who: "lakhdar", ar: "…الماء يمحو الأثر عن الكلب. هكذا كان أبي يقول.", en: "…Water wipes the trail from the dog. That's what my father used to say." },
];
export const ROUTE_CHOICE = [
  { id: "valley" as const, ar: "الوادي — أسرع ومكشوف", en: "The valley — faster, exposed" },
  { id: "ridge" as const, ar: "الحافة — أطول وأبرد", en: "The ridge — longer, colder" },
];
export const AFTER_CHOICE: Record<"valley" | "ridge", MLine[]> = {
  valley: [{ who: "ammar", ar: "الوادي إذن. امشِ منحنياً بين الشجيرات، وإن سمعت الكلب فادخل الماء.", en: "The valley, then. Walk low through the brush, and if you hear the dog, get into the water." }],
  ridge: [{ who: "ammar", ar: "الحافة. شُدّ عليه الكسوة، ولا تقف طويلاً في الريح.", en: "The ridge. Pull the cloak tight around him, and don't stand long in the wind." }],
};

export const LOSS: MLine[] = [
  { who: "lakhdar", ar: "النار… دافئة.", en: "The fire… it's warm." },
  { who: "lakhdar", ar: "قولوا لأمّي في تاوزيانت… إنّي ما هربت.", en: "Tell my mother in Taouzianat… that I didn't run." },
  { who: "ammar", ar: "…", en: "…" },
  { who: "ammar", ar: "حملتَه طوال الطريق يا صالح. لم يمت وحده في الثلج. هذا ما كان بأيدينا.", en: "You carried him the whole way, Salah. He didn't die alone in the snow. That much was in our hands." },
];

export const NARRATOR: { ar: string; en: string }[] = [
  { ar: "مرّت أيام باردة في الملجأ، حتى العاشر من نوفمبر.", en: "Cold days passed in the shelter, until the tenth of November." },
  { ar: "وصلت الأخبار متباينة: في الأوراس دوّت عمليات باتنة وخنشلة وآريس وتكوت، وفي مناطق أخرى تعثّرت العمليات وبدأت الاعتقالات. وأرسلت باريس المظلّيين إلى الجبال.", en: "The news came mixed: in the Aurès the attacks of Batna, Khenchela, Arris and T'kout had struck; elsewhere operations faltered and the arrests began. Paris sent paratroopers into the mountains." },
  { ar: "بدأت الثورة. أما كيف ستنجو… فلا أحد يعرف بعد.", en: "The revolution had begun. How it would survive… no one knew yet." },
];

export const BARKS = {
  needCarry: { ar: "لن نتركه هنا. احمله.", en: "We're not leaving him here. Carry him." },
  leftBehind: { ar: "صالح! لخضر خلفنا — لا نكمل بدونه.", en: "Salah! Lakhdar is behind us — we don't go on without him." },
  putDownRock: { ar: "ضعه هنا، واصعد الصخرة. من فوق ترى كل شيء.", en: "Set him down here and climb the rock. From up there you see everything." },
  chooseFirst: { ar: "انتظر — اصعد الصخرة أولاً، ثم نقرّر.", en: "Wait — climb the rock first, then we decide." },
  wrongRoute: { ar: "اخترنا الطريق الآخر. لا وقت للتردّد.", en: "We chose the other way. No time to waver." },
  cache: { ar: "هنا خبّأ الرعاة شيئاً — تحت الحجر.", en: "The shepherds hid something here — under the stone." },
  dog: { ar: "الكلب! ادخل الماء، بسرعة.", en: "The dog! Into the water, quick." },
  cold: { ar: "البرد يأكله… لا تقف.", en: "The cold is eating him… don't stop." },
  lakhdarWeak: { ar: "…صالح؟ أين نحن؟", en: "…Salah? Where are we?" },
  edge: { ar: "ليس من هنا — الجرف.", en: "Not that way — the drop." },
  shelterNear: { ar: "الملجأ. ضعه قرب النار.", en: "The shelter. Lay him by the fire." },
  gunshot: { ar: "الطلقة سُمعت في البلدة… سيصعدون.", en: "They heard that shot in the town… they'll come up." },
  reinforcements: { ar: "رجال آخرون يصعدون من البلدة!", en: "More men coming up from the town!" },
  valleyDone: { ar: "خرجنا من الوادي. لم يرنا أحد… أظنّ.", en: "We're out of the valley. Nobody saw us… I think." },
  ridgeDone: { ar: "انتهت الحافة. يداي لا أشعر بهما.", en: "The ridge is behind us. I can't feel my hands." },
};
