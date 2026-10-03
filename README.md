<div align="center">

# BLACKOUT // خاموشی

**A top-down tactical shooter played in the dark. Pure HTML5 Canvas + vanilla JavaScript. No build step, no dependencies.**

**یک شوتر تاکتیکی از بالا، در تاریکی مطلق. فقط HTML5 Canvas و جاوااسکریپت خالص. بدون نیاز به build یا وابستگی.**

![HTML5](https://img.shields.io/badge/HTML5-Canvas-orange) ![JS](https://img.shields.io/badge/JavaScript-Vanilla-yellow) ![i18n](https://img.shields.io/badge/lang-فارسی%20%7C%20English-19c3dd) ![deps](https://img.shields.io/badge/dependencies-0-3ddc84) ![input](https://img.shields.io/badge/input-KB%2BM%20%7C%20Gamepad%20%7C%20Touch-ff8a1a) ![coop](https://img.shields.io/badge/local%20co--op-2P-b07cff)

[English](#english) · [فارسی](#فارسی)

</div>

---

## English

### Highlights
- **Darkness is the mechanic**: a flashlight cone and ray-cast lighting decide what you can see, and what can see you.
- **Full campaign** with stealth, hacking, demolition, survival waves and a two-phase boss.
- **28 weapons**: pistols to railguns, an arc caster that chains lightning, a flamethrower that sets rooms alight.
- **Smart enemies**: patrols, noise investigation, flanking, grenadiers, breachers.
- **Progression**: XP, credits, weapon unlocks, 7 upgrade tracks, S–D mission ratings.
- **Bilingual UI**: Persian (RTL, Persian digits) and English, with Persian enemy voice lines.
- **Local profiles (v5)**: several players can keep separate progress on one PC.
- **Play anywhere (new in v6)**: full gamepad support, touch controls for phones and tablets, and **2-player local co-op** with three dedicated operations.

### Quick start
```bash
git clone https://github.com/Arvinb1386/blackout-game.git
cd blackout-game

# Option A: Pure static (solo, touch or gamepad co-op)
python3 -m http.server 8080   # then visit http://localhost:8080

# Option B: Node server with mobile remote controller support (WebSocket)
npm install && npm start
# PC Game:        http://localhost:8080
# P2 Controller:  http://<your-pc-ip>:8080/controller.html
```
On a phone, serve it on your LAN (`--bind 0.0.0.0` or `npm start`), open the game URL in landscape, or open `/controller.html` to turn the phone into a dedicated Player 2 wireless controller!

### Controls

**Keyboard + mouse**

| Action | Key |
|---|---|
| Move | `W A S D` / arrows |
| Aim / Fire | Mouse / Left click |
| Dodge roll | `Space` |
| Reload | `R` |
| Interact / Hack / Plant / Revive | `E` (hold) |
| Sprint | `Shift` |
| Swap weapon | `1` `2` / mouse wheel |
| Pause | `Esc` |

**Gamepad** (standard mapping: Xbox, PlayStation and most USB pads)

| Action | Button |
|---|---|
| Move / Aim | Left stick / Right stick (soft aim assist) |
| Fire | `RT` / `R2` |
| Sprint | `LT` / `L2` or click `L3` |
| Dodge roll | `A` / `✕` |
| Reload | `B` / `◯` |
| Interact / Hack / Plant / Revive | `X` / `□` (hold) |
| Next / previous weapon | `Y` or `RB` / `LB` |
| Weapon slots 1–4 | D-pad |
| Intel panel | `View` / `Share` (hold) |
| Pause | `Start` / `Options` |

Menus are fully navigable with the D-pad or left stick (`A` select, `B` back). Vibration kicks in on hits and heavy weapons.

**Touch** (Settings → TOUCH CONTROLS: `AUTO` / `OFF` / `EASY` / `PRO`)
- **EASY**: left thumb is a floating move stick; aim-assist locks onto the nearest visible hostile and fires automatically. Tap or hold the right side to fire manually.
- **PRO**: twin-stick. Right thumb is a floating aim stick, push past half-way to fire. Light aim assist only.
- Both modes have DODGE / RELOAD / USE (hold) / SWAP buttons, tap a HUD weapon slot to equip it, and push the move stick to the edge to sprint. `AUTO` turns touch on for touch screens.

### Local co-op
Pick **CO-OP** from the main menu. Two operators share one screen:
- **P1** plays on keyboard + mouse (or the first gamepad if two are connected); **P2** can use a gamepad or connect a smartphone as a wireless controller via WebSocket (`/controller.html`).
- Each operator has their own flashlight, HUD panel and reticle. The camera frames both and zooms out as you split up, with a soft leash so nobody walks off-screen.
- Enemies pick the closest or most visible operator; everything (doors, pickups, terminals, hazards, explosions) works for both.
- Go down and your partner can **revive** you by holding USE next to you. The op only fails if you both go down, and extraction needs every standing operator in the zone.
- Three dedicated operations, unlocked in order: **TWIN SIGNAL**, **SCORCHED PAIR** and **DEAD MAN'S SWITCH**. Enemies and the boss get extra HP to match the extra gun.
- Want the regular campaign with a friend? Turn on **Settings → CAMPAIGN IN CO-OP** and connect a gamepad or phone controller.

### Settings
Audio (master / music / SFX), mouse sensitivity, screen shake, particles, post-FX, enemy voices, blood, fullscreen, FPS counter, language, touch mode, gamepad aim assist, gamepad vibration, campaign co-op and a live gamepad counter. Settings are saved per profile.

### Local profiles
Click the profile chip in the main-menu footer to create, rename, switch or delete profiles. Each profile has its own XP, credits, unlocks, loadout, ratings, co-op progress and settings, stored in `localStorage`. Existing saves become the first profile automatically.

### Project structure
```
index.html          screens + script order
css/                style.css, embedded fonts
js/core            utils, i18n, save, input, audio, camera, collision
js/gameplay        player, enemies, ai, boss, weapons, projectiles, hazards, pickups, objectives
js/world           level generation, missions, renderer, postfx
js/expansions      arsenal, campaign, v4-* packs (monkey-patch the core)
js/v6-core.js      shared virtual-input layer, aim assist, v6 settings
js/v6-gamepad.js   gamepads: P1 / P2 roles, menu navigation, vibration
js/v6-touch.js     phone + tablet controls (EASY / PRO)
js/v6-coop.js      local co-op: P2, revive, shared camera, co-op operations
js/v6-remote.js    remote controller: WebSocket driver for Player 2
js/profiles.js     v5 local multi-profile manager
js/main.js         bootstrap
server.js          Node.js static server + WebSocket relay
controller.html    web-based mobile touch controller for P2
```
All modules attach to the global `BO` namespace and expansion packs extend the core by wrapping prototype methods, so new features can be added as drop-in scripts before `main.js`. The v6 packs must load in order (`v6-core` → `v6-gamepad` → `v6-touch` → `v6-coop` → `v6-remote`), after the v4 packs.

### Roadmap
- [x] Touch controls for phones (Easy mode with aim-assist, Pro twin-stick mode)
- [x] Local co-op (keyboard + gamepad) with dedicated co-op missions
- [x] Gamepad support

All planned features have shipped in v6. Ideas and PRs welcome.

---

<div dir="rtl">

## فارسی

### ویژگی‌ها
- **تاریکی خودِ گیم‌پلی است**: نور چراغ‌قوه و نورپردازی پرتویی تعیین می‌کند چه چیزی را می‌بینی و چه کسی تو را می‌بیند.
- **کمپین کامل** با مخفی‌کاری، هک، تخریب، موج‌های بقا و یک باس دو مرحله‌ای.
- **۲۸ سلاح**: از کلت تا ریل‌گان، تفنگ آذرخش و شعله‌افکن دوزخ.
- **دشمنان باهوش**: گشت‌زنی، بررسی صدا، دور زدن، نارنجک‌انداز و نفوذی.
- **پیشرفت**: تجربه، اعتبار، باز کردن سلاح‌ها، ۷ مسیر ارتقا و رتبه‌بندی S تا D.
- **رابط دوزبانه**: فارسی (راست‌به‌چپ با اعداد فارسی) و انگلیسی، همراه با صدای فارسی دشمن‌ها.
- **پروفایل‌های محلی (v5)**: چند نفر می‌توانند روی یک کامپیوتر پیشرفت جداگانه داشته باشند.
- **همه‌جا بازی کن (جدید در v6)**: پشتیبانی کامل از دسته بازی، کنترل لمسی برای موبایل و تبلت، و **بازی دونفره محلی** با سه مأموریت مخصوص.

### شروع سریع
```bash
git clone https://github.com/Arvinb1386/blackout-game.git
cd blackout-game

# روش ۱: اجرای ساده ایستا (تک‌نفره، لمسی یا دسته)
python3 -m http.server 8080   # سپس باز کردن http://localhost:8080

# روش ۲: سرور نودجی‌اس با پشتیبانی از دسته مجازی موبایل (WebSocket)
npm install && npm start
# بازی روی کامپیوتر:    http://localhost:8080
# دسته موبایل بازیکن ۲: http://<آی‌پی-کامپیوتر>:8080/controller.html
```
سپس آدرس `http://localhost:8080` را باز کن، یا مستقیم فایل `index.html` را اجرا کن. برای استفاده از گوشی به عنوان دسته بی‌سیم بازیکن ۲، در مرورگر گوشی آدرس `/controller.html` را باز کن.

### کنترل‌ها

**کیبورد و موس**

| عمل | کلید |
|---|---|
| حرکت | `W A S D` یا جهت‌نماها |
| نشانه‌گیری / شلیک | موس / کلیک چپ |
| غلت زدن | `Space` |
| خشاب‌گذاری | `R` |
| تعامل / هک / کار گذاشتن بمب / بلند کردن هم‌تیمی | نگه داشتن `E` |
| دویدن | `Shift` |
| تعویض سلاح | `1` `2` یا چرخ موس |
| توقف | `Esc` |

**دسته بازی** (نگاشت استاندارد: ایکس‌باکس، پلی‌استیشن و بیشتر دسته‌های USB)

| عمل | دکمه |
|---|---|
| حرکت / نشانه‌گیری | آنالوگ چپ / آنالوگ راست (با کمک‌نشانه‌گیری ملایم) |
| شلیک | `RT` / `R2` |
| دویدن | `LT` / `L2` یا فشردن `L3` |
| غلت زدن | `A` / `✕` |
| خشاب‌گذاری | `B` / `◯` |
| تعامل / هک / بمب / بلند کردن هم‌تیمی | نگه داشتن `X` / `□` |
| سلاح بعدی / قبلی | `Y` یا `RB` / `LB` |
| خانه‌های سلاح ۱ تا ۴ | D-pad |
| پنل اطلاعات | نگه داشتن `View` / `Share` |
| توقف | `Start` / `Options` |

منوها هم با D-pad یا آنالوگ چپ کار می‌کنند (`A` انتخاب، `B` برگشت). هنگام آسیب دیدن و شلیک با سلاح‌های سنگین، دسته می‌لرزد.

**لمسی** (تنظیمات ← کنترل لمسی: خودکار / خاموش / آسان / حرفه‌ای)
- **آسان**: انگشت چپ آنالوگ شناور حرکت است؛ کمک‌نشانه‌گیری روی نزدیک‌ترین دشمن قفل می‌کند و خودکار شلیک می‌کند. برای شلیک دستی سمت راست صفحه را لمس کن یا نگه دار.
- **حرفه‌ای**: دو آنالوگ. انگشت راست آنالوگ شناور نشانه‌گیری است و با بیش از نیمه کشیدن شلیک می‌کند. فقط کمک‌نشانه‌گیری سبک.
- در هر دو حالت دکمه‌های غلت / خشاب / تعامل (نگه داشتن) / سلاح وجود دارد، با لمس خانه سلاح در HUD آن را برمی‌داری و با کشیدن آنالوگ حرکت تا لبه می‌دوی. حالت خودکار روی صفحه‌های لمسی روشن می‌شود.

### بازی دونفره محلی
از منوی اصلی **دونفره** را انتخاب کن. دو مأمور روی یک صفحه بازی می‌کنند:
- **بازیکن ۱** با کیبورد و موس (یا دسته اول اگر دو دسته وصل باشد) و **بازیکن ۲** با دسته بازی فیزیکی یا گوشی موبایل به عنوان دسته ریموت بی‌سیم (`/controller.html`).
- هر مأمور چراغ‌قوه، پنل HUD و نشانگر خودش را دارد. دوربین هر دو را در کادر نگه می‌دارد و وقتی از هم دور می‌شوید عقب می‌کشد؛ یک افسار نرم هم نمی‌گذارد کسی از صفحه بیرون برود.
- دشمن‌ها نزدیک‌ترین یا دیده‌شده‌ترین مأمور را هدف می‌گیرند و درها، آیتم‌ها، ترمینال‌ها، خطرها و انفجارها برای هر دو کار می‌کنند.
- اگر زمین بخوری، هم‌تیمی‌ات با نگه داشتن دکمه تعامل کنارت بلندت می‌کند. مأموریت فقط وقتی شکست می‌خورد که هر دو زمین بخورید و برای خروج، همه مأمورهای سرپا باید در نقطه خروج باشند.
- سه مأموریت مخصوص که به ترتیب باز می‌شوند: **سیگنال دوقلو**، **جفت سوخته** و **کلید مرگ**. جان دشمن‌ها و باس متناسب با تفنگ اضافه بیشتر شده است.
- می‌خواهی کمپین اصلی را با دوستت بازی کنی؟ **تنظیمات ← کمپین به‌صورت دونفره** را روشن کن و یک دسته یا کنترلر ریموت وصل کن.

### تنظیمات
صدا (کلی / موسیقی / افکت‌ها)، حساسیت موس، لرزش صفحه، ذرات، افکت‌های تصویری، صدای دشمن‌ها، خون، تمام‌صفحه، شمارنده FPS، زبان، حالت لمسی، کمک‌نشانه‌گیری دسته، لرزش دسته، کمپین دونفره و شمارنده زنده دسته‌ها. تنظیمات برای هر پروفایل جدا ذخیره می‌شود.

### پروفایل‌های محلی
روی نشان پروفایل در پایین منوی اصلی کلیک کن تا پروفایل بسازی، نامش را عوض کنی، بین پروفایل‌ها جابه‌جا شوی یا حذفش کنی. هر پروفایل تجربه، اعتبار، سلاح‌ها، تجهیزات، رتبه‌ها، پیشرفت دونفره و تنظیمات خودش را در `localStorage` نگه می‌دارد. ذخیره‌های قبلی خودکار پروفایل اول می‌شوند.

### نقشه راه
- [x] کنترل لمسی برای موبایل (حالت آسان با کمک‌نشانه‌گیری، حالت حرفه‌ای دو آنالوگ)
- [x] بازی دونفره محلی (کیبورد + دسته) با مأموریت‌های مخصوص
- [x] پشتیبانی از دسته بازی

همه موارد نقشه راه در v6 منتشر شدند. ایده‌ها و PRها خوش‌آمدند.

</div>
