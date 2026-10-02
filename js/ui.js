/* =========================================================================
 * BLACKOUT :: ui.js  (UIManager)
 * DOM menus (main, missions, loadout, upgrades, settings, credits, pause,
 * results, death) and the canvas-drawn tactical HUD. All text is localised
 * (Persian RTL / English) and rendered with the embedded fonts.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const CFG = BO.CONFIG;
  const I = BO.I18N;
  const ACCENT = '#ff8a1a';
  const HOSTILE = '#ff3355';
  const TECH = '#19c3dd';
  const INK = 'rgba(8,9,18,0.72)';
  const TEXT = '#eef0f6';
  const MUTED = '#9aa0b4';
  const MAX_FEED = 5;
  const MAX_NOTES = 4;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  class UIManager {
    constructor(game) {
      this.game = game;
      this.root = $('#ui');
      this.screens = {};
      $$('.screen', this.root).forEach(el => { this.screens[el.dataset.screen] = el; });
      this.current = null;
      this.pendingMission = null;
      this.loadoutTab = 'primary';
      this.selectedWeapon = null;
      this.settingsReturn = 'menu';
      this.notes = [];
      this.feed = [];
      this.banners = [];
      this.indicators = [];
      this.scheduled = [];
      this.hit = { t: 0, kill: false, head: false };
      this.objectivePulse = 0;
      this.intro = null;
      this.completeBanner = 0;
      this.time = 0;
      this._bind();
      BO.events.on('lang:changed', () => this.applyLanguage());
    }

    /* ============================== DOM ============================== */
    _bind() {
      this.root.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el || el.disabled) return;
        this.game.audio.unlock();
        this.game.audio.uiClick();
        U.safe('ui.action', () => this._action(el.dataset.action, el));
      });
      this.root.addEventListener('mouseover', (e) => {
        const el = e.target.closest('button, .card');
        if (el && el !== this._lastHover) { this._lastHover = el; this.game.audio.uiHover(); }
      });
      this.root.addEventListener('input', (e) => {
        const el = e.target;
        if (!el.dataset.setting) return;
        this.game.save.data.settings[el.dataset.setting] = parseFloat(el.value);
        this._refreshSettingLabels();
        this.game.applySettings();
      });
      this.root.addEventListener('change', (e) => { if (e.target.dataset.setting) this.game.save.save(); });
    }

    _action(action, el) {
      const g = this.game, save = g.save.data;
      switch (action) {
        case 'play': this.pendingMission = BO.MissionSystem.nextMission(save).id; this.showLoadout(); break;
        case 'missions': this.showMissions(); break;
        case 'loadout': this.pendingMission = null; this.showLoadout(); break;
        case 'upgrades': this.showUpgrades(false); break;
        case 'settings': this.settingsReturn = 'menu'; this.showSettings(); break;
        case 'credits': this.show('credits'); break;
        case 'quit': this._quit(); break;
        case 'back': this.showMenu(); break;
        case 'mission': if (BO.MissionSystem.isUnlocked(el.dataset.id, save)) { this.pendingMission = el.dataset.id; this.showLoadout(); } else g.audio.uiDeny(); break;
        case 'deploy': if (this.pendingMission) this._deploy(this.pendingMission); break;
        case 'tab': this.loadoutTab = el.dataset.tab; this.selectedWeapon = save.loadout[this.loadoutTab]; this.renderLoadout(); break;
        case 'weapon': this.selectedWeapon = el.dataset.id; this.renderLoadout(); break;
        case 'equip': this._equip(); break;
        case 'unlock': this._unlockWeapon(); break;
        case 'upgrade': this._buyUpgrade(el.dataset.id); break;
        case 'toggle': this._toggleSetting(el.dataset.key); break;
        case 'particles': save.settings.particles = el.dataset.value; g.applySettings(); g.save.save(); this.renderSettings(); break;
        case 'lang': save.settings.lang = el.dataset.value; I.setLang(el.dataset.value); g.save.save(); break;
        case 'fullscreen': this._toggleFullscreen(); break;
        case 'reset': this._confirm(BO.t('set.resetConfirm'), () => { g.save.reset(); this.toast(BO.t('set.resetDone')); this.renderSettings(); }); break;
        case 'confirm-yes': this._closeConfirm(true); break;
        case 'confirm-no': this._closeConfirm(false); break;
        case 'resume': g.resume(); break;
        case 'restart': this.hidePause(); g.restartMission(); break;
        case 'pause-settings': this.settingsReturn = 'pause'; this.showSettings(); break;
        case 'settings-back': if (this.settingsReturn === 'pause') this.showPause(); else this.showMenu(); break;
        case 'quit-menu': this.hidePause(); g.quitToMenu(); break;
        case 'next': {
          const nxt = BO.MissionSystem.after(this.lastResults && this.lastResults.mission.id);
          this.pendingMission = nxt ? nxt.id : BO.MissionSystem.nextMission(save).id;
          this.showLoadout();
          break;
        }
        case 'results-upgrades': {
          const nxt = BO.MissionSystem.after(this.lastResults && this.lastResults.mission.id);
          this.pendingMission = nxt ? nxt.id : null;
          this.showUpgrades(!!nxt);
          break;
        }
        case 'to-loadout': this.showLoadout(); break;
        case 'retry': this._deploy(this.lastResults.mission.id); break;
        case 'quit-return': this.showMenu(); break;
        default: break;
      }
    }

    show(name) {
      Object.keys(this.screens).forEach(k => this.screens[k].classList.toggle('active', k === name));
      this.current = name;
      this.root.classList.toggle('in-game', !name);
      this.applyLanguage(true);
    }

    hideAll() { this.show(null); }

    applyLanguage(skipRebuild) {
      $$('[data-i18n]').forEach(el => { el.textContent = BO.t(el.dataset.i18n); });
      $$('[data-i18n-lines]').forEach(el => { el.innerHTML = ''; BO.t(el.dataset.i18nLines).split('\n').forEach(line => { const p = document.createElement('p'); p.textContent = line; el.appendChild(p); }); });
      if (skipRebuild) return;
      if (this.current === 'menu') this.renderProfile();
      if (this.current === 'missions') this.renderMissions();
      if (this.current === 'loadout') this.renderLoadout();
      if (this.current === 'upgrades') this.renderUpgrades();
      if (this.current === 'settings') this.renderSettings();
    }

    toast(text) {
      const el = $('#toast');
      el.textContent = text;
      el.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }

    _confirm(text, onYes) {
      $('#confirm-text').textContent = text;
      $('#confirm').classList.add('show');
      this._confirmCb = onYes;
    }

    _closeConfirm(yes) {
      $('#confirm').classList.remove('show');
      if (yes && this._confirmCb) this._confirmCb();
      this._confirmCb = null;
    }

    _deploy(id) {
      this.hideAll();
      this.game.startMission(id);
    }

    _quit() {
      this.game.audio.setMusic('off');
      this.show('quit');
      try { window.close(); } catch (e) { /* browsers only allow closing script-opened tabs */ }
    }

    _toggleFullscreen() {
      const s = this.game.save.data.settings;
      try {
        if (!document.fullscreenElement) {
          const req = document.documentElement.requestFullscreen;
          if (!req) { this.toast(BO.t('set.fsUnavailable')); return; }
          const pr = document.documentElement.requestFullscreen();
          if (pr && pr.catch) pr.catch(() => this.toast(BO.t('set.fsUnavailable')));
        } else document.exitFullscreen();
      } catch (e) { this.toast(BO.t('set.fsUnavailable')); }
      void s;
      setTimeout(() => this.renderSettings(), 250);
    }

    _toggleSetting(key) {
      const s = this.game.save.data.settings;
      s[key] = !s[key];
      this.game.applySettings();
      this.game.save.save();
      this.renderSettings();
    }

    /* ----------------------------- Menu ------------------------------ */
    showMenu() {
      this.show('menu');
      this.game.audio.setMusic('menu');
      this.renderProfile();
    }

    renderProfile() {
      const save = this.game.save.data;
      const need = BO.UpgradeSystem.xpForLevel(save.level);
      $('#profile-level').textContent = I.num(save.level);
      $('#profile-credits').textContent = I.num(save.credits);
      $('#profile-xp').textContent = I.num(save.xp) + ' / ' + I.num(need);
      $('#profile-xpbar').style.width = U.clamp(save.xp / need * 100, 0, 100) + '%';
      const next = BO.MissionSystem.nextMission(save);
      $('#menu-next').textContent = BO.MissionSystem.allCleared(save) ? BO.t('menu.allDone') : BO.t('menu.next', { name: BO.t(next.nameKey) });
      $$('[data-action="lang"]').forEach(b => b.classList.toggle('on', b.dataset.value === I.lang));
    }

    /* --------------------------- Missions ---------------------------- */
    showMissions() { this.show('missions'); this.renderMissions(); }

    renderMissions() {
      const save = this.game.save.data;
      const list = $('#mission-list');
      list.innerHTML = '';
      BO.MISSIONS.forEach((m, i) => {
        const unlocked = BO.MissionSystem.isUnlocked(m.id, save);
        const done = save.completedMissions.indexOf(m.id) >= 0;
        const card = document.createElement('button');
        card.className = 'card mission' + (unlocked ? '' : ' locked') + (done ? ' done' : '');
        card.dataset.action = 'mission';
        card.dataset.id = m.id;
        card.innerHTML = '<span class="m-index"></span><span class="m-body"><span class="m-name"></span><span class="m-desc"></span></span><span class="m-meta"><span class="m-diff"></span><span class="m-reward"></span><span class="m-best"></span></span>';
        $('.m-index', card).textContent = I.num(String(i + 1).padStart(2, '0'));
        $('.m-name', card).textContent = BO.t(m.nameKey);
        $('.m-desc', card).textContent = unlocked ? BO.t(m.descKey) : BO.t('missions.lockedHint');
        $('.m-diff', card).textContent = BO.t('diff.' + m.difficulty);
        $('.m-diff', card).dataset.diff = m.difficulty;
        $('.m-reward', card).textContent = BO.t('missions.reward') + ' ' + I.num(m.rewards.credits);
        $('.m-best', card).textContent = done ? BO.t('missions.completed') + (save.bestRatings[m.id] ? ' · ' + save.bestRatings[m.id] : '') : (unlocked ? '' : BO.t('common.locked'));
        list.appendChild(card);
      });
    }

    /* ---------------------------- Loadout ---------------------------- */
    showLoadout() {
      const save = this.game.save.data;
      this.loadoutTab = 'primary';
      this.selectedWeapon = save.loadout.primary;
      this.show('loadout');
      this.renderLoadout();
    }

    renderLoadout() {
      const save = this.game.save.data;
      $('#loadout-credits').textContent = I.num(save.credits);
      $$('[data-action="tab"]').forEach(b => b.classList.toggle('on', b.dataset.tab === this.loadoutTab));
      const deploy = $('#loadout-deploy');
      deploy.hidden = !this.pendingMission;
      if (this.pendingMission) {
        const m = BO.MissionSystem.byId(this.pendingMission);
        $('#loadout-mission').textContent = m ? BO.t(m.nameKey) : '';
      } else $('#loadout-mission').textContent = '';
      const list = $('#weapon-list');
      list.innerHTML = '';
      const ids = BO.WEAPON_ORDER.filter(id => BO.WEAPONS[id].slot === this.loadoutTab);
      if (ids.indexOf(this.selectedWeapon) < 0) this.selectedWeapon = ids[0];
      ids.forEach(id => {
        const def = BO.WEAPONS[id];
        const owned = save.unlockedWeapons.indexOf(id) >= 0;
        const equipped = save.loadout[this.loadoutTab] === id;
        const card = document.createElement('button');
        card.className = 'card weapon' + (id === this.selectedWeapon ? ' selected' : '') + (owned ? '' : ' locked') + (equipped ? ' equipped' : '');
        card.dataset.action = 'weapon';
        card.dataset.id = id;
        const cv = document.createElement('canvas');
        cv.width = 120; cv.height = 44;
        const c2 = cv.getContext('2d');
        BO.Weapons.drawWeaponIcon(c2, def, 60, 18, 96, owned ? (equipped ? ACCENT : '#c9ccd8') : '#4a4e5c');
        card.appendChild(cv);
        const name = document.createElement('span');
        name.className = 'w-name';
        name.textContent = BO.t('w.' + id);
        card.appendChild(name);
        const tag = document.createElement('span');
        tag.className = 'w-tag';
        tag.textContent = equipped ? BO.t('loadout.equipped') : (owned ? '' : I.num(def.price));
        card.appendChild(tag);
        list.appendChild(card);
      });
      this._renderWeaponDetail();
    }

    _renderWeaponDetail() {
      const save = this.game.save.data;
      const id = this.selectedWeapon;
      const def = BO.WEAPONS[id];
      if (!def) return;
      const st = BO.Weapons.displayStats(def, save.upgrades);
      $('#wd-name').textContent = BO.t('w.' + id);
      $('#wd-desc').textContent = BO.t('wd.' + id);
      const cv = $('#wd-canvas');
      const c2 = cv.getContext('2d');
      c2.clearRect(0, 0, cv.width, cv.height);
      BO.Weapons.drawWeaponIcon(c2, def, cv.width / 2, cv.height / 2 - 6, cv.width * 0.78, ACCENT);
      const raw = st.raw;
      const rows = [
        ['stat.damage', st.damage, I.num(Math.round(raw.damage)) + (def.pellets > 1 ? ' × ' + I.num(def.pellets) : '')],
        ['stat.fireRate', st.fireRate, I.num(def.burst ? (def.fireRate * def.burst).toFixed(1) : def.fireRate) + '/s'],
        ['stat.accuracy', st.accuracy, I.num(Math.round(st.accuracy)) + '%'],
        ['stat.magazine', st.magazine, I.num(raw.mag)],
        ['stat.reload', st.reload, I.num(raw.reload.toFixed(2)) + 's']
      ];
      const box = $('#wd-stats');
      box.innerHTML = '';
      rows.forEach(r => {
        const row = document.createElement('div');
        row.className = 'stat';
        row.innerHTML = '<span class="s-label"></span><span class="s-bar"><i></i></span><span class="s-val"></span>';
        $('.s-label', row).textContent = BO.t(r[0]);
        $('i', row).style.width = U.clamp(r[1], 3, 100) + '%';
        $('.s-val', row).textContent = r[2];
        box.appendChild(row);
      });
      const owned = save.unlockedWeapons.indexOf(id) >= 0;
      const equipped = save.loadout[this.loadoutTab] === id;
      const btn = $('#wd-action');
      btn.classList.toggle('primary', !equipped);
      if (owned) {
        btn.dataset.action = 'equip';
        btn.textContent = equipped ? BO.t('loadout.equipped') : BO.t('loadout.equip');
        btn.disabled = equipped;
      } else {
        btn.dataset.action = 'unlock';
        btn.textContent = BO.t('loadout.buy', { cost: I.num(def.price) });
        btn.disabled = save.credits < def.price;
      }
    }

    _equip() {
      const save = this.game.save.data;
      if (save.unlockedWeapons.indexOf(this.selectedWeapon) < 0) return;
      save.loadout[this.loadoutTab] = this.selectedWeapon;
      this.game.save.save();
      this.renderLoadout();
    }

    _unlockWeapon() {
      const save = this.game.save.data;
      if (BO.UpgradeSystem.unlockWeapon(save, this.selectedWeapon)) {
        save.loadout[this.loadoutTab] = this.selectedWeapon;
        this.game.save.save();
        this.game.audio.pickup('power');
      } else { this.game.audio.uiDeny(); this.toast(BO.t('loadout.cantAfford')); }
      this.renderLoadout();
    }

    /* ---------------------------- Upgrades ---------------------------- */
    showUpgrades(withNext) {
      this.upgradesNext = !!withNext;
      this.show('upgrades');
      this.renderUpgrades();
    }

    renderUpgrades() {
      const save = this.game.save.data;
      const US = BO.UpgradeSystem;
      $('#upgrade-credits').textContent = I.num(save.credits);
      $('#upgrades-next').hidden = !this.upgradesNext;
      const list = $('#upgrade-list');
      list.innerHTML = '';
      US.list.forEach(u => {
        const lvl = US.level(save, u.id);
        const maxed = lvl >= US.maxLevel;
        const cost = US.cost(save, u.id);
        const row = document.createElement('div');
        row.className = 'card upgrade' + (maxed ? ' maxed' : '');
        row.innerHTML = '<span class="u-body"><span class="u-name"></span><span class="u-desc"></span></span><span class="u-pips"></span><button class="u-buy" data-action="upgrade"></button>';
        $('.u-name', row).textContent = BO.t('up.' + u.id);
        $('.u-desc', row).textContent = BO.t('upd.' + u.id);
        const pips = $('.u-pips', row);
        for (let k = 0; k < US.maxLevel; k++) { const i = document.createElement('i'); if (k < lvl) i.className = 'on'; pips.appendChild(i); }
        const b = $('.u-buy', row);
        b.dataset.id = u.id;
        b.textContent = maxed ? BO.t('up.maxed') : BO.t('up.buy') + ' · ' + I.num(cost);
        b.disabled = maxed || save.credits < cost;
        list.appendChild(row);
      });
    }

    _buyUpgrade(id) {
      const save = this.game.save.data;
      if (BO.UpgradeSystem.buy(save, id)) { this.game.save.save(); this.game.audio.pickup('power'); }
      else { this.game.audio.uiDeny(); this.toast(BO.t('loadout.cantAfford')); }
      this.renderUpgrades();
    }

    /* ---------------------------- Settings ---------------------------- */
    showSettings() {
      this.show('settings');
      this.renderSettings();
    }

    renderSettings() {
      const s = this.game.save.data.settings;
      $$('[data-setting]').forEach(el => { el.value = s[el.dataset.setting]; });
      this._refreshSettingLabels();
      $$('[data-action="toggle"]').forEach(b => {
        const on = !!s[b.dataset.key];
        b.classList.toggle('on', on);
        b.textContent = BO.t(on ? 'common.on' : 'common.off');
      });
      const fs = $('[data-action="fullscreen"]');
      const isFs = !!document.fullscreenElement;
      fs.classList.toggle('on', isFs);
      fs.textContent = BO.t(isFs ? 'common.on' : 'common.off');
      $$('[data-action="particles"]').forEach(b => b.classList.toggle('on', b.dataset.value === s.particles));
      $$('[data-action="lang"]').forEach(b => b.classList.toggle('on', b.dataset.value === I.lang));
    }

    _refreshSettingLabels() {
      const s = this.game.save.data.settings;
      $$('[data-setting-label]').forEach(el => {
        const k = el.dataset.settingLabel;
        el.textContent = k === 'sensitivity' ? I.num(s[k].toFixed(2)) + '×' : I.num(Math.round(s[k] * 100)) + '%';
      });
    }

    /* ----------------------------- Pause ------------------------------ */
    showPause() { this.show('pause'); }
    hidePause() { if (this.current === 'pause' || this.current === 'settings') this.hideAll(); }

    /* ---------------------------- Results ----------------------------- */
    showResults(r) {
      this.lastResults = r;
      this.show('results');
      $('#res-title').textContent = r.mission.finale ? BO.t('res.victory') : BO.t('res.complete');
      $('#res-mission').textContent = BO.t(r.mission.nameKey);
      $('#res-rating').textContent = r.rating;
      this._fillStats('#res-stats', r, true);
      const nxt = BO.MissionSystem.after(r.mission.id);
      $('#res-next').hidden = !nxt;
      $('#res-upgrades').hidden = false;
    }

    showDeath(r) {
      this.lastResults = r;
      this.show('death');
      $('#death-mission').textContent = BO.t(r.mission.nameKey);
      this._fillStats('#death-stats', r, false);
    }

    _fillStats(sel, r, full) {
      const rows = [
        ['res.kills', I.num(r.kills)], ['res.accuracy', I.num(r.accuracy) + I.digits('%')], ['res.headshots', I.num(r.headshots)],
        ['res.time', I.num(U.formatTime(r.time))], ['res.damage', I.num(r.damage)], ['res.xp', '+' + I.num(r.xp)], ['res.credits', '+' + I.num(r.credits)]
      ];
      const box = $(sel);
      box.innerHTML = '';
      rows.forEach((row, i) => {
        const el = document.createElement('div');
        el.className = 'res-row';
        el.style.animationDelay = (0.15 + i * 0.08) + 's';
        el.innerHTML = '<span></span><b></b>';
        el.firstChild.textContent = BO.t(row[0]);
        el.lastChild.textContent = row[1];
        box.appendChild(el);
      });
      void full;
    }

    /* ============================ In-game ============================= */
    enterGame(def) {
      this.hideAll();
      this.notes.length = 0; this.feed.length = 0; this.banners.length = 0; this.indicators.length = 0; this.scheduled.length = 0;
      this.completeBanner = 0;
      const idx = BO.MISSIONS.indexOf(def) + 1;
      this.intro = { t: 0, def, idx };
    }

    schedule(delay, fn) { this.scheduled.push({ t: delay, fn }); }

    notify(text, color, life) {
      this.notes.push({ text, color: color || TEXT, t: 0, life: life || 2.5 });
      if (this.notes.length > MAX_NOTES) this.notes.shift();
    }

    killFeed(actor, target, headshot, weaponId) {
      this.feed.unshift({ actor, target, headshot, weaponId, t: 0 });
      if (this.feed.length > MAX_FEED) this.feed.pop();
    }

    banner(title, sub, color, life) { this.banners.push({ title, sub, color: color || ACCENT, t: 0, life: life || 2.6 }); }
    objectiveBanner(title, sub) { this.banner(title, sub, ACCENT, 2.6); }
    objectiveComplete(label) { this.banner(BO.t('note.objComplete'), label, '#3ddc84', 2.2); }
    bossBanner(title, sub, color) { this.banner(title, sub, color || HOSTILE, 3); }
    levelUp(level, credits) { this.banner(BO.t('note.levelUp'), BO.t('note.levelUpSub', { n: level, c: credits }), TECH, 2.6); }
    missionCompleteBanner(finale) { this.completeBanner = 0.0001; this.completeFinale = finale; }
    pulseObjective() { this.objectivePulse = 1; }
    hitmarker(kill, head) { this.hit.t = 0.18; this.hit.kill = kill; this.hit.head = head; if (!kill) this.game.audio.hitmarker(); }
    damageIndicator(angle, amount) { this.indicators.push({ angle, t: 0, life: 1.1, strength: U.clamp(amount / 30, 0.4, 1) }); if (this.indicators.length > 8) this.indicators.shift(); }

    update(dt) {
      this.time += dt;
      for (let i = this.scheduled.length - 1; i >= 0; i--) {
        const s = this.scheduled[i];
        s.t -= dt;
        if (s.t <= 0) { this.scheduled.splice(i, 1); U.safe('ui.schedule', s.fn); }
      }
      const age = (list) => { for (let i = list.length - 1; i >= 0; i--) { list[i].t += dt; if (list[i].t > (list[i].life || 6)) list.splice(i, 1); } };
      age(this.notes); age(this.feed); age(this.indicators);
      if (this.banners.length) { this.banners[0].t += dt; if (this.banners[0].t > this.banners[0].life) this.banners.shift(); }
      this.hit.t = Math.max(0, this.hit.t - dt);
      this.objectivePulse = Math.max(0, this.objectivePulse - dt * 2);
      if (this.intro) { this.intro.t += dt; if (this.intro.t > 4.2) this.intro = null; }
      if (this.completeBanner > 0) this.completeBanner += dt;
    }

    /* ----------------------------- HUD ------------------------------ */
    renderHUD(ctx, game, time) {
      if (!game.player || this.current === 'results' || this.current === 'death') return;
      const w = game.renderer.w, h = game.renderer.h;
      ctx.save();
      ctx.setTransform(game.renderer.dpr, 0, 0, game.renderer.dpr, 0, 0);
      ctx.direction = I.isRTL() ? 'rtl' : 'ltr';
      const p = game.player;
      this._vignette(ctx, p, w, h, time);
      this._damageIndicators(ctx, game, w, h);
      this._markers(ctx, game, w, h, time);
      this._playerPanel(ctx, p, time);
      this._objective(ctx, game, w, time);
      this._bossBar(ctx, game, w);
      this._weaponPanel(ctx, p, w, h, time);
      this._slots(ctx, p, w, h);
      this._prompt(ctx, game, w, h);
      this._feed(ctx, w);
      this._notes(ctx, w, h);
      this._banners(ctx, w, h);
      if (game.state === BO.Game.STATE.PLAYING && !p.dead) this._crosshair(ctx, game, p);
      if (game.input.isDown('Tab') && game.state === BO.Game.STATE.PLAYING) this._tabPanel(ctx, game, w, h);
      if (this.intro && game.state === BO.Game.STATE.PLAYING) this._introCard(ctx, w, h);
      if (game.state === BO.Game.STATE.DEAD) this._deathOverlay(ctx, w, h, game);
      if (this.completeBanner > 0) this._completeOverlay(ctx, w, h);
      if (game.save.data.settings.fps) this._fps(ctx, game, w);
      ctx.restore();
    }

    _text(ctx, str, x, y, size, color, align, weight, role) {
      ctx.font = I.font(size, weight || 600, role || 'ui');
      ctx.fillStyle = color;
      ctx.textAlign = align || 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(str, x, y);
    }

    _panel(ctx, x, y, w, h) {
      ctx.fillStyle = INK;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = ACCENT;
      ctx.fillRect(x, y, 3, h);
    }

    _vignette(ctx, p, w, h, time) {
      const low = p.hp / p.maxHp;
      let a = p.hurtFlash * 2.2;
      if (low < 0.3 && !p.dead) a = Math.max(a, (0.3 - low) * 1.6 * (0.6 + Math.sin(time * 6) * 0.4));
      if (a <= 0.01) return;
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, 'rgba(255,40,60,' + U.clamp(a, 0, 0.7) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    _damageIndicators(ctx, game, w, h) {
      const cam = game.camera, p = game.player;
      const cx = cam.worldToScreenX(p.x), cy = cam.worldToScreenY(p.y);
      ctx.lineCap = 'round';
      for (let i = 0; i < this.indicators.length; i++) {
        const d = this.indicators[i];
        const a = 1 - d.t / d.life;
        ctx.strokeStyle = 'rgba(255,51,85,' + (a * d.strength) + ')';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(cx, cy, 70, d.angle - 0.35, d.angle + 0.35); ctx.stroke();
      }
    }

    _markers(ctx, game, w, h, time) {
      const cam = game.camera, p = game.player;
      const list = game.markers;
      const margin = 46;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        let sx = cam.worldToScreenX(m.x), sy = cam.worldToScreenY(m.y);
        const dist = Math.round(U.dist(p.x, p.y, m.x, m.y) / CFG.TILE);
        const onScreen = sx > margin && sx < w - margin && sy > margin + 70 && sy < h - margin - 70;
        const color = m.isExtraction ? '#3ddc84' : (m.isBoss || m.def && m.def.hp && m.r ? HOSTILE : ACCENT);
        if (onScreen) {
          const bob = Math.sin(time * 4) * 3;
          ctx.save();
          ctx.translate(sx, sy - 40 + bob);
          ctx.rotate(Math.PI / 4);
          ctx.strokeStyle = color; ctx.lineWidth = 2;
          ctx.strokeRect(-6, -6, 12, 12);
          ctx.restore();
          if (dist > 2) this._text(ctx, I.num(dist) + 'm', sx, sy - 62 + bob, 12, color, 'center', 600);
          continue;
        }
        const ang = Math.atan2(sy - h / 2, sx - w / 2);
        const ex = U.clamp(w / 2 + Math.cos(ang) * w, margin, w - margin);
        const ey = U.clamp(h / 2 + Math.sin(ang) * h, margin + 70, h - margin - 70);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-2, 0); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
        ctx.restore();
        this._text(ctx, I.num(dist) + 'm', ex - Math.cos(ang) * 24, ey - Math.sin(ang) * 24, 12, color, 'center', 600);
      }
    }

    _bar(ctx, x, y, w, h, frac, color, segments) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w * U.clamp(frac, 0, 1), h);
      if (segments) {
        ctx.fillStyle = 'rgba(8,9,18,0.8)';
        for (let i = 1; i < segments; i++) ctx.fillRect(x + w * i / segments - 1, y, 2, h);
      }
    }

    _playerPanel(ctx, p, time) {
      const x = 22, y = 22, w = 290;
      this._panel(ctx, x, y, w, 104);
      const save = this.game.save.data;
      this._text(ctx, BO.t('common.level') + ' ' + I.num(save.level), x + 16, y + 17, 13, MUTED, 'left', 600);
      this._text(ctx, 'OPERATOR // ' + I.num(this.game.mission ? BO.MISSIONS.indexOf(this.game.mission) + 1 : 1), x + w - 12, y + 17, 12, MUTED, 'right', 600);
      const hpFrac = p.hp / p.maxHp;
      const hpColor = hpFrac < 0.3 ? (Math.floor(time * 4) % 2 ? HOSTILE : '#ff8095') : '#eef0f6';
      this._text(ctx, BO.t('hud.hp'), x + 16, y + 40, 13, hpColor, 'left', 700);
      this._text(ctx, I.num(Math.ceil(p.hp)), x + w - 12, y + 40, 16, hpColor, 'right', 700, 'display');
      this._bar(ctx, x + 16, y + 52, w - 28, 10, hpFrac, hpFrac < 0.3 ? HOSTILE : ACCENT, Math.round(p.maxHp / 25));
      this._text(ctx, BO.t('hud.armor'), x + 16, y + 74, 12, TECH, 'left', 600);
      this._text(ctx, I.num(Math.ceil(p.armor)), x + w - 12, y + 74, 13, TECH, 'right', 700);
      this._bar(ctx, x + 16, y + 84, w - 28, 5, p.armor / p.maxArmor, TECH, 0);
      this._bar(ctx, x + 16, y + 94, (w - 28) * 0.6, 3, p.stamina / CFG.STAMINA_MAX, '#c9ccd8', 0);
      // Dodge cooldown pill.
      const ready = p.dodgeReady;
      const dx = x + 16 + (w - 28) * 0.64, dw = (w - 28) * 0.36;
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(dx, y + 91, dw, 9);
      ctx.fillStyle = ready >= 1 ? '#3ddc84' : '#556';
      ctx.fillRect(dx, y + 91, dw * ready, 9);
      this._text(ctx, BO.t('hud.dodge'), dx + dw / 2, y + 96, 9, '#0b0c14', 'center', 700);
      // Active power-ups.
      let px = x;
      for (const k in p.powerups) {
        const left = p.powerups[k];
        if (left <= 0) continue;
        const c = BO.PICKUP_TYPES[k].color;
        ctx.fillStyle = INK; ctx.fillRect(px, y + 112, 92, 24);
        ctx.fillStyle = c; ctx.fillRect(px, y + 112, 92 * left / BO.Player.POWERUP_DURATION[k], 2);
        this._text(ctx, BO.t('pick.' + k), px + 46, y + 125, 10, c, 'center', 700);
        px += 98;
      }
    }

    _objective(ctx, game, w, time) {
      const obj = game.objectives;
      if (!obj || !obj.current) return;
      const label = obj.label();
      ctx.font = I.font(17, 600, 'ui');
      const tw = Math.max(260, ctx.measureText(label).width + 60);
      const x = w / 2 - tw / 2, y = 20;
      ctx.fillStyle = INK; ctx.fillRect(x, y, tw, 54);
      ctx.fillStyle = U.rgba(ACCENT, 0.4 + this.objectivePulse * 0.6);
      ctx.fillRect(x, y + 52, tw, 2);
      this._text(ctx, BO.t('hud.objective') + ' ' + I.num(obj.index + 1) + '/' + I.num(obj.stages.length), w / 2, y + 15, 11, ACCENT, 'center', 700);
      this._text(ctx, label, w / 2, y + 36, 17 + this.objectivePulse * 3, TEXT, 'center', 600);
      const s = obj.current;
      if (s.type === 'extract' && s.extractTime > 0) {
        const k = s.extractTime / CFG.EXTRACTION_TIME;
        this._bar(ctx, x + 10, y + 60, tw - 20, 6, k, '#3ddc84', 0);
        this._text(ctx, BO.t('obj.extracting') + ' ' + I.num(Math.round(k * 100)) + I.digits('%'), w / 2, y + 78, 12, '#3ddc84', 'center', 700);
      }
      if (s.type === 'survive') this._bar(ctx, x + 10, y + 60, tw - 20, 4, s.progress / s.duration, HOSTILE, 0);
    }

    _bossBar(ctx, game, w) {
      const b = game.boss;
      if (!b || b.mode === 'dormant' || (b.dead && b.removeTimer <= 0)) return;
      const bw = Math.min(720, w * 0.55), x = w / 2 - bw / 2, y = 96;
      this._text(ctx, BO.t(b.mk2 ? 'note.bossNameMk2' : 'note.bossName'), x, y, 18, HOSTILE, 'left', 700, 'display');
      this._text(ctx, BO.t('note.phase', { n: b.phase }), x + bw, y, 13, MUTED, 'right', 600);
      ctx.fillStyle = INK; ctx.fillRect(x - 3, y + 12, bw + 6, 18);
      const frac = b.hp / b.maxHp;
      ctx.fillStyle = b.invulnerable ? '#7fe3ff' : HOSTILE;
      ctx.fillRect(x, y + 15, bw * frac, 12);
      ctx.fillStyle = 'rgba(8,9,18,0.9)';
      ctx.fillRect(x + bw * 0.33 - 1, y + 13, 3, 16);
      ctx.fillRect(x + bw * 0.66 - 1, y + 13, 3, 16);
    }

    _weaponPanel(ctx, p, w, h, time) {
      const wpn = p.weapon;
      const pw = 300, x = w - pw - 22, y = h - 118;
      ctx.fillStyle = INK; ctx.fillRect(x, y, pw, 96);
      ctx.fillStyle = ACCENT; ctx.fillRect(x + pw - 3, y, 3, 96);
      this._text(ctx, BO.t('w.' + wpn.def.id), x + pw - 16, y + 18, 15, TEXT, 'right', 700, 'display');
      BO.Weapons.drawWeaponIcon(ctx, wpn.def, x + 70, y + 26, 90, U.rgba('#c9ccd8', 0.8));
      const low = wpn.mag <= Math.ceil(wpn.stats.mag * 0.25);
      ctx.font = I.font(44, 700, 'display');
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = wpn.mag === 0 ? HOSTILE : (low ? '#ffd34d' : TEXT);
      const magStr = I.num(wpn.mag);
      const resStr = ' / ' + I.num(wpn.reserve);
      ctx.font = I.font(18, 600, 'ui');
      const resW = ctx.measureText(resStr).width;
      ctx.fillStyle = MUTED;
      ctx.direction = 'ltr';
      ctx.fillText(resStr, x + pw - 16, y + 76);
      ctx.font = I.font(44, 700, 'display');
      ctx.fillStyle = wpn.mag === 0 ? HOSTILE : (low ? '#ffd34d' : TEXT);
      ctx.fillText(magStr, x + pw - 16 - resW, y + 78);
      ctx.direction = I.isRTL() ? 'rtl' : 'ltr';
      // Magazine pips.
      const pips = Math.min(wpn.stats.mag, 40);
      const pipW = Math.min(6, 180 / pips);
      for (let i = 0; i < pips; i++) {
        const filled = i < Math.round(wpn.mag / wpn.stats.mag * pips);
        ctx.fillStyle = filled ? U.rgba(ACCENT, 0.9) : 'rgba(255,255,255,0.1)';
        ctx.fillRect(x + 16 + i * (pipW + 1), y + 84, pipW, 4);
      }
      if (wpn.reloading) {
        this._text(ctx, BO.t('hud.reloading'), x + 16, y + 60, 12, ACCENT, 'left', 700);
        this._bar(ctx, x + 16, y + 68, 110, 4, wpn.reloadProgress, ACCENT, 0);
      } else if (wpn.mag === 0 && wpn.reserve === 0) this._text(ctx, BO.t('hud.noAmmo'), x + 16, y + 62, 12, HOSTILE, 'left', 700);
      else if (low) this._text(ctx, BO.t('hud.lowAmmo'), x + 16, y + 62, 12, '#ffd34d', 'left', 700);
    }

    _slots(ctx, p, w, h) {
      const sw = 74, gap = 8, total = sw * 5 + gap * 4;
      const x0 = w / 2 - total / 2, y = h - 64;
      for (let i = 0; i < 5; i++) {
        const x = x0 + i * (sw + gap);
        const wp = p.slots[i];
        const cur = i === p.current;
        ctx.fillStyle = cur ? 'rgba(255,138,26,0.18)' : INK;
        ctx.fillRect(x, y, sw, 44);
        ctx.strokeStyle = cur ? ACCENT : 'rgba(255,255,255,0.08)';
        ctx.lineWidth = cur ? 2 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, sw - 1, 43);
        this._text(ctx, I.num(i + 1), x + 9, y + 10, 11, cur ? ACCENT : MUTED, 'center', 700);
        if (wp) {
          BO.Weapons.drawWeaponIcon(ctx, wp.def, x + sw / 2 + 6, y + 17, 46, cur ? TEXT : '#7a7f92');
          ctx.direction = 'ltr';
          this._text(ctx, I.num(wp.mag) + '·' + I.num(wp.reserve), x + sw / 2, y + 37, 10, wp.outOfAmmo ? HOSTILE : MUTED, 'center', 600);
          ctx.direction = I.isRTL() ? 'rtl' : 'ltr';
        }
      }
    }

    _prompt(ctx, game, w, h) {
      const it = game.interactable;
      if (!it || game.state !== BO.Game.STATE.PLAYING) return;
      let text = '';
      if (it.kind === 'hack') text = it.target.progress > 0 ? BO.t('prompt.hacking') + ' ' + I.num(Math.round(it.target.progress * 100)) + I.digits('%') : BO.t('prompt.hack');
      else if (it.kind === 'plant') text = BO.t('prompt.plant');
      else if (it.kind === 'swap') text = BO.t('prompt.swap', { name: BO.t('w.' + it.target.weaponId) });
      ctx.font = I.font(16, 600, 'ui');
      const tw = ctx.measureText(text).width + 40;
      const y = h - 120;
      ctx.fillStyle = INK; ctx.fillRect(w / 2 - tw / 2, y - 18, tw, 36);
      ctx.fillStyle = TECH; ctx.fillRect(w / 2 - tw / 2, y + 16, tw * (it.kind === 'hack' ? it.target.progress : 1), 2);
      this._text(ctx, text, w / 2, y, 16, TEXT, 'center', 600);
    }

    _feed(ctx, w) {
      let y = 28;
      for (let i = 0; i < this.feed.length; i++) {
        const f = this.feed[i];
        const a = U.clamp(6 - f.t, 0, 1);
        ctx.globalAlpha = a;
        const str = f.actor + '  ›  ' + f.target + (f.headshot ? '  ◎' : '');
        ctx.font = I.font(13, 600, 'ui');
        const tw = ctx.measureText(str).width + 24;
        ctx.fillStyle = INK; ctx.fillRect(w - 22 - tw, y - 12, tw, 24);
        this._text(ctx, str, w - 34, y, 13, f.headshot ? ACCENT : TEXT, 'right', 600);
        y += 28;
      }
      ctx.globalAlpha = 1;
    }

    _notes(ctx, w, h) {
      let y = h * 0.66;
      for (let i = this.notes.length - 1; i >= 0; i--) {
        const n = this.notes[i];
        const a = U.clamp(Math.min(n.t * 6, (n.life - n.t) * 2), 0, 1);
        ctx.globalAlpha = a;
        const rise = (1 - Math.min(1, n.t * 5)) * 10;
        this._text(ctx, n.text, w / 2, y + rise, 16, n.color, 'center', 700);
        y -= 26;
      }
      ctx.globalAlpha = 1;
    }

    _banners(ctx, w, h) {
      const b = this.banners[0];
      if (!b) return;
      const inT = U.clamp(b.t / 0.3, 0, 1), outT = U.clamp((b.life - b.t) / 0.4, 0, 1);
      const a = Math.min(inT, outT);
      const y = h * 0.3;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(5,6,14,0.6)';
      const bw = 520 * U.easeOutCubic(inT);
      ctx.fillRect(w / 2 - bw / 2, y - 38, bw, 84);
      ctx.fillStyle = b.color;
      ctx.fillRect(w / 2 - bw / 2, y - 38, bw, 2);
      ctx.fillRect(w / 2 - bw / 2, y + 44, bw, 2);
      this._text(ctx, b.title, w / 2, y - 10, 30 + (1 - inT) * 12, b.color, 'center', 700, 'display');
      if (b.sub) this._text(ctx, b.sub, w / 2, y + 24, 16, TEXT, 'center', 600);
      ctx.globalAlpha = 1;
    }

    _crosshair(ctx, game, p) {
      const x = game.input.cursorX, y = game.input.cursorY;
      const w = p.weapon;
      const spread = w.currentSpread(0) + Math.sqrt(p.vx * p.vx + p.vy * p.vy) / CFG.PLAYER_BASE_SPEED * 0.03;
      const dist = U.dist(p.x, p.y, p.aimX, p.aimY) * game.camera.zoom;
      const gap = U.clamp(4 + Math.tan(spread) * dist, 4, 70);
      ctx.strokeStyle = 'rgba(5,6,14,0.8)';
      ctx.lineWidth = 4;
      this._crossLines(ctx, x, y, gap);
      ctx.strokeStyle = p.powerups.damage > 0 ? '#ff7a4d' : TEXT;
      ctx.lineWidth = 2;
      this._crossLines(ctx, x, y, gap);
      ctx.fillStyle = ACCENT;
      ctx.fillRect(x - 1, y - 1, 2, 2);
      if (w.reloading) {
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, gap + 14, -Math.PI / 2, -Math.PI / 2 + U.TAU * w.reloadProgress); ctx.stroke();
      }
      if (this.hit.t > 0) {
        const k = this.hit.t / 0.18;
        const s = 7 + (1 - k) * 4;
        ctx.strokeStyle = this.hit.kill ? HOSTILE : (this.hit.head ? ACCENT : '#ffffff');
        ctx.globalAlpha = k;
        ctx.lineWidth = this.hit.kill ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(x - s - 6, y - s - 6); ctx.lineTo(x - s, y - s);
        ctx.moveTo(x + s + 6, y - s - 6); ctx.lineTo(x + s, y - s);
        ctx.moveTo(x - s - 6, y + s + 6); ctx.lineTo(x - s, y + s);
        ctx.moveTo(x + s + 6, y + s + 6); ctx.lineTo(x + s, y + s);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    _crossLines(ctx, x, y, gap) {
      const len = 9;
      ctx.beginPath();
      ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y);
      ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
      ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap);
      ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len);
      ctx.stroke();
    }

    _tabPanel(ctx, game, w, h) {
      const pw = Math.min(560, w - 40), ph = 360, x = w / 2 - pw / 2, y = h / 2 - ph / 2;
      ctx.fillStyle = 'rgba(5,6,14,0.9)'; ctx.fillRect(x, y, pw, ph);
      ctx.fillStyle = ACCENT; ctx.fillRect(x, y, pw, 3);
      const rtl = I.isRTL();
      const L = rtl ? x + pw - 24 : x + 24, R = rtl ? x + 24 : x + pw - 24;
      const la = rtl ? 'right' : 'left', ra = rtl ? 'left' : 'right';
      this._text(ctx, BO.t('tab.title'), L, y + 30, 22, ACCENT, la, 700, 'display');
      this._text(ctx, BO.t(game.mission.nameKey), R, y + 30, 15, MUTED, ra, 600);
      const s = game.stats;
      const alive = game.enemies.filter(e => !e.dead).length;
      const rows = [
        ['tab.enemies', I.num(alive)], ['tab.kills', I.num(s.kills)],
        ['tab.accuracy', I.num(s.shots ? Math.round(s.hits / s.shots * 100) : 0) + I.digits('%')],
        ['tab.time', I.num(U.formatTime(game.time))], ['tab.credits', I.num(s.credits)]
      ];
      rows.forEach((r, i) => {
        this._text(ctx, BO.t(r[0]), L, y + 70 + i * 26, 14, MUTED, la, 600);
        this._text(ctx, r[1], R, y + 70 + i * 26, 15, TEXT, ra, 700);
      });
      this._text(ctx, BO.t('tab.objectives'), L, y + 210, 13, ACCENT, la, 700);
      game.objectives.stages.forEach((st, i) => {
        const cur = i === game.objectives.index;
        const col = st.done ? '#3ddc84' : (cur ? TEXT : '#5c6072');
        this._text(ctx, (st.done ? '✓ ' : (cur ? '› ' : '· ')) + game.objectives.label(st), L, y + 234 + i * 22, 14, col, la, 600);
      });
      this._text(ctx, BO.t('tab.controls'), w / 2, y + ph - 18, 11, '#6b7084', 'center', 600);
    }

    _introCard(ctx, w, h) {
      const it = this.intro;
      const a = U.clamp(Math.min(it.t / 0.5, (4.2 - it.t) / 0.8), 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(5,6,14,0.55)';
      ctx.fillRect(0, h * 0.36, w, 150);
      const slide = (1 - U.easeOutCubic(U.clamp(it.t / 0.8, 0, 1))) * 60;
      this._text(ctx, BO.t('note.missionStart') + ' ' + I.num(String(it.idx).padStart(2, '0')) + ' // ' + BO.t('diff.' + it.def.difficulty), w / 2, h * 0.36 + 32, 14, ACCENT, 'center', 700);
      this._text(ctx, BO.t(it.def.nameKey), w / 2 + slide, h * 0.36 + 76, 56, TEXT, 'center', 700, 'display');
      this._text(ctx, BO.t(it.def.descKey), w / 2, h * 0.36 + 122, 15, MUTED, 'center', 500);
      if (it.t > 1 && !this.game.input.locked && it.t < 4) this._text(ctx, BO.t('tip.click'), w / 2, h * 0.36 + 176, 12, '#6b7084', 'center', 600);
      ctx.globalAlpha = 1;
    }

    _deathOverlay(ctx, w, h, game) {
      const t = game.player.deathTimer;
      const a = U.clamp(t / 1.2, 0, 1);
      ctx.fillStyle = 'rgba(20,4,8,' + (a * 0.65) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = a;
      this._text(ctx, BO.t('res.kia'), w / 2, h / 2, 64 + (1 - a) * 30, HOSTILE, 'center', 700, 'display');
      ctx.globalAlpha = 1;
    }

    _completeOverlay(ctx, w, h) {
      const t = this.completeBanner;
      const a = U.clamp(t / 0.5, 0, 1);
      ctx.fillStyle = 'rgba(5,6,14,' + a * 0.5 + ')';
      ctx.fillRect(0, 0, w, h);
      const k = U.easeOutBack(U.clamp(t / 0.7, 0, 1));
      ctx.globalAlpha = a;
      ctx.fillStyle = ACCENT;
      ctx.fillRect(w / 2 - 300 * k, h / 2 - 52, 600 * k, 3);
      ctx.fillRect(w / 2 - 300 * k, h / 2 + 52, 600 * k, 3);
      this._text(ctx, BO.t(this.completeFinale ? 'res.victory' : 'res.complete'), w / 2, h / 2, 54 * Math.max(0.6, k), TEXT, 'center', 700, 'display');
      ctx.globalAlpha = 1;
    }

    _fps(ctx, game, w) {
      ctx.direction = 'ltr';
      this._text(ctx, BO.t('hud.fps') + ' ' + I.num(game.fps), w - 22, 12, 11, game.fps < 50 ? '#ffd34d' : '#3ddc84', 'right', 600);
    }

    /** Menu backdrop treatment drawn on canvas behind the DOM menu. */
    renderMenuOverlay(ctx, t) {
      const r = this.game.renderer, w = r.w, h = r.h;
      ctx.save();
      ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
      const g = ctx.createLinearGradient(0, 0, w, 0);
      const rtl = I.isRTL();
      g.addColorStop(rtl ? 1 : 0, 'rgba(4,5,10,0.92)');
      g.addColorStop(0.55, 'rgba(4,5,10,0.45)');
      g.addColorStop(rtl ? 0 : 1, 'rgba(4,5,10,0.15)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      const off = (t * 30) % 4;
      for (let y = off; y < h; y += 4) ctx.fillRect(0, y, w, 1);
      if (this.game.save.data.settings.fps) this._fps(ctx, this.game, w);
      ctx.restore();
    }
  }

  BO.UIManager = UIManager;
})(window.BO);
