/* =========================================================================
 * BLACKOUT :: profiles.js (v5)
 * Local multi-account support: several players can keep separate progress
 * (XP, credits, unlocks, settings) on the same PC / browser. Everything is
 * stored in localStorage. Profile 'p0' keeps the legacy save key so existing
 * saves migrate automatically. Must load before main.js.
 * ========================================================================= */
'use strict';
(function (BO) {
  const S = BO.SaveSystem;
  if (!S || !S.storage) return;
  const st = S.storage;
  const REG_KEY = 'blackout.profiles.v1';
  const MAX_PROFILES = 8;
  const COLORS = ['#ff8a1a', '#19c3dd', '#3ddc84', '#ff3355', '#ffd34d', '#b07cff', '#ff7ac8', '#9aa0b4'];
  const cleanName = (n, fb) => { const s = String(n == null ? '' : n).replace(/[<>]/g, '').trim().slice(0, 18); return s || fb; };
  const keyOf = id => (id === 'p0' ? S.LEGACY_KEY : S.LEGACY_KEY + '.p.' + id);
  function loadReg() { try { const r = JSON.parse(st.get(REG_KEY) || 'null'); if (r && Array.isArray(r.list) && r.list.length) { r.list = r.list.filter(p => p && typeof p.id === 'string' && /^p[0-9a-z]+$/.test(p.id)).slice(0, MAX_PROFILES).map((p, i) => ({ id: p.id, name: cleanName(p.name, 'Agent ' + (i + 1)), color: COLORS.indexOf(p.color) >= 0 ? p.color : COLORS[i % COLORS.length], created: +p.created || Date.now() })); if (r.list.length) return { active: r.active, list: r.list }; } } catch (e) {} return { active: 'p0', list: [{ id: 'p0', name: 'Agent 1', color: COLORS[0], created: Date.now() }] }; }
  const reg = loadReg();
  if (!reg.list.some(p => p.id === reg.active)) reg.active = reg.list[0].id;
  const persist = () => st.set(REG_KEY, JSON.stringify(reg)); persist(); S.setKey(keyOf(reg.active));
  const Profiles = { list() { return reg.list.slice(); }, active() { return reg.list.find(p => p.id === reg.active) || reg.list[0]; }, keyOf, summary(id) { const d = S.peek(keyOf(id)); return { level: d.level, credits: d.credits, missions: d.completedMissions.length }; }, create(name) { if (reg.list.length >= MAX_PROFILES) return null; let id; do { id = 'p' + Math.random().toString(36).slice(2, 8); } while (reg.list.some(p => p.id === id)); const p = { id, name: cleanName(name, 'Agent ' + (reg.list.length + 1)), color: COLORS[reg.list.length % COLORS.length], created: Date.now() }; reg.list.push(p); const d = S.defaults(); if (S.data && S.data.settings) d.settings.lang = S.data.settings.lang; S.write(keyOf(id), d); persist(); return p; }, rename(id, name) { const p = reg.list.find(x => x.id === id); if (p) { p.name = cleanName(name, p.name); persist(); } return p; }, remove(id) { if (id === reg.active || reg.list.length <= 1) return false; const i = reg.list.findIndex(p => p.id === id); if (i < 0) return false; reg.list.splice(i, 1); st.remove(keyOf(id)); persist(); return true; }, switchTo(id) { if (!reg.list.some(p => p.id === id) || id === reg.active) return; try { if (BO.game && BO.game.state === 'menu') S.save(); } catch (e) {} reg.active = id; persist(); window.location.reload(); } };
  BO.Profiles = Profiles;
  BO.I18N.extend('en', { 'prof.title': 'PROFILES', 'prof.switch': 'SWITCH', 'prof.new': '+ NEW PROFILE', 'prof.play': 'PLAY AS', 'prof.active': 'ACTIVE', 'prof.rename': 'RENAME', 'prof.delete': 'DELETE', 'prof.close': 'CLOSE', 'prof.namePrompt': 'Profile name:', 'prof.confirmDelete': 'Delete this profile and all its progress?', 'prof.full': 'Profile limit reached', 'prof.lvl': 'LVL', 'prof.ops': 'OPS' });
  BO.I18N.extend('fa', { 'prof.title': 'پروفایل‌ها', 'prof.switch': 'تعویض', 'prof.new': '+ پروفایل جدید', 'prof.play': 'PLAY AS', 'prof.active': 'فعال', 'prof.rename': 'RENAME', 'prof.delete': 'DELETE', 'prof.close': 'بستن', 'prof.namePrompt': 'نام پروفایل:', 'prof.confirmDelete': 'این پروفایل و همه پیشرفتش حذف شود؟', 'prof.full': 'به سقف تعداد پروفایل رسیدی', 'prof.lvl': 'سطح', 'prof.ops': 'مأموریت' });
  const CSS = '.p-switch{display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--line);font-size:14px;color:var(--text);pointer-events:auto}.p-switch i{width:10px;height:10px;border-radius:50%;display:inline-block}.p-switch:hover{border-color:var(--blaze)}#profiles-ov{position:fixed;inset:0;z-index:20;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.7);pointer-events:auto}#profiles-ov.show{display:flex}#profiles-ov .pbox{width:min(520px,94vw);max-height:86vh;overflow:auto;background:var(--ink-3);border-top:3px solid var(--blaze);padding:22px}#profiles-ov h2{margin:0 0 14px;font-family:var(--display);font-size:34px}#profiles-ov .prow{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);margin-bottom:6px;flex-wrap:wrap}#profiles-ov .prow.on{border-color:var(--blaze);background:rgba(255,138,26,.07)}#profiles-ov .pname{flex:1;min-width:120px;font-weight:700}#profiles-ov .pmeta{color:var(--muted);font-size:13px}#profiles-ov .prow button{padding:6px 10px;font-size:13px;border:1px solid var(--line)}#profiles-ov .prow button:hover{border-color:var(--blaze);color:var(--blaze)}#profiles-ov .pfoot{display:flex;justify-content:space-between;gap:8px;margin-top:12px}';
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const t = k => BO.t(k), num = n => (BO.I18N.num ? BO.I18N.num(n) : String(n));
  function renderList(ov) { const box = ov.querySelector('.pbox'); box.textContent = ''; box.appendChild(el('h2', null, t('prof.title'))); reg.list.forEach(p => { const on = p.id === reg.active, row = el('div', 'prow' + (on ? ' on' : '')), dot = el('i'); dot.style.cssText = 'width:12px;height:12px;border-radius:50%;background:' + p.color; row.appendChild(dot); row.appendChild(el('span', 'pname', p.name)); const s = Profiles.summary(p.id); row.appendChild(el('span', 'pmeta', t('prof.lvl') + ' ' + num(s.level) + ' · ' + num(s.credits) + ' · ' + t('prof.ops') + ' ' + num(s.missions))); if (on) row.appendChild(el('span', 'pmeta', t('prof.active'))); else { const b = el('button', null, t('prof.play')); b.onclick = () => Profiles.switchTo(p.id); row.appendChild(b); } const rn = el('button', null, t('prof.rename')); rn.onclick = () => { const n = window.prompt(t('prof.namePrompt'), p.name); if (n != null) { Profiles.rename(p.id, n); renderList(ov); refreshChip(); } }; row.appendChild(rn); if (!on) { const del = el('button', null, t('prof.delete')); del.onclick = () => { if (window.confirm(t('prof.confirmDelete'))) { Profiles.remove(p.id); renderList(ov); } }; row.appendChild(del); } box.appendChild(row); }); const foot = el('div', 'pfoot'), add = el('button', 'btn primary', t('prof.new')); add.disabled = reg.list.length >= MAX_PROFILES; add.onclick = () => { const n = window.prompt(t('prof.namePrompt'), 'Agent ' + (reg.list.length + 1)); if (n == null) return; const p = Profiles.create(n); if (!p) { if (BO.game && BO.game.ui) BO.game.ui.toast(t('prof.full')); return; } renderList(ov); }; const close = el('button', 'btn', t('prof.close')); close.onclick = () => ov.classList.remove('show'); foot.appendChild(add); foot.appendChild(close); box.appendChild(foot); }
  let chip = null; function refreshChip() { if (!chip) return; const p = Profiles.active(); chip.textContent = ''; const dot = el('i'); dot.style.background = p.color; chip.appendChild(dot); chip.appendChild(el('span', null, p.name)); chip.title = t('prof.switch'); }
  function mount() { const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style); const ov = el('div'); ov.id = 'profiles-ov'; ov.appendChild(el('div', 'pbox')); ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('show'); }); document.body.appendChild(ov); const footer = document.querySelector('[data-screen="menu"] .profile'); if (footer) { chip = el('button', 'p-switch'); chip.onclick = () => { renderList(ov); ov.classList.add('show'); }; footer.insertBefore(chip, footer.firstChild); refreshChip(); } window.addEventListener('keydown', e => { if (e.code === 'Escape' && ov.classList.contains('show')) ov.classList.remove('show'); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})(window.BO);

/* =========================================================================
 * BLACKOUT :: ASCENDANT LAB EXPANSION
 * Ten new endgame bosses. This is intentionally attached after the profile
 * module because boss-lab.html loads profiles after lab-bosses.js.
 * ========================================================================= */
(function (BO) {
  'use strict';
  const LB = BO && BO.LabBosses;
  if (!LB || !LB.ROSTER || !LB.LabBoss) return;
  const R = LB.ROSTER, SIG = LB.SIG, P = LB.LabBoss.prototype;
  const NEW = {
    x1:{tier:11,form:'chronarch',title:'CHRONARCH ZERO',epithet:'The Clock Without Hands',fa:'کرونارک صفر: زمان را می‌شکند و حمله‌ها را از گذشته برمی‌گرداند.',r:48,pal:{glow:'#58f0ff',orb:'#b8ffff'},sigs:['timewell','rewind'],pools:[null,['timewell','snipe','spiral'],['rewind','cross','timewell'],['rewind','nova','blink','timewell'],['rewind','cataclysm','nova','timewell']]},
    x2:{tier:12,form:'mycelium',title:'MYCELIAL EMPRESS',epithet:'The Blooming Hunger',fa:'امپراتریس قارچی: هاگ پخش می‌کند و میدان را به یک موجود زنده تبدیل می‌کند.',r:50,pal:{glow:'#c86bff',orb:'#f0b8ff'},sigs:['spore','bloom'],pools:[null,['spore','mines','fan'],['bloom','spore','stream'],['bloom','nova','phantoms','spore'],['cataclysm','bloom','spore','summon']]},
    x3:{tier:13,form:'mirror',title:'MIRROR TYRANT',epithet:'The Reversed Aim',fa:'استبداد آینه‌ای: گلوله‌ها را برمی‌گرداند و سایه‌ی معکوس تو را شکار می‌کند.',r:46,pal:{glow:'#ff6bd6',orb:'#ffd0f2'},sigs:['reflect','echo'],pools:[null,['reflect','cross','fan'],['echo','reflect','snipe'],['echo','blink','nova','reflect'],['cataclysm','echo','reflect','summon']]},
    x4:{tier:14,form:'gravemind',title:'GRAVEMIND ATLAS',epithet:'The Weight of Worlds',fa:'اطلس ذهن‌گور: جاذبه را وارونه می‌کند و مسیر فرار را می‌بلعد.',r:54,pal:{glow:'#8b9cff',orb:'#c5ccff'},sigs:['gravity','rift'],pools:[null,['gravity','mortar','fan'],['rift','gravity','spiral'],['rift','cross','nova','gravity'],['cataclysm','rift','gravity','summon']]},
    x5:{tier:15,form:'necroforge',title:'NECROFORGE COLOSSUS',epithet:'The Engine That Remembers',fa:'کلوسوس نکروافورج: زره‌اش از بقایای باس‌های قبلی ساخته شده است.',r:56,pal:{glow:'#ff8b42',orb:'#ffd08a'},sigs:['scrap','overheat'],pools:[null,['scrap','charge','mines'],['overheat','scrap','mortar'],['overheat','nova','charge','scrap'],['cataclysm','overheat','scrap','summon']]},
    x6:{tier:16,form:'seraph',title:'SERAPH OF NULL',epithet:'The Six-Winged Silence',fa:'سراف نیستی: بال‌هایش فضا را می‌برند و سکوتش HUD را کور می‌کند.',r:49,pal:{glow:'#fff2a6',orb:'#ffffff'},sigs:['wings','silence'],pools:[null,['wings','snipe','stream'],['silence','wings','cross'],['silence','blink','nova','wings'],['cataclysm','silence','wings','summon']]},
    x7:{tier:17,form:'leviathan',title:'LEVIATHAN PROTOCOL',epithet:'The Corridor Eater',fa:'پروتکل لویاتان: دیوارهای زنده می‌سازد و راهروها را می‌بلعد.',r:58,pal:{glow:'#31d7c2',orb:'#8affee'},sigs:['maelstrom','wall'],pools:[null,['maelstrom','charge','fan'],['wall','maelstrom','mines'],['wall','nova','cross','maelstrom'],['cataclysm','wall','maelstrom','summon']]},
    x8:{tier:18,form:'dreadnova',title:'DREADNOVA PRIME',epithet:'The Star That Hunts',fa:'دردنووا پرایم: ستاره‌ای متحرک که هر شلیک را به ضدحمله تبدیل می‌کند.',r:52,pal:{glow:'#ff416c',orb:'#ffb0bd'},sigs:['flare','retaliate'],pools:[null,['flare','snipe','fan'],['retaliate','flare','spiral'],['retaliate','nova','blink','flare'],['cataclysm','retaliate','flare','summon']]},
    x9:{tier:19,form:'paradox',title:'PARADOX REGENT',epithet:'The Answer Before the Question',fa:'نایب‌السلطنه پارادوکس: آینده را پیش‌بینی می‌کند و زمان‌بندی‌ها را جابه‌جا می‌کند.',r:51,pal:{glow:'#d8ff52',orb:'#eeff9b'},sigs:['paradox','split'],pools:[null,['paradox','stream','cross'],['split','paradox','snipe'],['split','blink','nova','paradox'],['cataclysm','split','paradox','summon']]},
    x10:{tier:20,form:'blackstar',title:'BLACKSTAR OMEGA',epithet:'The Last Light',fa:'بلک‌استار امگا: آخرین نور؛ چهار فاز، بدون بخش امن، بدون بخشش.',r:62,pal:{glow:'#ff315f',orb:'#ffe2ea'},sigs:['eclipse','annihilate'],pools:[null,['eclipse','snipe','spiral'],['annihilate','cross','mines'],['annihilate','nova','blink','eclipse'],['cataclysm','annihilate','eclipse','summon']]}
  };
  Object.keys(NEW).forEach(k => { R[k] = NEW[k]; });
  const oldCreate = LB.create;
  LB.create = function (key, x, y, arena) {
    const b = oldCreate.call(this, key, x, y, arena);
    const d = R[key];
    if (!b || !d || d.tier < 11) return b;
    const k = d.tier - 10;
    b.labS = { hp: 1.98 + k * 0.17, dmg: 1.52 + k * 0.065, cd: Math.max(0.52, 0.76 - k * 0.018), shot: 1.48 + k * 0.045, move: 1.34 + k * 0.035, tele: Math.max(0.58, 0.78 - k * 0.012), vent: Math.max(0.44, 0.66 - k * 0.018), sig: 1.75 + k * 0.07 };
    b.maxHp = Math.round(6500 * b.labS.hp); b.hp = b.maxHp; b.lab.form = d.form; b.lab.tier = d.tier; b.r = d.r; b.def.r = d.r; b.ascendant = true; b.v11.name = d.form; b.v11.tier = d.tier; b.v11.pools = d.pools.map(p => p && p.slice()); b.v11.cooldown = [0,0.95,0.8,0.68,0.55]; b.v11.vent = Math.max(1.2, 2.5 - k * 0.05); b.v11.chain = [0,2,2,2,3]; return b;
  };
  const oldPhase = P._checkPhase;
  P._checkPhase = function (game) { if (!this.ascendant) return oldPhase.call(this, game); const f = this.hp / this.maxHp, target = f <= 0.18 ? 4 : (f <= 0.42 ? 3 : (f <= 0.68 ? 2 : 1)); if (target <= this.phase) return; this.phase = target; this.mode = 'transition'; this.modeTime = 0; this.attack = null; if (game.onBossPhase) game.onBossPhase(this, target); };
  const oldMove = P._updateMovement;
  P._updateMovement = function (dt, game, p) { if (!this.ascendant || this.phase < 4) return oldMove.call(this, dt, game, p); const phase = this.phase; this.phase = 3; oldMove.call(this, dt, game, p); this.phase = phase; };
  function strike(b, game, p, n, color, spread) { for (let i=0;i<n;i++) { const a=Math.random()*Math.PI*2, d=80+Math.random()*spread, x=p.x+Math.cos(a)*d, y=p.y+Math.sin(a)*d; if (game.hazards && game.hazards.addStrike) game.hazards.addStrike(x,y,58,0.55+i*0.08,24*b.labS.dmg); } if (game.onBossFired) game.onBossFired(b,true); }
  function orbBurst(b, game, n, speed, dmg, color) { for(let i=0;i<n;i++) b._orb(game,i/n*Math.PI*2+b.ringSpin,speed,dmg,color); if(game.onBossFired) game.onBossFired(b,true); }
  const addSig = (name, tele, begin, run) => { SIG[name] = { tele, begin, run }; };
  addSig('timewell',0.65,(b,a,g,p)=>{a.n=3;a.timer=0;},(b,a,dt,g,p)=>{a.timer-=dt;if(a.timer<=0){a.timer=.32;orbBurst(b,g,10+b.phase*3,360,16,b.lab.pal.orb);if(++a.shots>=a.n)b._endAttack();}});
  addSig('rewind',0.7,(b,a)=>{a.timer=0;},(b,a,dt,g)=>{a.timer-=dt;if(a.timer<=0){a.timer=.5;strike(b,g,g.player,2+b.phase,b.lab.pal.glow,280);if(++a.shots>=3)b._endAttack();}});
  addSig('spore',0.5,(b,a,g,p)=>{a.timer=0;},(b,a,dt,g,p)=>{a.timer-=dt;if(a.timer<=0){a.timer=.28;strike(b,g,p,2+b.phase,b.lab.pal.glow,240);if(++a.shots>=4)b._endAttack();}});
  addSig('bloom',0.8,(b,a)=>{a.timer=0;},(b,a,dt,g)=>{a.timer-=dt;if(a.timer<=0){a.timer=.55;b._labRing(g,330+b.phase*20,22);if(++a.shots>=3)b._endAttack();}});
  addSig('reflect',0.6,(b,a)=>{a.timer=1.5;},(b,a,dt,g)=>{a.timer-=dt;orbBurst(b,g,8+b.phase*2,410,18,b.lab.pal.orb);if(a.t>0.55)b._endAttack();});
  addSig('echo',0.65,(b,a,g,p)=>{strike(b,g,p,3+b.phase,b.lab.pal.glow,320);},(b,a)=>{if(a.t>0.45)b._endAttack();});
  addSig('gravity',0.6,(b,a)=>{a.timer=0;},(b,a,dt,g,p)=>{a.timer-=dt;if(p&&!p.dead){const dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy)||1;p.x+=dx/d*80*dt;p.y+=dy/d*80*dt;}if(a.t>1.8)b._endAttack();});
  addSig('rift',0.7,(b,a,g,p)=>{strike(b,g,p,4+b.phase,b.lab.pal.glow,420);},(b,a)=>{if(a.t>0.5)b._endAttack();});
  addSig('scrap',0.55,(b,a,g,p)=>{strike(b,g,p,3+b.phase,b.lab.pal.glow,300);},(b,a)=>{if(a.t>0.45)b._endAttack();});
  addSig('overheat',0.7,(b,a)=>{a.timer=0;},(b,a,dt,g)=>{a.timer-=dt;if(a.timer<=0){a.timer=.25;orbBurst(b,g,12+b.phase*3,500,20,b.lab.pal.orb);if(++a.shots>=5)b._endAttack();}});
  addSig('wings',0.5,(b,a)=>{a.timer=0;},(b,a,dt,g)=>{a.timer-=dt;if(a.timer<=0){a.timer=.35;orbBurst(b,g,6+b.phase*2,460,17,b.lab.pal.orb);if(++a.shots>=4)b._endAttack();}});
  addSig('silence',0.8,(b,a,g,p)=>{strike(b,g,p,4+b.phase,b.lab.pal.glow,380);},(b,a)=>{if(a.t>0.55)b._endAttack();});
  addSig('maelstrom',0.55,(b,a)=>{a.timer=0;},(b,a,dt,g)=>{a.timer-=dt;if(a.timer<=0){a.timer=.22;orbBurst(b,g,10+b.phase*2,320,15,b.lab.pal.orb);if(++a.shots>=7)b._endAttack();}});
  addSig('wall',0.75,(b,a,g,p)=>{strike(b,g,p,5+b.phase,b.lab.pal.glow,500);},(b,a)=>{if(a.t>0.6)b._endAttack();});
  addSig('flare',0.5,(b,a)=>{a.timer=0;},(b,a,dt,g)=>{a.timer-=dt;if(a.timer<=0){a.timer=.3;orbBurst(b,g,14+b.phase*2,390,18,b.lab.pal.orb);if(++a.shots>=4)b._endAttack();}});
  addSig('retaliate',0.65,(b,a,g,p)=>{strike(b,g,p,4+b.phase,b.lab.pal.glow,360);},(b,a)=>{if(a.t>0.5)b._endAttack();});
  addSig('paradox',0.6,(b,a,g,p)=>{strike(b,g,p,3+b.phase,b.lab.pal.glow,280);},(b,a)=>{if(a.t>0.45)b._endAttack();});
  addSig('split',0.7,(b,a)=>{a.timer=0;},(b,a,dt,g)=>{a.timer-=dt;if(a.timer<=0){a.timer=.3;orbBurst(b,g,8+b.phase*3,430,17,b.lab.pal.orb);if(++a.shots>=5)b._endAttack();}});
  addSig('eclipse',0.8,(b,a,g,p)=>{strike(b,g,p,6+b.phase,b.lab.pal.glow,520);},(b,a)=>{if(a.t>0.65)b._endAttack();});
  addSig('annihilate',0.9,(b,a)=>{a.timer=0;},(b,a,dt,g)=>{a.timer-=dt;if(a.timer<=0){a.timer=.2;orbBurst(b,g,18+b.phase*4,560,23,b.lab.pal.orb);if(++a.shots>=6)b._endAttack();}});
  addSig('cataclysm',1.0,(b,a)=>{a.timer=0;},(b,a,dt,g)=>{a.timer-=dt;if(a.timer<=0){a.timer=.35;strike(b,g,g.player,4+b.phase,b.lab.pal.glow,520);orbBurst(b,g,12+b.phase*2,470,21,b.lab.pal.orb);if(++a.shots>=4)b._endAttack();}});
  const oldDraw = P.draw, oldOverlay = P.drawOverlay;
  P.draw = function(ctx,time){ oldDraw.call(this,ctx,time); if(!this.ascendant||this.dead)return; const c=this.lab.pal.glow; ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.ringSpin*.3);ctx.strokeStyle=c;ctx.globalAlpha=.65;ctx.lineWidth=2;for(let i=0;i<this.phase+1;i++){ctx.beginPath();ctx.arc(0,0,this.r+12+i*9,i*.7,this.ringSpin+i*.7+2.2);ctx.stroke();}ctx.restore(); };
  P.drawOverlay = function(ctx,time,game){ oldOverlay.call(this,ctx,time,game); if(!this.ascendant||this.dead)return;ctx.save();ctx.strokeStyle=this.lab.pal.glow;ctx.globalAlpha=.5;ctx.setLineDash([8,8]);ctx.beginPath();ctx.arc(this.x,this.y,this.r+20+this.phase*7,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.restore(); };
  const oldDescribe = LB.describe; LB.describe = function(key){const d=R[key];if(d&&d.tier>=11)return {key,tier:d.tier,title:d.title,epithet:d.epithet,fa:d.fa,color:d.pal.glow,phases:4,signatures:d.sigs.concat(['cataclysm'])};return oldDescribe.call(this,key);};
  const sel=document.getElementById('sel-variant'); if(sel) Object.keys(NEW).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=NEW[k].title+' // 4 PHASE ASCENDANT';sel.appendChild(o);});
  BO.AscendantLab = { roster: NEW, phases: 4, version: 'v14.0.0' };
})(window.BO);
