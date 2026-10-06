/* =========================================================================
 * BLACKOUT :: Skills System (js/v9-skills.js)
 * Tactical Abilities & Skill Progression.
 * Featuring:
 *  - Slow Motion (Bullet Time) skill activated by [C]
 *  - 10-level logical balanced upgrade progression
 *  - World speed: 0.5x, Player speed: 0.8x
 *  - Clean cybernetic UI with interactive level gauge & stat comparisons
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U, S = BO.SaveSystem, I = BO.I18N, G = BO.Game.prototype, P = BO.Player.prototype, UI = BO.UIManager.prototype;
  if (!U || !S || !G || !P || !UI) return;

  const MAX_LEVEL = 10;
  const LEVELS = [
    null, // 1-indexed (Level 1 to 10)
    { level: 1,  duration: 2.50, cooldown: 18.0, worldSpeed: 0.50, playerSpeed: 0.80, costCredits: 0,    costPoints: 0 },
    { level: 2,  duration: 2.75, cooldown: 17.0, worldSpeed: 0.50, playerSpeed: 0.80, costCredits: 400,  costPoints: 1 },
    { level: 3,  duration: 3.00, cooldown: 16.0, worldSpeed: 0.50, playerSpeed: 0.80, costCredits: 650,  costPoints: 1 },
    { level: 4,  duration: 3.25, cooldown: 15.0, worldSpeed: 0.50, playerSpeed: 0.81, costCredits: 950,  costPoints: 1 },
    { level: 5,  duration: 3.50, cooldown: 14.0, worldSpeed: 0.50, playerSpeed: 0.81, costCredits: 1350, costPoints: 1 },
    { level: 6,  duration: 3.75, cooldown: 13.0, worldSpeed: 0.50, playerSpeed: 0.82, costCredits: 1850, costPoints: 1 },
    { level: 7,  duration: 4.00, cooldown: 12.0, worldSpeed: 0.50, playerSpeed: 0.82, costCredits: 2450, costPoints: 1 },
    { level: 8,  duration: 4.25, cooldown: 11.0, worldSpeed: 0.50, playerSpeed: 0.83, costCredits: 3150, costPoints: 1 },
    { level: 9,  duration: 4.50, cooldown: 10.0, worldSpeed: 0.50, playerSpeed: 0.83, costCredits: 4000, costPoints: 1 },
    { level: 10, duration: 5.00, cooldown: 9.0,  worldSpeed: 0.50, playerSpeed: 0.84, costCredits: 5000, costPoints: 1 }
  ];

  // Upgrades list extensions (kept for upgrades screen compatibility)
  const NEW = [
    ['stamina', 240, 'mobility'],
    ['dodge', 320, 'mobility'],
    ['regen', 380, 'survival'],
    ['lifesteal', 340, 'survival'],
    ['crit', 420, 'weapons'],
    ['scavenger', 300, 'support'],
    ['cooldown', 400, 'support']
  ];
  NEW.forEach(x => {
    if (!BO.UpgradeSystem.list.some(y => y.id === x[0])) {
      BO.UpgradeSystem.list.push({ id: x[0], base: x[1], icon: x[0] });
    }
    if (BO.UPGRADE_IDS && BO.UPGRADE_IDS.indexOf(x[0]) < 0) {
      BO.UPGRADE_IDS.push(x[0]);
    }
  });

  const up = id => (S.data.upgrades && S.data.upgrades[id]) || 0;
  const raw = () => {
    try {
      return JSON.parse((S.storage ? S.storage.get(S.key) : localStorage.getItem(S.key)) || 'null');
    } catch (e) {
      return null;
    }
  };

  const oldLoad = S.load;
  S.load = function () {
    const d = oldLoad.apply(this, arguments);
    const r = raw();
    if (r && r.skills && typeof r.skills === 'object') {
      d.skills = {
        slowmo: U.clamp(Math.floor(r.skills.slowmo || 1), 1, MAX_LEVEL),
        spentPoints: U.clamp(Math.floor(r.skills.spentPoints || 0), 0, MAX_LEVEL - 1)
      };
    } else if (r && r.v9 && typeof r.v9 === 'object') {
      const oldSpent = Object.values(r.v9.r || {}).reduce((a, b) => a + (+b || 0), 0);
      const lvl = U.clamp(1 + Math.min(MAX_LEVEL - 1, oldSpent), 1, MAX_LEVEL);
      d.skills = { slowmo: lvl, spentPoints: lvl - 1 };
    } else {
      d.skills = { slowmo: 1, spentPoints: 0 };
    }
    NEW.forEach(x => {
      d.upgrades[x[0]] = U.isFiniteNumber(r?.upgrades?.[x[0]]) ? U.clamp(Math.floor(r.upgrades[x[0]]), 0, 5) : 0;
    });
    return d;
  };

  /* Runtime Skill System */
  const SkillSystem = {
    MAX_LEVEL,
    LEVELS,
    state: {
      active: false,
      durationTimer: 0,
      cooldownTimer: 0,
      maxDuration: 2.5,
      maxCooldown: 18.0
    },

    getLevel(s = S.data) {
      return (s.skills && s.skills.slowmo) || 1;
    },

    getStats(lvl) {
      const l = U.clamp(lvl !== undefined ? lvl : this.getLevel(), 1, MAX_LEVEL);
      return LEVELS[l];
    },

    points(s = S.data) {
      const spent = (s.skills && s.skills.spentPoints !== undefined) ? s.skills.spentPoints : (this.getLevel(s) - 1);
      return Math.max(0, (s.level || 1) - 1 - spent);
    },

    canUpgrade(s = S.data) {
      const cur = this.getLevel(s);
      if (cur >= MAX_LEVEL) return false;
      const next = LEVELS[cur + 1];
      if (!next) return false;
      return this.points(s) > 0 || (s.credits || 0) >= next.costCredits;
    },

    upgrade(s = S.data) {
      if (!this.canUpgrade(s)) return false;
      const cur = this.getLevel(s);
      const next = LEVELS[cur + 1];
      if (!s.skills) s.skills = { slowmo: 1, spentPoints: 0 };

      if (this.points(s) > 0) {
        s.skills.spentPoints = (s.skills.spentPoints || 0) + 1;
      } else if (s.credits >= next.costCredits) {
        s.credits -= next.costCredits;
      } else {
        return false;
      }

      s.skills.slowmo = cur + 1;
      S.save();
      return true;
    },

    respec(s = S.data) {
      if (!s.skills) s.skills = { slowmo: 1, spentPoints: 0 };
      s.skills.slowmo = 1;
      s.skills.spentPoints = 0;
      S.save();
      return true;
    },

    isActive(game) {
      return !!(this.state.active && game && game.state === BO.Game.STATE.PLAYING);
    },

    trigger(game) {
      if (!game || !game.player || game.player.dead || game.state !== BO.Game.STATE.PLAYING) return false;
      if (this.state.active) return false;
      if (this.state.cooldownTimer > 0) {
        game.ui.notify(BO.t('sk.slowmoCd', { s: Math.ceil(this.state.cooldownTimer) }), '#ff8095', 1.2);
        return false;
      }

      const stats = this.getStats();
      this.state.active = true;
      this.state.durationTimer = stats.duration;
      this.state.maxDuration = stats.duration;
      this.state.cooldownTimer = stats.cooldown;
      this.state.maxCooldown = stats.cooldown;

      this._playAudio(game.audio, true);
      game.ui.notify(BO.t('sk.slowmoActive'), '#00e5ff', 1.4);
      return true;
    },

    update(game, realDt) {
      if (this.state.cooldownTimer > 0) {
        this.state.cooldownTimer = Math.max(0, this.state.cooldownTimer - realDt);
      }
      if (this.state.active) {
        this.state.durationTimer -= realDt;
        if (this.state.durationTimer <= 0) {
          this.state.active = false;
          this.state.durationTimer = 0;
          this._playAudio(game?.audio, false);
          if (game && game.ui) {
            game.ui.notify(BO.t('sk.slowmoEnded'), '#9aa0b4', 1.0);
          }
        }
      }
    },

    onKill(game) {
      if (!this.state.active) return;
      const lvl = this.getLevel();
      if (lvl >= 7) {
        this.state.cooldownTimer = Math.max(0, this.state.cooldownTimer - 0.5);
      }
      if (lvl >= 10) {
        const stats = this.getStats(lvl);
        this.state.durationTimer = Math.min(stats.duration, this.state.durationTimer + 0.25);
        this.state.cooldownTimer = Math.max(0, this.state.cooldownTimer - 0.5);
      }
    },

    _playAudio(audio, activate) {
      if (!audio || !audio.ctx) return;
      try {
        const ctx = audio.ctx;
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const vol = (audio.volumes && audio.volumes.sfx !== undefined ? audio.volumes.sfx : 0.85);

        if (activate) {
          const filter = ctx.createBiquadFilter();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(360, now);
          osc.frequency.exponentialRampToValueAtTime(90, now + 0.28);
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(800, now);
          filter.frequency.exponentialRampToValueAtTime(160, now + 0.28);
          gain.gain.setValueAtTime(0.32 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.33);
        } else {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(110, now);
          osc.frequency.exponentialRampToValueAtTime(380, now + 0.18);
          gain.gain.setValueAtTime(0.22 * vol, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.21);
        }
      } catch (e) {}
    },

    renderHUD(ctx, game, time) {
      const w = game.renderer.w, h = game.renderer.h;
      const st = this.state;
      const isRTL = I.isRTL();

      // Screen-space Time Dilation Cyan Vignette when Slow-Mo is active
      if (st.active) {
        ctx.save();
        ctx.setTransform(game.renderer.dpr, 0, 0, game.renderer.dpr, 0, 0);
        const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.hypot(w, h) * 0.54);
        const pulse = 0.16 + Math.sin(time * 6) * 0.05;
        grad.addColorStop(0, 'rgba(0, 220, 255, 0)');
        grad.addColorStop(0.68, 'rgba(0, 200, 255, 0.05)');
        grad.addColorStop(1, 'rgba(0, 229, 255, ' + pulse + ')');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // HUD Status Pill widget (positioned neatly below stamina/dodge at x=22, y=148)
      ctx.save();
      ctx.setTransform(game.renderer.dpr, 0, 0, game.renderer.dpr, 0, 0);
      ctx.direction = isRTL ? 'rtl' : 'ltr';

      const px = 22, py = 148, pw = 186, ph = 30;
      const isReady = st.cooldownTimer <= 0 && !st.active;
      const activeColor = '#00e5ff';
      const readyColor = '#3ddc84';
      const cdColor = 'rgba(255, 255, 255, 0.14)';

      // Pill Background
      ctx.fillStyle = 'rgba(9, 12, 22, 0.9)';
      ctx.fillRect(px, py, pw, ph);

      // Inner Progress Fill
      if (st.active) {
        const frac = U.clamp(st.durationTimer / st.maxDuration, 0, 1);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.28)';
        ctx.fillRect(px, py, pw * frac, ph);
      } else if (!isReady) {
        const frac = U.clamp(1 - (st.cooldownTimer / st.maxCooldown), 0, 1);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fillRect(px, py, pw * frac, ph);
      } else {
        ctx.fillStyle = 'rgba(61, 220, 132, 0.15)';
        ctx.fillRect(px, py, pw, ph);
      }

      // Pill Border
      ctx.lineWidth = st.active ? 2 : 1;
      ctx.strokeStyle = st.active ? activeColor : (isReady ? (0.6 + Math.sin(time * 5) * 0.4 > 0.6 ? activeColor : readyColor) : cdColor);
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

      // Label & Value
      ctx.font = I.font(11, 700, 'ui');
      ctx.textBaseline = 'middle';

      const label = BO.t('sk.keyHint');
      const val = st.active
        ? I.num(st.durationTimer.toFixed(1)) + BO.t('sk.sec')
        : (isReady ? BO.t('sk.ready') : I.num(st.cooldownTimer.toFixed(1)) + BO.t('sk.sec'));

      if (isRTL) {
        ctx.textAlign = 'right';
        ctx.fillStyle = st.active ? activeColor : (isReady ? readyColor : '#9aa0b4');
        ctx.fillText(label, px + pw - 10, py + ph / 2);

        ctx.textAlign = 'left';
        ctx.fillStyle = st.active ? '#ffffff' : (isReady ? '#ffffff' : '#ff8095');
        ctx.fillText(val, px + 10, py + ph / 2);
      } else {
        ctx.textAlign = 'left';
        ctx.fillStyle = st.active ? activeColor : (isReady ? readyColor : '#9aa0b4');
        ctx.fillText(label, px + 10, py + ph / 2);

        ctx.textAlign = 'right';
        ctx.fillStyle = st.active ? '#ffffff' : (isReady ? '#ffffff' : '#ff8095');
        ctx.fillText(val, px + pw - 10, py + ph / 2);
      }

      ctx.restore();
    }
  };

  BO.Skills = SkillSystem;

  /* Engine Hooks */
  const origGameUpdate = G._update;
  G._update = function (realDt) {
    if (this.state === BO.Game.STATE.PLAYING && this.player && !this.player.dead) {
      if (this.input && this.input.wasPressed('KeyC')) {
        SkillSystem.trigger(this);
      }
    }

    SkillSystem.update(this, realDt);

    if (SkillSystem.isActive(this)) {
      // Slow motion active: pass 0.5x speed to game update for world elements
      origGameUpdate.call(this, realDt * 0.5);
    } else {
      origGameUpdate.call(this, realDt);
    }
  };

  const origPlayerUpdate = P.update;
  P.update = function (dt, input, game) {
    if (SkillSystem.isActive(game)) {
      const stats = SkillSystem.getStats();
      // Since dt was scaled to 0.5 * realDt, player receives: dt * (playerSpeed / 0.5) = realDt * playerSpeed
      const playerDt = dt * (stats.playerSpeed / 0.5);

      // Level 3+ Reflex Stance: +10% reload speed during slow-mo
      if (stats.level >= 3 && this.weapon && this.weapon.reloading) {
        this.weapon.reloadTimer = Math.max(0, this.weapon.reloadTimer - playerDt * 0.1);
      }

      return origPlayerUpdate.call(this, playerDt, input, game);
    }
    return origPlayerUpdate.call(this, dt, input, game);
  };

  const omove = P._updateMovement, ododge = P._startDodge;
  P._updateMovement = function (dt, i, g) {
    const l = up('stamina'), a = BO.CONFIG.STAMINA_DRAIN, b = BO.CONFIG.STAMINA_REGEN;
    let drain = a * (l ? (1 - 0.1 * l) : 1);
    let regen = b * (l ? (1 + 0.12 * l) : 1);

    // Level 5+ Adrenaline Surge: Sprinting consumes 25% less stamina during slow motion
    if (SkillSystem.isActive(g) && SkillSystem.getLevel() >= 5) {
      drain *= 0.75;
    }

    BO.CONFIG.STAMINA_DRAIN = drain;
    BO.CONFIG.STAMINA_REGEN = regen;
    try {
      return omove.apply(this, arguments);
    } finally {
      BO.CONFIG.STAMINA_DRAIN = a;
      BO.CONFIG.STAMINA_REGEN = b;
    }
  };

  P._startDodge = function () {
    const r = ododge.apply(this, arguments), l = up('dodge');
    if (l) {
      this.dodgeCooldown *= (1 - 0.08 * l);
      this.iframes += (0.03 * l);
    }
    return r;
  };

  if (BO.ProjectileSystem) {
    const sp = BO.ProjectileSystem.prototype.spawn;
    BO.ProjectileSystem.prototype.spawn = function (x) {
      if (x && x.owner === 0) {
        x.critChance = (x.critChance || 0) + 0.025 * up('crit');
      }
      return sp.apply(this, arguments);
    };

    const origStep = BO.ProjectileSystem.prototype._step;
    BO.ProjectileSystem.prototype._step = function (p, dt, game) {
      // Player projectiles fly at 0.8x during Slow-Mo (dt * (0.8 / 0.5)), while enemy projectiles fly at 0.5x
      if (SkillSystem.isActive(game) && p.owner === 0) {
        const stats = SkillSystem.getStats();
        const playerBulletDt = dt * (stats.playerSpeed / 0.5);
        return origStep.call(this, p, playerBulletDt, game);
      }
      return origStep.call(this, p, dt, game);
    };
  }

  const start = G.startMission;
  G.startMission = function () {
    const ok = start.apply(this, arguments);
    if (ok) {
      SkillSystem.state.active = false;
      SkillSystem.state.durationTimer = 0;
      SkillSystem.state.cooldownTimer = 0;
    }
    return ok;
  };

  const kill = G.onEnemyKilled;
  G.onEnemyKilled = function (e, info) {
    const r = kill.apply(this, arguments);
    SkillSystem.onKill(this);
    if (this.player && info?.source !== 'hazard' && info?.source !== 'enemy') {
      const h = 3 * up('lifesteal');
      if (h) this.player.heal(h);
    }
    return r;
  };

  const cred = G.addCredits;
  G.addCredits = function (n) {
    return cred.call(this, up('scavenger') ? Math.round(n * (1 + 0.08 * up('scavenger'))) : n);
  };

  const oldHUD = UI.renderHUD;
  UI.renderHUD = function (ctx, game, time) {
    oldHUD.call(this, ctx, game, time);
    if (!game || !game.player || game.player.dead || this.current === 'results' || this.current === 'death') return;
    SkillSystem.renderHUD(ctx, game, time);
  };

  /* UI & Styles Injection */
  if (typeof document === 'undefined') return;
  const $ = (q, r) => (r || document).querySelector(q);
  const F = h => {
    const t = document.createElement('template');
    t.innerHTML = h.trim();
    return t.content.firstChild;
  };

  const css = document.createElement('style');
  css.textContent = `
    .v9torch {
      position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(420px circle at var(--mx,70%) var(--my,40%), rgba(255,170,90,.12), transparent 70%);
    }
    .v9d {
      position: absolute; top: 50%; inset-inline-end: 4vw; transform: translateY(-50%);
      width: min(360px, 32vw); padding: 20px; background: rgba(10,12,22,.86);
      border-top: 3px solid var(--blaze); z-index: 2;
    }
    .v9d h3 { margin: 0 0 14px; color: var(--muted); letter-spacing: .16em; font-size: 12px; }
    .v9d .v9ring {
      font: 700 56px var(--display); color: var(--tech); border: 6px solid rgba(25,195,221,.3);
      border-radius: 50%; width: 100px; height: 100px; display: flex; align-items: center;
      justify-content: center; float: left; margin-right: 14px;
    }
    html[dir="rtl"] .v9d .v9ring { float: right; margin-right: 0; margin-left: 14px; }
    .v9d b { font-size: 20px; }
    .v9d .v9stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 18px; clear: both; }
    .v9d .v9stats div { padding: 8px; background: rgba(255,255,255,.04); color: var(--muted); font-size: 11px; }
    .v9d .v9stats b { display: block; color: var(--text); font-size: 19px; }
    .v9d .v9next { margin-top: 12px; padding: 12px; border: 1px solid rgba(255,138,26,.35); color: var(--blaze); }
    .v9d .v9next b { display: block; font: 700 25px var(--display); color: var(--text); }
    .v9d .v9tip { margin: 12px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }

    /* New Modern Skills Screen */
    .v9skills {
      width: min(1040px, 94vw);
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }
    .skills-head-meta {
      display: flex;
      gap: 20px;
      font-size: 14px;
      align-items: center;
    }
    .skills-head-meta span {
      background: rgba(255, 255, 255, 0.05);
      padding: 6px 14px;
      border-radius: 4px;
      border: 1px solid var(--line);
    }
    .skills-head-meta b {
      color: var(--tech);
      font-size: 18px;
    }
    .v9skills-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px 28px 20px;
      overflow-y: auto;
    }

    /* Slow Motion Hero Card */
    .skill-card-hero {
      background: linear-gradient(135deg, rgba(16, 22, 38, 0.94), rgba(8, 10, 18, 0.98));
      border: 1px solid rgba(0, 229, 255, 0.3);
      border-radius: 12px;
      padding: 24px 28px;
      position: relative;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }
    .skill-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
    }
    .skill-title-group {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .skill-icon-dial {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      border: 2px solid var(--tech);
      background: radial-gradient(circle, rgba(0, 229, 255, 0.2) 0%, rgba(9, 12, 22, 0.8) 75%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      color: var(--tech);
      box-shadow: 0 0 18px rgba(0, 229, 255, 0.35);
      animation: dialPulse 3.5s infinite ease-in-out;
    }
    @keyframes dialPulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 14px rgba(0, 229, 255, 0.25); }
      50% { transform: scale(1.04); box-shadow: 0 0 24px rgba(0, 229, 255, 0.5); }
    }
    .skill-title-group h3 {
      margin: 0;
      font-size: 26px;
      font-family: var(--display);
      color: #ffffff;
      letter-spacing: 0.04em;
    }
    .skill-badge-key {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      background: rgba(0, 229, 255, 0.16);
      color: var(--tech);
      padding: 3px 10px;
      border-radius: 4px;
      border: 1px solid rgba(0, 229, 255, 0.4);
      margin-inline-start: 10px;
      vertical-align: middle;
    }
    .skill-level-pill {
      font-family: var(--display);
      font-size: 20px;
      font-weight: 700;
      color: var(--tech);
      background: rgba(0, 229, 255, 0.1);
      padding: 6px 18px;
      border-radius: 20px;
      border: 1px solid rgba(0, 229, 255, 0.3);
    }
    .skill-desc-text {
      color: #c9ccd8;
      font-size: 15px;
      line-height: 1.6;
      margin: 0 0 18px;
    }

    /* 10-Segment Level Progress Bar */
    .skill-gauge {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 6px;
      margin-bottom: 22px;
    }
    .gauge-segment {
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--muted);
      transition: all .25s var(--ease);
    }
    .gauge-segment.done {
      background: linear-gradient(180deg, #00e5ff, #0098b8);
      color: #070912;
      border-color: #00e5ff;
      box-shadow: 0 0 10px rgba(0, 229, 255, 0.35);
    }
    .gauge-segment.next {
      border: 1px dashed var(--tech);
      color: var(--tech);
      animation: nextPillPulse 1.8s infinite;
    }
    @keyframes nextPillPulse {
      0%, 100% { border-color: rgba(0, 229, 255, 0.4); }
      50% { border-color: rgba(0, 229, 255, 1); box-shadow: 0 0 8px rgba(0, 229, 255, 0.3); }
    }

    /* Stats Grid */
    .skill-stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }
    .skill-stat-box {
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
    }
    .skill-stat-box small {
      display: block;
      color: var(--muted);
      font-size: 11px;
      letter-spacing: .08em;
      margin-bottom: 6px;
    }
    .skill-stat-box b {
      font-family: var(--display);
      font-size: 22px;
      color: var(--text);
    }
    .skill-stat-box .next-val {
      font-size: 14px;
      color: var(--ok);
      margin-inline-start: 6px;
    }

    /* Perk Info */
    .skill-perk-box {
      background: rgba(0, 229, 255, 0.06);
      border: 1px solid rgba(0, 229, 255, 0.2);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      font-size: 14px;
      line-height: 1.5;
    }
    .skill-perk-box b {
      color: var(--tech);
    }
    .skill-perk-box .next-perk {
      color: var(--muted);
      margin-top: 6px;
      font-size: 13px;
    }

    /* Action Buttons */
    .skill-actions-row {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .btn-skill-upgrade {
      flex: 1;
      padding: 14px 24px;
      background: linear-gradient(135deg, #00e5ff, #0088cc);
      color: #070912;
      font-family: var(--display);
      font-weight: 700;
      font-size: 22px;
      border-radius: 6px;
      border: none;
      box-shadow: 0 4px 18px rgba(0, 229, 255, 0.4);
      transition: all .2s var(--ease);
    }
    .btn-skill-upgrade:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(0, 229, 255, 0.6);
      color: #000;
    }
    .btn-skill-upgrade:disabled {
      background: rgba(255, 255, 255, 0.08);
      color: var(--muted);
      box-shadow: none;
    }

    /* Teaser Card */
    .skill-card-teaser {
      background: rgba(255, 255, 255, 0.02);
      border: 1px dashed rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--muted);
    }
    .skill-card-teaser h4 {
      margin: 0 0 4px;
      color: #c9ccd8;
      font-size: 16px;
    }
    .skill-card-teaser p {
      margin: 0;
      font-size: 13px;
    }

    @media (max-width: 1100px) {
      .v9d { display: none; }
      .skill-stats-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 600px) {
      .skill-stats-grid { grid-template-columns: 1fr; }
      .skill-gauge { grid-template-columns: repeat(5, 1fr); gap: 4px; }
    }
  `;
  document.head.appendChild(css);

  /* Menu Dossier & Nav Button */
  const m = $('[data-screen="menu"]');
  if (m) {
    m.insertBefore(F('<div class="v9torch"></div>'), m.firstChild);
    m.insertBefore(F('<button class="nav" data-action="v9skills" data-i18n="menu.skills"></button>'), $('[data-action="settings"]', m));
    m.appendChild(F(`
      <aside class="v9d">
        <h3 data-i18n="v9.dossier"></h3>
        <div class="v9ring" id="v9lvl"></div>
        <b id="v9rank"></b>
        <div id="v9xp"></div>
        <div class="v9stats">
          <div>OPS <b id="v9ops"></b></div>
          <div>KILLS <b id="v9kills"></b></div>
          <div>CREDITS <b id="v9credits"></b></div>
          <div>S RATINGS <b id="v9s"></b></div>
        </div>
        <div class="v9next">
          <small data-i18n="v9.nextOp"></small>
          <b id="v9op"></b>
        </div>
        <p class="v9tip" id="v9tip"></p>
      </aside>
    `));
    m.addEventListener('mousemove', e => {
      m.style.setProperty('--mx', e.clientX + 'px');
      m.style.setProperty('--my', e.clientY + 'px');
    });
  }

  /* Screen Insertion */
  const scr = F(`
    <section class="screen panel-screen" data-screen="v9skills">
      <div class="panel wide v9skills">
        <header class="panel-head">
          <h2 data-i18n="sk.title"></h2>
          <div class="skills-head-meta">
            <span class="head-points"><span data-i18n="sk.points"></span>: <b id="v9pts">0</b></span>
            <span class="head-credits"><span data-i18n="common.credits"></span>: <b id="v9cred">0</b></span>
          </div>
        </header>
        <div class="v9skills-container" id="v9skills-container"></div>
        <footer class="panel-foot">
          <button class="btn" data-action="back" data-i18n="common.back"></button>
          <button class="btn danger" data-action="v9respec" data-i18n="sk.respec"></button>
        </footer>
      </div>
    </section>
  `);
  $('[data-screen="upgrades"]')?.parentNode.insertBefore(scr, $('[data-screen="upgrades"]').nextSibling);

  function menu(ui) {
    const s = ui.game.save.data, n = BO.UpgradeSystem.xpForLevel(s.level);
    $('#v9lvl').textContent = I.num(s.level);
    $('#v9rank').textContent = BO.t('rank.' + (s.level >= 20 ? 5 : s.level >= 15 ? 4 : s.level >= 10 ? 3 : s.level >= 6 ? 2 : s.level >= 3 ? 1 : 0));
    $('#v9xp').textContent = BO.t('v9.xpTo', { a: I.num(s.xp), b: I.num(n) });
    $('#v9ops').textContent = I.num(s.completedMissions.length);
    $('#v9kills').textContent = I.num(s.stats?.kills || 0);
    $('#v9credits').textContent = I.num(s.credits);
    $('#v9s').textContent = I.num(Object.values(s.bestRatings || {}).filter(x => x === 'S').length);
    const nx = BO.MissionSystem.nextMission(s);
    $('#v9op').textContent = nx ? BO.t(nx.nameKey) : BO.t('v9.allDone');
    $('#v9tip').textContent = BO.t('v9.tip1');
  }

  const oldProf = UI.renderProfile;
  UI.renderProfile = function () {
    oldProf.apply(this, arguments);
    menu(this);
  };

  /* Render Modern Skills View */
  function renderSkillsView(ui) {
    const s = ui.game.save.data;
    const curLevel = SkillSystem.getLevel(s);
    const curStats = SkillSystem.getStats(curLevel);
    const nextStats = curLevel < MAX_LEVEL ? SkillSystem.getStats(curLevel + 1) : null;
    const points = SkillSystem.points(s);
    const canUp = SkillSystem.canUpgrade(s);

    $('#v9pts').textContent = I.num(points);
    $('#v9cred').textContent = I.num(s.credits);

    const container = $('#v9skills-container');
    if (!container) return;

    // Gauge segments HTML
    let gaugeHtml = '';
    for (let i = 1; i <= MAX_LEVEL; i++) {
      let cls = 'gauge-segment';
      if (i <= curLevel) cls += ' done';
      else if (i === curLevel + 1) cls += ' next';
      gaugeHtml += `<div class="${cls}">${I.num(i)}</div>`;
    }

    // Upgrade Button Label
    let btnText = '';
    if (curLevel >= MAX_LEVEL) {
      btnText = BO.t('sk.maxed');
    } else {
      const costDesc = points > 0
        ? BO.t('sk.costPt')
        : BO.t('sk.costCr', { c: I.num(nextStats.costCredits) });
      btnText = `${BO.t('sk.upgradeBtn', { n: I.num(curLevel + 1) })} · ${costDesc}`;
    }

    container.innerHTML = `
      <div class="skill-card-hero">
        <div class="skill-card-top">
          <div class="skill-title-group">
            <div class="skill-icon-dial">⏱</div>
            <div>
              <h3>
                ${BO.t('sk.slowmo')}
                <span class="skill-badge-key">${BO.t('sk.keyBadge')}</span>
              </h3>
            </div>
          </div>
          <div class="skill-level-pill">${BO.t('sk.levelPill', { cur: I.num(curLevel), max: I.num(MAX_LEVEL) })}</div>
        </div>

        <p class="skill-desc-text">${BO.t('sk.slowmoDesc')}</p>

        <div class="skill-gauge">
          ${gaugeHtml}
        </div>

        <div class="skill-stats-grid">
          <div class="skill-stat-box">
            <small>${BO.t('sk.worldSpeed')}</small>
            <b>${I.num((curStats.worldSpeed * 100).toFixed(0))}%</b>
          </div>
          <div class="skill-stat-box">
            <small>${BO.t('sk.playerSpeed')}</small>
            <b>${I.num((curStats.playerSpeed * 100).toFixed(0))}%</b>
            ${nextStats ? `<span class="next-val">→ ${I.num((nextStats.playerSpeed * 100).toFixed(0))}%</span>` : ''}
          </div>
          <div class="skill-stat-box">
            <small>${BO.t('sk.duration')}</small>
            <b>${I.num(curStats.duration.toFixed(2))}${BO.t('sk.sec')}</b>
            ${nextStats ? `<span class="next-val">→ ${I.num(nextStats.duration.toFixed(2))}${BO.t('sk.sec')}</span>` : ''}
          </div>
          <div class="skill-stat-box">
            <small>${BO.t('sk.cooldown')}</small>
            <b>${I.num(curStats.cooldown.toFixed(1))}${BO.t('sk.sec')}</b>
            ${nextStats ? `<span class="next-val">→ ${I.num(nextStats.cooldown.toFixed(1))}${BO.t('sk.sec')}</span>` : ''}
          </div>
        </div>

        <div class="skill-perk-box">
          <div><b>${BO.t('sk.perkCur')}:</b> ${BO.t('sk.perk.' + curLevel)}</div>
          ${nextStats ? `<div class="next-perk"><b>${BO.t('sk.perkNext')}:</b> ${BO.t('sk.perk.' + (curLevel + 1))}</div>` : ''}
        </div>

        <div class="skill-actions-row">
          <button class="btn-skill-upgrade" data-action="v9upgrade" ${canUp ? '' : 'disabled'}>
            ${btnText}
          </button>
        </div>
      </div>

      <div class="skill-card-teaser">
        <div>
          <h4>${BO.t('sk.futureTitle')}</h4>
          <p>${BO.t('sk.futureDesc')}</p>
        </div>
        <span style="font-size:24px; opacity:0.6;">🔒</span>
      </div>
    `;
  }

  const showSkills = ui => {
    ui.show('v9skills');
    renderSkillsView(ui);
  };

  const root = document.getElementById('ui');
  root?.addEventListener('click', e => {
    const x = e.target.closest('[data-action]');
    if (!x || !BO.game) return;
    const u = BO.game.ui;
    if (x.dataset.action === 'v9skills') showSkills(u);
    if (x.dataset.action === 'v9upgrade') {
      if (SkillSystem.upgrade(BO.game.save.data)) {
        renderSkillsView(u);
      }
    }
    if (x.dataset.action === 'v9respec') {
      u._confirm(BO.t('sk.respecConfirm'), () => {
        SkillSystem.respec(BO.game.save.data);
        renderSkillsView(u);
      });
    }
  });

  /* Localization */
  BO.I18N.extend('en', {
    'menu.skills': 'SKILLS',
    'v9.dossier': 'OPERATOR DOSSIER',
    'v9.nextOp': 'NEXT OPERATION',
    'v9.xpTo': '{a} / {b} XP',
    'v9.allDone': 'ALL OPERATIONS CLEARED',
    'v9.tip1': 'Press [C] to activate Slow Motion in combat.',
    'sk.title': 'TACTICAL SKILLS',
    'sk.points': 'POINTS',
    'sk.respec': 'RESPEC (FREE)',
    'sk.respecConfirm': 'Reset Slow Motion to Level 1 and refund all spent points?',
    'sk.slowmo': 'SLOW MOTION',
    'sk.keyBadge': 'KEY [C]',
    'sk.keyHint': '[C] SLOW-MO',
    'sk.levelPill': 'LEVEL {cur} / {max}',
    'sk.slowmoDesc': 'Press [C] during combat to bend time into tactical bullet-time. The entire world and hostiles slow down to 50% speed while you operate at 80% speed.',
    'sk.worldSpeed': 'WORLD SPEED',
    'sk.playerSpeed': 'OPERATOR SPEED',
    'sk.duration': 'DURATION',
    'sk.cooldown': 'COOLDOWN',
    'sk.sec': 's',
    'sk.perkCur': 'CURRENT FOCUS',
    'sk.perkNext': 'NEXT LEVEL BONUS',
    'sk.upgradeBtn': 'UPGRADE TO LEVEL {n}',
    'sk.costPt': '1 SKILL POINT',
    'sk.costCr': '{c} CREDITS',
    'sk.maxed': '★ MAX LEVEL REACHED (10/10) ★',
    'sk.ready': 'READY',
    'sk.slowmoActive': 'SLOW MOTION ACTIVATED',
    'sk.slowmoEnded': 'TIME FLOW RESTORED',
    'sk.slowmoCd': 'SLOW-MO READY IN {s}s',
    'sk.futureTitle': 'FUTURE SKILLS',
    'sk.futureDesc': 'Additional tactical operator abilities will be unlocked here in upcoming updates.',
    'sk.perk.1': 'Tactical Focus: Slow world to 50%, operator to 80%.',
    'sk.perk.2': 'Extended Flow: +0.25s duration, -1.0s cooldown.',
    'sk.perk.3': 'Reflex Stance: +10% faster reload during slow motion.',
    'sk.perk.4': 'Tuned Agility: Operator speed slightly tuned to 81%.',
    'sk.perk.5': 'Adrenaline Surge: -25% sprint stamina drain during slow motion.',
    'sk.perk.6': 'Heightened Senses: Operator speed tuned to 82%.',
    'sk.perk.7': 'Momentum: Eliminations in slow motion cut cooldown by 0.5s.',
    'sk.perk.8': 'Temporal Drift: Operator speed tuned to 83%.',
    'sk.perk.9': 'Chrono Surge: Extended duration to 4.5s and 10.0s cooldown.',
    'sk.perk.10': 'Chrono Mastery: 5.0s duration, 9.0s cooldown; eliminations extend duration by +0.25s.'
  });

  BO.I18N.extend('fa', {
    'menu.skills': 'مهارت‌ها',
    'v9.dossier': 'پرونده مأمور',
    'v9.nextOp': 'مأموریت بعدی',
    'v9.xpTo': '{a} / {b} تجربه',
    'v9.allDone': 'تمام مأموریت‌ها انجام شدند',
    'v9.tip1': 'در مبارزات با فشردن کلید [C] اسلو موشن را فعال کن.',
    'sk.title': 'مهارت‌های تاکتیکی',
    'sk.points': 'امتیاز مهارت',
    'sk.respec': 'بازتنظیم امتیازها (رایگان)',
    'sk.respecConfirm': 'مهارت اسلو موشن به سطح ۱ بازگردد و امتیازهای خرج‌شده برگشت داده شوند؟',
    'sk.slowmo': 'اسلو موشن (حرکت آهسته)',
    'sk.keyBadge': 'کلید [C]',
    'sk.keyHint': '[C] اسلو موشن',
    'sk.levelPill': 'سطح {cur} از {max}',
    'sk.slowmoDesc': 'با فشردن کلید [C] در حین بازی زمان را بشکنید. سرعت جهان و تمامی دشمنان به ۵۰٪ (0.5x) کاهش می‌یابد در حالی که شما با سرعت ۸۰٪ (0.8x) حرکت و شلیک می‌کنید.',
    'sk.worldSpeed': 'سرعت جهان',
    'sk.playerSpeed': 'سرعت کاربر',
    'sk.duration': 'زمان ماندگاری',
    'sk.cooldown': 'شارژ مجدد',
    'sk.sec': ' ثانیه',
    'sk.perkCur': 'ویژگی تاکتیکی این سطح',
    'sk.perkNext': 'پاداش سطح بعدی',
    'sk.upgradeBtn': 'ارتقا به سطح {n}',
    'sk.costPt': '۱ امتیاز مهارت',
    'sk.costCr': '{c} سکه',
    'sk.maxed': '★ حداکثر سطح (تکمیل شده ۱۰/۱۰) ★',
    'sk.ready': 'آماده',
    'sk.slowmoActive': 'اسلو موشن فعال شد',
    'sk.slowmoEnded': 'زمان به حالت عادی برگشت',
    'sk.slowmoCd': 'اسلو موشن تا {s} ثانیه دیگر آماده می‌شود',
    'sk.futureTitle': 'مهارت‌های آینده',
    'sk.futureDesc': 'توانایی‌های تاکتیکی جدید در به‌روزرسانی‌های بعدی در این بخش اضافه خواهند شد.',
    'sk.perk.1': 'تمرکز تاکتیکی: سرعت جهان ۵۰٪ و سرعت کاربر ۸۰٪.',
    'sk.perk.2': 'تداوم زمان: ۰٫۲۵+ ثانیه ماندگاری، ۱- ثانیه شارژ سریع‌تر.',
    'sk.perk.3': 'واکنش سریع: ۱۰٪ بارگذاری سریع‌تر سلاح در حالت اسلو موشن.',
    'sk.perk.4': 'چابکی تاکتیکی: تنظیم سرعت کاربر به ۸۱٪.',
    'sk.perk.5': 'آدرنالین: ۲۵٪ مصرف کمتر استقامت هنگام دویدن در اسلو موشن.',
    'sk.perk.6': 'حواس تقویت‌شده: تنظیم سرعت کاربر به ۸۲٪.',
    'sk.perk.7': 'تکانه: هر حذف دشمن در اسلو موشن زمان شارژ را ۰٫۵ ثانیه کم می‌کند.',
    'sk.perk.8': 'رانش زمانی: تنظیم سرعت کاربر به ۸۳٪.',
    'sk.perk.9': 'موج زمان: ماندگاری ۴٫۵ ثانیه و شارژ سریع‌تر تا ۱۰ ثانیه.',
    'sk.perk.10': 'تسلط بر زمان: ۵٫۰ ثانیه ماندگاری، شارژ ۹ ثانیه‌ای و افزایش مدت با هر حذف.'
  });

})(window.BO);
