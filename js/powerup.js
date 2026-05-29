// ===== Power-ups =====

const POWERUP_TYPES = {
  extraBullet: {
    name: '+4 PTS',
    color: '#ffd54f',
    glow: 'rgba(255, 213, 79, 0.6)',
    icon: '+',
  },
  shield: {
    name: 'SHIELD',
    color: '#4fc3f7',
    glow: 'rgba(79, 195, 247, 0.6)',
    icon: '◯',
  },
  freeze: {
    name: 'FREEZE',
    color: '#80deea',
    glow: 'rgba(128, 222, 234, 0.6)',
    icon: '❄',
  },
  autoCannon: {
    name: 'AUTO CANNON',
    color: '#ff5722',
    glow: 'rgba(255, 87, 34, 0.8)',
    icon: '⚡',
  }
};

class PowerUp {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.def = POWERUP_TYPES[type];
    this.radius = 16;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.spinAngle = 0;
    this.alive = true;
    // Lifetime — drops self-destruct after 15s so the map doesn't accumulate
    // uncollected pickups.
    this.lifetime = 15.0;
    this.age = 0;
  }

  update(dt) {
    this.bobPhase += dt * 2;
    this.spinAngle += dt * 1.5;
    this.age += dt;
    if (this.age >= this.lifetime) {
      this.alive = false;
    }
  }

  applyTo(tank, allTanks) {
    if (this.type === 'extraBullet') {
      tank.points += 4;
    } else if (this.type === 'shield') {
      tank.activateShield(15.0);
    } else if (this.type === 'freeze') {
      for (const t of allTanks) {
        if (t !== tank && t.alive) t.freeze(10.0);
      }
    } else if (this.type === 'autoCannon') {
      tank.activateAutoCannon(13.0);  // 13 second auto-cannon
    }
    this.alive = false;
  }

  draw(ctx) {
    if (!this.alive) return;

    const bob = Math.sin(this.bobPhase) * 4;
    const y = this.y + bob;

    // Fade out + blink during the last 2 seconds of life so players know it's
    // about to vanish.
    const remaining = this.lifetime - this.age;
    let alpha = 1;
    if (remaining < 2) {
      const blink = (Math.sin(this.age * 18) + 1) / 2; // 0..1
      alpha = Math.max(0.25, remaining / 2) * (0.5 + 0.5 * blink);
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, y);

    // Outer glow
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 2.5);
    grad.addColorStop(0, this.def.glow);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Rotating ring
    ctx.rotate(this.spinAngle);
    ctx.strokeStyle = this.def.color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(-this.spinAngle);

    // Main body
    ctx.fillStyle = '#0a0e14';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = this.def.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Icon
    ctx.fillStyle = this.def.color;
    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.def.icon, 0, 0);

    ctx.restore();
  }
}
