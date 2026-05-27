// ===== Renderer: particles & effects =====

class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  explode(x, y, color = '#ffd54f', count = 24) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Utils.randFloat(80, 280);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        decay: Utils.randFloat(1.2, 2.5),
        size: Utils.randFloat(2, 6),
        color
      });
    }
    // Smoke ring
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Utils.randFloat(20, 80);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        decay: 0.8,
        size: Utils.randFloat(8, 16),
        color: 'rgba(80, 80, 80, 1)',
        isSmoke: true
      });
    }
  }

  spark(x, y, color = '#ffd54f') {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Utils.randFloat(40, 140);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        decay: 3,
        size: Utils.randFloat(1.5, 3),
        color
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt * p.decay;
      if (p.isSmoke) p.size += dt * 20;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.isSmoke) {
        ctx.globalAlpha *= 0.4;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
