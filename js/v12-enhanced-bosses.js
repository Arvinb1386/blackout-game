/**
 * v12-enhanced-bosses.js
 * Expansion pack: Enhanced Boss System
 * - Stronger bosses with unique visual appearances per variant
 * - Enhanced enemy variety and aggression
 * - Destructible obstacles in boss arena
 * - Flashlight toggle mechanic (enemies can't detect in darkness)
 */

(function(BO) {
  'use strict';

  // ===== ENHANCED BOSS VISUALS =====
  // Wrap the original boss draw to add unique visual detail per variant

  const OriginalBoss = BO.Boss;
  const OriginalBossDraw = OriginalBoss.prototype.draw;

  BO.Boss.prototype.draw = function(ctx) {
    OriginalBossDraw.call(this, ctx);
    
    // Add variant-specific visual enhancements
    const variant = this.variant || (this.v11 && this.v11.name);
    if (variant) {
      const enhancedColor = this._getVariantColor();
      
      // Draw glowing aura based on variant
      ctx.fillStyle = enhancedColor;
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      
      // Draw distinctive markings/patterns per variant
      this._drawVariantMarkings(ctx, enhancedColor);
      
      // Increase boss health and damage based on variant strength
      if (this.health === this.maxHealth && !this._enhancedBoosts) {
        this.maxHealth = Math.floor(this.maxHealth * 1.4);
        this.health = this.maxHealth;
        this.dmg = Math.floor(this.dmg * 1.25);
        this._enhancedBoosts = true;
      }
    }
  };

  BO.Boss.prototype._getVariantColor = function() {
    const variant = this.variant || (this.v11 && this.v11.name);
    const colors = {
      'tactical': '#ff4444',     // Red glow
      'aggressive': '#ff6600',   // Orange glow
      'swift': '#ffff00',        // Yellow glow
      'ranged': '#00ccff',       // Cyan glow
      'tank': '#884400',         // Brown glow
      'teleport': '#bb00ff',     // Purple glow
      'cloner': '#00ff44',       // Green glow
      'minion': '#ffaa00',       // Gold glow
      'hybrid': '#ff00ff',       // Magenta glow
      'warden': '#ff8a1a',
      'iron': '#00ccff',
      'siege': '#ff4444',
      'vortex': '#bb00ff',
      'hunter': '#ffff00',
      'prime': '#ffaa00',
      'forge': '#ff6600',
      'wraith': '#00ff44',
      'tempest': '#8df7ff'
    };
    return colors[variant] || '#ffffff';
  };

  BO.Boss.prototype._drawVariantMarkings = function(ctx, color) {
    const variant = this.variant || (this.v11 && this.v11.name);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6;
    
    switch(variant) {
      case 'tactical':
        // Tactical: crosshair pattern
        ctx.beginPath();
        ctx.moveTo(this.x - 15, this.y);
        ctx.lineTo(this.x + 15, this.y);
        ctx.moveTo(this.x, this.y - 15);
        ctx.lineTo(this.x, this.y + 15);
        ctx.stroke();
        break;
      case 'aggressive':
        // Aggressive: spikes around perimeter
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 / 8) * i;
          const sx = this.x + Math.cos(angle) * (this.r + 5);
          const sy = this.y + Math.sin(angle) * (this.r + 5);
          const ex = this.x + Math.cos(angle) * (this.r + 15);
          const ey = this.y + Math.sin(angle) * (this.r + 15);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
        break;
      case 'swift':
        // Swift: motion lines
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      case 'ranged':
        // Ranged: targeting reticle
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 15, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'tank':
        // Tank: armor plating
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI * 2 / 6) * i;
          const x = this.x + Math.cos(angle) * this.r;
          const y = this.y + Math.sin(angle) * this.r;
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.6;
        }
        break;
      case 'teleport':
        // Teleport: phase effect
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'cloner':
        // Cloner: dual nodes
        ctx.beginPath();
        ctx.arc(this.x - 8, this.y, this.r - 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(this.x + 8, this.y, this.r - 3, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'minion':
        // Minion: crown pattern
        ctx.beginPath();
        ctx.moveTo(this.x - 10, this.y - this.r - 8);
        ctx.lineTo(this.x - 5, this.y - this.r - 15);
        ctx.lineTo(this.x, this.y - this.r - 10);
        ctx.lineTo(this.x + 5, this.y - this.r - 15);
        ctx.lineTo(this.x + 10, this.y - this.r - 8);
        ctx.stroke();
        break;
      case 'hybrid':
        // Hybrid: complex pattern
        for (let i = 0; i < 4; i++) {
          const angle = (Math.PI * 2 / 4) * i;
          const sx = this.x + Math.cos(angle) * (this.r + 5);
          const sy = this.y + Math.sin(angle) * (this.r + 5);
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
    }
    
    ctx.globalAlpha = 1;
  };

  // ===== ENHANCED ENEMY VARIETY =====
  // Increase enemy spawn count and variety in boss fights

  const OriginalBossSpawn = OriginalBoss.prototype.spawnEnemies;
  BO.Boss.prototype.spawnEnemies = function() {
    if (OriginalBossSpawn) {
      OriginalBossSpawn.call(this);
    }
    
    // Spawn additional varied enemies based on variant
    if (this.variant && !this._variedEnemiesSpawned) {
      const extraCount = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < extraCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 150 + Math.random() * 100;
        const x = this.x + Math.cos(angle) * distance;
        const y = this.y + Math.sin(angle) * distance;
        
        // Vary enemy type
        const enemyType = Math.random() < 0.6 ? 'zombie' : 'runner';
        const enemy = BO.spawnEnemy(x, y, {type: enemyType});
        if (enemy) {
          enemy.aggressive = 1; // More aggressive in boss fights
          enemy.speed *= 1.3;    // Faster variants
        }
      }
      this._variedEnemiesSpawned = true;
    }
  };

  // ===== DESTRUCTIBLE OBSTACLES =====
  // Make hazard/obstacle props take damage and be destroyed

  const OriginalProp = BO.Prop;
  if (OriginalProp) {
    const OriginalPropUpdate = OriginalProp.prototype.update;
    
    BO.Prop.prototype.update = function() {
      if (OriginalPropUpdate) {
        OriginalPropUpdate.call(this);
      }
      
      // Track destructible state
      if (this.hp !== undefined && this.maxHp !== undefined) {
        if (this.hp <= 0 && !this.destroyed) {
          this.destroyed = true;
          this._onDestroy();
        }
      }
    };
    
    BO.Prop.prototype._onDestroy = function() {
      // Create visual effect when destroyed
      if (BO.particles) {
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 / 8) * i;
          const vx = Math.cos(angle) * 3;
          const vy = Math.sin(angle) * 3;
          BO.particles.push({
            x: this.x,
            y: this.y,
            vx: vx,
            vy: vy,
            life: 30,
            color: '#888'
          });
        }
      }
    };
    
    const OriginalPropDraw = OriginalProp.prototype.draw;
    BO.Prop.prototype.draw = function(ctx) {
      // Show damage state visually
      if (this.hp !== undefined && this.maxHp !== undefined) {
        const healthPercent = Math.max(0, this.hp / this.maxHp);
        if (healthPercent < 1) {
          ctx.globalAlpha = Math.max(0.3, healthPercent);
        }
      }
      
      if (OriginalPropDraw) {
        OriginalPropDraw.call(this, ctx);
      }
      
      ctx.globalAlpha = 1;
      
      // Draw health bar for damaged obstacles
      if (this.hp !== undefined && this.maxHp !== undefined && this.hp < this.maxHp) {
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(this.x - 15, this.y - this.r - 10, 30 * (this.hp / this.maxHp), 4);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x - 15, this.y - this.r - 10, 30, 4);
      }
    };
  }

  // ===== FLASHLIGHT TOGGLE MECHANIC (F KEY) =====
  const U = BO.U;
  const CFG = BO.CONFIG;

  // 1. Toggle handling on F key press
  if (BO.events) {
    BO.events.on('input:key', function(code) {
      if (code === 'KeyF') {
        const g = BO.game;
        if (!g || g.state !== BO.Game.STATE.PLAYING || !g.player || g.player.dead) return;
        const p = g.player;
        p.flashlight = p.flashlight === false ? true : false;
        
        // Mechanical switch sound
        if (g.audio) {
          if (g.audio.uiClick) {
            g.audio.uiClick();
          } else if (g.audio.tone && g.audio.ctx) {
            g.audio.tone({
              when: g.audio.ctx.currentTime,
              freq: p.flashlight ? 820 : 420,
              dur: 0.03,
              vol: 0.15,
              type: 'triangle'
            });
          }
        }
        
        // Toast notification
        if (g.ui && g.ui.notify) {
          g.ui.notify(
            BO.t(p.flashlight ? 'flash.on' : 'flash.off'),
            p.flashlight ? '#ffea75' : '#777d8e',
            1.2
          );
        }
      }
    });
  }

  // 2. Lighting rendering: disable flashlight cone when flashlight is off
  if (BO.Renderer && BO.Renderer.prototype._renderLighting) {
    const origLighting = BO.Renderer.prototype._renderLighting;
    BO.Renderer.prototype._renderLighting = function(game, time, rect) {
      const p = game && game.player;
      const oldRange = CFG ? CFG.FLASHLIGHT_RANGE : 560;
      if (p && p.flashlight === false && CFG) {
        CFG.FLASHLIGHT_RANGE = 0; // Disables cone casting & drawing; ambient circle remains
      }
      try {
        return origLighting.call(this, game, time, rect);
      } finally {
        if (CFG) CFG.FLASHLIGHT_RANGE = oldRange;
      }
    };
  }

  // 3. Volumetric postfx: disable light beam when flashlight is off
  if (BO.PostFX && BO.PostFX.prototype.world) {
    const origPostfxWorld = BO.PostFX.prototype.world;
    BO.PostFX.prototype.world = function(game, time) {
      const p = game && game.player;
      if (p && p.flashlight === false) return;
      return origPostfxWorld.call(this, game, time);
    };
  }

  // 4. Enemy cone illumination: player cannot illuminate distant enemies in dark
  if (BO.Game && BO.Game.prototype._updateVisibility) {
    const origVis = BO.Game.prototype._updateVisibility;
    BO.Game.prototype._updateVisibility = function() {
      const p = this.player;
      const oldRange = CFG ? CFG.FLASHLIGHT_RANGE : 560;
      if (p && p.flashlight === false && CFG) {
        CFG.FLASHLIGHT_RANGE = 0;
      }
      try {
        return origVis.apply(this, arguments);
      } finally {
        if (CFG) CFG.FLASHLIGHT_RANGE = oldRange;
      }
    };
  }

  // 5. Enemy detection & Stealth: enemies cannot see player in the dark when flashlight is off
  if (BO.AISystem && BO.AISystem.prototype._perceive) {
    const origPerceive = BO.AISystem.prototype._perceive;
    BO.AISystem.prototype._perceive = function(e) {
      const r = origPerceive.apply(this, arguments);
      const g = this.game;
      const p = g && g.player;
      if (p && p.flashlight === false && e.canSee && !e.engaged && !e.isBoss) {
        const d = U ? U.dist(e.x, e.y, p.x, p.y) : Math.hypot(e.x - p.x, e.y - p.y);
        const exp = g.playerExposure || 0;
        // Outside close contact (90px) and not exposed by lit room or gun flash
        if (d > 90 && exp < 0.3) {
          e.canSee = false;
          e.clearShot = false;
        }
      }
      return r;
    };
  }

  // 6. HUD indicator for Flashlight status
  if (BO.UIManager && BO.UIManager.prototype.renderHUD) {
    const origHUD = BO.UIManager.prototype.renderHUD;
    BO.UIManager.prototype.renderHUD = function(ctx, game, time) {
      origHUD.apply(this, arguments);
      if (!game || !game.player || this.current === 'results' || this.current === 'death') return;
      const p = game.player;
      const on = p.flashlight !== false;
      ctx.save();
      ctx.setTransform(game.renderer.dpr, 0, 0, game.renderer.dpr, 0, 0);
      ctx.font = '700 11px "Chakra Petch", Vazirmatn, sans-serif';
      const x = game.renderer.w - 18;
      const y = 30;
      ctx.textAlign = 'right';
      ctx.fillStyle = on ? '#ffea75' : '#555b6e';
      const label = on ? BO.t('flash.onHud') : BO.t('flash.offHud');
      ctx.fillText(label, x, y);
      ctx.fillStyle = on ? '#ffea75' : '#333846';
      ctx.beginPath();
      ctx.arc(x - ctx.measureText(label).width - 8, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
  }

  // 7. Translations
  if (BO.I18N && BO.I18N.extend) {
    BO.I18N.extend('en', {
      'flash.on': 'FLASHLIGHT: ON',
      'flash.off': 'FLASHLIGHT: OFF',
      'flash.onHud': 'FLASHLIGHT: ON [F]',
      'flash.offHud': 'FLASHLIGHT: OFF [F]',
    });
    BO.I18N.extend('fa', {
      'flash.on': 'چراغ‌قوه: روشن',
      'flash.off': 'چراغ‌قوه: خاموش',
      'flash.onHud': 'چراغ‌قوه: روشن [F]',
      'flash.offHud': 'چراغ‌قوه: خاموش [F]',
    });
  }

  console.log('v12-enhanced-bosses.js loaded: stronger bosses, destructible obstacles, enemy variety, flashlight toggle');

})(window.BO);