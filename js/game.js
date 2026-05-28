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
  maxPowerupsPerGame: 6,        // more drops so the rare auto-cannon actually appears
  powerupsSpawned: 0,
  nextPowerupTime: 0,
  autoCannonSpawned: false,     // guarantee at least one auto-cannon per match

  // ===== Network state =====
  // 'local' = single device (both players keyboard); 'host' = P1 device; 'client' = P2 device
  networkRole: 'local',
  myPlayerNum: 0,           // 1 if host, 2 if client, 0 if local
  matchId: null,
  remoteInput: { forward: false, backward: false, left: false, right: false, firePressed: false, ammoType: 'bullet' },
  lastInputSent: 0,         // throttle for client → Firebase
  opponentQuizScore: null,  // received from Firebase
  remoteFireCounter: 0,     // tracks edge transitions on fire button
  lastRemoteFireCounter: 0,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = new ParticleSystem();
    this.input = new InputManager();
    this.resize();
    this.setupAmmoButtons();
    this.setupQuizInput();
    this.applyTeacherSettings();
    this.detectNetworkRole();
    window.addEventListener('resize', () => this.resize());
  },

  // Detect host/client/local role from sessionStorage (per-tab) — set by StudentLobby
  detectNetworkRole() {
    // sessionStorage is per-tab/per-device → safe for multi-tab testing
    const myPlayerNum = parseInt(sessionStorage.getItem('combat:myPlayerNum') || '0');
    const matchId = sessionStorage.getItem('combat:currentMatchId');
    const firebaseReady = (typeof Firebase !== 'undefined' && Firebase.isInitialized());

    // Clean up any prior listeners from a previous match
    if (typeof Firebase !== 'undefined' && Firebase.isInitialized() && this.matchId && this.matchId !== matchId) {
      Firebase.unlisten(`input:${this.matchId}:p2`);
      Firebase.unlisten(`match:${this.matchId}`);
      Firebase.unlisten(`quizScores:${this.matchId}`);
    }

    if (myPlayerNum && matchId && firebaseReady) {
      this.myPlayerNum = myPlayerNum;
      this.matchId = matchId;
      this.networkRole = (myPlayerNum === 1) ? 'host' : 'client';
      console.log(`[Game] Network role: ${this.networkRole} (player ${myPlayerNum}), match: ${matchId}`);

      // Host listens for client's input
      if (this.networkRole === 'host') {
        Firebase.listenToInput(matchId, 2, (input) => {
          this.remoteInput = input || this.remoteInput;
        });
      }

      // Client listens for host's broadcast state to render
      if (this.networkRole === 'client') {
        Firebase.listenToMatchState(matchId, (state) => {
          this.applyRemoteState(state);
        });
      }

      // Both listen for quiz scores
      Firebase.listenToQuizScores(matchId, (scores) => {
        this.handleQuizScores(scores);
      });
    } else {
      this.networkRole = 'local';
      this.myPlayerNum = 0;
      this.matchId = null;
      console.log('[Game] Network role: local (single-device mode)');
    }
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

      // In networked mode, only local player's keys answer
      // Also accept 1-4 keys as universal answer keys for local player
      const num = parseInt(k);
      if (this.networkRole !== 'local') {
        if (num >= 1 && num <= 4) {
          this.answerQuiz(this.myPlayerNum, num - 1);
          e.preventDefault();
          return;
        }
        // Allow either set of keys to control local player (touch-friendly)
        if (this.myPlayerNum === 1 && p1Idx >= 0) { this.answerQuiz(1, p1Idx); e.preventDefault(); }
        if (this.myPlayerNum === 2 && p2Idx >= 0) { this.answerQuiz(2, p2Idx); e.preventDefault(); }
        return;
      }

      // Local (single-device) mode: split keys
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
    this.opponentQuizScore = null;

    const bank = window.LOADED_QUESTIONS || TEST_QUESTIONS;
    this.quizzes[0] = new Quiz(1, bank);
    this.quizzes[1] = new Quiz(2, bank);

    document.getElementById('quiz-overlay').classList.remove('hidden');
    // Hide either legacy menu or the lobby overlay
    const legacy = document.getElementById('overlay');
    if (legacy) legacy.classList.add('hidden');
    const lobby = document.getElementById('lobby-overlay');
    if (lobby) lobby.classList.add('hidden');

    // In networked mode, only render the LOCAL player's quiz panel
    if (this.networkRole !== 'local') {
      this.renderQuizPanel(this.myPlayerNum);
    } else {
      this.renderQuizPanel(1);
      this.renderQuizPanel(2);
    }
  },

  answerQuiz(player, optionIndex) {
    // In networked mode, can only answer for local player
    if (this.networkRole !== 'local' && player !== this.myPlayerNum) return;

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

    // In networked mode, only update the LOCAL player's quiz
    const playerIndices = (this.networkRole !== 'local') ? [this.myPlayerNum - 1] : [0, 1];

    for (const i of playerIndices) {
      const q = this.quizzes[i];
      if (!q) continue;
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
    // In networked mode: send my score to Firebase, wait for opponent's score
    if (this.networkRole !== 'local') {
      const myScore = this.quizzes[this.myPlayerNum - 1].score;

      // Send my score to Firebase
      if (typeof Firebase !== 'undefined' && Firebase.isInitialized()) {
        Firebase.sendQuizScore(this.matchId, this.myPlayerNum, myScore);
      }

      // If we already have opponent's score, start match. Otherwise wait.
      if (this.opponentQuizScore !== null) {
        this.startNetworkedMatch();
      } else {
        // Show "waiting for opponent" overlay
        this.showWaitingForOpponent();
      }
      return;
    }

    // Local (single-device) mode: simple flow
    document.getElementById('quiz-overlay').classList.add('hidden');
    const p1Points = this.quizzes[0].score;
    const p2Points = this.quizzes[1].score;
    this.startMatch(p1Points, p2Points);
  },

  // Called when both quiz scores have been received
  startNetworkedMatch() {
    document.getElementById('quiz-overlay').classList.add('hidden');
    this.hideWaitingForOpponent();
    const myScore = this.quizzes[this.myPlayerNum - 1].score;
    const oppScore = this.opponentQuizScore;
    const p1Score = (this.myPlayerNum === 1) ? myScore : oppScore;
    const p2Score = (this.myPlayerNum === 2) ? myScore : oppScore;
    this.startMatch(p1Score, p2Score);
  },

  showWaitingForOpponent() {
    let el = document.getElementById('waiting-opponent-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'waiting-opponent-overlay';
      el.className = 'overlay';
      el.innerHTML = `
        <div class="overlay-content">
          <h1>⏳ Waiting…</h1>
          <p class="subtitle">Waiting for your opponent to finish their quiz</p>
          <div class="waiting-pulse">
            <div class="pulse-ring"></div>
            <div class="pulse-ring delay-1"></div>
            <div class="pulse-ring delay-2"></div>
          </div>
        </div>
      `;
      document.body.appendChild(el);
    } else {
      el.classList.remove('hidden');
    }
    document.getElementById('quiz-overlay').classList.add('hidden');
  },

  hideWaitingForOpponent() {
    const el = document.getElementById('waiting-opponent-overlay');
    if (el) el.classList.add('hidden');
  },

  handleQuizScores(scores) {
    if (!scores) return;
    const opponentNum = (this.myPlayerNum === 1) ? 2 : 1;
    const oppScore = scores[`p${opponentNum}`];
    if (oppScore !== undefined && oppScore !== null) {
      this.opponentQuizScore = oppScore;

      // If my quiz already ended AND I'm waiting, start match now
      const myQuiz = this.quizzes[this.myPlayerNum - 1];
      const myScoreSent = (myQuiz && this.quizTimeRemaining <= 0) ||
                          (scores[`p${this.myPlayerNum}`] !== undefined);
      if (myScoreSent && this.state === 'quiz') {
        // Both quizzes have submitted scores — start combat
        this.startNetworkedMatch();
      }
    }
  },

  // ===== Combat =====

  startMatch(p1StartPoints = 50, p2StartPoints = 50) {
    this.state = 'combat';
    this.gameMap = new GameMap(this.mapWidth, this.mapHeight);

    const bracketCenterY = this.mapHeight / 2;
    const p1x = 170;
    const p2x = this.mapWidth - 170;

    // Use teacher-configured names if set (sessionStorage = per-tab, falls back to localStorage)
    const getMatchVar = (key) => sessionStorage.getItem(key) || localStorage.getItem(key);
    const p1Name = (getMatchVar('combat:p1Name') || 'RED').toUpperCase().slice(0, 14);
    const p2Name = (getMatchVar('combat:p2Name') || 'BLUE').toUpperCase().slice(0, 14);

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

    // Cheat code: "Alex Hay" gets 10000 points (1000 of each ammo type)
    if (p1Name === 'ALEX HAY') {
      this.tanks[0].points = 10000;
      console.log('[Game] 🎮 CHEAT CODE ACTIVATED: Alex Hay (P1) given 10000 points');
    }
    if (p2Name === 'ALEX HAY') {
      this.tanks[1].points = 10000;
      console.log('[Game] 🎮 CHEAT CODE ACTIVATED: Alex Hay (P2) given 10000 points');
    }

    this.bullets = [];
    this.powerups = [];
    this.powerupsSpawned = 0;
    this.autoCannonSpawned = false;
    this.nextPowerupTime = Utils.randFloat(6, 12); // first one comes sooner

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

    // ===== CLIENT MODE: don't simulate; just send input to Firebase =====
    if (this.networkRole === 'client') {
      this.sendInputToHost();

      // ===== SMOOTHING: Interpolate tank positions toward network targets =====
      // Without this, tanks snap to position every ~50ms (jittery).
      // Lerp factor: closes ~25% of gap per frame at 60fps = catches up quickly but smoothly.
      const lerpFactor = Math.min(1, dt * 16);
      for (const tank of this.tanks) {
        if (tank.netTargetX !== undefined) {
          tank.x += (tank.netTargetX - tank.x) * lerpFactor;
          tank.y += (tank.netTargetY - tank.y) * lerpFactor;
          // Angle interpolation handling wrap-around
          if (tank.netTargetAngle !== undefined) {
            const dAng = Utils.angleDiff(tank.angle, tank.netTargetAngle);
            tank.angle += dAng * lerpFactor;
          }
        }
      }

      // ===== SMOOTHING: Extrapolate bullets using their velocity =====
      // Bullets get recreated on each broadcast but move at known velocity between updates.
      // Moving them locally each frame eliminates the "teleporting" effect.
      for (const b of this.bullets) {
        if (b.vx !== undefined && b.vy !== undefined) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        }
      }

      // Particles + powerup animations still update so visuals look smooth
      this.particles.update(dt);
      // Animate powerups locally (bob + spin) even though spawning/pickup is host-side
      for (const p of this.powerups) {
        if (p && typeof p.update === 'function') p.update(dt);
      }
      if (this.shakeAmount > 0) this.shakeAmount = Math.max(0, this.shakeAmount - dt * 30);
      this.updateHUD();
      return;
    }

    // ===== HOST / LOCAL MODE: full simulation =====

    this.timeRemaining -= dt;
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.endMatch();
    }

    // In host mode, override input.p2 with remote input from client
    let p1Input = this.input.p1;
    let p2Input = this.input.p2;
    if (this.networkRole === 'host') {
      // The client (p2) sends their input via Firebase — use it for tank 2
      p2Input = {
        forward: !!this.remoteInput.forward,
        backward: !!this.remoteInput.backward,
        left: !!this.remoteInput.left,
        right: !!this.remoteInput.right,
        touchTarget: this.remoteInput.touchTarget || null,
      };
      // Apply ammo type from remote if changed
      if (this.remoteInput.ammoType && this.tanks[1] &&
          this.tanks[1].ammoType !== this.remoteInput.ammoType) {
        this.tanks[1].setAmmoType(this.remoteInput.ammoType);
      }
    }

    this.tanks[0].update(dt, p1Input, this.gameMap);
    this.tanks[1].update(dt, p2Input, this.gameMap);

    // Fire handling: tank 1 from local input, tank 2 from remote (or local in 'local' mode)
    if (this.input.consumeFire(1)) {
      const b = this.tanks[0].tryFire(this.bullets);
      if (b) {
        this.particles.spark(b.x, b.y, AMMO_TYPES[b.type].color);
        this.shakeAmount = Math.max(this.shakeAmount, 2);
      }
    }
    let p2FireFlag = false;
    if (this.networkRole === 'host') {
      // Edge-detect remote fire counter — each new value = one fire press
      if (this.remoteInput && this.remoteInput.fireCounter !== undefined &&
          this.remoteInput.fireCounter !== this.lastRemoteFireCounter) {
        this.lastRemoteFireCounter = this.remoteInput.fireCounter;
        p2FireFlag = true;
      }
    } else {
      p2FireFlag = this.input.consumeFire(2);
    }
    if (p2FireFlag) {
      const b = this.tanks[1].tryFire(this.bullets);
      if (b) {
        this.particles.spark(b.x, b.y, AMMO_TYPES[b.type].color);
        this.shakeAmount = Math.max(this.shakeAmount, 2);
      }
    }

    // Auto-cannon power-up: fire continuously if active
    for (const tank of this.tanks) {
      if (tank.autoCannonActive) {
        const b = tank.autoFire(this.bullets);
        if (b) {
          this.particles.spark(b.x, b.y, AMMO_TYPES[b.type].color);
          this.shakeAmount = Math.max(this.shakeAmount, 1);
        }
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
        this.nextPowerupTime = Utils.randFloat(10, 18); // tighter cadence
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

    // Broadcast live state (~30 FPS — smoother movement for client, still light on Firebase)
    // ALWAYS run — broadcastState writes localStorage even when BroadcastChannel is null
    const now = performance.now();
    if (now - lastBroadcast > 33) {
      lastBroadcast = now;
      this.broadcastState();
    }
  },

  // CLIENT: send local input to Firebase (host applies it to Tank 2)
  sendInputToHost() {
    if (typeof Firebase === 'undefined' || !Firebase.isInitialized()) return;
    const now = performance.now();
    if (now - this.lastInputSent < 33) return; // throttle ~30Hz for snappier remote control
    this.lastInputSent = now;

    // Pull local input — in client mode, "p1" (WASD) or touch controls the local tank
    // We combine both keyboard layouts (WASD + arrows) and touch
    const localInput = {
      forward: this.input.p1.forward || this.input.p2.forward,
      backward: this.input.p1.backward || this.input.p2.backward,
      left: this.input.p1.left || this.input.p2.left,
      right: this.input.p1.right || this.input.p2.right,
      touchTarget: this.input.p1.touchTarget || null,
    };

    // Edge-detect fire: increment counter on each new press.
    // Consume BOTH flags (not via short-circuit OR) since both are set on space/enter.
    const f1 = this.input.consumeFire(1);
    const f2 = this.input.consumeFire(2);
    if (f1 || f2) {
      this._fireCounter = (this._fireCounter || 0) + 1;
    }
    localInput.fireCounter = this._fireCounter || 0;

    // Local tank's ammo type (set via ammo buttons)
    if (this.tanks[1]) localInput.ammoType = this.tanks[1].ammoType;

    Firebase.sendInput(this.matchId, this.myPlayerNum, localInput);
  },

  // CLIENT: apply game state received from host (renders host's authoritative state)
  applyRemoteState(state) {
    if (this.networkRole !== 'client' || !state) return;
    if (this.state !== 'combat') return; // ignore state before combat starts

    if (!this.tanks || this.tanks.length === 0) return;

    // Diagnostic: log first received state so user can verify sync is working
    if (!this._firstStateLogged) {
      this._firstStateLogged = true;
      console.log('%c[Client] ✓ Receiving state from host', 'color: #4caf50; font-weight: bold', state);
    }

    // Apply tank positions, angles, kills, points, alive status
    // SMOOTHING: store target position instead of snapping — client update loop lerps to it.
    if (state.tanks && Array.isArray(state.tanks)) {
      for (let i = 0; i < state.tanks.length && i < this.tanks.length; i++) {
        const t = state.tanks[i];
        const local = this.tanks[i];
        if (!t || !local) continue;

        // Store network target — actual x/y are lerped toward this each frame
        local.netTargetX = t.x;
        local.netTargetY = t.y;
        local.netTargetAngle = t.angle;

        // First state received? Snap to it so we don't slide in from origin.
        if (local._netInit === undefined) {
          local.x = t.x;
          local.y = t.y;
          local.angle = t.angle;
          local._netInit = true;
        }

        // If tank was just teleported (respawn) by host, snap to new pos to avoid long lerp.
        const dx = t.x - local.x, dy = t.y - local.y;
        if (Math.hypot(dx, dy) > 150) {
          local.x = t.x;
          local.y = t.y;
          local.angle = t.angle;
        }

        local.kills = t.kills;
        local.points = t.points;
        local.alive = t.alive;
        local.shielded = t.shielded;
        local.frozen = t.frozen;
        local.autoCannonActive = t.autoCannonActive;
        local.autoCannonTime = t.autoCannonTime;
      }
    }

    // Apply bullets — recreate lightweight versions WITH velocity for client-side extrapolation
    if (state.bullets && Array.isArray(state.bullets)) {
      // Try to match incoming bullets to existing ones (by proximity + type + velocity direction)
      // so we can preserve them across broadcasts and smoothly extrapolate. Falls back to fresh
      // bullet for new spawns.
      const oldBullets = this.bullets || [];
      const used = new Set();

      this.bullets = state.bullets.map(b => {
        const ammo = (typeof AMMO_TYPES !== 'undefined') ? AMMO_TYPES[b.type] : null;
        const vx = b.vx || 0;
        const vy = b.vy || 0;

        // Find nearest old bullet of same type that hasn't been claimed yet
        let bestMatch = null;
        let bestDist = 80; // max snap distance
        for (let j = 0; j < oldBullets.length; j++) {
          if (used.has(j)) continue;
          const o = oldBullets[j];
          if (o.type !== b.type) continue;
          const d = Math.hypot(o.x - b.x, o.y - b.y);
          if (d < bestDist) {
            bestDist = d;
            bestMatch = j;
          }
        }

        if (bestMatch !== null) {
          used.add(bestMatch);
          const existing = oldBullets[bestMatch];
          // Smoothly correct existing bullet toward authoritative position
          existing.x = b.x;
          existing.y = b.y;
          existing.vx = vx;
          existing.vy = vy;
          return existing;
        }

        // New bullet — create fresh
        return {
          x: b.x, y: b.y, vx: vx, vy: vy, type: b.type,
          def: ammo || { color: '#fff', size: 4 },
          alive: true,
          draw: function(ctx) {
            ctx.save();
            ctx.fillStyle = this.def.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.def.size || 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        };
      });
    }

    // Apply timer
    if (typeof state.time === 'number') {
      this.timeRemaining = state.time;
    }

    // Apply powerups (render-only on client) — preserve existing instances by
    // (type + rounded x/y) so animation state (bob/spin) doesn't reset each broadcast.
    if (state.powerups && Array.isArray(state.powerups) && typeof PowerUp !== 'undefined') {
      const existing = this.powerups || [];
      const next = [];
      for (const p of state.powerups) {
        const match = existing.find(e =>
          e.type === p.type &&
          Math.round(e.x) === p.x &&
          Math.round(e.y) === p.y
        );
        if (match) {
          next.push(match);
        } else {
          next.push(new PowerUp(p.x, p.y, p.type));
        }
      }
      this.powerups = next;
    }
  },

  broadcastState() {
    // Client doesn't broadcast — it receives state from host
    if (this.networkRole === 'client') return;

    const matchId = sessionStorage.getItem('combat:currentMatchId') ||
                    localStorage.getItem('combat:currentMatchId') || 'local';
    const payload = {
      type: 'state-update',
      matchId,
      time: this.timeRemaining,
      tanks: this.tanks.map(t => ({
        x: Math.round(t.x), y: Math.round(t.y), angle: t.angle,
        name: t.name,
        kills: t.kills, points: t.points,
        alive: t.alive, shielded: t.shielded, frozen: t.frozen,
        autoCannonActive: t.autoCannonActive, autoCannonTime: t.autoCannonTime
      })),
      bullets: this.bullets.map(b => ({
        x: Math.round(b.x), y: Math.round(b.y), type: b.type,
        vx: Math.round(b.vx || 0), vy: Math.round(b.vy || 0)
      })),
      powerups: this.powerups.map(p => ({
        x: Math.round(p.x), y: Math.round(p.y), type: p.type
      })),
      ts: Date.now()
    };

    // Primary: BroadcastChannel (works on http://, may not on file://)
    if (broadcastChannel) {
      try { broadcastChannel.postMessage(payload); } catch (e) {}
    }

    // Secondary: Firebase (multi-device sync)
    if (Firebase && Firebase.isInitialized()) {
      if (!this._firstBroadcastLogged) {
        this._firstBroadcastLogged = true;
        console.log('%c[Host] ✓ Broadcasting state to Firebase', 'color: #4caf50; font-weight: bold', `match=${matchId}`);
      }
      Firebase.broadcastMatchState(matchId, payload).catch(e => console.warn('Firebase broadcast failed:', e));
    }

    // Fallback: localStorage (works on file:// via polling on teacher side)
    try {
      localStorage.setItem('combat:spectate:' + matchId, JSON.stringify(payload));
    } catch (e) {}
  },

  spawnPowerup() {
    let type;

    // Guarantee at least one auto-cannon per match — schedule it on the 3rd spawn
    // (mid-game, exciting reveal). If somehow not chosen, force it on the last spawn.
    const remaining = this.maxPowerupsPerGame - this.powerupsSpawned;
    if (!this.autoCannonSpawned && (this.powerupsSpawned === 2 || remaining === 1)) {
      type = 'autoCannon';
      this.autoCannonSpawned = true;
    } else {
      // Weighted random: auto-cannon stays rare among "normal" picks so it feels special
      const pool = ['extraBullet', 'extraBullet', 'shield', 'shield', 'freeze', 'autoCannon'];
      type = pool[Math.floor(Math.random() * pool.length)];
      if (type === 'autoCannon') this.autoCannonSpawned = true;
    }

    const pos = this.gameMap.randomSpawn(20, 80);
    this.powerups.push(new PowerUp(pos.x, pos.y, type));
    console.log(`[Game] Spawned power-up: ${type} (${this.powerupsSpawned + 1}/${this.maxPowerupsPerGame})`);
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

  // Save a match's result into the cumulative leaderboard in localStorage & Firebase.
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

    // Per-tab matchId (falls back to localStorage for single-device mode)
    const matchId = sessionStorage.getItem('combat:currentMatchId') ||
                    localStorage.getItem('combat:currentMatchId');

    // Also write to Firebase — but ONLY host (or local) writes results to avoid duplicates
    if (Firebase && Firebase.isInitialized() && this.networkRole !== 'client') {
      Firebase.endMatch(
        matchId || 'local',
        t1.name,
        t2.name,
        winnerTank ? winnerTank.name : null,
        q1,
        q2
      ).catch(e => console.warn('Firebase endMatch failed:', e));
    }

    // Update the pairing in the round (if this match was part of a tournament round)
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

    // Clear current match ID from BOTH storages (per-tab and shared)
    sessionStorage.removeItem('combat:currentMatchId');
    localStorage.removeItem('combat:currentMatchId');
  }
};
