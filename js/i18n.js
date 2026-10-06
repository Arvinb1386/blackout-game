/* =========================================================================
 * BLACKOUT :: i18n.js
 * Persian (fa, RTL) and English (en) localisation. Persian uses the embedded
 * Vazirmatn typeface and Persian digits everywhere, including the canvas HUD.
 * ========================================================================= */
'use strict';
(function (BO) {
  const STRINGS = {
    en: {
      'game.subtitle': 'TACTICAL OPERATIONS // LIGHTS OUT',
      'menu.play': 'PLAY', 'menu.missions': 'MISSIONS', 'menu.loadout': 'LOADOUT', 'menu.upgrades': 'UPGRADES',
      'menu.settings': 'SETTINGS', 'menu.credits': 'CREDITS', 'menu.quit': 'QUIT', 'menu.update': 'UPDATES',
      'update.title': 'CHECK FOR UPDATES', 'update.checking': 'Checking for updates...',
      'update.latest': 'You have the latest version ({version}).', 'update.available': 'New version {version} is available!',
      'update.downloading': 'Downloading update... {percent}%', 'update.ready': 'Update downloaded successfully!',
      'update.btnDownload': 'DOWNLOAD & UPDATE', 'update.btnRestart': 'RESTART & APPLY UPDATE',
      'update.btnWeb': 'OPEN DOWNLOAD PAGE', 'update.btnCheck': 'CHECK AGAIN',
      'update.error': 'Error checking for updates: {error}',
      'update.manualHint': 'Running in web browser. You can download the latest installer from GitHub.',
      'update.inAppHint': 'Update will be downloaded and installed directly inside the game.',
      'update.restartNotice': 'Update file is ready. Click "Restart & Apply Update" or close and reopen the game to complete installation.',
      'update.installing': 'Exiting game and launching the update installer...',
      'update.currentVer': 'CURRENT VERSION', 'update.latestVer': 'LATEST VERSION',
      'menu.next': 'NEXT OP: {name}', 'menu.allDone': 'ALL OPERATIONS CLEARED // REPLAY ANY MISSION',
      'menu.corrupt': 'Save data was damaged and has been safely reset.',
      'common.back': 'BACK', 'common.deploy': 'DEPLOY', 'common.level': 'LEVEL', 'common.xp': 'XP', 'common.credits': 'CREDITS',
      'common.on': 'ON', 'common.off': 'OFF', 'common.locked': 'LOCKED', 'common.cancel': 'CANCEL', 'common.confirm': 'CONFIRM',
      'missions.title': 'OPERATIONS', 'missions.completed': 'CLEARED', 'missions.best': 'BEST', 'missions.reward': 'REWARD',
      'missions.lockedHint': 'Clear the previous operation to unlock.',
      'diff.easy': 'EASY', 'diff.medium': 'MEDIUM', 'diff.hard': 'HARD', 'diff.extreme': 'EXTREME',
      'm1.name': 'ABANDONED OUTPOST', 'm1.desc': 'A dead relay station at the edge of the grid. Clear the squatters, then get out.',
      'm2.name': 'INDUSTRIAL COMPLEX', 'm2.desc': 'Smelters, catwalks and volatile fuel. Burn three supply caches and extract.',
      'm3.name': 'BLACKSITE', 'm3.desc': 'Classified data lies under the Warden\'s watch. Take it. Then take him down.',
      'm4.name': 'SIGNAL TOWER', 'm4.desc': 'Bring two uplink terminals online and hold the tower while the signal pushes through.',
      'm5.name': 'LAST LIGHT', 'm5.desc': 'The Warden rebuilt himself. Gut the reactor, finish the job, end the blackout.',
      'loadout.title': 'LOADOUT', 'loadout.primary': 'PRIMARY', 'loadout.secondary': 'SECONDARY',
      'loadout.equip': 'EQUIP', 'loadout.equipped': 'EQUIPPED', 'loadout.buy': 'UNLOCK {cost}', 'loadout.cantAfford': 'NOT ENOUGH CREDITS',
      'stat.damage': 'DAMAGE', 'stat.fireRate': 'FIRE RATE', 'stat.accuracy': 'ACCURACY', 'stat.magazine': 'MAGAZINE',
      'stat.reload': 'RELOAD SPEED', 'stat.range': 'RANGE',
      'stat.price': 'COST', 'stat.pellets': 'PELLETS', 'stat.burst': 'BURST',
      'stat.reserve': 'RESERVE', 'stat.spread': 'SPREAD', 'stat.recoil': 'RECOIL BLOOM',
      'stat.maxBloom': 'MAX BLOOM', 'stat.recovery': 'BLOOM RECOVERY',
      'stat.bulletSpeed': 'MUZZLE VELOCITY', 'stat.pierce': 'PIERCE',
      'stat.explosive': 'BLAST RADIUS', 'stat.shake': 'CAMERA SHAKE', 'stat.kick': 'KICK',
      'stat.hitStop': 'HIT STOP', 'stat.knockback': 'KNOCKBACK', 'stat.moveMul': 'MOVE SPEED',
      'stat.tracer': 'TRACER', 'stat.tracerWidth': 'TRACER WIDTH', 'stat.auto': 'FULL AUTO',
      'stat.silent': 'SUPPRESSED', 'stat.burn': 'BURN', 'stat.chill': 'CHILL',
      'stat.chain': 'CHAIN', 'stat.homing': 'HOMING', 'stat.cluster': 'CLUSTER',
      'stat.noise': 'NOISE RADIUS', 'stat.look': 'SILHOUETTE',
      'w.pistol': 'M9 SIDEARM', 'w.revolver': 'HAMMER .50', 'w.smg': 'VECTOR SMG', 'w.ar': 'K-17 RIFLE', 'w.burst': 'TRIAD BURST',
      'w.shotgun': 'BREACHER 12G', 'w.dmr': 'LONGSHOT DMR', 'w.lmg': 'ANVIL LMG', 'w.sniper': 'WIDOW .338', 'w.launcher': 'THUMPER GL',
      'wd.pistol': 'Reliable, accurate, always there.', 'wd.revolver': 'Six rounds. Every one pierces.',
      'wd.smg': 'Hose it down up close.', 'wd.ar': 'The all-rounder. Controlled bursts win.',
      'wd.burst': 'Three-round bursts with tight grouping.', 'wd.shotgun': 'Eight pellets. Door-kicker.',
      'wd.dmr': 'Semi-auto precision at range.', 'wd.lmg': '100-round belt. Slower on your feet.',
      'wd.sniper': 'One shot, through two targets.', 'wd.launcher': 'Explosive rounds. Mind the blast.',
      'up.title': 'UPGRADES', 'up.maxHp': 'MAX HEALTH', 'up.armor': 'ARMOR PLATING', 'up.speed': 'MOBILITY',
      'up.reload': 'FAST HANDS', 'up.damage': 'HOLLOW POINTS', 'up.accuracy': 'STABILIZER', 'up.magazine': 'EXTENDED MAGS',
      'up.stamina': 'ENDURANCE', 'up.dodge': 'REFLEXES', 'up.regen': 'BIO-REGEN',
      'up.lifesteal': 'SECOND WIND', 'up.crit': 'PRECISION', 'up.scavenger': 'SCAVENGER', 'up.cooldown': 'TACTICAL CORE',
      'upd.maxHp': '+15 max health per level', 'upd.armor': '+15 max armor per level', 'upd.speed': '+5% movement speed',
      'upd.reload': '-8% reload time', 'upd.damage': '+8% weapon damage', 'upd.accuracy': '-10% weapon spread', 'upd.magazine': '+10% magazine size',
      'upd.stamina': '-10% sprint drain, +12% stamina regen per level',
      'upd.dodge': '-8% dodge cooldown, bonus invulnerability per level',
      'upd.regen': 'Regenerates health after 4s without damage',
      'upd.lifesteal': '+3 health restored per enemy elimination',
      'upd.crit': '+2.5% critical strike chance per level',
      'upd.scavenger': '+8% bonus credits earned per level',
      'upd.cooldown': '-5% tactical skill cooldown per level',
      'upc.survival': 'SURVIVAL', 'upc.mobility': 'MOBILITY', 'upc.weapons': 'WEAPONRY', 'upc.support': 'SUPPORT',
      'up.new': 'NEW',
      'up.cost': 'COST', 'up.maxed': 'MAXED', 'up.buy': 'UPGRADE', 'up.lvl': 'LV {n}/{max}',
      'set.title': 'SETTINGS', 'set.master': 'MASTER VOLUME', 'set.music': 'MUSIC VOLUME', 'set.sfx': 'EFFECTS VOLUME',
      'set.sensitivity': 'MOUSE SENSITIVITY', 'set.shake': 'SCREEN SHAKE', 'set.particles': 'PARTICLE QUALITY',
      'set.low': 'LOW', 'set.medium': 'MEDIUM', 'set.high': 'HIGH', 'set.fullscreen': 'FULLSCREEN', 'set.fps': 'FPS COUNTER',
      'set.language': 'LANGUAGE', 'set.reset': 'RESET ALL PROGRESS', 'set.resetConfirm': 'Erase all progress? This cannot be undone.',
      'set.resetDone': 'Progress reset.', 'set.fsUnavailable': 'Fullscreen is not available here.',
      'credits.title': 'CREDITS', 'credits.body': 'BLACKOUT\nDesign, code, audio & art: generated procedurally\nBuilt with HTML5 Canvas & Web Audio\n\nTypefaces (SIL Open Font License)\nVazirmatn by Saber Rastikerdar\nKhand by Indian Type Foundry\nChakra Petch by Cadson Demak\n\nMade with love',
      'quit.title': 'SESSION ENDED', 'quit.body': 'You can close this tab now.', 'quit.return': 'RETURN TO BASE',
      'pause.title': 'PAUSED', 'pause.resume': 'RESUME', 'pause.restart': 'RESTART MISSION', 'pause.settings': 'SETTINGS', 'pause.quit': 'QUIT TO MENU',
      'res.complete': 'MISSION COMPLETE', 'res.kills': 'KILLS', 'res.accuracy': 'ACCURACY', 'res.headshots': 'HEADSHOTS', 'res.time': 'TIME',
      'res.damage': 'DAMAGE TAKEN', 'res.xp': 'XP EARNED', 'res.credits': 'CREDITS EARNED', 'res.rating': 'RATING',
      'res.next': 'NEXT MISSION', 'res.upgrades': 'UPGRADES', 'res.menu': 'MAIN MENU', 'res.retry': 'RETRY', 'res.replay': 'REPLAY',
      'res.kia': 'KILLED IN ACTION', 'res.kiaSub': 'Half of the collected credits were recovered.', 'res.victory': 'THE BLACKOUT IS OVER',
      'hud.hp': 'HP', 'hud.armor': 'ARMOR', 'hud.reloading': 'RELOADING', 'hud.empty': 'EMPTY', 'hud.noAmmo': 'NO AMMO', 'hud.dodge': 'DODGE',
      'hud.objective': 'OBJECTIVE', 'hud.stamina': 'STAMINA', 'hud.fps': 'FPS', 'hud.lowAmmo': 'LOW AMMO',
      'obj.eliminate': 'Eliminate hostile forces', 'obj.destroy': 'Destroy supply caches', 'obj.destroyCore': 'Destroy reactor cores',
      'obj.collect': 'Retrieve encrypted data', 'obj.activate': 'Activate uplink terminals', 'obj.survive': 'Hold the uplink',
      'obj.boss': 'Defeat THE WARDEN', 'obj.extract': 'Reach extraction', 'obj.extracting': 'Extracting',
      'note.objComplete': 'OBJECTIVE COMPLETE', 'note.newObj': 'NEW OBJECTIVE', 'note.levelUp': 'LEVEL UP', 'note.levelUpSub': 'Level {n} // +{c} credits',
      'note.missionStart': 'OPERATION', 'note.bossWarning': 'WARNING', 'note.bossName': 'THE WARDEN', 'note.bossNameMk2': 'THE WARDEN MK-II',
      'note.phase': 'PHASE {n}', 'note.neutralized': 'TARGET NEUTRALIZED', 'note.extractReady': 'Extraction is open',
      'note.waveIncoming': 'Hostiles inbound', 'note.charge': 'Charge planted', 'note.hacked': 'Terminal online', 'note.intel': 'Data secured',
      'note.locked': 'Sealed. Complete your objective first.',
      'pick.health': '+{n} HEALTH', 'pick.armor': '+{n} ARMOR', 'pick.ammo': 'AMMO RESUPPLY', 'pick.credits': '+{n} CREDITS',
      'pick.weapon': 'ACQUIRED {name}', 'pick.damage': 'DAMAGE BOOST', 'pick.rate': 'RAPID FIRE', 'pick.speed': 'ADRENALINE', 'pick.invuln': 'AEGIS SHIELD',
      'pick.intel': 'ENCRYPTED DATA',
      'prompt.hack': 'Hold [E] to activate terminal', 'prompt.plant': '[E] Plant demolition charge', 'prompt.swap': '[E] Take {name}',
      'prompt.extract': 'Hold position', 'prompt.hacking': 'Uploading',
      'fx.headshot': 'HEADSHOT', 'fx.crit': 'CRIT',
      'enemy.grunt': 'GRUNT', 'enemy.rusher': 'RUSHER', 'enemy.heavy': 'HEAVY', 'enemy.sniper': 'SNIPER', 'enemy.boss': 'THE WARDEN',
      'feed.you': 'YOU', 'feed.barrel': 'BARREL',
      'tab.title': 'MISSION INTEL', 'tab.enemies': 'HOSTILES REMAINING', 'tab.kills': 'KILLS', 'tab.accuracy': 'ACCURACY', 'tab.time': 'MISSION TIME',
      'tab.credits': 'CREDITS COLLECTED', 'tab.objectives': 'OBJECTIVES', 'tab.controls': 'WASD move · Mouse aim · LMB fire · R reload · 1-5 weapons · SPACE dodge · SHIFT sprint · E interact · ESC pause',
      'tip.move': 'WASD to move, SHIFT to sprint', 'tip.shoot': 'Aim with the mouse, LEFT CLICK to fire', 'tip.reload': 'R to reload, 1-5 to switch weapons',
      'tip.dodge': 'SPACE to dodge roll through fire', 'tip.dark': 'The grid is dark. Your flashlight is your edge.',
      'tip.click': 'CLICK TO TAKE CONTROL'
    },
    fa: {
      'game.subtitle': 'عملیات تاکتیکی // خاموشی',
      'menu.play': 'شروع', 'menu.missions': 'مأموریت‌ها', 'menu.loadout': 'تجهیزات', 'menu.upgrades': 'ارتقا',
      'menu.settings': 'تنظیمات', 'menu.credits': 'سازندگان', 'menu.quit': 'خروج', 'menu.update': 'بررسی به‌روزرسانی',
      'update.title': 'بررسی به‌روزرسانی', 'update.checking': 'در حال بررسی نسخه جدید...',
      'update.latest': 'شما از آخرین نسخه ({version}) استفاده می‌کنید.', 'update.available': 'نسخه جدید {version} در دسترس است!',
      'update.downloading': 'در حال دریافت به‌روزرسانی... {percent}٪', 'update.ready': 'به‌روزرسانی با موفقیت دریافت شد!',
      'update.btnDownload': 'دانلود و به‌روزرسانی', 'update.btnRestart': 'راه‌اندازی مجدد و اعمال آپدیت',
      'update.btnWeb': 'صفحه دانلود در گیت‌هاب', 'update.btnCheck': 'بررسی مجدد',
      'update.error': 'خطا در بررسی به‌روزرسانی: {error}',
      'update.manualHint': 'در محیط مرورگر وب هستید. می‌توانید فایل نصب جدید را از گیت‌هاب دریافت کنید.',
      'update.inAppHint': 'به‌روزرسانی به‌صورت خودکار درون بازی دریافت و نصب خواهد شد.',
      'update.restartNotice': 'فایل به‌روزرسانی آماده است. برای اعمال، روی «راه‌اندازی مجدد و اعمال آپدیت» بزنید یا یک‌بار بازی را ببندید و دوباره باز کنید.',
      'update.installing': 'در حال خروج از بازی و اجرای نسخه جدید...',
      'update.currentVer': 'نسخه فعلی', 'update.latestVer': 'آخرین نسخه',
      'menu.next': 'عملیات بعدی: {name}', 'menu.allDone': 'همه عملیات‌ها پاک‌سازی شد // هر مأموریتی را دوباره بازی کن',
      'menu.corrupt': 'فایل ذخیره آسیب دیده بود و به‌صورت امن بازنشانی شد.',
      'common.back': 'بازگشت', 'common.deploy': 'اعزام', 'common.level': 'سطح', 'common.xp': 'تجربه', 'common.credits': 'اعتبار',
      'common.on': 'روشن', 'common.off': 'خاموش', 'common.locked': 'قفل', 'common.cancel': 'انصراف', 'common.confirm': 'تأیید',
      'missions.title': 'عملیات‌ها', 'missions.completed': 'پاک‌سازی شد', 'missions.best': 'بهترین', 'missions.reward': 'پاداش',
      'missions.lockedHint': 'برای باز شدن، عملیات قبلی را تمام کن.',
      'diff.easy': 'آسان', 'diff.medium': 'متوسط', 'diff.hard': 'سخت', 'diff.extreme': 'بسیار سخت',
      'm1.name': 'پاسگاه متروکه', 'm1.desc': 'یک ایستگاه رله مرده در لبه شبکه. مزاحمان را پاک‌سازی کن و خارج شو.',
      'm2.name': 'مجتمع صنعتی', 'm2.desc': 'کوره‌ها، راهروهای فلزی و سوخت انفجاری. سه انبار تدارکات را نابود کن و خارج شو.',
      'm3.name': 'سایت سیاه', 'm3.desc': 'داده‌های طبقه‌بندی‌شده زیر نظر نگهبان است. آن‌ها را بگیر و بعد کارش را تمام کن.',
      'm4.name': 'برج سیگنال', 'm4.desc': 'دو پایانه ارتباطی را فعال کن و تا ارسال کامل سیگنال از برج دفاع کن.',
      'm5.name': 'آخرین نور', 'm5.desc': 'نگهبان خودش را از نو ساخته. رآکتور را نابود کن، کار را تمام کن و خاموشی را پایان بده.',
      'loadout.title': 'تجهیزات', 'loadout.primary': 'سلاح اصلی', 'loadout.secondary': 'سلاح کمری',
      'loadout.equip': 'تجهیز', 'loadout.equipped': 'تجهیز شده', 'loadout.buy': 'باز کردن {cost}', 'loadout.cantAfford': 'اعتبار کافی نیست',
      'stat.damage': 'آسیب', 'stat.fireRate': 'سرعت شلیک', 'stat.accuracy': 'دقت', 'stat.magazine': 'خشاب',
      'stat.reload': 'سرعت خشاب‌گذاری', 'stat.range': 'برد',
      'stat.price': 'قیمت', 'stat.pellets': 'ساچمه', 'stat.burst': 'رگبار',
      'stat.reserve': 'ذخیره', 'stat.spread': 'پخش', 'stat.recoil': 'لگنگیری',
      'stat.maxBloom': 'حداکثر لگنگیری', 'stat.recovery': 'بازیابی لگنگیری',
      'stat.bulletSpeed': 'سرعت گلوله', 'stat.pierce': 'نفوذ',
      'stat.explosive': 'شعاع انفجار', 'stat.shake': 'لرزش دوربین', 'stat.kick': 'ضربه',
      'stat.hitStop': 'توقف ضربه', 'stat.knockback': 'پس‌زدن', 'stat.moveMul': 'سرعت حرکت',
      'stat.tracer': 'رد گلوله', 'stat.tracerWidth': 'ضخامت رد', 'stat.auto': 'تمام‌خودکار',
      'stat.silent': 'خفه‌شده', 'stat.burn': 'سوختن', 'stat.chill': 'یخ‌زدگی',
      'stat.chain': 'زنجیر', 'stat.homing': 'هدایت‌شونده', 'stat.cluster': 'خوشه‌ای',
      'stat.noise': 'شعاع صدا', 'stat.look': 'شکل ظاهری',
      'w.pistol': 'کلت M9', 'w.revolver': 'هَمِر .50', 'w.smg': 'مسلسل دستی وکتور', 'w.ar': 'تفنگ K-17', 'w.burst': 'تفنگ رگباری تریاد',
      'w.shotgun': 'شات‌گان بریچر', 'w.dmr': 'تک‌تیر لانگ‌شات', 'w.lmg': 'تیربار سندان', 'w.sniper': 'تک‌تیرانداز ویدو', 'w.launcher': 'نارنجک‌انداز تامپر',
      'wd.pistol': 'قابل اعتماد، دقیق، همیشه همراه.', 'wd.revolver': 'شش گلوله. هر کدام از هدف رد می‌شود.',
      'wd.smg': 'برای فاصله نزدیک، بی‌امان.', 'wd.ar': 'همه‌کاره. رگبار کنترل‌شده برنده است.',
      'wd.burst': 'رگبار سه‌تایی با گروه‌بندی فشرده.', 'wd.shotgun': 'هشت ساچمه. مخصوص درهای بسته.',
      'wd.dmr': 'دقت نیمه‌خودکار در فاصله دور.', 'wd.lmg': 'نوار صدتایی. کمی کندت می‌کند.',
      'wd.sniper': 'یک شلیک، از دو هدف عبور می‌کند.', 'wd.launcher': 'گلوله انفجاری. مراقب موج انفجار باش.',
      'up.title': 'ارتقا', 'up.maxHp': 'حداکثر سلامتی', 'up.armor': 'زره', 'up.speed': 'تحرک',
      'up.reload': 'دست‌های سریع', 'up.damage': 'گلوله توخالی', 'up.accuracy': 'پایدارساز', 'up.magazine': 'خشاب بزرگ',
      'up.stamina': 'استقامت', 'up.dodge': 'چابکی', 'up.regen': 'بازسازی زیستی',
      'up.lifesteal': 'نفس دوباره', 'up.crit': 'دقت مرگبار', 'up.scavenger': 'غنیمت‌گیر', 'up.cooldown': 'هسته تاکتیکی',
      'upd.maxHp': '+۱۵ سلامتی در هر سطح', 'upd.armor': '+۱۵ زره در هر سطح', 'upd.speed': '+۵٪ سرعت حرکت',
      'upd.reload': '-۸٪ زمان خشاب‌گذاری', 'upd.damage': '+۸٪ آسیب سلاح', 'upd.accuracy': '-۱۰٪ پراکندگی سلاح', 'upd.magazine': '+۱۰٪ ظرفیت خشاب',
      'upd.stamina': '-۱۰٪ مصرف دویدن و +۱۲٪ بازیابی استقامت در هر سطح',
      'upd.dodge': '-۸٪ زمان شارژ غلت و افزایش زمان مصونیت در هر سطح',
      'upd.regen': 'بازیابی خودکار سلامتی پس از ۴ ثانیه بدون آسیب',
      'upd.lifesteal': '+۳ سلامتی به ازای هر نابودی دشمن در هر سطح',
      'upd.crit': '+۲٫۵٪ شانس ضربه مهلک (کریتیکال) در هر سطح',
      'upd.scavenger': '+۸٪ دریافت سکه و اعتبار بیشتر در هر سطح',
      'upd.cooldown': '-۵٪ زمان شارژ مجدد مهارت‌ها در هر سطح',
      'upc.survival': 'بقا', 'upc.mobility': 'تحرک', 'upc.weapons': 'تسلیحات', 'upc.support': 'پشتیبانی',
      'up.new': 'جدید',
      'up.cost': 'هزینه', 'up.maxed': 'حداکثر', 'up.buy': 'ارتقا', 'up.lvl': 'سطح {n}/{max}',
      'set.title': 'تنظیمات', 'set.master': 'صدای کلی', 'set.music': 'صدای موسیقی', 'set.sfx': 'صدای جلوه‌ها',
      'set.sensitivity': 'حساسیت ماوس', 'set.shake': 'لرزش صفحه', 'set.particles': 'کیفیت ذرات',
      'set.low': 'کم', 'set.medium': 'متوسط', 'set.high': 'زیاد', 'set.fullscreen': 'تمام‌صفحه', 'set.fps': 'نمایش فریم',
      'set.language': 'زبان', 'set.reset': 'پاک کردن همه پیشرفت', 'set.resetConfirm': 'همه پیشرفت پاک شود؟ این کار برگشت‌پذیر نیست.',
      'set.resetDone': 'پیشرفت بازنشانی شد.', 'set.fsUnavailable': 'حالت تمام‌صفحه در اینجا در دسترس نیست.',
      'credits.title': 'سازندگان', 'credits.body': 'خاموشی — BLACKOUT\nطراحی، کد، صدا و گرافیک: تولید رویه‌ای\nساخته‌شده با HTML5 Canvas و Web Audio\n\nقلم‌ها (مجوز SIL Open Font)\nوزیرمتن، اثر صابر راستی‌کردار\nKhand از Indian Type Foundry\nChakra Petch از Cadson Demak\n\nساخته‌شده با عشق.',
      'quit.title': 'نشست پایان یافت', 'quit.body': 'اکنون می‌توانی این زبانه را ببندی.', 'quit.return': 'بازگشت به پایگاه',
      'pause.title': 'توقف', 'pause.resume': 'ادامه', 'pause.restart': 'شروع دوباره مأموریت', 'pause.settings': 'تنظیمات', 'pause.quit': 'خروج به منو',
      'res.complete': 'مأموریت انجام شد', 'res.kills': 'حذف‌ها', 'res.accuracy': 'دقت', 'res.headshots': 'شلیک به سر', 'res.time': 'زمان',
      'res.damage': 'آسیب دریافتی', 'res.xp': 'تجربه کسب‌شده', 'res.credits': 'اعتبار کسب‌شده', 'res.rating': 'رتبه',
      'res.next': 'مأموریت بعدی', 'res.upgrades': 'ارتقا', 'res.menu': 'منوی اصلی', 'res.retry': 'تلاش دوباره', 'res.replay': 'بازی دوباره',
      'res.kia': 'کشته در عملیات', 'res.kiaSub': 'نیمی از اعتبار جمع‌شده بازیابی شد.', 'res.victory': 'خاموشی به پایان رسید',
      'hud.hp': 'سلامتی', 'hud.armor': 'زره', 'hud.reloading': 'خشاب‌گذاری', 'hud.empty': 'خالی', 'hud.noAmmo': 'بدون مهمات', 'hud.dodge': 'غلت',
      'hud.objective': 'هدف', 'hud.stamina': 'استقامت', 'hud.fps': 'فریم', 'hud.lowAmmo': 'مهمات کم',
      'obj.eliminate': 'نیروهای متخاصم را حذف کن', 'obj.destroy': 'انبارهای تدارکات را نابود کن', 'obj.destroyCore': 'هسته‌های رآکتور را نابود کن',
      'obj.collect': 'داده‌های رمزگذاری‌شده را بازیابی کن', 'obj.activate': 'پایانه‌های ارتباطی را فعال کن', 'obj.survive': 'از ایستگاه ارسال دفاع کن',
      'obj.boss': 'نگهبان را شکست بده', 'obj.extract': 'به نقطه خروج برس', 'obj.extracting': 'در حال خروج',
      'note.objComplete': 'هدف انجام شد', 'note.newObj': 'هدف جدید', 'note.levelUp': 'ارتقای سطح', 'note.levelUpSub': 'سطح {n} // +{c} اعتبار',
      'note.missionStart': 'عملیات', 'note.bossWarning': 'هشدار', 'note.bossName': 'نگهبان', 'note.bossNameMk2': 'نگهبان نسخه ۲',
      'note.phase': 'مرحله {n}', 'note.neutralized': 'هدف از بین رفت', 'note.extractReady': 'نقطه خروج باز شد',
      'note.waveIncoming': 'دشمنان در راهند', 'note.charge': 'مواد منفجره کار گذاشته شد', 'note.hacked': 'پایانه فعال شد', 'note.intel': 'داده‌ها ایمن شد',
      'note.locked': 'مهروموم شده. اول هدف را انجام بده.',
      'pick.health': '+{n} سلامتی', 'pick.armor': '+{n} زره', 'pick.ammo': 'تدارک مهمات', 'pick.credits': '+{n} اعتبار',
      'pick.weapon': '{name} برداشته شد', 'pick.damage': 'تقویت آسیب', 'pick.rate': 'شلیک سریع', 'pick.speed': 'آدرنالین', 'pick.invuln': 'سپر ایجیس',
      'pick.intel': 'داده رمزگذاری‌شده',
      'prompt.hack': 'برای فعال‌سازی [E] را نگه دار', 'prompt.plant': '[E] کار گذاشتن مواد منفجره', 'prompt.swap': '[E] برداشتن {name}',
      'prompt.extract': 'در موقعیت بمان', 'prompt.hacking': 'در حال بارگذاری',
      'fx.headshot': 'شلیک به سر', 'fx.crit': 'بحرانی',
      'enemy.grunt': 'سرباز', 'enemy.rusher': 'یورشگر', 'enemy.heavy': 'سنگین', 'enemy.sniper': 'تک‌تیرانداز', 'enemy.boss': 'نگهبان',
      'feed.you': 'تو', 'feed.barrel': 'بشکه',
      'tab.title': 'اطلاعات مأموریت', 'tab.enemies': 'دشمنان باقی‌مانده', 'tab.kills': 'حذف‌ها', 'tab.accuracy': 'دقت', 'tab.time': 'زمان مأموریت',
      'tab.credits': 'اعتبار جمع‌شده', 'tab.objectives': 'اهداف', 'tab.controls': 'WASD حرکت · ماوس نشانه‌گیری · کلیک چپ شلیک · R خشاب · ۱ تا ۵ سلاح · SPACE غلت · SHIFT دویدن · E تعامل · ESC توقف',
      'tip.move': 'با WASD حرکت کن و با SHIFT بدو', 'tip.shoot': 'با ماوس نشانه بگیر و با کلیک چپ شلیک کن', 'tip.reload': 'با R خشاب بگذار و با ۱ تا ۵ سلاح عوض کن',
      'tip.dodge': 'با SPACE از میان آتش غلت بزن', 'tip.dark': 'شبکه خاموش است. چراغ‌قوه برتری توست.',
      'tip.click': 'برای کنترل کلیک کن'
    }
  };

  const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

  const I18N = {
    lang: 'en',
    setLang(lang) {
      this.lang = STRINGS[lang] ? lang : 'en';
      if (typeof document !== 'undefined' && document.documentElement) {
        const root = document.documentElement;
        root.lang = this.lang;
        root.dir = this.isRTL() ? 'rtl' : 'ltr';
      }
      if (BO.events && BO.events.emit) BO.events.emit('lang:changed', this.lang);
    },
    extend(lang, table) {
      if (!STRINGS[lang]) STRINGS[lang] = {};
      Object.assign(STRINGS[lang], table);
    },
    isRTL() { return this.lang === 'fa'; },
    /** Translate a key, interpolating {placeholders}. Falls back to English, then to the key. */
    t(key, params) {
      const table = STRINGS[this.lang] || STRINGS.en;
      let s = table[key];
      if (s === undefined) s = STRINGS.en[key];
      if (s === undefined) return key;
      if (params) {
        for (const p in params) s = s.split('{' + p + '}').join(String(params[p]));
      }
      return this.lang === 'fa' ? this.digits(s) : s;
    },
    /** Converts Latin digits to Persian digits when Persian is active. */
    digits(value) {
      const s = String(value);
      if (this.lang !== 'fa') return s;
      let out = '';
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 48 && c <= 57) out += PERSIAN_DIGITS[c - 48];
        else if (s[i] === '%') out += '٪';
        else out += s[i];
      }
      return out;
    },
    num(n) { return this.digits(n); },
    /**
     * Canvas font string. role: 'display' (condensed headings), 'ui' (HUD text).
     * Persian always renders with Vazirmatn.
     */
    font(size, weight, role) {
      const w = weight || 600;
      if (this.lang === 'fa') return w + ' ' + Math.round(size * 0.92) + 'px Vazirmatn, Tahoma, sans-serif';
      if (role === 'display') return w + ' ' + size + 'px Khand, "Chakra Petch", sans-serif';
      return w + ' ' + Math.round(size * 0.9) + 'px "Chakra Petch", Khand, sans-serif';
    }
  };

  BO.I18N = I18N;
  BO.t = (key, params) => I18N.t(key, params);
})(window.BO);
