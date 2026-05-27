// ===== Game manager =====

// Cross-tab communication for live spectating + leaderboard updates
let broadcastChannel = null;
let lastBroadcast = 0;
try {
  broadcastChannel = new BroadcastChannel('combat-events');
} catch (e) {
  broadcastChannel = null;
}

const Game = {
  canvas: null,
  ctx: null,

  mapWidth: 1280,
  mapHeight: 760,

  gameMap: null,
  tanks: [],
  bullets: [],
  powerups: [],
  particles: null,
  input: null,

  // ===== State machine =====
  // 'menu' | 'quiz' | 'combat' | 'results'
  state: 'menu',

  // Quiz state
  quizzes: [null, null],   // [p1Quiz, p2Quiz]
  quizTimeLimit: 60,
  quizTimeRemaining: 0,

  // Match state
  matchTime: 120,
  timeRemaining: 120,
  ended: false,
  shakeAmount: 0,

  // Power-ups
  maxPowerupsPerGame: 3,
  powerupsSpawned: 0,
  nextPowerupTime: 0,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = new ParticleSystem();
    this.input = new InputManager();
    this.resize();
    this.setupAmmoButtons();
    this.setupQuizInput();
    this.applyTeacherSettings();
    window.addEventListener('resize', () => this.resize());
  },

  // Read settings stored by the teacher dashboard (localStorage)
  applyTeacherSettings() {
    try {
      const qRaw = localStorage.getItem('combat:questions');
      if (qRaw) {
        const customQs = JSON.parse(qRaw);
        if (customQs && customQs.length > 0) {
          window.LOADED_QUESTIONS = customQs;
        }
      }
    } catch (e) {}

    // Apply teacher's timer settings to dropdowns IF they exist (legacy layout)
    const quizT = localStorage.getItem('combat:quizTimer');
    const combatT = localStorage.getItem('combat:combatTimer');
    const quizSel = document.getElementById('quiz-timer-sel');
    const combatSel = document.getElementById('combat-timer-sel');
    if (quizT && quizSel) quizSel.value = quizT;
    if (combatT && combatSel) combatSel.value = combatT;

    // Update menu hint if present (legacy layout)
    const qSource = window.LOADED_QUESTIONS
      ? `${window.LOADED_QUESTIONS.length} custom questions loaded`
      : `${TEST_QUESTIONS.length} test questions`;
    const p1Name = localStorage.getItem('combat:p1Name') || '';
    const p2Name = localStorage.getItem('combat:p2Name') || '';
    const namesText = (p1Name || p2Name)
      ? `${p1Name || 'Red'}  vs  ${p2Name || 'Blue'}`
      : '';
    const hintEl = document.querySelector('#overlay .hint');
    if (hintEl) {
      hintEl.innerHTML = `Answer questions to earn ammo, then battle!<br>
        <span class="config-line">📝 ${qSource}${namesText ? '  ·  👥 ' + namesText : ''}</span>`;
    }
  },

  resize() {
    const sideMargin = 360;
    const verticalPadding = 110;
    const maxW = Math.max(600, window.innerWidth - sideMargin);
    const maxH = Math.max(400, window.innerHeight - verticalPadding);
    const aspect = this.mapWidth / this.mapHeight;
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    this.canvas.width = this.mapWidth;
    this.canvas.height = this.mapHeight;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  },

  setupAmmoButtons() {
    document.querySelectorAll('.ammo-btn').forEach(btn => {
      const fire = (e) => {
        e.preventDefault();
        const player = parseInt(btn.dataset.player);
        const ammo = btn.dataset.ammo;
        this.setAmmo(player, ammo);
        btn.blur();
      };
      btn.addEventListener('pointerdown', fire);
      btn.addEventListener('click', fire);
    });
  },

  setupQuizInput() {
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'quiz') return;
      const k = e.key.toLowerCase();
      const p1Keys = ['a', 's', 'd', 'f'];
      const p2Keys = ['h', 'j', 'k', 'l'];
      const p1Idx = p1Keys.indexOf(k);
      const p2Idx = p2Keys.indexOf(k);
      if (p1Idx >= 0) { this.answerQuiz(1, p1Idx); e.preventDefault(); }
      if (p2Idx >= 0) { this.answerQuiz(2, p2Idx); e.preventDefault(); }
    });
  },

  setAmmo(player, type) {
    const tank = this.tanks[player - 1];
    if (!tank) return;
    tank.setAmmoType(type);
    document.querySelectorAll(`#p${player}-ammo .ammo-btn`).forEach(b => {
      b.classList.toggle('active', b.dataset.ammo === type);
    });
  },

  // ===== Quiz =====

  startQuiz(quizSeconds, combatSeconds) {
    this.state = 'quiz';
    this.quizTimeLimit = quizSeconds;
    this.quizTimeRemaining = quizSeconds;
    this.matchTime = combatSeconds;

    const bank = window.LOADED_QUESTIONS || TEST_QUESTIONS;
    this.quizzes[0] = new Quiz(1, bank);
    this.quizzes[1] = new Quiz(2, bank);

    document.getElementById('quiz-overlay').classList.remove('hidden');
    // Hide either legacy menu or the lobby overlay
    const legacy = document.getElementById('overlay');
    if (legacy) legacy.classList.add('hidden');
    const lobby = document.getElementById('lobby-overlay');
    if (lobby) lobby.classList.add('hidden');

    this.renderQuizPanel(1);
    this.renderQuizPanel(2);
  },

  answerQuiz(player, optionIndex) {
    const quiz = this.quizzes[player - 1];
    if (!quiz || !quiz.canAnswer()) return;
    quiz.answer(optionIndex);
    this.renderQuizPanel(player);
  },

  renderQuizPanel(player) {
    const quiz = this.quizzes[player - 1];
    if (!quiz) return;
    const q = quiz.currentQuestion();
    const p = player;
    const keys = p === 1 ? ['A', 'S', 'D', 'F'] : ['H', 'J', 'K', 'L'];

    document.getElementById(`p${p}-question`).textContent = q.text;
    document.getElementById(`p${p}-quiz-score`).textContent = quiz.score;
    document.getElementById(`p${p}-quiz-stats`).textContent =
      `${quiz.correct}/${quiz.answered}`;

    const diffEl = document.getElementById(`p${p}-diff`);
    if (q.difficulty === 'hard') {
      diffEl.textContent = `HARD · 2pt · ${q.subject || ''}`;
      diffEl.classList.add('hard');
    } else {
      diffEl.textContent = `EASY · 1pt · ${q.subject || ''}`;
      diffEl.classList.remove('hard');
    }

    // Streak indicator
    const streakEl = document.getElementById(`p${p}-streak`);
    if (streakEl) {
      if (quiz.streak >= 3) {
        const fires = '🔥'.repeat(Math.min(3, Math.floor(quiz.streak / 3)));
        streakEl.innerHTML = `${fires} Streak ${quiz.streak}`;
        streakEl.classList.add('active');
      } else if (quiz.streak >= 1) {
        streakEl.innerHTML = `Streak ${quiz.streak}`;
        streakEl.classList.remove('active');
      } else {
        streakEl.innerHTML = '&nbsp;';
        streakEl.classList.remove('active');
      }
    }

    // Read-time indicator + feedback message
    const statusEl = document.getElementById(`p${p}-status`);
    if (statusEl) {
      if (quiz.feedback) {
        const remain = Math.ceil(quiz.feedback.timeLeft);
        if (quiz.feedback.type === 'correct') {
          let msg = `✓ +${quiz.feedback.pointsEarned}pt`;
          if (quiz.feedback.bonusPoints > 0) {
            msg += ` (incl. +${quiz.feedback.bonusPoints} streak bonus!)`;
          }
          statusEl.innerHTML = msg;
          statusEl.className = 'quiz-status correct';
        } else {
          statusEl.innerHTML = `✗ Wrong — next question in ${remain}s`;
          statusEl.className = 'quiz-status wrong';
        }
      } else if (quiz.readTime > 0) {
        statusEl.innerHTML = `📖 Read the question…`;
        statusEl.className = 'quiz-status reading';
      } else {
        statusEl.innerHTML = '&nbsp;';
        statusEl.className = 'quiz-status';
      }
    }

    // Render answer options
    const optsEl = document.getElementById(`p${p}-options`);
    optsEl.innerHTML = '';
    const canClick = quiz.canAnswer();
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option';
      btn.innerHTML = `<span class="key-hint">${keys[i]}</span><span>${opt}</span>`;
      btn.disabled = !canClick;
      if (!canClick && !quiz.feedback) btn.classList.add('reading');

      if (quiz.feedback) {
        if (i === quiz.feedback.correctIndex) btn.classList.add('show-correct');
        if (i === quiz.feedback.pickedIndex) {
          btn.classList.add(quiz.feedback.type === 'correct' ? 'correct' : 'wrong');
        }
      }
      btn.addEventListener('click', () => this.answerQuiz(p, i));
      optsEl.appendChild(btn);
    });
  },

  updateQuiz(dt) {
    this.quizTimeRemaining -= dt;
    if (this.quizTimeRemaining <= 0) {
      this.quizTimeRemaining = 0;
      this.endQuiz();
      return;
    }

    // Update each quiz; re-render when state changes (feedback ends, read-time ends, countdown ticks)
    for (let i = 0; i < 2; i++) {
      const q = this.quizzes[i];
      const hadFeedback = !!q.feedback;
      const wasReading = q.readTime > 0;
      const oldFeedbackSecs = q.feedback ? Math.ceil(q.feedback.timeLeft) : -1;

      q.update(dt);

      const newFeedbackSecs = q.feedback ? Math.ceil(q.feedback.timeLeft) : -1;
      const feedbackEnded = hadFeedback && !q.feedback;
      const readingEnded = wasReading && q.readTime <= 0;
      const countdownTicked = q.feedback && newFeedbackSecs !== oldFeedbackSecs;

      if (feedbackEnded || readingEnded || countdownTicked) {
        this.renderQuizPanel(i + 1);
      }
    }

    // Quiz timer display
    const m = Math.floor(this.quizTimeRemaining / 60);
    const s = Math.floor(this.quizTimeRemaining % 60);
    const tv = document.getElementById('quiz-timer-value');
    tv.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    if (this.quizTimeRemaining < 10) tv.classList.add('warning');
    else tv.classList.remove('warning');
  },

  endQuiz() {
    document.getElementById('quiz-overlay').classList.add('hidden');
    // Carry scores forward as ammo budgets
    const p1Points = this.quizzes[0].score;
    const p2Points = this.quizzes[1].score;
    this.startMatch(p1Points, p2Points);
  },

  // ===== Combat =====

  startMatch(p1StartPoints = 50, p2StartPoints = 50) {
    this.state = 'combat';
    this.gameMap = new GameMap(this.mapWidth, this.mapHeight);

    const bracketCenterY = this.mapHeight / 2;
    const p1x = 170;
    const p2x = this.mapWidth - 170;

    // Use teacher-configured names if set
    const p1Name = (localStorage.getItem('combat:p1Name') || 'RED').toUpperCase().slice(0, 14);
    const p2Name = (localStorage.getItem('combat:p2Name') || 'BLUE').toUpperCase().slice(0, 14);

    this.tanks = [
      new Tank(p1x, bracketCenterY, '#ff5252', '#b71c1c', '#ffeb3b', p1Name),
      new Tank(p2x, bracketCenterY, '#4fc3f7', '#0277bd', '#fff176', p2Name),
    ];
    this.tanks[0].angle = 0;
    this.tanks[1].angle = Math.PI;

    // Update HUD labels
    document.querySelector('#p1-hud .player-name').textContent = p1Name + ' TANK';
    document.querySelector('#p2-hud .player-name').textContent = p2Name + ' TANK';

    // Override starting points with quiz-earned scores
    this.tanks[0].points = p1StartPoints;
    this.tanks[1].points = p2StartPoints;

    this.bullets = [];
    this.powerups = [];
    this.powerupsSpawned = 0;
    this.nextPowerupTime = Utils.randFloat(8, 15);

    this.timeRemaining = this.matchTime;
    this.ended = false;
  },

  update(dt) {
    if (this.state === 'quiz') {
      this.updateQuiz(dt);
      return;
    }
    if (this.state !== 'combat') return;

    this.input.update();

    this.timeRemaining -= dt;
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.endMatch();
    }

    this.tanks[0].update(dt, this.input.p1, this.gameMap);
    this.tanks[1].update(dt, this.input.p2, this.gameMap);

    if (this.input.consumeFire(1)) {
      const b = this.tanks[0].tryFire(this.bullets);
      if (b) {
        this.particles.spark(b.x, b.y, AMMO_TYPES[b.type].color);
        this.shakeAmount = Math.max(this.shakeAmount, 2);
      }
    }
    if (this.input.consumeFire(2)) {
      const b = this.tanks[1].tryFire(this.bullets);
      if (b) {
        this.particles.spark(b.x, b.y, AMMO_TYPES[b.type].color);
        this.shakeAmount = Math.max(this.shakeAmount, 2);
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const wasAlive = b.alive;
      b.update(dt, this.gameMap, this.tanks);
      if (!b.alive && wasAlive) this.particles.spark(b.x, b.y, b.def.color);
      if (!b.alive) this.bullets.splice(i, 1);
    }

    for (const tank of this.tanks) {
      if (!tank.alive && !tank._explodedThisDeath) {
        this.particles.explode(tank.x, tank.y, tank.color, 32);
        this.shakeAmount = 14;
        tank._explodedThisDeath = true;
      }
      if (tank.alive) tank._explodedThisDeath = false;
    }

    if (this.powerupsSpawned < this.maxPowerupsPerGame) {
      this.nextPowerupTime -= dt;
      if (this.nextPowerupTime <= 0) {
        this.spawnPowerup();
        this.powerupsSpawned++;
        this.nextPowerupTime = Utils.randFloat(15, 25);
      }
    }

    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.update(dt);

      let pickedBy = null;
      let bestDist = Infinity;
      for (const tank of this.tanks) {
        if (!tank.alive) continue;
        const d = Utils.dist(p.x, p.y, tank.x, tank.y);
        if (d < p.radius + tank.radius && d < bestDist) {
          pickedBy = tank;
          bestDist = d;
        }
      }
      if (pickedBy) {
        p.applyTo(pickedBy, this.tanks);
        this.particles.spark(p.x, p.y, p.def.color);
      }

      if (!p.alive) this.powerups.splice(i, 1);
    }

    this.particles.update(dt);

    if (this.shakeAmount > 0) this.shakeAmount = Math.max(0, this.shakeAmount - dt * 30);

    this.updateHUD();

    // Broadcast live state (throttled to ~12fps for spectator)
    // ALWAYS run — broadcastState writes localStorage even when BroadcastChannel is null
    const now = performance.now();
    if (now - lastBroadcast > 80) {
      lastBroadcast = now;
      this.broadcastState();
    }
  },

  broadcastState() {
    const matchId = localStorage.getItem('combat:currentMatchId') || 'local';
    const payload = {
      type: 'state-update',
      matchId,
      time: this.timeRemaining,
      tanks: this.tanks.map(t => ({
        x: Math.round(t.x), y: Math.round(t.y), angle: t.angle,
        name: t.name,
        kills: t.kills, points: t.points,
        alive: t.alive, shielded: t.shielded, frozen: t.frozen
      })),
      bullets: this.bullets.map(b => ({
        x: Math.round(b.x), y: Math.round(b.y), type: b.type
      })),
      ts: Date.now()
    };

    // Primary: BroadcastChannel (works on http://, may not on file://)
    if (broadcastChannel) {
      try { broadcastChannel.postMessage(payload); } catch (e) {}
    }

    // Fallback: localStorage (works on file:// via polling on teacher side)
    try {
      localStorage.setItem('combat:spectate:' + matchId, JSON.stringify(payload));
    } catch (e) {}
  },

  spawnPowerup() {
    const types = ['extraBullet', 'shield', 'freeze'];
    const type = types[Math.floor(Math.random() * types.length)];
    const pos = this.gameMap.randomSpawn(20, 80);
    this.powerups.push(new PowerUp(pos.x, pos.y, type));
  },

  updateHUD() {
    document.getElementById('p1-kills').textContent = this.tanks[0].kills;
    document.getElementById('p2-kills').textContent = this.tanks[1].kills;
    document.getElementById('p1-points').textContent = this.tanks[0].points;
    document.getElementById('p2-points').textContent = this.tanks[1].points;

    const m = Math.floor(this.timeRemaining / 60);
    const s = Math.floor(this.timeRemaining % 60);
    const tv = document.getElementById('timer-value');
    tv.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    if (this.timeRemaining < 20) tv.classList.add('warning');
    else tv.classList.remove('warning');
  },

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.gameMap) return;
    if (this.state !== 'combat' && this.state !== 'results') return;

    let sx = 0, sy = 0;
    if (this.shakeAmount > 0) {
      sx = (Math.random() - 0.5) * this.shakeAmount;
      sy = (Math.random() - 0.5) * this.shakeAmount;
    }

    ctx.save();
    ctx.translate(sx, sy);

    this.gameMap.draw(ctx);
    for (const p of this.powerups) p.draw(ctx);
    for (const t of this.tanks) t.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    this.particles.draw(ctx);

    ctx.restore();
  },

  endMatch() {
    if (this.ended) return;
    this.ended = true;
    this.state = 'results';

    const t1 = this.tanks[0];
    const t2 = this.tanks[1];
    let winnerText;
    let winnerTank = null, loserTank = null;
    if (t1.kills > t2.kills) {
      winnerText = `${t1.name} WINS!`;
      winnerTank = t1; loserTank = t2;
    } else if (t2.kills > t1.kills) {
      winnerText = `${t2.name} WINS!`;
      winnerTank = t2; loserTank = t1;
    } else {
      winnerText = 'DRAW!';
    }

    // Save match result to the leaderboard (localStorage)
    this.saveMatchResult(t1, t2, winnerTank, loserTank);

    // Pick whichever overlay container exists (lobby or legacy)
    const overlay = document.getElementById('lobby-overlay') || document.getElementById('overlay');
    const content = overlay ? overlay.querySelector('.overlay-content') : null;
    if (content) {
      content.innerHTML = `
        <h1>${winnerText}</h1>
        <p class="subtitle">Match Over · saved to leaderboard</p>
        <div class="controls-help">
          <div class="control-block">
            <h3>${t1.name}</h3>
            <p>Kills: <b>${t1.kills}</b></p>
            <p>Quiz score: <b>${this.quizzes[0] ? this.quizzes[0].score : '—'}</b></p>
            <p>Quiz correct: <b>${this.quizzes[0] ? this.quizzes[0].correct + '/' + this.quizzes[0].answered : '—'}</b></p>
            ${this.quizzes[0] ? `<p>Best streak: <b>${this.quizzes[0].bestStreak}</b></p>` : ''}
          </div>
          <div class="control-block">
            <h3>${t2.name}</h3>
            <p>Kills: <b>${t2.kills}</b></p>
            <p>Quiz score: <b>${this.quizzes[1] ? this.quizzes[1].score : '—'}</b></p>
            <p>Quiz correct: <b>${this.quizzes[1] ? this.quizzes[1].correct + '/' + this.quizzes[1].answered : '—'}</b></p>
            ${this.quizzes[1] ? `<p>Best streak: <b>${this.quizzes[1].bestStreak}</b></p>` : ''}
          </div>
        </div>
        <button id="post-match-btn" class="primary-btn">CLOSE MATCH</button>
        <a href="teacher.html" class="ghost-btn">← Teacher Dashboard</a>
        <a href="index.html" class="ghost-btn">← Home</a>
      `;
      overlay.classList.remove('hidden');
      document.getElementById('post-match-btn').addEventListener('click', () => {
        window.close();
        setTimeout(() => location.reload(), 50);  // fallback if window.close fails
      });
    }
  },

  // Save a match's result into the cumulative leaderboard in localStorage.
  saveMatchResult(t1, t2, winnerTank, loserTank) {
    let lb = {};
    try {
      const raw = localStorage.getItem('combat:leaderboard');
      if (raw) lb = JSON.parse(raw);
    } catch (e) { lb = {}; }

    const upsert = (name, deltaKills, deltaQuiz, isWin, isLoss) => {
      const entry = lb[name] || { kills: 0, wins: 0, losses: 0, quizScore: 0 };
      entry.kills = (entry.kills || 0) + deltaKills;
      entry.quizScore = (entry.quizScore || 0) + deltaQuiz;
      if (isWin) entry.wins = (entry.wins || 0) + 1;
      if (isLoss) entry.losses = (entry.losses || 0) + 1;
      // Compute rating: wins×100 + kills×5 + quizScore
      entry.rating = (entry.wins || 0) * 100 + (entry.kills || 0) * 5 + (entry.quizScore || 0);
      lb[name] = entry;
    };

    const q1 = this.quizzes[0] ? this.quizzes[0].score : 0;
    const q2 = this.quizzes[1] ? this.quizzes[1].score : 0;

    upsert(t1.name, t1.kills, q1, winnerTank === t1, loserTank === t1);
    upsert(t2.name, t2.kills, q2, winnerTank === t2, loserTank === t2);

    localStorage.setItem('combat:leaderboard', JSON.stringify(lb));

    // Update the pairing in the round (if this match was part of a tournament round)
    const matchId = localStorage.getItem('combat:currentMatchId');
    if (matchId) {
      try {
        const pairings = JSON.parse(localStorage.getItem('combat:pairings') || '[]');
        const pair = pairings.find(p => p.matchId === matchId);
        if (pair) {
          pair.status = 'done';
          pair.winner = winnerTank ? winnerTank.name : 'draw';
          pair.p1Kills = t1.kills;
          pair.p2Kills = t2.kills;
          pair.p1QuizScore = q1;
          pair.p2QuizScore = q2;
          localStorage.setItem('combat:pairings', JSON.stringify(pairings));
        }
      } catch (e) {}
    }

    // Broadcast to teacher dashboard (BroadcastChannel)
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({
          type: 'match-ended',
          matchId: matchId || 'local',
          p1Name: t1.name, p2Name: t2.name,
          p1Kills: t1.kills, p2Kills: t2.kills,
          p1QuizScore: q1, p2QuizScore: q2,
          winner: winnerTank ? winnerTank.name : null
        });
      } catch (e) {}
    }

    // Fallback signal: bump a timestamp the teacher dashboard polls
    try {
      localStorage.setItem('combat:lastUpdate', String(Date.now()));
    } catch (e) {}

    // Clean up the spectator state for this match
    if (matchId) {
      try { localStorage.removeItem('combat:spectate:' + matchId); } catch (e) {}
    }

    // Clear current match ID
    localStorage.removeItem('combat:currentMatchId');
  }
};
