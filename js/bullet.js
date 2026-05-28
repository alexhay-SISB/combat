// ===== Bullets: 3 ammo types =====

const AMMO_TYPES = {
  bullet: {
    name: 'BULLET',
    cost: 1,
    speed: 580,
    radius: 5,
    maxLifetime: 10.0,      // lingers for ricochet plays
    maxBounces: 12,
    requiresBounce: true,   // must bounce off wall to kill
    color: '#ffd54f',
    color2: '#ffb300',
    trailColor: 'rgba(255, 213, 79, 0.45)',
    glowColor: 'rgba(255, 213, 79, 0.9)',
    trailLength: 8,
  },
  cannon: {
    name: 'CANNON',
    cost: 2,
    speed: 1000,
    radius: 9,              // visually larger
    maxLifetime: 12.0,      // travels further & lingers more
    maxBounces: 10,
    requiresBounce: false,
    color: '#ff5722',
    color2: '#d84315',
    trailColor: 'rgba(255, 87, 34, 0.6)',
    glowColor: 'rgba(255, 87, 34, 1)',
    trailLength: 14,
  },
  seeker: {
    name: 'SEEKER',
    cost: 4,
    speed: 400,
    radius: 7,
    maxLifetime: 18.0,      // hunts for up to 18s
    maxBounces: 99,         // unlimited bouncing while it hunts
    requiresBounce: false,
    seeks: true,
    turnRate: 4.2,
    color: '#e040fb',
    color2: '#8e24aa',
    trailColor: 'rgba(224, 64, 251, 0.55)',
    glowColor: 'rgba(224, 64, 251, 1)',
    trailLength: 12,
  }
};

class Bullet {
  constructor(x, y, angle, type, owner) {
    const def = AMMO_TYPES[type];
    this.x = x;
    this.y = y;
    this.type = type;
    this.def = def;
    this.angle = angle;
    this.speed = def.speed;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.radius = def.radius;
    this.lifetime = 0;
    this.bounces = 0;
    this.owner = owner;
    this.alive = true;
    this.trail = [];
    this.pulsePhase = 0;
  }

  update(dt, gameMap, tanks) {
    if (!this.alive) return;

    this.lifetime += dt;
    this.pulsePhase += dt * 8;

    if (this.lifetime > this.def.maxLifetime) {
      this.alive = false;
      return;
    }

    // Seeker tracking
    if (this.def.seeks) {
      const target = this.findTarget(tanks);
      if (target) {
        const desiredAngle = Math.atan2(target.y - this.y, target.x - this.x);
        const diff = Utils.angleDiff(this.angle, desiredAngle);
        const maxTurn = this.def.turnRate * dt;
        const turn = Utils.clamp(diff, -maxTurn, maxTurn);
        this.angle += turn;
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
      }
    }

    // Trail
    this.trail.push({ x: this.x, y: this.y, angle: this.angle, life: 1 });
    if (this.trail.length > this.def.trailLength) this.trail.shift();
    for (const t of this.trail) t.life -= dt * 3;

    // Sub-stepped movement for fast bullets
    const steps = Math.max(1, Math.ceil(Math.abs(this.speed) * dt / 4));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.x += this.vx * stepDt;
      this.y += this.vy * stepDt;

      // Walls
      const hits = gameMap.collide(this.x, this.y, this.radius);
      if (hits.length > 0) {
        const n = hits[0].normal;
        if (n.x !== 0) this.vx = -this.vx;
        if (n.y !== 0) this.vy = -this.vy;
        this.angle = Math.atan2(this.vy, this.vx);
        this.x += n.x * 4;
        this.y += n.y * 4;
        this.bounces++;
        if (this.bounces > this.def.maxBounces) {
          this.alive = false;
          return;
        }
      }

      // Tanks — bullets PENETRATE: can kill multiple tanks in one flight
      for (const tank of tanks) {
        if (!tank.alive) continue;
        if (tank === this.owner && this.lifetime < 0.15) continue;

        const d = Utils.dist(this.x, this.y, tank.x, tank.y);
        if (d < tank.radius + this.radius) {
          const canKill = !this.def.requiresBounce || this.bounces > 0;

          if (tank.shielded) {
            // Shields still stop the bullet (absorb the hit)
            if (tank !== this.owner) tank.consumeShield();
            this.alive = false;
            return;
          }

          if (canKill) {
            // Tank dies — but bullet KEEPS GOING (penetrates)
            // If this tank is the owner: self-kill, no kill awarded
            // If this tank is the opponent: kill credited to owner (even if owner is already dead)
            tank.die(this.owner);
            // Don't stop the bullet — fall through to check the other tank
          }
          // else (requiresBounce + no bounces yet): pass through harmlessly
        }
      }
    }
  }

  findTarget(tanks) {
    let best = null;
    let bestD = Infinity;
    for (const t of tanks) {
      if (t === this.owner || !t.alive) continue;
      const d = Utils.dist(this.x, this.y, t.x, t.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  draw(ctx) {
    if (!this.alive) return;

    if (this.type === 'bullet') this.drawBullet(ctx);
    else if (this.type === 'cannon') this.drawCannon(ctx);
    else if (this.type === 'seeker') this.drawSeeker(ctx);
  }

  drawBullet(ctx) {
    // Yellow pellet — small, fast, bouncing
    // Trail (dotted)
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      if (t.life <= 0) continue;
      ctx.globalAlpha = t.life * 0.5;
      ctx.fillStyle = this.def.trailColor;
      const r = this.radius * (0.3 + i / this.trail.length * 0.5);
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Glow
    const glowR = this.radius * 3.5;
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowR);
    grad.addColorStop(0, this.def.glowColor);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Outer ring
    ctx.fillStyle = this.def.color2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 1, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = this.def.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Bright center
    ctx.fillStyle = '#fffacc';
    ctx.beginPath();
    ctx.arc(this.x - 1, this.y - 1, this.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCannon(ctx) {
    // Orange shell — large, elongated, intense trail
    // Smoke / flame trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      if (t.life <= 0) continue;
      ctx.globalAlpha = t.life * 0.7;
      // Outer trail (red/dark)
      ctx.fillStyle = `rgba(255, 60, 0, ${t.life * 0.5})`;
      const r = this.radius * (0.5 + i / this.trail.length * 0.6);
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fill();
      // Inner trail (bright orange)
      ctx.fillStyle = `rgba(255, 180, 50, ${t.life * 0.7})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Big intense glow
    const glowR = this.radius * 4;
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowR);
    grad.addColorStop(0, this.def.glowColor);
    grad.addColorStop(0.5, 'rgba(255, 87, 34, 0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Elongated shell shape
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Shell body (oval)
    ctx.fillStyle = this.def.color2;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius + 4, this.radius, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.def.color;
    ctx.beginPath();
    ctx.ellipse(-1, -1, this.radius + 2, this.radius - 1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bright tip
    ctx.fillStyle = '#fff8e0';
    ctx.beginPath();
    ctx.ellipse(this.radius - 1, 0, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawSeeker(ctx) {
    // Pink/magenta dart — homing
    // Wavy trail with side-spread
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      if (t.life <= 0) continue;
      ctx.globalAlpha = t.life * 0.6;
      ctx.fillStyle = this.def.trailColor;
      const r = this.radius * (0.4 + i / this.trail.length * 0.7);
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fill();
      // Sparkle dots offset perpendicular to trail
      const perp = t.angle + Math.PI / 2;
      const offset = Math.sin(i + this.pulsePhase) * 4;
      ctx.fillStyle = `rgba(255, 200, 255, ${t.life * 0.6})`;
      ctx.beginPath();
      ctx.arc(t.x + Math.cos(perp) * offset, t.y + Math.sin(perp) * offset, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pulsing glow
    const pulse = 1 + Math.sin(this.pulsePhase) * 0.3;
    const glowR = this.radius * 4 * pulse;
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowR);
    grad.addColorStop(0, this.def.glowColor);
    grad.addColorStop(0.5, 'rgba(224, 64, 251, 0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Dart/arrow shape pointing in direction of travel
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Outer dart
    ctx.fillStyle = this.def.color2;
    ctx.beginPath();
    ctx.moveTo(this.radius + 4, 0);
    ctx.lineTo(-this.radius - 2, -this.radius);
    ctx.lineTo(-this.radius, 0);
    ctx.lineTo(-this.radius - 2, this.radius);
    ctx.closePath();
    ctx.fill();

    // Inner dart
    ctx.fillStyle = this.def.color;
    ctx.beginPath();
    ctx.moveTo(this.radius + 2, 0);
    ctx.lineTo(-this.radius, -this.radius * 0.7);
    ctx.lineTo(-this.radius * 0.5, 0);
    ctx.lineTo(-this.radius, this.radius * 0.7);
    ctx.closePath();
    ctx.fill();

    // Bright tip
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.radius + 1, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
