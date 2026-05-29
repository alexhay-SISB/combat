// ===== Tank (bigger, fixed turret, SNES-style detail) =====

class Tank {
  constructor(x, y, color, secondaryColor, accentColor, name) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.secondaryColor = secondaryColor;
    this.accentColor = accentColor;
    this.name = name;

    // BIGGER tank
    this.radius = 26;            // collision radius
    this.bodyW = 56;
    this.bodyH = 46;

    this.angle = 0;              // body & turret share this angle (fixed turret)
    this.speed = 0;
    this.maxSpeed = 210;         // faster top speed
    this.acceleration = 1000;    // snappier ramp-up
    this.turnRate = 3.6;         // slightly more nimble

    this.points = 50;            // ammo budget (test mode — lots so all 3 types are easy to try)
    this.kills = 0;
    this.alive = true;
    this.respawnTimer = 0;

    this.shielded = false;
    this.shieldTime = 0;

    this.frozen = false;
    this.freezeTime = 0;

    this.fireCooldown = 0;
    this.muzzleFlash = 0;

    this.treadOffset = 0;
    this.recoil = 0;

    this.ammoType = 'bullet';

    // Auto-cannon power-up
    this.autoCannonActive = false;
    this.autoCannonTime = 0;
    this.autoCannonFireTimer = 0;

    // For drawing
    this._explodedThisDeath = false;
  }

  update(dt, input, gameMap) {
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn(gameMap);
      return;
    }

    if (this.frozen) {
      this.freezeTime -= dt;
      if (this.freezeTime <= 0) this.frozen = false;
    }
    if (this.shielded) {
      this.shieldTime -= dt;
      if (this.shieldTime <= 0) this.shielded = false;
    }

    // Auto-cannon power-up: decrement timers but DON'T reset the fire timer
    // when it hits 0 — that's autoFire()'s job. Resetting it here was the bug
    // that prevented any shots from going out.
    if (this.autoCannonActive) {
      this.autoCannonTime -= dt;
      if (this.autoCannonTime <= 0) {
        this.autoCannonActive = false;
      } else if (this.autoCannonFireTimer > 0) {
        // Cool down toward 0; autoFire() in game.js fires + resets when ready
        this.autoCannonFireTimer -= dt;
        if (this.autoCannonFireTimer < 0) this.autoCannonFireTimer = 0;
      }
    }

    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.muzzleFlash > 0) this.muzzleFlash -= dt * 4;
    if (this.recoil > 0) this.recoil -= dt * 6;

    if (this.frozen) {
      this.speed = 0;
      return;
    }

    // === Movement: keyboard (discrete) OR touch (twin-stick analog) ===
    let targetSpeed;
    if (input.touchTarget && input.touchTarget.magnitude > 0.08) {
      // Touch mode: joystick angle = facing direction, magnitude = speed
      const target = input.touchTarget;
      const diff = Utils.angleDiff(this.angle, target.angle);
      const maxTurn = this.turnRate * dt * 1.8;        // slightly faster on touch for responsiveness
      this.angle += Utils.clamp(diff, -maxTurn, maxTurn);

      // Only move forward when aimed roughly at target (within 60°)
      const aligned = Math.abs(diff) < Math.PI / 3;
      targetSpeed = aligned ? this.maxSpeed * target.magnitude : 0;
    } else {
      // Keyboard mode (existing)
      const forward = input.forward ? 1 : 0;
      const backward = input.backward ? 1 : 0;
      const left = input.left ? 1 : 0;
      const right = input.right ? 1 : 0;
      this.angle += (right - left) * this.turnRate * dt;
      targetSpeed = (forward - backward) * this.maxSpeed;
    }

    // Accelerate toward target speed
    if (this.speed < targetSpeed) {
      this.speed = Math.min(targetSpeed, this.speed + this.acceleration * dt);
    } else if (this.speed > targetSpeed) {
      this.speed = Math.max(targetSpeed, this.speed - this.acceleration * dt);
    }

    // Move with axis-separated wall sliding
    const nx = this.x + Math.cos(this.angle) * this.speed * dt;
    const ny = this.y + Math.sin(this.angle) * this.speed * dt;

    if (gameMap.collide(nx, this.y, this.radius).length === 0) {
      this.x = nx;
    } else {
      this.speed *= 0.4;
    }
    if (gameMap.collide(this.x, ny, this.radius).length === 0) {
      this.y = ny;
    } else {
      this.speed *= 0.4;
    }

    this.treadOffset += this.speed * dt * 0.12;
  }

  tryFire(bullets) {
    if (!this.alive || this.frozen) return null;
    if (this.fireCooldown > 0) return null;

    // Max 5 of THIS ammo type from THIS player on screen at once. If they've hit
    // the cap they must switch to another ammo type (or wait for some to expire).
    const mineOfType = bullets.reduce((n, b) =>
      (b.alive && b.owner === this && b.type === this.ammoType) ? n + 1 : n, 0);
    if (mineOfType >= 5) return null;

    const def = AMMO_TYPES[this.ammoType];
    if (this.points < def.cost) return null;

    this.points -= def.cost;

    // Bullet exits from barrel tip
    const barrelEnd = this.bodyW / 2 + 22;
    const bx = this.x + Math.cos(this.angle) * barrelEnd;
    const by = this.y + Math.sin(this.angle) * barrelEnd;
    const b = new Bullet(bx, by, this.angle, this.ammoType, this);
    bullets.push(b);

    if (this.ammoType === 'cannon') this.fireCooldown = 0.10;       // ~10 shots/sec
    else if (this.ammoType === 'seeker') this.fireCooldown = 0.28;  // ~3.5 shots/sec
    else this.fireCooldown = 0.16;                                  // bullet — ~6 shots/sec

    this.muzzleFlash = 1;
    this.recoil = 1;
    return b;
  }

  // Auto-fire cannons (unlimited, no cost) while power-up is active
  autoFire(bullets) {
    if (!this.alive || this.frozen) return null;
    if (this.autoCannonFireTimer > 0) return null;

    // Respect the same 5-on-screen cap (cannon type) as manual fire.
    const mineCannon = bullets.reduce((n, b) =>
      (b.alive && b.owner === this && b.type === 'cannon') ? n + 1 : n, 0);
    if (mineCannon >= 5) return null;

    // Bullet exits from barrel tip
    const barrelEnd = this.bodyW / 2 + 22;
    const bx = this.x + Math.cos(this.angle) * barrelEnd;
    const by = this.y + Math.sin(this.angle) * barrelEnd;
    const b = new Bullet(bx, by, this.angle, 'cannon', this);
    bullets.push(b);

    this.autoCannonFireTimer = 0.08;  // ~12 shots/sec
    this.muzzleFlash = 1;
    this.recoil = 1;
    return b;
  }

  setAmmoType(type) {
    if (AMMO_TYPES[type]) this.ammoType = type;
  }

  die(killer) {
    if (!this.alive) return;
    this.alive = false;
    this.respawnTimer = 1.5;
    if (killer && killer !== this) killer.kills++;
  }

  respawn(gameMap) {
    const pos = gameMap.randomSpawn(this.radius);
    this.x = pos.x;
    this.y = pos.y;
    this.speed = 0;
    this.alive = true;
    this.angle = Math.random() * Math.PI * 2;
    this.shielded = true;
    this.shieldTime = 1.8;
    this._explodedThisDeath = false;
  }

  activateShield(time) {
    this.shielded = true;
    this.shieldTime = Math.max(this.shieldTime, time);
  }

  consumeShield() {
    this.shielded = false;
    this.shieldTime = 0;
  }

  freeze(time) {
    this.frozen = true;
    this.freezeTime = Math.max(this.freezeTime, time);
  }

  activateAutoCannon(time) {
    this.autoCannonActive = true;
    this.autoCannonTime = Math.max(this.autoCannonTime, time);
    this.autoCannonFireTimer = 0;
  }

  draw(ctx) {
    if (!this.alive) {
      this.drawRespawnIndicator(ctx);
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y);

    // Drop shadow (offset, not rotated)
    ctx.save();
    ctx.translate(3, 5);
    ctx.rotate(this.angle);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    this.drawSilhouette(ctx);
    ctx.restore();

    // Body
    ctx.save();
    ctx.rotate(this.angle);
    if (this.recoil > 0) ctx.translate(-this.recoil * 3, 0);
    this.drawBody(ctx);
    this.drawTurret(ctx);
    ctx.restore();

    // Shield ring
    if (this.shielded) {
      const t = performance.now() * 0.005;
      const pulse = 0.5 + Math.sin(t * 2) * 0.3;
      ctx.strokeStyle = '#4fc3f7';
      ctx.lineWidth = 3;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 2);
      ctx.stroke();
      // Inner sparkle
      ctx.strokeStyle = '#b3e5fc';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -t * 20;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Frozen overlay
    if (this.frozen) {
      ctx.fillStyle = 'rgba(128, 222, 234, 0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#80deea';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Ice crystals
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
        ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
        ctx.stroke();
      }
    }

    // Auto-cannon activation ring
    if (this.autoCannonActive) {
      const t = performance.now() * 0.008;
      const pulse = 0.5 + Math.sin(t * 3) * 0.4;
      ctx.strokeStyle = '#ff5722';
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 12, 0, Math.PI * 2);
      ctx.stroke();
      // Rotating flame-like dash pattern
      ctx.strokeStyle = '#ffb300';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 4]);
      ctx.lineDashOffset = -t * 40;
      ctx.globalAlpha = pulse * 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Name label above tank
    ctx.save();
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(this.name, this.x + 1, this.y - 42 + 1);
    ctx.fillStyle = this.color;
    ctx.fillText(this.name, this.x, this.y - 42);
    ctx.restore();
  }

  drawSilhouette(ctx) {
    const w = this.bodyW;
    const h = this.bodyH;
    ctx.fillRect(-w / 2 - 4, -h / 2 - 6, w + 8, 8);
    ctx.fillRect(-w / 2 - 4, h / 2 - 2, w + 8, 8);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 6);
    ctx.fill();
  }

  drawBody(ctx) {
    const w = this.bodyW;
    const h = this.bodyH;

    // === Treads ===
    // Tread base (dark)
    ctx.fillStyle = '#15171b';
    ctx.fillRect(-w / 2 - 5, -h / 2 - 7, w + 10, 9);
    ctx.fillRect(-w / 2 - 5, h / 2 - 2, w + 10, 9);

    // Tread highlight
    ctx.fillStyle = '#252a30';
    ctx.fillRect(-w / 2 - 5, -h / 2 - 7, w + 10, 2);
    ctx.fillRect(-w / 2 - 5, h / 2 - 2, w + 10, 2);

    // Tread segments (animated)
    const segW = 7;
    const segCount = Math.ceil((w + 10) / segW) + 1;
    ctx.fillStyle = '#3a4048';
    for (let i = 0; i < segCount; i++) {
      const offset = ((this.treadOffset % segW) + segW) % segW;
      const sx = -w / 2 - 5 + i * segW - offset;
      if (sx > -w / 2 - 5 - 2 && sx < w / 2 + 5 - 2) {
        ctx.fillRect(sx, -h / 2 - 6, 3, 7);
        ctx.fillRect(sx, h / 2 - 1, 3, 7);
      }
    }

    // === Body ===
    const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, this.color);
    grad.addColorStop(0.5, this.color);
    grad.addColorStop(1, this.secondaryColor);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 6);
    ctx.fill();

    // Body shadow underside
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.roundRect(-w / 2, h / 2 - 8, w, 8, 6);
    ctx.fill();

    // Top highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(-w / 2 + 4, -h / 2 + 3, w - 8, 4);

    // Rivets along the side
    ctx.fillStyle = this.secondaryColor;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * 14, -h / 2 + 8, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(i * 14, h / 2 - 8, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Accent stripe on side
    ctx.fillStyle = this.accentColor;
    ctx.fillRect(-w / 2 + 6, h / 2 - 14, w - 12, 2);

    // Body outline
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 6);
    ctx.stroke();

    // Front "headlight" detail
    ctx.fillStyle = '#fffacc';
    ctx.beginPath();
    ctx.arc(w / 2 - 4, -8, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w / 2 - 4, 8, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Glow
    ctx.fillStyle = 'rgba(255, 250, 200, 0.4)';
    ctx.beginPath();
    ctx.arc(w / 2 - 4, -8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w / 2 - 4, 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawTurret(ctx) {
    // Turret is FIXED — drawn pointing in body direction
    // Barrel
    ctx.fillStyle = '#1c1f24';
    ctx.fillRect(0, -5, 32, 10);
    // Barrel highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(0, -5, 32, 2.5);
    // Barrel shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 3, 32, 2);
    // Barrel tip
    ctx.fillStyle = '#0e1014';
    ctx.fillRect(30, -6, 4, 12);

    // Muzzle flash
    if (this.muzzleFlash > 0) {
      const flashSize = 22 * this.muzzleFlash;
      const fGrad = ctx.createRadialGradient(34, 0, 0, 34, 0, flashSize);
      fGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      fGrad.addColorStop(0.3, 'rgba(255, 220, 100, 0.95)');
      fGrad.addColorStop(0.6, 'rgba(255, 130, 0, 0.7)');
      fGrad.addColorStop(1, 'rgba(255, 70, 0, 0)');
      ctx.fillStyle = fGrad;
      ctx.beginPath();
      ctx.arc(34, 0, flashSize, 0, Math.PI * 2);
      ctx.fill();
      // Flash flicker shapes
      ctx.fillStyle = 'rgba(255, 255, 200, 0.9)';
      ctx.beginPath();
      ctx.moveTo(32, 0);
      ctx.lineTo(34 + flashSize * 0.7, -flashSize * 0.3);
      ctx.lineTo(34 + flashSize, 0);
      ctx.lineTo(34 + flashSize * 0.7, flashSize * 0.3);
      ctx.closePath();
      ctx.fill();
    }

    // Turret dome
    const tGrad = ctx.createRadialGradient(-3, -4, 0, 0, 0, 14);
    tGrad.addColorStop(0, this.color);
    tGrad.addColorStop(0.6, this.color);
    tGrad.addColorStop(1, this.secondaryColor);
    ctx.fillStyle = tGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    // Turret outline
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Turret top highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(-4, -4, 4, 0, Math.PI * 2);
    ctx.fill();

    // Hatch
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.arc(2, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Hatch rim
    ctx.strokeStyle = this.accentColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Antenna
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.lineTo(-12, -10);
    ctx.stroke();
    ctx.fillStyle = this.accentColor;
    ctx.beginPath();
    ctx.arc(-12, -10, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawRespawnIndicator(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = this.color;
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.name} • RESPAWN ${this.respawnTimer.toFixed(1)}s`, this.x, this.y);
    ctx.restore();
  }
}

// Polyfill roundRect
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}
