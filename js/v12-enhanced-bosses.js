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
    if (this.variant && v11 && v11.tactics[this.variant]) {
      const tactic = v11.tactics[this.variant];
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
    const colors = {
      'tactical': '#ff4444',     // Red glow
      'aggressive': '#ff6600',   // Orange glow
      'swift': '#ffff00',        // Yellow glow
      'ranged': '#00ccff',       // Cyan glow
      'tank': '#884400',         // Brown glow
      'teleport': '#bb00ff',     // Purple glow
      'cloner': '#00ff44',       // Green glow
      'minion': '#ffaa00',       // Gold glow
      'hybrid': '#ff00ff'        // Magenta glow
    };
    return colors[this.variant] || '#ffffff';
  };

  BO.Boss.prototype._drawVariantMarkings = function(ctx, color) {
    const variant = this.variant;
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

  // ===== FLASHLIGHT TOGGLE MECHANIC =====
  // Add ability to toggle flashlight; enemies cannot detect player in darkness

  // Initialize flashlight state on player
  const OriginalPlayer = BO.Player;
  const OriginalPlayerInit = OriginalPlayer.prototype.init;
  
  BO.Player.prototype.init = function() {
    if (OriginalPlayerInit) {
      OriginalPlayerInit.call(this);
    }
    this.flashlightEnabled = true; // Flashlight starts ON
  };

  // Add keyboard input handler for flashlight toggle (F key)
  const OriginalInputHandleKey = BO.input && BO.input.handleKey;
  if (BO.input) {
    BO.input.handleKey = function(key) {
      if (OriginalInputHandleKey) {
        OriginalInputHandleKey.call(this, key);
      }
      
      // Toggle flashlight on F key
      if (key === 'f' || key === 'F') {
        if (BO.game && BO.game.player) {
          BO.game.player.flashlightEnabled = !BO.game.player.flashlightEnabled;
        }
      }
    };
  }

  // Alternatively, hook into keydown at game level
  if (!BO.input || !BO.input.handleKey) {
    const OriginalGameUpdate = BO.game && BO.game.update;
    if (BO.game) {
      BO.game.update = function() {
        if (OriginalGameUpdate) {
          OriginalGameUpdate.call(this);
        }
        // Check if F key was pressed
        if (BO.keys && (BO.keys['f'] || BO.keys['F'])) {
          if (this.player && !this._flashlightToggleLocked) {
            this.player.flashlightEnabled = !this.player.flashlightEnabled;
            this._flashlightToggleLocked = true;
          }
        } else {
          this._flashlightToggleLocked = false;
        }
      };
    }
  }

  // Modify enemy perception: can't detect player when flashlight is OFF
  const OriginalAIVisibility = BO.ai && BO.ai.visibility;
  if (BO.ai && BO.ai.visibility) {
    BO.ai.visibility = function(enemy, target) {
      if (!target) return false;
      
      // If target is player and flashlight is off, enemy can't see them
      if (target === BO.game.player && !target.flashlightEnabled) {
        return false;
      }
      
      // Otherwise use original visibility logic
      return OriginalAIVisibility.call(this, enemy, target);
    };
  }

  // Modify postfx flashlight rendering to reflect toggle state
  const OriginalPostfxDraw = BO.postfx && BO.postfx.draw;
  if (BO.postfx) {
    BO.postfx.draw = function(ctx, player) {
      // Only render flashlight effects if flashlight is enabled
      if (player && player.flashlightEnabled !== false) {
        if (OriginalPostfxDraw) {
          OriginalPostfxDraw.call(this, ctx, player);
        }
      } else {
        // When flashlight is off, render darkness/shadow effect
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
    };
  }

  // Add HUD indicator for flashlight status
  const OriginalGameRender = BO.game && BO.game.render;
  if (BO.game) {
    BO.game.render = function(ctx) {
      if (OriginalGameRender) {
        OriginalGameRender.call(this, ctx);
      }
      
      // Draw flashlight status indicator
      if (this.player) {
        ctx.font = '14px Arial';
        ctx.fillStyle = this.player.flashlightEnabled ? '#00ff00' : '#ff0000';
        ctx.fillText(
          'Flashlight: ' + (this.player.flashlightEnabled ? 'ON (F)' : 'OFF (F)'),
          10,
          30
        );
      }
    };
  }

  console.log('v12-enhanced-bosses.js loaded: stronger bosses, destructible obstacles, enemy variety, flashlight toggle');

})(window.BO);