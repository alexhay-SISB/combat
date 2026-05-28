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
  }

  update(dt) {
    this.bobPhase += dt * 2;
    this.spinAngle += dt * 1.5;
  }

  applyTo(tank, allTanks) {
    if (this.type === 'extraBullet') {
      tank.points += 4;
    } else if (this.type === 'shield') {
      tank.activateShield(10.0);
    } else if (this.type === 'freeze') {
      for (const t of allTanks) {
        if (t !== tank && t.alive) t.freeze(5.0);
      }
    } else if (this.type === 'autoCannon') {
      tank.activateAutoCannon(20.0);  // 20 second auto-cannon
    }
    this.alive = false;
  }

  draw(ctx) {
    if (!this.alive) return;

    const bob = Math.sin(this.bobPhase) * 4;
    const y = this.y + bob;

    ctx.save();
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
