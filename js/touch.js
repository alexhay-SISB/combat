// ===== Touch input (iPad) =====
// Single-stick + fire button. Joystick angle = tank facing direction,
// joystick distance from center = movement speed.

const TouchInput = {
  active: false,        // is touch mode active (any touch input received)
  joystickActive: false,
  joystickTouchId: null,
  joystickAngle: 0,
  joystickMagnitude: 0,
  fireDown: false,
  fireTouchId: null,

  init() {
    if (!Utils.isTouchDevice()) return;
    this.active = true;
    document.getElementById('touch-controls').classList.remove('hidden');

    const joystick = document.getElementById('touch-joystick');
    const stick = joystick.querySelector('.joystick-stick');
    const maxRadius = 55;

    const getCenter = () => {
      const r = joystick.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    joystick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joystickActive = true;
      this.joystickTouchId = t.identifier;
      this.updateStick(t.clientX, t.clientY, getCenter, maxRadius, stick);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystickTouchId) {
          e.preventDefault();
          this.updateStick(t.clientX, t.clientY, getCenter, maxRadius, stick);
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystickTouchId) {
          this.joystickActive = false;
          this.joystickTouchId = null;
          this.joystickMagnitude = 0;
          stick.style.transform = 'translate(-50%, -50%)';
        }
        if (t.identifier === this.fireTouchId) {
          this.fireDown = false;
          this.fireTouchId = null;
          document.getElementById('touch-fire-btn').classList.remove('pressed');
        }
      }
    });
    window.addEventListener('touchcancel', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystickTouchId) {
          this.joystickActive = false;
          this.joystickTouchId = null;
          this.joystickMagnitude = 0;
          stick.style.transform = 'translate(-50%, -50%)';
        }
        if (t.identifier === this.fireTouchId) {
          this.fireDown = false;
          this.fireTouchId = null;
        }
      }
    });

    // Fire button
    const fireBtn = document.getElementById('touch-fire-btn');
    fireBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.fireDown = true;
      this.fireTouchId = e.changedTouches[0].identifier;
      fireBtn.classList.add('pressed');
    }, { passive: false });
  },

  updateStick(cx, cy, getCenter, maxRadius, stickEl) {
    const c = getCenter();
    const dx = cx - c.x;
    const dy = cy - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const clampedDist = Math.min(dist, maxRadius);
    const x = Math.cos(angle) * clampedDist;
    const y = Math.sin(angle) * clampedDist;
    stickEl.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    this.joystickAngle = angle;
    this.joystickMagnitude = clampedDist / maxRadius;
  }
};
