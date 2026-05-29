// ===== Entry point (student page) =====

// --- Disable zoom on iPad / touch screens ---------------------------------
// iOS Safari ignores `user-scalable=no`, so a double-tap or pinch can zoom the
// game in and leave the student stuck (no way to zoom back out mid-match).
// These listeners kill double-tap-zoom and pinch-zoom while leaving the
// joystick/fire buttons (which fire on touchstart) fully functional.
(function disableZoom() {
  // Pinch-zoom (Safari-specific gesture events)
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

  // Double-tap-to-zoom: cancel the second tap if it lands within 300ms of the first.
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // Multi-touch pinch via touchmove (belt-and-suspenders for non-gesture browsers)
  document.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });
})();

(async function () {
  // Initialize Firebase
  let firebaseOK = false;
  if (FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY') {
    firebaseOK = await Firebase.init(FIREBASE_CONFIG);
    if (firebaseOK) {
      console.log('%c[Multi-device] Firebase CONNECTED ✓', 'color: #4caf50; font-weight: bold');
    } else {
      console.error('%c[Multi-device] Firebase FAILED — students will NOT see each other!', 'color: #f44336; font-weight: bold');
    }
  } else {
    console.warn('Firebase config not set; using localStorage only');
  }

  // Show connection badge in lobby
  showConnectionBadge(firebaseOK);

  const canvas = document.getElementById('game-canvas');
  Game.init(canvas);

  // Initialize touch input if on a touch device, OR via ?touch=1 for desktop testing
  const forceTouch = new URLSearchParams(location.search).get('touch') === '1';
  if (typeof TouchInput !== 'undefined' && (Utils.isTouchDevice() || forceTouch)) {
    TouchInput.init();
  }

  // NOTE: We no longer auto-start the quiz from main.js.
  // The StudentLobby detects when teacher starts the round and calls
  // Game.startQuiz() on the student's own device. This enables true
  // multi-device gameplay (each student plays on their own iPad).

  // Quiz "END QUIZ" button
  const endBtn = document.getElementById('quiz-skip-btn');
  if (endBtn) endBtn.addEventListener('click', () => Game.endQuiz());

  // Game loop
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    try {
      Game.update(dt);
      Game.draw();
    } catch (e) {
      console.error('Game loop error:', e);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

// Small floating badge so the user can SEE whether multi-device sync is on.
function showConnectionBadge(connected) {
  const b = document.createElement('div');
  b.id = 'fb-status-badge';
  b.style.cssText = `
    position: fixed; top: 8px; right: 8px;
    padding: 6px 10px; font-family: monospace; font-size: 11px;
    border-radius: 14px; z-index: 99999;
    background: ${connected ? 'rgba(76,175,80,0.9)' : 'rgba(244,67,54,0.95)'};
    color: white; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    pointer-events: none;
  `;
  b.textContent = connected ? '● MULTI-DEVICE' : '● OFFLINE (local only)';
  document.body.appendChild(b);
}
