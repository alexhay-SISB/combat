// ===== Entry point (student page) =====

(function () {
  const canvas = document.getElementById('game-canvas');
  Game.init(canvas);

  // Initialize touch input if on a touch device, OR via ?touch=1 for desktop testing
  const forceTouch = new URLSearchParams(location.search).get('touch') === '1';
  if (typeof TouchInput !== 'undefined' && (Utils.isTouchDevice() || forceTouch)) {
    TouchInput.init();
  }

  // If the teacher dashboard launched us via "Play" (currentMatchId is set),
  // auto-start the quiz with the teacher's configured timers.
  const launchedFromTeacher = localStorage.getItem('combat:currentMatchId');
  if (launchedFromTeacher) {
    const quizSecs = parseInt(localStorage.getItem('combat:quizTimer') || '60');
    const combatSecs = parseInt(localStorage.getItem('combat:combatTimer') || '120');
    Game.startQuiz(quizSecs, combatSecs);
  }
  // Else: the StudentLobby script handles the lobby UI / waiting state.

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
