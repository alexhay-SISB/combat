// ===== Map: walls, tiled terrain, decorations =====

class GameMap {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.tileSize = 40;
    this.walls = [];
    this.decorations = [];
    this.backgroundCanvas = null;
    this.generate();
    this.prerender();
  }

  generate() {
    this.walls = [];

    const w = this.width;
    const h = this.height;
    const cx = w / 2;
    const cy = h / 2;

    // Border walls (thick perimeter)
    const t = 26;
    this.walls.push(new Wall(0, 0, w, t, true));
    this.walls.push(new Wall(0, h - t, w, t, true));
    this.walls.push(new Wall(0, 0, t, h, true));
    this.walls.push(new Wall(w - t, 0, t, h, true));

    // === ATARI COMBAT-style symmetric maze ===

    // Top-center & bottom-center vertical bars (the "I" shapes at top/bottom)
    this.walls.push(new Wall(cx - 20, 80, 40, 110));
    this.walls.push(new Wall(cx - 20, h - 190, 40, 110));

    // Four corner horizontal bars (pulled back toward edges for wider gap to brackets)
    this.walls.push(new Wall(130, 90, 120, 30));
    this.walls.push(new Wall(w - 250, 90, 120, 30));
    this.walls.push(new Wall(130, h - 120, 120, 30));
    this.walls.push(new Wall(w - 250, h - 120, 120, 30));

    // === Left bracket  ] -shape opening toward LEFT border ===
    // Spine sits on the RIGHT side of the bracket (closer to center)
    // Stubs extend LEFT from the spine toward the border
    // Tank spawns inside this pocket between border and spine
    // Moved 100px further from the left edge
    this.walls.push(new Wall(320, 220, 32, 320));   // vertical spine
    this.walls.push(new Wall(220, 220, 100, 32));   // top stub (extends left)
    this.walls.push(new Wall(220, 508, 100, 32));   // bottom stub (extends left)

    // === Right bracket  [ -shape opening toward RIGHT border (mirror) ===
    this.walls.push(new Wall(w - 352, 220, 32, 320));   // vertical spine
    this.walls.push(new Wall(w - 320, 220, 100, 32));   // top stub (extends right)
    this.walls.push(new Wall(w - 320, 508, 100, 32));   // bottom stub (extends right)

    // === Two mid-field accent bars ===
    this.walls.push(new Wall(480, cy - 14, 90, 28));
    this.walls.push(new Wall(w - 570, cy - 14, 90, 28));

    // Decorations (no collision)
    this.generateDecorations();
  }

  generateDecorations() {
    // Seeded RNG for deterministic decoration placement
    let seed = 47291;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let i = 0; i < 200; i++) {
      const x = rand() * this.width;
      const y = rand() * this.height;
      const t = rand();
      let deco;
      if (t < 0.45) deco = { type: 'grass', x, y, size: rand() * 3 + 3, variant: Math.floor(rand() * 3) };
      else if (t < 0.65) deco = { type: 'flower', x, y, color: ['#e91e63', '#fff', '#ffd54f', '#80d8ff'][Math.floor(rand() * 4)] };
      else if (t < 0.8) deco = { type: 'rock', x, y, size: rand() * 4 + 2 };
      else if (t < 0.92) deco = { type: 'dirt', x, y, size: rand() * 28 + 20, angle: rand() * Math.PI };
      else deco = { type: 'mushroom', x, y };

      // Skip if overlaps a wall (with buffer)
      let collides = false;
      for (const w of this.walls) {
        if (x >= w.x - 8 && x <= w.x + w.w + 8 && y >= w.y - 8 && y <= w.y + w.h + 8) {
          collides = true;
          break;
        }
      }
      if (!collides) this.decorations.push(deco);
    }
  }

  prerender() {
    // Pre-render the background once for performance
    this.backgroundCanvas = document.createElement('canvas');
    this.backgroundCanvas.width = this.width;
    this.backgroundCanvas.height = this.height;
    const ctx = this.backgroundCanvas.getContext('2d');

    // Base grass color
    const baseGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    baseGrad.addColorStop(0, '#3e6b3e');
    baseGrad.addColorStop(1, '#2f5631');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Tiled grass variation
    let s = 7777;
    const trand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };

    const tile = this.tileSize;
    for (let y = 0; y < this.height; y += tile) {
      for (let x = 0; x < this.width; x += tile) {
        const r = trand();
        if (r < 0.35) {
          ctx.fillStyle = `rgba(120, 170, 100, ${0.10 + r * 0.12})`;
          ctx.fillRect(x, y, tile, tile);
        } else if (r < 0.55) {
          ctx.fillStyle = `rgba(40, 80, 50, ${0.10 + r * 0.10})`;
          ctx.fillRect(x, y, tile, tile);
        }

        // Subtle dotted texture
        if (r < 0.7) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.fillRect(x + trand() * tile, y + trand() * tile, 2, 2);
          ctx.fillRect(x + trand() * tile, y + trand() * tile, 2, 2);
        }
      }
    }

    // Decorations first (under walls visually, but walls are drawn live)
    for (const d of this.decorations) {
      this.drawDecoration(ctx, d);
    }

    // Vignette for depth
    const vGrad = ctx.createRadialGradient(
      this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.35,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.75
    );
    vGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vGrad.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawDecoration(ctx, d) {
    ctx.save();
    if (d.type === 'grass') {
      // Tufts of grass
      const colors = ['#5a8a5a', '#6a9a6a', '#4a7a4a'];
      ctx.fillStyle = colors[d.variant];
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(d.x + i * 2, d.y - (i % 2), 1.5, d.size + (i % 2));
      }
    } else if (d.type === 'flower') {
      // Stem
      ctx.fillStyle = '#3a5a3a';
      ctx.fillRect(d.x - 0.5, d.y, 1.5, 5);
      // Petals
      ctx.fillStyle = d.color;
      for (let a = 0; a < 4; a++) {
        const px = d.x + Math.cos(a * Math.PI / 2) * 2;
        const py = d.y - 1 + Math.sin(a * Math.PI / 2) * 2;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Center
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc(d.x, d.y - 1, 1.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.type === 'rock') {
      // Base shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(d.x + 1, d.y + 2, d.size, d.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Rock
      ctx.fillStyle = '#6a6a72';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.fillStyle = '#9a9aa2';
      ctx.beginPath();
      ctx.arc(d.x - d.size * 0.3, d.y - d.size * 0.3, d.size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.type === 'dirt') {
      // Subtle dirt patch
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, d.size);
      grad.addColorStop(0, 'rgba(120, 90, 60, 0.45)');
      grad.addColorStop(1, 'rgba(120, 90, 60, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, d.size, d.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (d.type === 'mushroom') {
      // Cute mushroom
      ctx.fillStyle = '#f5f0e0';
      ctx.fillRect(d.x - 1, d.y, 2, 4);
      ctx.fillStyle = '#d32f2f';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 3, Math.PI, Math.PI * 2);
      ctx.fill();
      // Spots
      ctx.fillStyle = '#fff';
      ctx.fillRect(d.x - 1.5, d.y - 1, 1, 1);
      ctx.fillRect(d.x + 0.5, d.y - 1.5, 1, 1);
    }
    ctx.restore();
  }

  collide(cx, cy, r) {
    const hits = [];
    for (const w of this.walls) {
      if (Utils.circleRectCollide(cx, cy, r, w.x, w.y, w.w, w.h)) {
        const n = Utils.rectCircleNormal(cx, cy, w.x, w.y, w.w, w.h);
        hits.push({ wall: w, normal: n });
      }
    }
    return hits;
  }

  randomSpawn(radius = 24, padding = 60) {
    for (let i = 0; i < 200; i++) {
      const x = Utils.randFloat(padding, this.width - padding);
      const y = Utils.randFloat(padding, this.height - padding);
      if (this.collide(x, y, radius + 12).length === 0) {
        return { x, y };
      }
    }
    return { x: this.width / 2, y: this.height / 2 };
  }

  draw(ctx) {
    // Draw pre-rendered background
    ctx.drawImage(this.backgroundCanvas, 0, 0);

    // Draw walls (live, so they cast dynamic shadow)
    for (const w of this.walls) {
      w.drawShadow(ctx);
    }
    for (const w of this.walls) {
      w.draw(ctx);
    }
  }
}

class Wall {
  constructor(x, y, w, h, isBorder = false) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.isBorder = isBorder;
  }

  drawShadow(ctx) {
    // Drop shadow on ground (offset down-right)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(this.x + 6, this.y + this.h, this.w, 8);
    ctx.fillRect(this.x + this.w, this.y + 6, 8, this.h);
    // Soft corner
    ctx.fillRect(this.x + this.w, this.y + this.h, 8, 8);
  }

  draw(ctx) {
    const { x, y, w, h, isBorder } = this;

    // Main body gradient (stone/concrete)
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (isBorder) {
      grad.addColorStop(0, '#65707e');
      grad.addColorStop(0.5, '#454e5c');
      grad.addColorStop(1, '#2a323e');
    } else {
      grad.addColorStop(0, '#8a96a4');
      grad.addColorStop(0.5, '#65707e');
      grad.addColorStop(1, '#3e4858');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // Brick pattern lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.lineWidth = 1;
    const brickH = 14;
    const brickW = 28;

    // Horizontal mortar lines
    for (let by = brickH; by < h; by += brickH) {
      ctx.beginPath();
      ctx.moveTo(x, y + by);
      ctx.lineTo(x + w, y + by);
      ctx.stroke();
    }
    // Vertical mortar lines (staggered)
    let row = 0;
    for (let by = 0; by < h; by += brickH) {
      const offset = (row % 2 === 0) ? 0 : brickW / 2;
      for (let bx = offset; bx < w; bx += brickW) {
        if (bx === 0 || bx >= w) continue;
        ctx.beginPath();
        ctx.moveTo(x + bx, y + by);
        ctx.lineTo(x + bx, y + Math.min(by + brickH, h));
        ctx.stroke();
      }
      row++;
    }

    // Top edge highlight (light catches top)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(x, y, w, 3);
    // Left edge subtle highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(x, y, 2, h);

    // Bottom & right shadow edges
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y + h - 3, w, 3);
    ctx.fillRect(x + w - 3, y, 3, h);

    // Outline
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // Random rivets on borders (decoration)
    if (isBorder && w > 60 && h > 60) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      // No rivets — keep border clean
    } else if (!isBorder) {
      // Small rivet at each corner-ish position
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      const r = 2;
      ctx.beginPath();
      ctx.arc(x + 6, y + 6, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + w - 6, y + 6, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 6, y + h - 6, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + w - 6, y + h - 6, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
