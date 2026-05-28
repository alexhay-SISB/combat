// ===== Input: keyboard (touch comes in Phase 2) =====

class InputManager {
  constructor() {
    this.keys = new Set();
    this.p1 = this.makeInputState();
    this.p2 = this.makeInputState();
    this.p1FirePressed = false;
    this.p2FirePressed = false;
    this.setupKeyboard();
  }

  makeInputState() {
    return {
      forward: false,
      backward: false,
      left: false,
      right: false,
      touchTarget: null,    // { angle, magnitude } when touch is active
    };
  }

  setupKeyboard() {
    // When the user is typing in an input/textarea, the game must NOT intercept keys.
    // Otherwise space (fire), enter, numbers (ammo), and arrows get swallowed.
    const isTypingInField = (e) => {
      const t = e.target;
      if (!t) return false;
      const tag = (t.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (t.isContentEditable) return true;
      return false;
    };

    window.addEventListener('keydown', (e) => {
      // Let text inputs receive their keystrokes — including space, enter, digits.
      if (isTypingInField(e)) return;

      const k = e.key.toLowerCase();
      this.keys.add(k);

      // Fire
      if (k === ' ') { this.p1FirePressed = true; e.preventDefault(); }
      if (k === 'enter') { this.p2FirePressed = true; e.preventDefault(); }

      // Ammo switching
      if (k === '1') { Game.setAmmo(1, 'bullet'); e.preventDefault(); }
      if (k === '2') { Game.setAmmo(1, 'cannon'); e.preventDefault(); }
      if (k === '3') { Game.setAmmo(1, 'seeker'); e.preventDefault(); }
      if (k === '8') { Game.setAmmo(2, 'bullet'); e.preventDefault(); }
      if (k === '9') { Game.setAmmo(2, 'cannon'); e.preventDefault(); }
      if (k === '0') { Game.setAmmo(2, 'seeker'); e.preventDefault(); }

      // Block scroll keys
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (isTypingInField(e)) return;
      this.keys.delete(e.key.toLowerCase());
    });
  }

  update() {
    // Player 1: WASD
    this.p1.forward = this.keys.has('w');
    this.p1.backward = this.keys.has('s');
    this.p1.left = this.keys.has('a');
    this.p1.right = this.keys.has('d');

    // Player 2: Arrows
    this.p2.forward = this.keys.has('arrowup');
    this.p2.backward = this.keys.has('arrowdown');
    this.p2.left = this.keys.has('arrowleft');
    this.p2.right = this.keys.has('arrowright');

    // Held fire (autofire on hold)
    if (this.keys.has(' ')) this.p1FirePressed = true;
    if (this.keys.has('enter')) this.p2FirePressed = true;

    // === Touch input (iPad) — drives Player 1 ===
    if (typeof TouchInput !== 'undefined' && TouchInput.active) {
      if (TouchInput.joystickActive) {
        this.p1.touchTarget = {
          angle: TouchInput.joystickAngle,
          magnitude: TouchInput.joystickMagnitude,
        };
      } else {
        this.p1.touchTarget = null;
      }
      if (TouchInput.fireDown) this.p1FirePressed = true;
    }
  }

  consumeFire(player) {
    if (player === 1) {
      const f = this.p1FirePressed;
      this.p1FirePressed = false;
      return f;
    } else {
      const f = this.p2FirePressed;
      this.p2FirePressed = false;
      return f;
    }
  }
}
