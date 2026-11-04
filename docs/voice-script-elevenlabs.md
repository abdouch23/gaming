# سيناريو التعليق الصوتي — ElevenLabs (Eleven v3)

كل الجمل المنطوقة في اللعبة مرتّبة حسب الشخصية، منقولة حرفياً من الكود، ومع كل جملة توجيه للأداء والعاطفة على شكل وسوم (audio tags) يفهمها Eleven v3. في آخر الملف قسم للأعداء الفرنسيين، ومعظمه حوارات جديدة مقترحة لأن اللعبة لا تحتوي حالياً على أي جملة فرنسية منطوقة.

---

## 1. طريقة الاستعمال

- **النموذج:** Eleven v3 (alpha). هو الوحيد الذي يفهم الوسوم بين معقوفين مثل `[whispers]` و`[sighs]`.
- **الوسوم تبقى بالإنجليزية دائماً:** v3 يفهم الوسوم الإنجليزية فقط. لا تترجمها، وضعها قبل النص مباشرة أو في وسطه في الموضع الذي يتغيّر فيه الأداء.
- **توليد واحد لكل جملة:** ولّد كل `ID` في ملف مستقل، وجرّب 2–3 توليدات واختر الأفضل. v3 غير حتمي، فالتوليد الثاني قد يختلف كثيراً عن الأول.
- **لا تنسخ الترجمة الإنجليزية:** السطر المائل تحت كل جملة عربية للفهم فقط (وهو موجود أصلاً في الكود كحقل `en`). لا تلصقه في ElevenLabs.
- **نص الجملة:** الصق النص كما هو (مع `…` و`—`، فهي تساعد على الإيقاع). لم تُغيَّر أي كلمة عن الكود.
- **اللهجة:** النص بالعربية الفصحى المبسّطة كما في الكود. اللكنة الجزائرية/الشاوية تأتي من **اختيار الصوت** (صوت مستنسخ أو من Voice Library بلكنة جزائرية/مغاربية)، لا من تغيير الكلمات.
- **الأرقام داخل النص:** اكتبها بالحروف عند التوليد (مثلاً «ستّين» بدل «60») حتى يُنطق الرقم صحيحاً. الكلمات نفسها لا تتغيّر.
- **تسمية الملفات المقترحة:** `<ID>.mp3`، مثلاً `ch2_benboulaid_01.mp3`، `mt_ammar_bark_leftBehind.mp3`، `fr_soldier_alert_03.mp3`.
  - `ch1` = الفصل الأول «الليلة الأخيرة» (`pages/LastNight.tsx`)
  - `ch2` = الفصل الثاني «ليلة الفاتح» (`lib/barracks/story.ts`، `lib/barracks/level.ts`)
  - `mt` = المستوى الثاني «الطريق إلى الجبل» (`lib/mountain/story.ts`، `lib/mountain/level.ts`)
  - `fr` = الأعداء الفرنسيون (جديد)
- **ما بين القوسين بعد الـID** هو موضع الجملة في الكود (اسم الثابت والفهرس، أو مفتاح `bark`) حتى يربط المطوّر الملف الصوتي بالسطر.
- **الجمل الديناميكية** (فيها أرقام متغيّرة مثل `{tagged}`) معلَّمة بـ⚙️، ومعها اقتراح لطريقة تسجيلها.

---

## 2. دليل الأصوات

| الشخصية | العمر التقريبي | الدور | وصف الصوت | إعدادات ElevenLabs المقترحة |
|---|---|---|---|---|
| **مصطفى بن بولعيد** | ~37 (مواليد 1917) | قائد منطقة الأوراس | صوت رجولي عميق ودافئ، هادئ وواثق، فيه سلطة الأب لا صرامة الضابط. لكنة جزائرية أوراسية (شاوية) خفيفة. يتكلّم ببطء ويترك وقفات. | Stability: **Natural** (‏Robust للجمل الرسمية مثل كلمة السرّ). صوت أبطأ قليلاً، وحماس منخفض. |
| **شيحاني بشير** | ~25 (مواليد 1929) | نائب القائد · المخطِّط | شاب، ذكي وحادّ، كلامه سريع ودقيق كمن يقرأ خطة. نبرة متوسطة صافية. لكنة جزائرية شرقية. | **Natural**. نبرة جادّة ومركّزة. |
| **عباس لغرور** | ~28 (مواليد 1926) | قائد الفوج | رجولي، خشن قليلاً، عملي ومباشر، قائد ميداني. يهمس في التسلّل ويصرخ في الاشتباك. لكنة خنشلية/شاوية. | **Creative** للجمل الميدانية (همس وصراخ)، و**Natural** للمشاهد الحوارية. |
| **عاجل عجول** | ~32 (مواليد 1922) | عارف المسالك | صوت أخشن وأكثر ريفية، حذر ومتيقّظ دائماً، يعرف الأرض. لكنة شاوية واضحة. | **Creative** (فيه همس وصراخ إنذار). |
| **مصطفى بوستة** | ~30–35 (غير موثّق، اقتراح) | المتفجّرات والإسناد | هادئ بشكل مقلق، تقني، قليل الكلام، جمل قصيرة. نبرة منخفضة. | **Robust** (ثبات وبرود). |
| **مرود العزوي** | ~30–40 (غير موثّق، اقتراح) | رجل الاتصال · الرامي | غامض، صوت منخفض فيه حدّة، يختبر الناس. هادئ جداً كقنّاص. لكنة جزائرية ريفية. | **Natural**، مع همس في الميدان. |
| **أنت (الفصل الثاني)** | ~20–25 | مجاهد شاب في فوج الثكنة | شاب، جادّ، فيه حماس مكبوت واحترام للقادة. يفضَّل أن يكون الصوت نفسه في الفصول الثلاثة. | **Natural**. |
| **صالح (المستوى الثاني)** | ~20–25 | اللاعب | الصوت نفسه للاعب، لكن متعَب ومنقطع النفَس من حمل الجريح. | **Creative**. |
| **عمّار** | ~40–45 (رعى الغنم عشرين سنة) | مجاهد · راعٍ من الجبل | صوت جبلي خشن ودافئ، صبور، فيه حكمة. يهمس في الوادي ويلهث على الحافة. لكنة شاوية واضحة. (الشخصية نفسها في الفصل الأول عند العين: الصوت نفسه.) | **Creative** للنداءات الميدانية، و**Natural** للحوار. |
| **لخضر** | ~20 | مجاهد جريح | شاب ضعيف ومُنهَك ومحموم، صوت مكسور، أنفاس قصيرة. يجب أن يُسمع الألم والبرد. | **Creative** (أداء عاطفي قوي). |
| **زهرة** | ~25–30 | مناضلة في الشبكة (الفصل الأول) | امرأة شابة، صوت منخفض حازم، تهمس لأنها في الدوار ليلاً. قلقة لكن متماسكة. لكنة جزائرية. | **Natural**، مع `[whispers]` في أغلب الجمل. |
| **الراوي** | — | التمهيد والخاتمة | صوت رجولي ناضج (45–60)، رخيم وحزين ووقور، أسلوب وثائقي تاريخي. عربية فصحى بنطق جزائري نظيف. | **Robust**. أبطأ قليلاً، ووقفات طويلة. |
| **جندي فرنسي (Soldat A/B)** | 19–22 | مجنّدون في الخدمة الإلزامية | فرنسية متروبوليتانية شعبية؛ أحدهما بلكنة جنوبية (ميدي/مرسيليا) والآخر باريسي. ملل وبرد ثم ذعر. | **Creative**. |
| **جندي «بييه نوار»** | 25–30 | جندي من مستوطني الجزائر | فرنسية بلكنة «بييه نوار» (سريعة، مشدّدة، فيها نبرة متوسطية). أكثر توتّراً لأنه يعرف البلد. | **Creative**. |
| **الرقيب (Sergent)** | 30–40 | قائد الحرس | خشن، آمر، صوت عالٍ، لكنة متروبوليتانية. | **Robust** للأوامر، و**Creative** للصراخ. |
| **الملازم (Lieutenant)** | 25–30 | ضابط الثكنة | فرنسية متعلّمة ودقيقة (خرّيج سان سير)، بارد ثم متوتّر. | **Natural**. |
| **الدركي / الماريشال دي لوجي** | 35–45 | دورية الدرك والكلب (الجبل والدشرة) | دركي ريفي متعب، بطيء، لكنة من جنوب فرنسا. | **Natural**. |
| **سائس الكلب (maître-chien)** | 25–35 | دورية الجبل | أوامر قصيرة حادّة للكلب، يلهث من الصعود. | **Creative**. |

---

## 3. الشخصيات — الجمل الموجودة في اللعبة

### 3.1 مصطفى بن بولعيد — `ch2` (‏`PROLOGUE`، بيت بن شايبة)

`ch2_benboulaid_01` (PROLOGUE[0]) — [solemn] [slowly] يا إخوة… [pause] سنوات ونحن نعمل في الظل. [resolute] الليلة، عند منتصف الليل، تتكلّم الجزائر كلّها بصوت واحد.
*Brothers… for years we have worked in the shadows. Tonight, at midnight, all of Algeria speaks with one voice.*

`ch2_benboulaid_02` (PROLOGUE[2]) — [calm] [authoritative] خنشلة الليلة لعباس ورجاله: أفواجٌ للدرك، وللشرطة، وللمحوّل الكهربائي. [warmly] وأنت يا ولدي، مع عباس وعاجل: الثكنة العسكرية. [serious] نحتاج منها ثلاثة أشياء.
*Tonight Khenchela belongs to Abbas and his men: squads for the gendarmerie, the police, the power transformer. And you, my son — with Abbas and Adjel: the army barracks. We need three things from it.*

`ch2_benboulaid_03` (PROLOGUE[3]) — [deliberate] خرائطهم من مبنى القيادة — كل مركز وكل دورية في الأوراس. وسلاحهم من المخزن. [pause] ومركباتهم… [dry] لا نريدها أن تلحق بنا.
*Their maps from the HQ — every post, every patrol in the Aurès. Their rifles from the armory. And their vehicles… we don't want them following us.*

`ch2_benboulaid_04` (PROLOGUE[8]) — [serious] [low voice] ومن لا يعرف كلمة السرّ ليس منّا. احفظوها جيداً…
*And whoever doesn't know the password is not one of us. Remember it well…*

`ch2_benboulaid_05` (PROLOGUE[9]) — [whispers] [solemn] «خالد عقبة».
*"Khaled Okba."*

`ch2_benboulaid_06` (PROLOGUE[11]) — [firm] ولا طلقة قبل الموعد. [serious] إن انكشف فوجٌ واحد قبل منتصف الليل، انكشف الأوراس كلّه. [pause] [warmly] توكّلوا على الله.
*And not one shot before the hour. If one squad is exposed before midnight, the whole Aurès is exposed. Go, with God.*

---

### 3.2 شيحاني بشير — `ch2`

`ch2_chihani_01` (PROLOGUE[1]) — [calm] [matter-of-fact] السلاح وُزّع على الأفواج. كل فوج يعرف هدفه، ولا يعرف أهداف غيره. [pause] هكذا يحمي بعضنا بعضاً.
*The weapons are with the squads. Each squad knows its target and no one else's. That is how we protect each other.*

`ch2_chihani_02` (PROLOGUE[7]) — [focused] لكن لا خطة بلا عيون. مرود العزوي ينتظركم في مقبرة سيدي عبد الله جنوب الدشرة ومعه منظار. [briskly] انزلوا الوادي، اصعدوا كاف الغراب فوق الثكنة، وعدّوا حرّاسهم قبل أن تأتوني.
*But no plan without eyes. Mroud Al-Azawi waits at Sidi Abdallah cemetery south of the dachra, with binoculars. Go down the oued, climb Crow's Kef above the barracks, and count their guards before you come to me.*

`ch2_chihani_03` ⚙️ (chihaniLines — tagged ≥ 75%) — [impressed] [quietly] عددتم {tagged} من {total}؟ هذا عمل رجال يعرفون الحرب. كلّهم على الخريطة.
*You counted {tagged} of {total}? That's the work of men who know war. They're all on the map.*

`ch2_chihani_04` ⚙️ (chihaniLines — tagged < 75%) — [thoughtful] {tagged} من {total}… [pause] يكفي لنبدأ، [warning] لكن انتبهوا لمن لم تروه.
*{tagged} of {total}… enough to start, but watch for the ones you didn't see.*

> ⚙️ `{tagged}` و`{total}` متغيّران (`tagged` من 5 فما فوق، و`total` عدد جنود الثكنة). الحل الأبسط: ولّد نسخة لكل قيمة تتوقّعها (مثلاً `ch2_chihani_03_t05_of30`). البديل: قسّم الجملة إلى ملفات (الرقم وحده، ثم «من»، ثم الرقم، ثم بقية الجملة) وركّبها في الكود.

`ch2_chihani_05` (chihaniLines — tries > 1) — [cold] [disapproving] والعزوي يقول إنك تلعثمت في كلمة السرّ. [pause] بوستة لن يكمن وحده في الوادي ليغطّي رجلاً يتلعثم.
*And Azawi says you stumbled on the password. Boucetta won't lie alone in the oued to cover a man who stumbles.*

`ch2_chihani_06` (chihaniLines — order) — [firm] [measured] الترتيب لا يتغيّر: القيادة أولاً — الخرائط والمفتاح. ثم المخزن. ثم المركبات. [pause] ثم الجبل.
*The order doesn't change: the HQ first — maps and key. Then the armory. Then the vehicles. Then the mountain.*

`ch2_chihani_07` (chihaniLines — afterwards) — [serious] وبعدها لا تعودوا إلى هنا: مسلك الثكنة الغربي ينزل إلى نقطة التفرّق، ثلاثمئة متر جنوباً. [softer] من هناك كلٌّ إلى جبله.
*And afterwards don't come back here: the barracks' west track runs down to the dispersal point, three hundred metres south. From there, each man to his mountain.*

`ch2_chihani_08` (chihaniLines — choose) — [calm] [inviting] اختر المدخل، وما يفعله بوستة ليفتح لكم الطريق.
*Choose the way in, and what Boucetta does to open the road.*

---

### 3.3 عباس لغرور — `ch2` + `mt`

**مشهد البيت (`ch2`)**

`ch2_laghrour_01` (PROLOGUE[4]) — [practical] [confident] الثكنة على بعد أكثر من ستمئة متر من هنا، غرب المدينة. فيها أكثر من ثلاثين عسكرياً وبرجان بكشّافات. [slight smile] لن ندخلها بالقوة يا سي مصطفى… بل بالعقل.
*The barracks is more than six hundred metres from here, west of the town. Thirty-odd soldiers, two towers with searchlights. We won't get in by force, Si Mostefa… but by wits.*

`ch2_laghrour_02` (AZAWI_OK[3]) — [quietly] [resolute] الفوج اكتمل. أربعة رجال وكلمة واحدة.
*The squad is complete. Four men and one word.*

**نداءات الميدان (`level.ts` → `bark("laghrour", key)`)**

`ch2_laghrour_bark_join` (join) — [whispers] نحن خلفك. انحنِ نَنحنِ، توقّف نتوقّف. البوشكارة عند المقهى — خذ الزقاق الخلفي.
*We're behind you. Crouch and we crouch. The informer's at the café — take the back lane.*

`ch2_laghrour_bark_town` (town) — [whispers] [wistful] انظر شرقاً… أضواء خنشلة. الإخوة هناك ينتظرون منتصف الليل مثلنا: الدرك، الشرطة، المحوّل.
*Look east… the lights of Khenchela. The brothers there wait for midnight like us: the gendarmerie, the police, the transformer.*

`ch2_laghrour_bark_recon` (recon) — [whispers] [satisfied] يكفي. نعرف أين يقفون. شيحاني ينتظرنا في المعصرة.
*Enough. We know where they stand. Chihani is waiting at the mill.*

`ch2_laghrour_bark_approach` (approach) — [whispers] [tense] مئتا متر حتى السياج. الحصى قرب الطريق يفضحنا — نمشي في الوادي، منحنين.
*Two hundred metres to the wire. The gravel by the road gives us away — we walk the oued, crouched.*

`ch2_laghrour_bark_inside` (inside) — [whispers] [focused] القيادة أمامنا. الحارس لا يترك الباب — في الجدار الخلفي ثغرة، ازحف عبرها.
*The HQ is ahead. The sentry never leaves the door — there's a breach in the back wall, crawl through.*

`ch2_laghrour_bark_records` (records) — [whispers] [grim satisfaction] أسماء البوشكارة… سيعرف كل دوّار من باعه.
*The informers' names… every village will know who sold it.*

`ch2_laghrour_bark_sabotage` (sabotage) — [whispers] [urgent] السلاح معنا. الآن المركبات — ثلاث عبوات، ولا يلحق بنا أحد.
*We have the guns. Now the vehicles — three charges, and nobody follows us.*

`ch2_laghrour_bark_armed` ⚙️ (armed — CHARGE_TIMER = 60) — [urgent] [loud whisper] الصواعق تعمل — 60 ثانية. [urgent] إلى الجبل!
*Timers running — 60 seconds. To the mountains!*
> عند التوليد اكتب «ستّين ثانية» بالحروف. إن تغيّرت قيمة `CHARGE_TIMER` في `map.ts` يجب إعادة التوليد.

`ch2_laghrour_bark_boom` (boom) — [shouting] [triumphant] الله أكبر! [breathing heavily] [emotional] في كل الأوراس الآن… الثورة بدأت.
*Allahu akbar! All over the Aurès, right now… the revolution has begun.*

`ch2_laghrour_bark_nearrally` (nearrally) — [out of breath] [relieved] نقطة التفرّق أمامنا. من هناك كل رجل إلى جبله.
*The dispersal point is ahead. From there every man to his mountain.*

**مشهد الجسر (`mt` → `BRIDGE`)**

`mt_laghrour_01` (BRIDGE[0]) — [tired] [low voice] هنا نفترق. عجول والعزوي معي إلى جبل شيليا. [pause] أما أنت…
*This is where we split. Adjoul and Azawi come with me to Djebel Chélia. As for you…*

`mt_laghrour_02` (BRIDGE[1]) — [heavy] [sad] هذا لخضر، من فوج الدرك. أصابته رصاصة عند السور، ونزف طوال الطريق. [pause] لا يقدر على المشي.
*This is Lakhdar, from the gendarmerie squad. A bullet found him at the wall, and he bled the whole way here. He can't walk.*

`mt_laghrour_03` (BRIDGE[3]) — [firm] [urgent] احمله أنت يا صالح، وعمّار يدلّك. [serious] الدرك سيصعدون بالكلاب عند الفجر.
*You carry him, Salah, and Ammar shows the way. The gendarmes will come up with dogs at first light.*

`mt_laghrour_04` (BRIDGE[6]) — [serious] [low voice] الطلقة الواحدة الآن تجلب عليكم الجبل كلّه. اقتصدوا في كل شيء. [pause] [warmly] الله معكم.
*One shot now brings the whole mountain down on you. Spare everything. God be with you.*

---

### 3.4 عاجل عجول — `ch2`

`ch2_adjoul_01` (PROLOGUE[5]) — [wary] [low voice] والدشرة مليئة بعيون الحاكم. البوشكارة عند المقهى لا ينام، ودورية درك تمشي مسلك خنشلة حتى الفجر. [decisive] نخرج من الخلف وننزل في الوادي.
*And the dachra is full of the administrator's eyes. The informer at the café never sleeps; a gendarme patrol walks the Khenchela track till dawn. We leave by the back and go down into the oued.*

`ch2_adjoul_bark_leave` (leave) — [whispers] المقبرة جنوباً على طرف الوادي، مئة وخمسون متراً. دورية الدرك تمشي في المسلك شرقاً — لا نقترب منها.
*The cemetery is 150 m south, on the edge of the oued. The gendarme patrol walks the track to the east — keep clear of it.*

`ch2_adjoul_bark_millnear` (millnear) — [whispers] [relieved] المعصرة على ضفّة الوادي. بوستة سبقنا بالعبوات.
*The mill is on the bank of the oued. Boucetta got there ahead of us with the charges.*

`ch2_adjoul_bark_restrict` (restrict{si}) — [harsh whisper] [angry] ليس الآن! بلا خطة سنموت عند السياج — ونكشف الأوراس كلّه.
*Not now! Without a plan we die at the wire — and expose the whole Aurès.*

`ch2_adjoul_bark_darktown` (darktown) — [excited whisper] [awed] انطفأت خنشلة! الإخوة ضربوا المحوّل.
*Khenchela has gone dark! The brothers hit the transformer.*

`ch2_adjoul_bark_alarm` (alarm) — [shouting] [urgent] انكشفنا! غطّوا بعضكم، ولا تتوقّفوا!
*We're blown! Cover each other, keep moving!*

---

### 3.5 مصطفى بوستة — `ch2`

`ch2_boucetta_01` (PROLOGUE[6]) — [calm] [low voice] سأسبقكم بالعبوات إلى معصرة الزيتون على ضفّة الوادي — بعيدة عن أعينهم، قريبة من هدفكم. ثلاث عبوات بصواعق مؤقّتة. شيحاني سيضع معكم الخطة هناك.
*I'll go ahead with the charges to the olive mill on the oued bank — out of their sight, close to your target. Three charges on timers. Chihani will make the plan with you there.*

`ch2_boucetta_02` (chihaniLines[0]) — [quietly] [calm] وصلتم. العبوات جاهزة، والصواعق جافّة.
*You made it. The charges are ready, the detonators dry.*

`ch2_boucetta_03` (chihaniLines — sixty seconds) — [flat] [serious] ستون ثانية بعد آخر صاعق. [pause] لا تكونوا قربها.
*Sixty seconds after the last timer. Don't be near them.*

`ch2_boucetta_bark_gatefire` (level.ts — onBark("boucetta") عند إشارة الهجوم على الباب) — [urgent whisper] النار مشتعلة عند الطريق. حرّاس الباب يتحرّكون — [urgent] الآن!
*The fire's lit by the road. The gate guards are moving — now!*

---

### 3.6 مرود العزوي — `ch2`

`ch2_azawi_01` (AZAWI_Q) — [low voice] [menacing] قف مكانك. [pause] الليل طويل على من لا يعرف الطريق… [suspicious] ما الكلمة؟
*Stay where you are. The night is long for those who don't know the way… The word?*

`ch2_azawi_02` (AZAWI_WRONG) — [cold] [suspicious] …ليست هذه. رجلٌ يخطئ الكلمة الليلة قد يكون جاسوساً. [pause] فكّر، ثم تكلّم.
*…That's not it. A man who gets the word wrong tonight might be a spy. Think, then speak.*

`ch2_azawi_03` (AZAWI_OK[0]) — [relaxing] [warmly] مرحباً بالرجال. أنا مرود العزوي — أمشي معكم من هنا إلى الجبل.
*Welcome, men. I'm Mroud Al-Azawi — I walk with you from here to the mountain.*

`ch2_azawi_04` (AZAWI_OK[1]) — [whispers] [instructive] خذ منظاري. اتبع الوادي جنوباً أربعمئة متر حتى كاف الغراب؛ من قمّته تُرى الثكنة كلّها. علّم خمسةً من حرّاسهم على الأقل، فشيحاني لن يضع خطة على العمى.
*Take my binoculars. Follow the oued south four hundred metres to Crow's Kef; from its top you see the whole barracks. Mark at least five of their guards — Chihani won't plan blind.*

`ch2_azawi_05` (AZAWI_OK[2]) — [whispers] [conspiratorial] وشيء آخر: مفتاح المخزن في خزنة القائد، داخل مبنى القيادة. الحارس لا يبرح الباب، لكن في الجدار الخلفي ثغرة.
*One more thing: the armory key is in the commander's safe, inside the HQ. The sentry never leaves the door — but there's a breach in the back wall.*

`ch2_azawi_bark_keffoot` (keffoot) — [whispers] اصعد إلى القمة وانبطح. كشّافاتهم لا تبلغ هنا، لكن المنظار يبلغهم.
*Climb to the top and lie flat. Their searchlights don't reach here — but the binoculars reach them.*

`ch2_azawi_bark_recon3` ⚙️ (recon3 — `{tagged}` ≥ 3) — [whispers] [approving] {tagged}… واصل. الحرّاس عند الباب والأبراج أولاً.
*{tagged}… keep going. The gate and the towers first.*
> ⚙️ ولّد الرقم في ملف منفصل (ثلاثة، أربعة، خمسة…) أو نسخة كاملة لكل رقم (`ch2_azawi_bark_recon3_n03` …).

`ch2_azawi_bark_hqin` (hqin) — [whispers] [tense] مكتب القائد غرباً. انتبه للحاجب في الممرّ.
*The commander's office is west. Watch the clerk in the corridor.*

`ch2_azawi_bark_maps` (maps) — [whispers] [awed] مواقعهم كلّها… المراكز، الدوريات، مستودعات الوقود. [emotional] بن بولعيد ينتظر هذه منذ سنة.
*Every post they have… patrols, fuel depots. Ben Boulaïd has waited a year for this.*

---

### 3.7 الفوج — جمل مشتركة لأي رفيق (`ch2`)

هذه الجمل تُقال بلسان الرفيق الذي ينفّذ الأمر (`m.id` = laghrour أو adjoul أو azawi). **ولّد كل جملة بأصوات الثلاثة**، مع لاحقة: `_laghrour` / `_adjoul` / `_azawi`.

`ch2_squad_take` (level.ts → orderStrike: «سأتكفّل به.») — [whispers] [determined] سأتكفّل به.
*I'll take him.*

`ch2_squad_done` (level.ts → onStrike: «تمّ. بلا صوت.») — [whispers] [breathing heavily] تمّ. بلا صوت.
*Done. Not a sound.*

`ch2_squad_abort` (squad.ts → «أُلغيت — لقد انتبه!») — [urgent whisper] [alarmed] أُلغيت — لقد انتبه!
*Aborted — he's alert!*

---

### 3.8 أنت — اللاعب في الفصل الثاني (`ch2`)

`ch2_you_01` (PROLOGUE[10]) — [quietly] [resolute] خالد عقبة. [respectful] سنعود بالسلاح يا سي مصطفى.
*Khaled Okba. We'll come back with the rifles, Si Mostefa.*

**الإجابات على سؤال العزوي (`PASSWORDS`)**: يختارها اللاعب، وكلّها تقال همساً.

`ch2_you_pw_a` (PASSWORDS id "a" — خطأ) — [whispers] [uncertain] الأوراس حرّة
*The Aurès is free*

`ch2_you_pw_b` (PASSWORDS id "b" — صحيح) — [whispers] [steady] خالد عقبة
*Khaled Okba*

`ch2_you_pw_c` (PASSWORDS id "c" — خطأ) — [whispers] [hesitant] أرسلني بن بولعيد
*Ben Boulaïd sent me*

---

### 3.9 صالح — اللاعب في الجبل (`mt`)

`mt_salah_01` (BRIDGE[5]) — [firm] [out of breath] لا أحد يبقى هنا. [effort] قم، خذ بكتفي.
*Nobody stays here. Up — take my shoulder.*

---

### 3.10 عمّار — `mt` + `ch1`

**مشهد الجسر (`mt`)**

`mt_ammar_01` (BRIDGE[2]) — [calm] [warm] [gravelly] أنا عمّار. رعيتُ الغنم في هذه الجبال عشرين سنة. فوق السفح ملجأ رعاة، وفيه حطب.
*I'm Ammar. I grazed sheep on these mountains for twenty years. There's a shepherds' shelter up the slope, with firewood.*

**عند المفترق (`FORK_LINES` / `AFTER_CHOICE`)**

`mt_ammar_02` (FORK_LINES[0]) — [out of breath] [low voice] من هنا يتفرّق الطريق. انظر: الملجأ هناك، فوق، تحت الصخرة.
*The path splits here. Look: the shelter, up there, under the rock.*

`mt_ammar_03` (FORK_LINES[1]) — [thoughtful] شرقاً الوادي: أقصر، فيه ماء وشجيرات… [worried] لكن الدرك يمشون على ضفّته، ومعهم كلب.
*East, the valley: shorter, water and brush… but the gendarmes walk its bank, and they have a dog.*

`mt_ammar_04` (FORK_LINES[2]) — [grim] غرباً الحافة: أطول وأعلى، والريح هناك تقطع العظم. [dry humor] لا أحد يحرسها — البرد يكفيهم.
*West, the ridge: longer and higher, and the wind up there cuts to the bone. Nobody guards it — the cold does it for them.*

`mt_ammar_05` (AFTER_CHOICE.valley) — [whispers] [decisive] الوادي إذن. امشِ منحنياً بين الشجيرات، وإن سمعت الكلب فادخل الماء.
*The valley, then. Walk low through the brush, and if you hear the dog, get into the water.*

`mt_ammar_06` (AFTER_CHOICE.ridge) — [decisive] [caring] الحافة. شُدّ عليه الكسوة، ولا تقف طويلاً في الريح.
*The ridge. Pull the cloak tight around him, and don't stand long in the wind.*

**موت لخضر (`LOSS`)**

`mt_ammar_07` (LOSS[2] — النص «…») — [long, heavy sigh]
*…*
> جملة صامتة في الكود. ولّد تنهيدة فقط (v3 قد يحتاج حرفاً واحداً؛ إن رفض فاستعمل تنهيدة من مكتبة مؤثرات أو اترك الجملة بلا صوت).

`mt_ammar_08` (LOSS[3]) — [softly] [voice breaking] حملتَه طوال الطريق يا صالح. [pause] لم يمت وحده في الثلج. [sighs] هذا ما كان بأيدينا.
*You carried him the whole way, Salah. He didn't die alone in the snow. That much was in our hands.*

**نداءات الميدان (`BARKS` + `level.ts`)**

`mt_ammar_bark_start` (level.ts bark "start") — [whispers] احمله. البلدة نائمة… [wary] لكن ليس كلّها.
*Pick him up. The town is asleep… not all of it.*
> في الكود: «احمله (امسك E). البلدة نائمة… لكن ليس كلّها.» — حُذف «(امسك E)» من الصوت لأنه تلميح واجهة، وبقيت الكلمات الأخرى كما هي.

`mt_ammar_bark_needCarry` (BARKS.needCarry) — [firm] [whispers] لن نتركه هنا. احمله.
*We're not leaving him here. Carry him.*

`mt_ammar_bark_leftBehind` (BARKS.leftBehind) — [urgent] [loud whisper] صالح! لخضر خلفنا — لا نكمل بدونه.
*Salah! Lakhdar is behind us — we don't go on without him.*

`mt_ammar_bark_putDownRock` (BARKS.putDownRock) — [out of breath] ضعه هنا، واصعد الصخرة. من فوق ترى كل شيء.
*Set him down here and climb the rock. From up there you see everything.*

`mt_ammar_bark_chooseFirst` (BARKS.chooseFirst) — [urgent] انتظر — اصعد الصخرة أولاً، ثم نقرّر.
*Wait — climb the rock first, then we decide.*

`mt_ammar_bark_wrongRoute` (BARKS.wrongRoute) — [impatient] [firm] اخترنا الطريق الآخر. لا وقت للتردّد.
*We chose the other way. No time to waver.*

`mt_ammar_bark_cache` (BARKS.cache) — [whispers] [hopeful] هنا خبّأ الرعاة شيئاً — تحت الحجر.
*The shepherds hid something here — under the stone.*

`mt_ammar_bark_dog` (BARKS.dog) — [urgent whisper] [alarmed] الكلب! ادخل الماء، بسرعة.
*The dog! Into the water, quick.*

`mt_ammar_bark_cold` (BARKS.cold) — [shivering] [worried] البرد يأكله… لا تقف.
*The cold is eating him… don't stop.*

`mt_ammar_bark_edge` (BARKS.edge) — [sharp] [urgent] ليس من هنا — الجرف.
*Not that way — the drop.*

`mt_ammar_bark_gunshot` (BARKS.gunshot) — [tense] [whispers] الطلقة سُمعت في البلدة… سيصعدون.
*They heard that shot in the town… they'll come up.*

`mt_ammar_bark_reinforcements` (BARKS.reinforcements — مفتاح bark "reinf") — [alarmed] [urgent] رجال آخرون يصعدون من البلدة!
*More men coming up from the town!*

`mt_ammar_bark_valleyDone` (BARKS.valleyDone) — [exhaling] [relieved] خرجنا من الوادي. لم يرنا أحد… [uncertain] أظنّ.
*We're out of the valley. Nobody saw us… I think.*

`mt_ammar_bark_ridgeDone` (BARKS.ridgeDone) — [exhausted] [shivering] انتهت الحافة. يداي لا أشعر بهما.
*The ridge is behind us. I can't feel my hands.*

`mt_ammar_bark_shelterNear` (BARKS.shelterNear) — [relieved] [out of breath] الملجأ. ضعه قرب النار.
*The shelter. Lay him by the fire.*

**الفصل الأول — عند العين (`ch1`، `pages/LastNight.tsx` → `ammarLines`)**

`ch1_ammar_01` (ammarLines[0]) — [whispers] [relieved] وصلت أخيراً. [urgent] الرسالة؟
*You made it. The message?*

`ch1_ammar_02` (ammarLines[2] — observed) — [whispers] [satisfied] هذا ما نحتاجه. سنتحرّك قبل الفجر.
*That's what we need. We move before dawn.*

`ch1_ammar_03` (ammarLines[2] — not observed) — [whispers] [uneasy] معلومة لم يتحقّق منها أحد… [sighs] سنتحرّك على عجل، ونرجو ألا نخطئ.
*Unverified… We'll move in haste, and hope we're not wrong.*

---

### 3.11 لخضر — `mt`

`mt_lakhdar_01` (BRIDGE[4]) — [weak] [pained] اتركوني… [gasping] سأبطئكم.
*Leave me… I'll slow you down.*

`mt_lakhdar_02` (FORK_LINES[3]) — [faint] [feverish] …الماء يمحو الأثر عن الكلب. [weak smile] هكذا كان أبي يقول.
*…Water wipes the trail from the dog. That's what my father used to say.*

`mt_lakhdar_bark_lakhdarWeak` (BARKS.lakhdarWeak) — [barely audible] [confused] …صالح؟ أين نحن؟
*…Salah? Where are we?*

**همهمات أثناء الحمل (`level.ts` → قائمة `lines` العشوائية، كل 70–110 ثانية)**

`mt_lakhdar_carry_01` (lines[0]) — [weak] [breathing heavily] …ما زال بعيداً؟
*…Is it still far?*

`mt_lakhdar_carry_02` (lines[1]) — [feverish] [whispers] أسمع الماء… أم هو الدم في أذني؟
*I hear water… or is that the blood in my ears?*

`mt_lakhdar_carry_03` (lines[2]) — [pained] [pleading] اتركني يا صالح… أنقذ نفسك.
*Leave me, Salah… save yourself.*

`mt_lakhdar_carry_04` (lines[3]) — [softly] [nostalgic] أمّي كانت تقول إن الجبل لا يخون أهله.
*My mother used to say the mountain doesn't betray its own.*

**عند النار (`LOSS`)**

`mt_lakhdar_03` (LOSS[0]) — [barely audible] [peaceful] النار… [faint] دافئة.
*The fire… it's warm.*

`mt_lakhdar_04` (LOSS[1]) — [dying] [whispers] [voice breaking] قولوا لأمّي في تاوزيانت… [gasping] إنّي ما هربت.
*Tell my mother in Taouzianat… that I didn't run.*

---

### 3.12 زهرة — `ch1` (`pages/LastNight.tsx`)

`ch1_zahra_01` (ZAHRA_INTRO[0]) — [whispers] [relieved] [scolding] تأخّرت. ظننتُ أن الدرك أمسكوا بك.
*You're late. I thought the gendarmes had you.*

`ch1_zahra_02` (ZAHRA_INTRO[2]) — [whispers] جاهزة. [serious] لكن اسمع: الدورية غيّرت طريقها الليلة. الشبكة تقول إنها تقف عند القنطرة ثم تعود… [uncertain] لستُ متأكدة.
*It is. But listen: the patrol changed its route tonight. The network says it stops at the culvert, then turns back… I'm not sure.*

`ch1_zahra_03` (ZAHRA_AFTER.promise[0]) — [whispers] [approving] إذن خذ الممرّ خلف الجدار الغربي، فتحتُه لك. لا يعرفه الدرك.
*Then take the passage behind the west wall, I've opened it for you. The gendarmes don't know it.*

`ch1_zahra_04` (ZAHRA_AFTER.promise[1]) — [whispers] راقبهم من الصخرة الشرقية، ثم اذهب إلى عمّار عند العين.
*Watch them from the Eastern Rock, then go to Ammar at the spring.*

`ch1_zahra_05` (ZAHRA_AFTER.rush[0]) — [whispers] [disappointed] كما تشاء… [worried] الرسالة لعمّار عند العين. لا تَمُت من أجلها.
*As you wish… The message is for Ammar at the spring. Don't die for it.*

---

### 3.13 أنت — اللاعب في الفصل الأول (`ch1`)

`ch1_you_01` (ZAHRA_INTRO[1]) — [whispers] [tense] المسلك مراقَب. هل الرسالة جاهزة؟
*The path is watched. Is the message ready?*

`ch1_you_02` (choose → promise) — [whispers] [sincere] أعدكِ أن أتحقّق بعينيّ أولاً.
*I promise to see it with my own eyes first.*

`ch1_you_03` (choose → rush) — [whispers] [impatient] لا وقت. أثق بالشبكة.
*No time. I trust the network.*

`ch1_you_04` (ammarLines[1] — observed) — [whispers] [confident] هذه هي. ورأيتُ الدورية بعينيّ: تقف عند القنطرة ثم تعود إلى المفترق.
*Here. And I saw the patrol with my own eyes: it stops at the culvert, then returns to the crossroads.*

`ch1_you_05` (ammarLines[1] — not observed) — [whispers] [slightly unsure] هذه هي. الشبكة تقول إن الدورية تقف عند القنطرة.
*Here. The network says the patrol stops at the culvert.*

---

### 3.14 الراوي

**الفصل الثاني — التمهيد (`ch2`، `INTRO`)**

`ch2_narrator_01` (INTRO[0]) — [solemn] [slowly] ليلة 31 أكتوبر 1954. [pause] جبال الأوراس.
*The night of 31 October 1954. The Aurès mountains.*
> اكتب التاريخ بالحروف عند التوليد: «ليلة الحادي والثلاثين من أكتوبر، ألفٍ وتسعمئةٍ وأربعةٍ وخمسين».

`ch2_narrator_02` (INTRO[1]) — [reflective] سنواتٌ من العمل السرّي، من الاجتماعات في البيوت المعتمة، ومن السلاح المخبّأ تحت التبن… [pause] [resolute] كلّها تنتهي الليلة.
*Years of clandestine work — meetings in dark houses, rifles hidden under the straw — all of it ends tonight.*

`ch2_narrator_03` (INTRO[2]) — [documentary tone] في دشرة أولاد موسى، في بيت عائلة بن شايبة، يجمع مصطفى بن بولعيد رفاقه: شيحاني بشير، عباس لغرور، عاجل عجول، مصطفى بوستة… [pause] وعشرات غيرهم.
*In Dachra Ouled Moussa, in the house of the Ben Chaïba family, Mostefa Ben Boulaïd gathers his comrades: Chihani Bachir, Abbas Laghrour, Adjel Adjoul, Mostefa Boucetta… and dozens more.*

`ch2_narrator_04` (INTRO[3]) — [measured] تُوزَّع المهام، ويُوزَّع السلاح، [pause] وتُعطى كلمة السرّ.
*The tasks are handed out, the weapons are handed out, and the password is given.*

`ch2_narrator_05` (INTRO[4]) — [building intensity] وعند منتصف الليل، ستشتعل الأوراس كلّها في وقت واحد.
*At midnight, the whole Aurès will ignite at once.*

`ch2_narrator_06` (INTRO[5]) — [solemn] [quietly] لم يكن أحدٌ منهم يعلم كيف ستنتهي الطريق. [pause] لكنهم كانوا يعلمون أنها بدأت… [firm] ولا رجوع.
*None of them knew how the road would end. But they knew it had begun — and there was no turning back.*

**الفصل الثاني — الخاتمة (`OUTRO`)**

`ch2_narrator_07` (OUTRO) — [solemn] [proud] في تلك الليلة، من باتنة إلى خنشلة وآريس وتكوت وبسكرة، ضرب المجاهدون في الساعة نفسها. [pause] كانت تلك أولى شرارات حرب التحرير التي ستدوم أكثر من سبع سنوات، [emotional] وتنتهي باستقلال الجزائر في 5 جويلية 1962.
*That night, from Batna to Khenchela, Arris, T'kout and Biskra, the mujahideen struck at the same hour. It was one of the first sparks of a war of liberation that would last more than seven years and end with Algeria's independence on 5 July 1962.*
> اكتب «الخامس من جويلية، ألفٍ وتسعمئةٍ واثنين وستّين» بالحروف عند التوليد.

**الجبل — التمهيد (`mt`، `M_INTRO`)**

`mt_narrator_01` (M_INTRO[0]) — [solemn] الفاتح من نوفمبر 1954. [pause] بعد منتصف الليل.
*1 November 1954. After midnight.*

`mt_narrator_02` (M_INTRO[1]) — [intense] [measured] انفجرت مركبات الثكنة، وانطفأت خنشلة. [pause] وفي كل الأوراس دوّى الرصاص في الساعة نفسها.
*The barracks' vehicles burned, and Khenchela went dark. All over the Aurès, rifles spoke at the same hour.*

`mt_narrator_03` (M_INTRO[2]) — [ominous] [quietly] عند نقطة التفرّق، يتوزّع الرجال على الجبال قبل أن يطلع الفجر وتبدأ المطاردة.
*At the dispersal point the men scatter into the mountains before dawn, and before the hunt begins.*

**الجبل — الخاتمة (`NARRATOR`)**

`mt_narrator_04` (NARRATOR[0]) — [melancholic] [slowly] مرّت أيام باردة في الملجأ، حتى العاشر من نوفمبر.
*Cold days passed in the shelter, until the tenth of November.*

`mt_narrator_05` (NARRATOR[1]) — [documentary tone] [sober] وصلت الأخبار متباينة: في الأوراس دوّت عمليات باتنة وخنشلة وآريس وتكوت، وفي مناطق أخرى تعثّرت العمليات وبدأت الاعتقالات. [pause] [grave] وأرسلت باريس المظلّيين إلى الجبال.
*The news came mixed: in the Aurès the attacks of Batna, Khenchela, Arris and T'kout had struck; elsewhere operations faltered and the arrests began. Paris sent paratroopers into the mountains.*

`mt_narrator_06` (NARRATOR[2]) — [solemn] بدأت الثورة. [long pause] [quietly] أما كيف ستنجو… فلا أحد يعرف بعد.
*The revolution had begun. How it would survive… no one knew yet.*

---

## 4. الأعداء — بالفرنسية

### 4.1 «موجود في اللعبة»

**لا توجد حالياً أي جملة فرنسية منطوقة في الكود.** الجنود (`lib/barracks/soldiers.ts`) والدرك (`lib/night/guards.ts`) ودورية الجبل مع الكلب (`lib/mountain/pursuers.ts`) يعملون بلا حوار. الأصوات الموجودة مؤثرات مركّبة فقط: نباح الكلب (`bark()` في `lib/barracks/audio.ts` و`lib/night/audio.ts`) والصفّارة والطلقات. أما رسائل الإنذار مثل «الجنود يبحثون…» و«صفّارة الإنذار! الثكنة استيقظت» فهي إشعارات واجهة بالعربية، لا كلام جنود.

### 4.2 «جديد — مقترح للإضافة»

حوار للجيش الفرنسي والدرك سنة 1954. المصطلحات من تلك الفترة: الوثائق الرسمية سمّت المجاهدين «hors-la-loi» و«rebelles». السلاح المذكور: MAS-36 وMAT-49 وقنابل يدوية. تُذكر عطلة «Toussaint» (عيد جميع القدّيسين في 1 نوفمبر)، و«la quille» (نهاية الخدمة العسكرية بعامية المجنّدين)، ولعبة الورق «belote». تجنّبنا كل الشتائم العرقية والألقاب المهينة عمداً.

**الشخصيات:** `soldier` = جندي عادي في الثكنة · `pn` = جندي «بييه نوار» · `sgt` = الرقيب · `lt` = الملازم · `gend` = دركي · `handler` = سائس الكلب · `observer` = مراقب على التلّة · `radio` = عامل اللاسلكي.

#### أ) أحاديث الحرّاس في الملل — Soldat A / Soldat B
ولّد كل جملة في ملف مستقل بصوت المتكلّم. الحرف الأخير في الـID يحدّد المتكلّم (a أو b).

**المحادثة 1 — البرد**
`fr_idle_01_a` — [bored] [shivering] Putain de froid… On m'avait dit l'Algérie, le soleil, les oranges.
*يا له من برد… قالوا لي الجزائر، الشمس، البرتقال.*
`fr_idle_01_b` — [laughs softly] T'es dans les Aurès, mon vieux. Ici, l'hiver, ça gèle comme dans le Jura.
*أنت في الأوراس يا صاحبي. هنا في الشتاء يتجمّد كل شيء كما في جبال الجورا.*
`fr_idle_01_a2` — [grumbling] Passe-moi une Gauloise, au moins.
*أعطني سيجارة «غولواز» على الأقل.*

**المحادثة 2 — الورق**
`fr_idle_02_a` — [bored] Tu fais une belote après la relève ?
*نلعب «بيلوت» بعد تبديل الحراسة؟*
`fr_idle_02_b` — [amused] Avec toi ? Tu triches comme un arracheur de dents.
*معك أنت؟ تغشّ بلا حياء.*
`fr_idle_02_a2` — [laughs] C'est pas tricher, c'est du talent.
*ليس غشّاً، إنها موهبة.*

**المحادثة 3 — عطلة جميع القدّيسين**
`fr_idle_03_a` — [wistful] Demain c'est la Toussaint. Chez moi, ma mère va fleurir la tombe du grand-père.
*غداً عيد جميع القدّيسين. في بيتنا ستضع أمّي الزهور على قبر جدّي.*
`fr_idle_03_b` — [dry] Et nous, on fleurit les barbelés.
*ونحن نزيّن الأسلاك الشائكة.*
`fr_idle_03_a2` — [sighs] Le lieutenant a dit qu'il y aurait du vin au mess, au moins.
*قال الملازم إن هناك نبيذاً في المطعم على الأقل.*

**المحادثة 4 — رسائل من البلد**
`fr_idle_04_a` — [softly] J'ai reçu une lettre de Lucienne. Elle dit qu'elle m'attend.
*وصلتني رسالة من لوسيان. تقول إنها تنتظرني.*
`fr_idle_04_b` — [teasing] Elle dit ça à tout le régiment, ta Lucienne.
*لوسيان هذه تقول ذلك للفوج كلّه.*
`fr_idle_04_a2` — [annoyed] Ta gueule. Encore huit mois et c'est la quille.
*اسكت. ثمانية أشهر أخرى وتنتهي الخدمة.*

**المحادثة 5 — إشاعات من الأوراس (جندي «بييه نوار» ومجنّد)**
`fr_idle_05_a` — [low voice] [uneasy] (pn) Au marché, ils parlaient bizarrement aujourd'hui. Les commerçants ont fermé tôt.
*في السوق كانوا يتكلّمون بطريقة غريبة اليوم. التجّار أغلقوا باكراً.*
`fr_idle_05_b` — [dismissive] Tu vois des complots partout, toi.
*أنت ترى مؤامرة في كل مكان.*
`fr_idle_05_a2` — [serious] (pn) Je suis né ici. Quand les mechtas se taisent comme ça, c'est que quelque chose se prépare.
*أنا مولود هنا. حين تصمت المداشر هكذا، فهناك شيء يُحضَّر.*

**المحادثة 6 — الدورية**
`fr_idle_06_a` — [yawning] Il est quelle heure ?
*كم الساعة؟*
`fr_idle_06_b` — [bored] Bientôt minuit. Encore deux heures avant la relève.
*قريباً منتصف الليل. ساعتان أخريان قبل التبديل.*
`fr_idle_06_a2` — [mutters] Minuit… Il se passe jamais rien, ici.
*منتصف الليل… لا يحدث شيء هنا أبداً.*

**المحادثة 7 — الدركيون عند الدشرة (`ch1` / `ch2`)**
`fr_idle_07_a` — [tired] (gend) Encore une nuit à promener la lanterne pour rien.
*ليلة أخرى نتجوّل فيها بالفانوس بلا فائدة.*
`fr_idle_07_b` — [low voice] (gend) Le brigadier dit qu'on a signalé des types armés vers Foum Toub.
*يقول العريف إنهم أبلغوا عن رجال مسلّحين نحو فم الطوب.*
`fr_idle_07_a2` — [scoffs] Des bergers avec des fusils de chasse, oui.
*رعاة معهم بنادق صيد، لا أكثر.*

#### ب) الريبة / سماع صوت
`fr_soldier_suspicious_01` — [alert] [quietly] T'as entendu ?
*هل سمعت؟*
`fr_soldier_suspicious_02` — [calling out] [nervous] Qui va là ?
*من هناك؟*
`fr_soldier_suspicious_03` — [whispering] Chut… Là-bas, près du mur.
*اصمت… هناك، قرب الجدار.*
`fr_soldier_suspicious_04` — [uncertain] C'est un chien… ou autre chose ?
*هل هو كلب… أم شيء آخر؟*
`fr_soldier_suspicious_05` — [nervous] Y a quelqu'un ? Montrez-vous !
*هل من أحد؟ أظهِر نفسك!*
`fr_soldier_suspicious_06` — [tense] J'ai vu bouger quelque chose dans l'oued.
*رأيت شيئاً يتحرّك في الوادي.*
`fr_gend_suspicious_07` — [suspicious] (gend) Hé ! Le couvre-feu, ça vous dit rien ?
*هيه! ألم تسمع بحظر التجوال؟*
`fr_soldier_suspicious_08` — [nervous laugh] Arrête, tu me fous la trouille.
*توقّف، أنت تخيفني.*

#### ج) البحث والتفتيش
`fr_soldier_search_01` — [focused] Je vais voir. Couvre-moi.
*سأذهب لأرى. غطّني.*
`fr_soldier_search_02` — [calling] Passe-moi la lampe.
*أعطني المصباح.*
`fr_soldier_search_03` — [tense] [slowly] Doucement… Il est peut-être encore là.
*على مهل… ربما ما زال هنا.*
`fr_soldier_search_04` — [calling out] Fouillez derrière les camions !
*فتّشوا خلف الشاحنات!*
`fr_soldier_search_05` — [muttering] Des traces de pas… fraîches.
*آثار أقدام… حديثة.*
`fr_soldier_search_06` — [nervous] Toi, à gauche. Moi, je prends la droite.
*أنت إلى اليسار، وأنا آخذ اليمين.*

#### د) فقدان الهدف / التخلّي عن البحث
`fr_soldier_lost_01` — [relieved] [sighs] Rien. Un chacal, sûrement.
*لا شيء. ابن آوى على الأرجح.*
`fr_soldier_lost_02` — [annoyed] On perd notre temps. Retour au poste.
*نضيّع وقتنا. عودة إلى المركز.*
`fr_soldier_lost_03` — [uneasy] J'aurais juré avoir vu quelqu'un…
*كنت سأقسم أنني رأيت أحداً…*
`fr_soldier_lost_04` — [dismissive] C'est le vent. Rentre, tu vas geler.
*إنها الريح. ارجع وإلا تجمّدت.*
`fr_soldier_lost_05` — [grumbling] Bon. Mais je le note au rapport.
*حسناً. لكنني سأدوّنها في التقرير.*
`fr_soldier_lost_06` — [tense] Ouvre l'œil quand même. Cette nuit me plaît pas.
*ابقَ متيقّظاً مع ذلك. هذه الليلة لا تعجبني.*

#### هـ) رؤية اللاعب / إطلاق الإنذار
`fr_soldier_alert_01` — [shouting] Halte ! Qui vive ?
*قف! من هناك؟*
`fr_soldier_alert_02` — [shouting] [panicked] Alerte ! Alerte !
*إنذار! إنذار!*
`fr_soldier_alert_03` — [shouting] Aux armes ! Des hommes dans le camp !
*إلى السلاح! رجال داخل المعسكر!*
`fr_soldier_alert_04` — [shouting] Là ! Près de l'armurerie !
*هناك! قرب مخزن السلاح!*
`fr_soldier_alert_05` — [shouting] Sonnez la sirène !
*أطلقوا صفّارة الإنذار!*
`fr_soldier_alert_06` — [shouting] Les mains en l'air ! Plus un geste !
*ارفع يديك! لا حركة!*
`fr_soldier_alert_07` — [panicked] Ce sont les rebelles ! Ils sont là !
*إنهم المتمرّدون! إنهم هنا!*
`fr_gend_alert_08` — [shouting] (gend) Halte, gendarmerie ! Arrêtez-vous !
*قف، الدرك! توقّف!*

#### و) أثناء الاشتباك

**إطلاق النار**
`fr_soldier_combat_fire_01` — [shouting] Feu ! Feu à volonté !
*نار! أطلقوا بحرّية!*
`fr_soldier_combat_fire_02` — [shouting] Il tire de la tour ! Ripostez !
*يطلق من البرج! ردّوا!*
`fr_soldier_combat_fire_03` — [aggressive] Je l'ai vu, il est derrière le mur !
*رأيته، إنه خلف الجدار!*
`fr_soldier_combat_fire_04` — [shouting] Tirez sur la lueur des coups !
*أطلقوا على وميض الطلقات!*
`fr_soldier_combat_fire_05` — [shouting] Rafale ! Envoie la MAT !
*رشقة! أطلق الرشّاش (ماط)!*

**الاحتماء**
`fr_soldier_combat_cover_01` — [shouting] À couvert !
*احتموا!*
`fr_soldier_combat_cover_02` — [panicked] Couche-toi, bon sang !
*انبطح، يا إلهي!*
`fr_soldier_combat_cover_03` — [out of breath] Derrière le camion ! Vite !
*خلف الشاحنة! بسرعة!*
`fr_soldier_combat_cover_04` — [shouting] Restez pas à découvert !
*لا تبقوا مكشوفين!*

**إعادة التعبئة**
`fr_soldier_combat_reload_01` — [shouting] Je recharge !
*أعيد التعبئة!*
`fr_soldier_combat_reload_02` — [panicked] Chargeur ! Qui a un chargeur ?
*مخزن! من معه مخزن؟*
`fr_soldier_combat_reload_03` — [urgent] Couvre-moi, je suis vide !
*غطّني، نفدت ذخيرتي!*
`fr_soldier_combat_reload_04` — [frustrated] Enrayé ! Mon fusil est enrayé !
*تعطّلت! بندقيتي تعطّلت!*

**قنبلة يدوية**
`fr_soldier_combat_grenade_01` — [shouting] Grenade ! Planquez-vous !
*قنبلة! اختبئوا!*
`fr_soldier_combat_grenade_02` — [shouting] Attention, grenade !
*انتبهوا، قنبلة!*
`fr_soldier_combat_grenade_03` — [aggressive] Je balance une grenade !
*سأرمي قنبلة!*
`fr_soldier_combat_grenade_04` — [panicked] Elle est à mes pieds !
*إنها عند قدميّ!*

**سقوط جندي**
`fr_soldier_combat_mandown_01` — [shouting] Homme à terre !
*رجل سقط!*
`fr_soldier_combat_mandown_02` — [panicked] Dubois est touché !
*دوبوا أُصيب!*
`fr_soldier_combat_mandown_03` — [shouting] Brancardier ! Un brancardier !
*حمّالة! أحضروا حامل نقالة!*
`fr_soldier_combat_mandown_04` — [horrified] Il bouge plus… Il bouge plus !
*لم يعد يتحرّك… لم يعد يتحرّك!*

**طلب النجدة والتعزيزات**
`fr_soldier_combat_help_01` — [shouting] Renforts ! On a besoin de renforts !
*تعزيزات! نحتاج إلى تعزيزات!*
`fr_soldier_combat_help_02` — [shouting] Prévenez Khenchela !
*أبلغوا خنشلة!*
`fr_soldier_combat_help_03` — [panicked] Le téléphone est coupé ! Il marche plus !
*الهاتف مقطوع! لم يعد يعمل!*
`fr_soldier_combat_help_04` — [shouting] Ils sont combien ? On les voit pas !
*كم عددهم؟ لا نراهم!*
`fr_soldier_combat_help_05` — [relieved] [shouting] Le camion arrive ! Tenez bon !
*الشاحنة قادمة! اصمدوا!*

#### ز) الإصابة والاحتضار
`fr_soldier_wounded_01` — [pained] [gasping] Je suis touché…
*أُصبت…*
`fr_soldier_wounded_02` — [screaming] [pained] Ma jambe ! Ma jambe !
*رجلي! رجلي!*
`fr_soldier_wounded_03` — [weak] Aidez-moi… quelqu'un…
*ساعدوني… أيّ أحد…*
`fr_soldier_wounded_04` — [crying] [dying] Maman…
*أمّي…*
`fr_soldier_wounded_05` — [gasping] J'ai froid… j'ai si froid…
*أشعر بالبرد… برد شديد…*
`fr_soldier_wounded_06` — [weak] [voice breaking] Dites à ma mère… dites-lui…
*قولوا لأمّي… قولوا لها…*

#### ح) أوامر الضباط (الرقيب والملازم)
`fr_sgt_orders_01` — [shouting] Debout là-dedans ! Tout le monde dehors !
*انهضوا! الجميع إلى الخارج!*
`fr_sgt_orders_02` — [barking orders] Deux hommes à l'armurerie, au trot !
*رجلان إلى مخزن السلاح، ركضاً!*
`fr_sgt_orders_03` — [furious] Qui a laissé la porte ouverte ? L'armurerie est vide !
*من ترك الباب مفتوحاً؟ مخزن السلاح فارغ!*
`fr_sgt_orders_04` — [shouting] Doublez les sentinelles aux tours ! Allumez les projecteurs !
*ضاعفوا الحرّاس في الأبراج! أشعلوا الكشّافات!*
`fr_lt_orders_05` — [controlled] [urgent] Sergent, faites boucler le périmètre. Personne n'entre, personne ne sort.
*أيها الرقيب، أغلق المحيط. لا أحد يدخل، لا أحد يخرج.*
`fr_lt_orders_06` — [urgent] Appelez Batna par radio. Tout de suite !
*اتّصلوا بباتنة باللاسلكي. حالاً!*
`fr_lt_orders_07` — [shouting] Protégez les véhicules ! Ils visent les camions !
*احموا المركبات! إنهم يستهدفون الشاحنات!*
`fr_lt_orders_08` — [stunned] [quietly] Les cartes… Ils ont pris les cartes.
*الخرائط… أخذوا الخرائط.*
`fr_sgt_orders_09` — [shouting] Ne tirez pas sur nos hommes ! Identifiez vos cibles !
*لا تطلقوا على رجالنا! حدّدوا أهدافكم!*

#### ط) مستوى الجبل — الدورية والكلب والمراقب واللاسلكي

**سائس الكلب (أوامر للكلب)**
`fr_handler_dog_01` — [firm] [low voice] Cherche ! Cherche, Rex !
*ابحث! ابحث يا ريكس!*
`fr_handler_dog_02` — [sharp] Au pied !
*إلى جانبي!*
`fr_handler_dog_03` — [encouraging] Piste ! Allez, piste !
*الأثر! هيّا، تتبّع الأثر!*
`fr_handler_dog_04` — [out of breath] Il a une piste ! Il tire vers l'oued !
*التقط الأثر! يجرّ نحو الوادي!*
`fr_handler_dog_05` — [frustrated] Il perd la trace… L'eau. Ils sont passés par l'eau.
*أضاع الأثر… الماء. مرّوا عبر الماء.*
`fr_handler_dog_06` — [soothing] Tout doux… tout doux, mon chien.
*على مهلك… على مهلك يا كلبي.*
`fr_handler_dog_07` — [whispering] Couché. Pas un bruit.
*انبطح. ولا صوت.*
`fr_handler_dog_08` — [shouting] Du sang sur les pierres ! Il y a un blessé avec eux !
*دم على الحجارة! معهم جريح!*

**المراقب على التلّة**
`fr_observer_01` — [bored] [calling] Rien en vue sur la crête.
*لا شيء ظاهر على الحافة.*
`fr_observer_02` — [alert] Mouvement à deux cents mètres, près des rochers !
*حركة على بعد مئتي متر، قرب الصخور!*
`fr_observer_03` — [shouting] Deux hommes ! Un qui porte l'autre !
*رجلان! أحدهما يحمل الآخر!*
`fr_observer_04` — [shivering] [muttering] Avec ce vent, j'y vois plus rien dans les jumelles.
*مع هذه الريح لم أعد أرى شيئاً في المنظار.*
`fr_observer_05` — [uncertain] Une fumée, là-haut… Un abri de bergers, peut-être.
*دخان هناك في الأعلى… ربما ملجأ رعاة.*

**نداءات اللاسلكي**
`fr_radio_01` — [radio voice] [clipped] Ici patrouille Bravo, je vous appelle. À vous.
*هنا الدورية «برافو»، أناديكم. حوِّل.*
`fr_radio_02` — [radio voice] Traces fraîches dans l'oued, direction plein sud. À vous.
*آثار حديثة في الوادي، باتّجاه الجنوب. حوِّل.*
`fr_radio_03` — [radio voice] [urgent] Coup de feu entendu sur le versant est. Demandons des renforts. À vous.
*سُمعت طلقة على السفح الشرقي. نطلب تعزيزات. حوِّل.*
`fr_radio_04` — [radio voice] [calm] Bien reçu. Le camion monte de Khenchela. Terminé.
*وصلت الرسالة. الشاحنة تصعد من خنشلة. انتهى.*
`fr_radio_05` — [radio voice] [frustrated] Contact perdu. Le chien a perdu la piste. À vous.
*فُقد الاتصال بالهدف. الكلب أضاع الأثر. حوِّل.*
`fr_radio_06` — [radio voice] Ordre de Batna : ratissez la crête avant la nuit. Terminé.
*أمر من باتنة: مشّطوا الحافة قبل الليل. انتهى.*

---

## 5. ملحق — جمل غامضة / اختيارية

هذه نصوص تظهر على الشاشة، لكن ليس واضحاً أنها منطوقة. لم تُحتسب في الجمل الأساسية. ولّدها بصوت الراوي فقط إن قرّرتم قراءتها بصوت مسموع.

| ID مقترح | المصدر | النص |
|---|---|---|
| `ch2_narrator_opt_disclaimer` | `DISCLAIMER` | مستوحاة من أحداث حقيقية. الحوارات وبعض الوقائع والمهمّات متخيَّلة، والصور تمثيلية. |
| `ch2_narrator_opt_caption` | `CAPTION` | دشرة أولاد موسى · بيت عائلة بن شايبة — 31 أكتوبر 1954 · 22:40 · غرب خنشلة |
| `mt_narrator_opt_disclaimer` | `M_DISCLAIMER` | عمّار ولخضر وصالح شخصيات متخيَّلة. الأماكن والتضاريس حقيقية — جبال الأوراس غرب خنشلة. |
| `mt_narrator_opt_caption` | `M_CAPTION` | جبال الأوراس · غرب خنشلة — 1 نوفمبر 1954 · قبل الفجر · 1690 م |
| `ch2_narrator_opt_end_ghost` | `Barracks.tsx` النهاية «ضربة الشبح» | دخلتم وخرجتم كالظل. حين انفجرت مركباتهم عند منتصف الليل، كانت خرائطهم وسلاحهم في الجبل. |
| `ch2_narrator_opt_end_guerrilla` | `Barracks.tsx` النهاية «حرب العصابات» | دوّى الرصاص في الثكنة، لكن الفوج انسحب بالسلاح والخرائط. هكذا تبدأ حرب العصابات. |
| `ch2_narrator_opt_end_escape` | `Barracks.tsx` النهاية «نجاة بالسلاح» | نجوتم، لكن معظم البنادق بقيت في الرفوف. ستحتاج الجبال إلى أكثر من هذا. |
| `ch2_narrator_opt_end_records` | `Barracks.tsx` (إضافة إن أُخذ السجلّ) | وسجلّ المخبرين معكم: لن تنام البوشكارة مطمئنة بعد اليوم. |
| `mt_narrator_opt_end_valley` | `Mountain.tsx` النهاية | اخترتم الوادي، الأقصر والأكثر انكشافاً. حملتَ لخضر حتى النار. وفي الملجأ، بقي عمّار وصالح وحدهما مع الفجر. |
| `mt_narrator_opt_end_ridge` | `Mountain.tsx` النهاية | اخترتم الحافة، الأطول والأبرد. حملتَ لخضر حتى النار. وفي الملجأ، بقي عمّار وصالح وحدهما مع الفجر. |
| `ch1_narrator_opt_end_holds` | `LastNight.tsx` النهاية | وصلت الرسالة ومعها الحقيقة. عمّار ورجاله يتحرّكون بثقة قبل أول ضوء. |
| `ch1_narrator_opt_end_shaken` | `LastNight.tsx` النهاية | وصلت الرسالة، لكن الثقة اهتزّت هذه الليلة. |
| `ch1_narrator_opt_end_rushed` | `LastNight.tsx` النهاية | وصلت الرسالة، لكن أحداً لم يتحقّق مما فيها. ستتحرّك الشبكة على عجل. |
| `ch2_boucetta_opt_report` | `level.ts` تلميح المعصرة (اقتباس على لسان بوستة) | أين التقرير؟ علّم 5 حرّاس من كاف الغراب |
| `ch2_boucetta_opt_notyet` | `level.ts` تلميح المعصرة | ليس قبل لقاء العزوي |

**نصوص استُبعدت عمداً لأنها واجهة لا كلام:** أهداف المراحل (`OBJ`)، تلميحات التفاعل («اقطع السلك»، «احمل لخضر»…)، رسائل التنبيه («يصرخ لإطلاق الإنذار — أسكته!»، «عثروا على جثّة»، «وصلت شاحنة التعزيزات!»، «الجنود يبحثون…»، «الكلب يشتمّ أثرك — ادخل الماء»)، خيارات خطة شيحاني في `Barracks.tsx`، وأسماء الأماكن في `map.ts` و`night/world.ts`.

---

## 6. جدول المراجعة — عدد الجمل لكل شخصية

| الشخصية | الموجودة في اللعبة | ملاحظات |
|---|---|---|
| مصطفى بن بولعيد | 6 | |
| شيحاني بشير | 8 | منها 2 ⚙️ بأرقام متغيّرة |
| عباس لغرور | 16 | 2 في البيت + 10 نداءات (`ch2`) + 4 في الجسر (`mt`) |
| عاجل عجول | 6 | |
| مصطفى بوستة | 4 | (+2 اختيارية) |
| مرود العزوي | 9 | منها 1 ⚙️ |
| الفوج (جمل مشتركة) | 3 | × 3 أصوات = 9 ملفات |
| أنت — الفصل الثاني | 4 | جملة + 3 إجابات لكلمة السرّ |
| صالح — الجبل | 1 | |
| عمّار | 26 | 23 في الجبل (منها تنهيدة صامتة) + 3 في الفصل الأول |
| لخضر | 9 | |
| زهرة | 5 | |
| أنت — الفصل الأول | 5 | |
| الراوي | 13 | 7 في الفصل الثاني + 6 في الجبل (+15 اختيارية في الملحق) |
| **مجموع الجمل الموجودة** | **115** | ‏121 ملفاً صوتياً بعد احتساب أصوات الفوج الثلاثة |
| الأعداء الفرنسيون — موجود | 0 | لا يوجد حوار فرنسي في الكود |
| الأعداء الفرنسيون — جديد مقترح | 109 | أحاديث 21 (7 محادثات) · ريبة 8 · بحث 6 · فقدان 6 · إنذار 8 · اشتباك 26 · إصابة 6 · ضبّاط 9 · جبل 19 (كلب 8، مراقب 5، لاسلكي 6) |
