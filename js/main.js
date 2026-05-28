// ===== Entry point (student page) =====

(async function () {
  // Initialize Firebase
  if (FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY') {
    const success = await Firebase.init(FIREBASE_CONFIG);
    if (success) {
      console.log('Firebase connected for multi-device sync');
    } else {
      console.warn('Firebase init failed; falling back to localStorage');
    }
  } else {
    console.warn('Firebase config not set; using localStorage only');
  }

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
