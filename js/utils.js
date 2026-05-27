// ===== Utility Functions =====

const Utils = {
  // Clamp a value between min and max
  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  },

  // Linear interpolation
  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  // Distance between two points
  dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  },

  // Random integer in range [min, max]
  randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // Random float in range [min, max]
  randFloat(min, max) {
    return Math.random() * (max - min) + min;
  },

  // Normalize an angle to [-PI, PI]
  normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  },

  // Shortest angle difference (a -> b)
  angleDiff(a, b) {
    return this.normalizeAngle(b - a);
  },

  // Circle-rectangle collision
  circleRectCollide(cx, cy, r, rx, ry, rw, rh) {
    const closestX = this.clamp(cx, rx, rx + rw);
    const closestY = this.clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) < (r * r);
  },

  // Get the side of a rectangle a circle is hitting (for bounce direction)
  // Returns { normal: {x, y}, side: 'left'|'right'|'top'|'bottom' }
  rectCircleNormal(cx, cy, rx, ry, rw, rh) {
    const closestX = this.clamp(cx, rx, rx + rw);
    const closestY = this.clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;

    if (Math.abs(dx) > Math.abs(dy)) {
      return { x: dx > 0 ? 1 : -1, y: 0 };
    } else {
      return { x: 0, y: dy > 0 ? 1 : -1 };
    }
  },

  // Detect device type
  isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }
};
