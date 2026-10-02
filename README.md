<div align="center">

# BLACKOUT // خاموشی

**A top-down tactical shooter played in the dark. Pure HTML5 Canvas + vanilla JavaScript. No build step, no dependencies.**

**یک شوتر تاکتیکی از بالا، در تاریکی مطلق. فقط HTML5 Canvas و جاوااسکریپت خالص. بدون نیاز به build یا وابستگی.**

![HTML5](https://img.shields.io/badge/HTML5-Canvas-orange) ![JS](https://img.shields.io/badge/JavaScript-Vanilla-yellow) ![i18n](https://img.shields.io/badge/lang-فارسی%20%7C%20English-19c3dd) ![deps](https://img.shields.io/badge/dependencies-0-3ddc84)

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
- **Local profiles (new in v5)**: several players can keep separate progress on one PC.

### Quick start
```bash
git clone https://github.com/Arvinb1386/blackout-game.git
cd blackout-game
# open index.html directly, or serve it:
python3 -m http.server 8080   # then visit http://localhost:8080
```

### Controls
| Action | Key |
|---|---|
| Move | `W A S D` / arrows |
| Aim / Fire | Mouse / Left click |
| Dodge roll | `Space` |
| Reload | `R` |
| Interact / Hack / Plant | `E` (hold) |
| Sprint | `Shift` |
| Swap weapon | `1` `2` / mouse wheel |
| Pause | `Esc` |

### Local profiles
Click the profile chip in the main-menu footer to create, rename, switch or delete profiles. Each profile has its own XP, credits, unlocks, loadout, ratings and settings, stored in `localStorage`. Existing saves become the first profile automatically.

### Project structure
```
index.html          screens + script order
css/                style.css, embedded fonts
js/core            utils, i18n, save, input, audio, camera, collision
js/gameplay        player, enemies, ai, boss, weapons, projectiles, hazards, pickups, objectives
js/world           level generation, missions, renderer, postfx
js/expansions      arsenal, campaign, v4-* packs (monkey-patch the core)
js/profiles.js     v5 local multi-profile manager
js/main.js         bootstrap
```
All modules attach to the global `BO` namespace and expansion packs extend the core by wrapping prototype methods, so new features can be added as drop-in scripts before `main.js`.

### Roadmap
- Touch controls for phones (Easy mode with aim-assist, Pro twin-stick mode)
- Local co-op (keyboard + gamepad) with dedicated co-op missions
- Gamepad support

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
- **پروفایل‌های محلی (جدید در v5)**: چند نفر می‌توانند روی یک کامپیوتر پیشرفت جداگانه داشته باشند.

### شروع سریع
```bash
git clone https://github.com/Arvinb1386/blackout-game.git
cd blackout-game
python3 -m http.server 8080
```
سپس آدرس `http://localhost:8080` را باز کن، یا مستقیم فایل `index.html` را اجرا کن.

### کنترل‌ها
| عمل | کلید |
|---|---|
| حرکت | `W A S D` یا جهت‌نماها |
| نشانه‌گیری / شلیک | موس / کلیک چپ |
| غلت زدن | `Space` |
| خشاب‌گذاری | `R` |
| تعامل / هک / کار گذاشتن بمب | نگه داشتن `E` |
| دویدن | `Shift` |
| تعویض سلاح | `1` `2` یا چرخ موس |
| توقف | `Esc` |

### پروفایل‌های محلی
روی نشان پروفایل در پایین منوی اصلی کلیک کن تا پروفایل بسازی، نامش را عوض کنی، بین پروفایل‌ها جابه‌جا شوی یا حذفش کنی. هر پروفایل تجربه، اعتبار، سلاح‌ها، تجهیزات، رتبه‌ها و تنظیمات خودش را در `localStorage` نگه می‌دارد. ذخیره‌های قبلی خودکار پروفایل اول می‌شوند.

### نقشه راه
- کنترل لمسی برای موبایل (حالت آسان با کمک‌نشانه‌گیری، حالت حرفه‌ای دو آنالوگ)
- بازی دونفره محلی (کیبورد + دسته) با مأموریت‌های مخصوص
- پشتیبانی از دسته بازی

</div>
