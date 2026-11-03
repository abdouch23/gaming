// Story script for Chapter II. Dialogue is fictional; the people, the place and the password come from the
// documented night of 31 October 1954 (Dachra Ouled Moussa, the Ben Chaïba house, «خالد عقبة»).
import type { CastId } from "@/lib/barracks/level";

export type SpeakerId = CastId | "you";
export interface Character { ar: string; en: string; roleAr: string; roleEn: string; portrait?: string; face?: string }

const P = (id: string) => ({ portrait: `/portraits/${id}.jpg`, face: `/portraits/${id}-face.jpg` });
export const CAST: Record<SpeakerId, Character> = {
  benboulaid: { ar: "مصطفى بن بولعيد", en: "Mostefa Ben Boulaïd", roleAr: "قائد منطقة الأوراس", roleEn: "Leader, Aurès zone", ...P("benboulaid") },
  chihani: { ar: "شيحاني بشير", en: "Chihani Bachir", roleAr: "نائب القائد · المخطِّط", roleEn: "Deputy · the planner", ...P("chihani") },
  laghrour: { ar: "عباس لغرور", en: "Abbas Laghrour", roleAr: "قائد الفوج", roleEn: "Squad leader", ...P("laghrour") },
  adjoul: { ar: "عاجل عجول", en: "Adjel Adjoul", roleAr: "الفوج · عارف المسالك", roleEn: "Squad · the pathfinder", ...P("adjoul") },
  boucetta: { ar: "مصطفى بوستة", en: "Mostefa Boucetta", roleAr: "المتفجّرات والإسناد", roleEn: "Explosives & support", ...P("boucetta") },
  azawi: { ar: "مرود العزوي", en: "Mroud Al-Azawi", roleAr: "رجل الاتصال · الرامي", roleEn: "Liaison · marksman", ...P("azawi") },
  you: { ar: "أنت", en: "You", roleAr: "مجاهد · فوج ثكنة الوادي", roleEn: "Mujahid · the oued barracks squad" },
};

export interface Line { who: SpeakerId; ar: string; en: string; shot?: "wide" }

export const INTRO: { ar: string; en: string }[] = [
  { ar: "ليلة 31 أكتوبر 1954. جبال الأوراس.", en: "The night of 31 October 1954. The Aurès mountains." },
  { ar: "سنواتٌ من العمل السرّي، من الاجتماعات في البيوت المعتمة، ومن السلاح المخبّأ تحت التبن… كلّها تنتهي الليلة.", en: "Years of clandestine work — meetings in dark houses, rifles hidden under the straw — all of it ends tonight." },
  { ar: "في دشرة أولاد موسى، في بيت عائلة بن شايبة، يجمع مصطفى بن بولعيد رفاقه: شيحاني بشير، عباس لغرور، عاجل عجول، مصطفى بوستة… وعشرات غيرهم.", en: "In Dachra Ouled Moussa, in the house of the Ben Chaïba family, Mostefa Ben Boulaïd gathers his comrades: Chihani Bachir, Abbas Laghrour, Adjel Adjoul, Mostefa Boucetta… and dozens more." },
  { ar: "تُوزَّع المهام، ويُوزَّع السلاح، وتُعطى كلمة السرّ.", en: "The tasks are handed out, the weapons are handed out, and the password is given." },
  { ar: "وعند منتصف الليل، ستشتعل الأوراس كلّها في وقت واحد.", en: "At midnight, the whole Aurès will ignite at once." },
  { ar: "لم يكن أحدٌ منهم يعلم كيف ستنتهي الطريق. لكنهم كانوا يعلمون أنها بدأت… ولا رجوع.", en: "None of them knew how the road would end. But they knew it had begun — and there was no turning back." },
];
export const DISCLAIMER = {
  ar: "مستوحاة من أحداث حقيقية. الحوارات وبعض الوقائع والمهمّات متخيَّلة، والصور تمثيلية.",
  en: "Inspired by real events. Dialogue, some events and missions are fictionalised; portraits are artistic depictions.",
};
export const CAPTION = { ar: "دشرة أولاد موسى · بيت عائلة بن شايبة", sub: "31 أكتوبر 1954 · 22:40", en: "Dachra Ouled Moussa · the Ben Chaïba house" };

export const PROLOGUE: Line[] = [
  { who: "benboulaid", ar: "يا إخوة… سنوات ونحن نعمل في الظل. الليلة، عند منتصف الليل، تتكلّم الجزائر كلّها بصوت واحد.", en: "Brothers… for years we have worked in the shadows. Tonight, at midnight, all of Algeria speaks with one voice." },
  { who: "chihani", ar: "السلاح وُزّع على الأفواج. كل فوج يعرف هدفه، ولا يعرف أهداف غيره. هكذا يحمي بعضنا بعضاً.", en: "The weapons are with the squads. Each squad knows its target and no one else's. That is how we protect each other." },
  { who: "benboulaid", ar: "أنت يا ولدي، ومعك عباس وعاجل: ثكنة الوادي. نحتاج منها ثلاثة أشياء.", en: "You, my son — with Abbas and Adjel: the oued barracks. We need three things from it." },
  { who: "benboulaid", ar: "خرائطهم من مبنى القيادة — كل مركز وكل دورية في الأوراس. وسلاحهم من المخزن. ومركباتهم… لا نريدها أن تلحق بنا.", en: "Their maps from the HQ — every post, every patrol in the Aurès. Their rifles from the armory. And their vehicles… we don't want them following us." },
  { who: "laghrour", ar: "فيها أكثر من ثلاثين عسكرياً، وبرجان بكشّافات. لن ندخلها بالقوة يا سي مصطفى… بل بالعقل.", en: "More than thirty soldiers, two towers with searchlights. We won't get in by force, Si Mostefa… but by wits." },
  { who: "adjoul", ar: "والدشرة مليئة بعيون الحاكم. البوشكارة عند المقهى لا ينام، والدرك يدورون حتى الفجر.", en: "And the dachra is full of the administrator's eyes. The informer at the café never sleeps; the gendarmes walk till dawn." },
  { who: "boucetta", ar: "سأسبقكم إلى معصرة الزيتون بالعبوات. ثلاث، بصواعق مؤقّتة. شيحاني سيضع معكم الخطة هناك.", en: "I'll go ahead to the olive mill with the charges. Three, on timers. Chihani will make the plan with you there." },
  { who: "chihani", ar: "لكن لا خطة بلا عيون. مرود العزوي ينتظركم في مقبرة سيدي عبد الله ومعه منظار. اصعدوا الكاف وعدّوا حرّاسهم قبل أن تأتوني.", en: "But no plan without eyes. Mroud Al-Azawi waits at Sidi Abdallah cemetery with binoculars. Climb the Kef and count their guards before you come to me." },
  { who: "benboulaid", ar: "ومن لا يعرف كلمة السرّ ليس منّا. احفظوها جيداً…", en: "And whoever doesn't know the password is not one of us. Remember it well…" },
  { who: "benboulaid", ar: "«خالد عقبة».", en: "“Khaled Okba.”" },
  { who: "you", ar: "خالد عقبة. سنعود بالسلاح يا سي مصطفى.", en: "Khaled Okba. We'll come back with the rifles, Si Mostefa." },
  { who: "benboulaid", ar: "ولا طلقة قبل الموعد. إن انكشف فوجٌ واحد قبل منتصف الليل، انكشف الأوراس كلّه. توكّلوا على الله.", en: "And not one shot before the hour. If one squad is exposed before midnight, the whole Aurès is exposed. Go, with God." },
];

export const AZAWI_Q: Line = { who: "azawi", ar: "قف مكانك. الليل طويل على من لا يعرف الطريق… ما الكلمة؟", en: "Stay where you are. The night is long for those who don't know the way… The word?" };
export const PASSWORDS = [
  { id: "a", ar: "الأوراس حرّة", en: "The Aurès is free", ok: false },
  { id: "b", ar: "خالد عقبة", en: "Khaled Okba", ok: true },
  { id: "c", ar: "أرسلني بن بولعيد", en: "Ben Boulaïd sent me", ok: false },
];
export const AZAWI_WRONG: Line = { who: "azawi", ar: "…ليست هذه. رجلٌ يخطئ الكلمة الليلة قد يكون جاسوساً. فكّر، ثم تكلّم.", en: "…That's not it. A man who gets the word wrong tonight might be a spy. Think, then speak." };
export const AZAWI_OK: Line[] = [
  { who: "azawi", ar: "مرحباً بالرجال. أنا مرود العزوي — أمشي معكم من هنا إلى الجبل.", en: "Welcome, men. I'm Mroud Al-Azawi — I walk with you from here to the mountain." },
  { who: "azawi", ar: "خذ منظاري. من كاف الغراب تُرى الثكنة كلّها. علّم خمسةً من حرّاسهم على الأقل، فشيحاني لن يضع خطة على العمى.", en: "Take my binoculars. From Crow's Kef you see the whole barracks. Mark at least five of their guards — Chihani won't plan blind." },
  { who: "azawi", ar: "وشيء آخر: مفتاح المخزن في خزنة القائد، داخل مبنى القيادة. الحارس لا يبرح الباب، لكن في الجدار الخلفي ثغرة.", en: "One more thing: the armory key is in the commander's safe, inside the HQ. The sentry never leaves the door — but there's a breach in the back wall." },
  { who: "laghrour", ar: "الفوج اكتمل. أربعة رجال وكلمة واحدة.", en: "The squad is complete. Four men and one word." },
];

export const chihaniLines = (tagged: number, total: number, tries: number): Line[] => [
  { who: "boucetta", ar: "وصلتم. العبوات جاهزة، والصواعق جافّة.", en: "You made it. The charges are ready, the detonators dry." },
  tagged >= Math.ceil(total * 0.75)
    ? { who: "chihani", ar: `عددتم ${tagged} من ${total}؟ هذا عمل رجال يعرفون الحرب. كلّهم على الخريطة.`, en: `You counted ${tagged} of ${total}? That's the work of men who know war. They're all on the map.` }
    : { who: "chihani", ar: `${tagged} من ${total}… يكفي لنبدأ، لكن انتبهوا لمن لم تروه.`, en: `${tagged} of ${total}… enough to start, but watch for the ones you didn't see.` },
  ...(tries > 1 ? [{ who: "chihani" as const, ar: "والعزوي يقول إنك تلعثمت في كلمة السرّ. بوستة لن يكمن وحده في الوادي ليغطّي رجلاً يتلعثم.", en: "And Azawi says you stumbled on the password. Boucetta won't lie alone in the oued to cover a man who stumbles." }] : []),
  { who: "chihani", ar: "الترتيب لا يتغيّر: القيادة أولاً — الخرائط والمفتاح. ثم المخزن. ثم المركبات. ثم الجبل.", en: "The order doesn't change: the HQ first — maps and key. Then the armory. Then the vehicles. Then the mountain." },
  { who: "boucetta", ar: "ستون ثانية بعد آخر صاعق. لا تكونوا قربها.", en: "Sixty seconds after the last timer. Don't be near them." },
  { who: "chihani", ar: "اختر المدخل، وما يفعله بوستة ليفتح لكم الطريق.", en: "Choose the way in, and what Boucetta does to open the road." },
];

export const OUTRO = {
  ar: "في تلك الليلة، من باتنة إلى خنشلة وآريس وتكوت وبسكرة، ضرب المجاهدون في الساعة نفسها. كانت تلك أولى شرارات حرب التحرير التي ستدوم أكثر من سبع سنوات، وتنتهي باستقلال الجزائر في 5 جويلية 1962.",
  en: "That night, from Batna to Khenchela, Arris, T'kout and Biskra, the mujahideen struck at the same hour. It was one of the first sparks of a war of liberation that would last more than seven years and end with Algeria's independence on 5 July 1962.",
};
