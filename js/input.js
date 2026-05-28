// ===== Input: unified keyboard controls =====
// Both tanks use the SAME control scheme (arrows + spacebar) because in
// multi-device play each player only controls one tank on their own device.

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
    // When typing in an input/textarea, the game must NOT intercept keys.
    const isTypingInField = (e) => {
      const t = e.target;
      if (!t) return false;
      const tag = (t.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (t.isContentEditable) return true;
      return false;
    };

    // Figure out which tank slot the local player controls so number-key ammo
    // switching always targets THEIR tank.
    const localPlayerSlot = () => {
      if (typeof Game !== 'undefined' && Game.networkRole === 'client') return 2;
      return 1; // host or local mode → P1 slot
    };

    window.addEventListener('keydown', (e) => {
      if (isTypingInField(e)) return;

      const k = e.key.toLowerCase();
      this.keys.add(k);

      // Fire — space (or enter as alternate). Both fire flags set; the inactive
      // slot's flag is harmlessly consumed elsewhere.
      if (k === ' ' || k === 'enter') {
        this.p1FirePressed = true;
        this.p2FirePressed = true;
        e.preventDefault();
      }

      // Ammo switching — 1/2/3 always changes the LOCAL player's tank.
      const slot = localPlayerSlot();
      if (k === '1') { Game.setAmmo(slot, 'bullet'); e.preventDefault(); }
      if (k === '2') { Game.setAmmo(slot, 'cannon'); e.preventDefault(); }
      if (k === '3') { Game.setAmmo(slot, 'seeker'); e.preventDefault(); }

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
    // Unified movement: arrow keys (WASD as alternate). Both tank slots receive
    // the same input — in multi-device mode each device controls one tank, and
    // the host only uses p1 while the client only uses p1||p2 for its own tank.
    const fwd = this.keys.has('arrowup')    || this.keys.has('w');
    const bwd = this.keys.has('arrowdown')  || this.keys.has('s');
    const lft = this.keys.has('arrowleft')  || this.keys.has('a');
    const rht = this.keys.has('arrowright') || this.keys.has('d');

    this.p1.forward = fwd;  this.p1.backward = bwd;
    this.p1.left    = lft;  this.p1.right    = rht;

    this.p2.forward = fwd;  this.p2.backward = bwd;
    this.p2.left    = lft;  this.p2.right    = rht;

    // Held fire (autofire while spacebar / enter held)
    if (this.keys.has(' ') || this.keys.has('enter')) {
      this.p1FirePressed = true;
      this.p2FirePressed = true;
    }

    // === Touch input (iPad) — drives both slots ===
    if (typeof TouchInput !== 'undefined' && TouchInput.active) {
      if (TouchInput.joystickActive) {
        const target = {
          angle: TouchInput.joystickAngle,
          magnitude: TouchInput.joystickMagnitude,
        };
        this.p1.touchTarget = target;
        this.p2.touchTarget = target;
      } else {
        this.p1.touchTarget = null;
        this.p2.touchTarget = null;
      }
      if (TouchInput.fireDown) {
        this.p1FirePressed = true;
        this.p2FirePressed = true;
      }
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
