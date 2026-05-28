// ===== Teacher dashboard =====

const STORAGE_KEYS = {
  questions: 'combat:questions',
  questionsLabel: 'combat:questionsLabel',
  quizTimer: 'combat:quizTimer',
  combatTimer: 'combat:combatTimer',
  p1Name: 'combat:p1Name',
  p2Name: 'combat:p2Name',
  leaderboard: 'combat:leaderboard',
  players: 'combat:players',
  currentRound: 'combat:currentRound',
  pairings: 'combat:pairings',
  currentMatchId: 'combat:currentMatchId',
};

// Cross-tab event channel
let eventChannel = null;
try { eventChannel = new BroadcastChannel('combat-events'); }
catch (e) { eventChannel = null; }

// ===========================================
// LEADERBOARD
// ===========================================
const Leaderboard = {
  getData() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.leaderboard) || '{}'); }
    catch (e) { return {}; }
  },

  computeRating(stats) {
    return (stats.wins || 0) * 100 + (stats.kills || 0) * 5 + (stats.quizScore || 0);
  },

  render() {
    const tbody = document.getElementById('leaderboard-body');
    const empty = document.getElementById('lb-empty');
    const data = this.getData();

    const players = Object.entries(data).map(([name, stats]) => ({
      name, ...stats, rating: this.computeRating(stats),
    }));
    players.sort((a, b) => b.rating - a.rating);

    if (players.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = players.map((p, i) => `
      <tr>
        <td class="rank-cell">${i + 1}</td>
        <td class="name-cell">${p.name}</td>
        <td>${p.wins || 0}</td>
        <td>${p.losses || 0}</td>
        <td>${p.kills || 0}</td>
        <td>${p.quizScore || 0}</td>
        <td><b>${p.rating}</b></td>
      </tr>
    `).join('');
  },

  reset() {
    if (!confirm('Reset all player stats? Cumulative wins, kills, and quiz scores will be cleared.')) return;
    localStorage.removeItem(STORAGE_KEYS.leaderboard);
    this.render();
    Lobby.render();
  },
};

// ===========================================
// LOBBY (player management)
// ===========================================
const Lobby = {
  players: [],

  init() {
    this.load();
    this.wire();
    this.render();
  },

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.players) || '[]');
      // Defensive: drop any entries missing a usable name
      this.players = (Array.isArray(raw) ? raw : []).filter(
        p => p && typeof p.name === 'string' && p.name.trim().length > 0
      );
    } catch (e) { this.players = []; }
  },

  save() {
    localStorage.setItem(STORAGE_KEYS.players, JSON.stringify(this.players));
  },

  wire() {
    const input = document.getElementById('add-player-input');
    const addBtn = document.getElementById('add-player-btn');

    const tryAdd = () => {
      const name = input.value.trim();
      if (this.addPlayer(name)) input.value = '';
      input.focus();
    };

    addBtn.addEventListener('click', tryAdd);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') tryAdd(); });

    document.getElementById('bulk-add-btn').addEventListener('click', () => this.bulkAdd());
    document.getElementById('sample-players-btn').addEventListener('click', () => this.addSamplePlayers());
    document.getElementById('clear-players-btn').addEventListener('click', () => this.clearAll());
  },

  makeId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },

  addPlayer(name) {
    if (!name) return false;
    if (this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      alert(`"${name}" is already in the lobby.`);
      return false;
    }
    this.players.push({ id: this.makeId(), name, joinedAt: Date.now() });
    this.save();
    this.render();
    return true;
  },

  removePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
    this.save();
    this.render();
  },

  bulkAdd() {
    const ta = document.getElementById('bulk-add-input');
    const names = ta.value.split('\n').map(s => s.trim()).filter(s => s);
    let added = 0;
    for (const name of names) {
      if (!this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        this.players.push({ id: this.makeId() + added, name, joinedAt: Date.now() + added });
        added++;
      }
    }
    if (added > 0) {
      this.save();
      this.render();
      ta.value = '';
    }
  },

  addSamplePlayers() {
    const samples = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Taylor', 'Quinn'];
    let added = 0;
    for (const name of samples) {
      if (!this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        this.players.push({ id: this.makeId() + added, name, joinedAt: Date.now() + added });
        added++;
      }
    }
    if (added > 0) {
      this.save();
      this.render();
    }
  },

  clearAll() {
    if (!confirm('Remove all players from the lobby?')) return;
    this.players = [];
    this.save();
    this.render();
  },

  render() {
    const list = document.getElementById('player-list');
    const count = document.getElementById('player-count');
    count.textContent = this.players.length;

    if (this.players.length === 0) {
      list.innerHTML = '<p class="empty-state small">No players yet. Add some above!</p>';
      return;
    }

    const lb = Leaderboard.getData();
    const tags = this.players.map(p => {
      const stats = lb[p.name] || {};
      const rating = Leaderboard.computeRating(stats);
      return `
        <div class="player-tag" data-id="${p.id}">
          <span class="player-tag-name">${p.name}</span>
          <span class="player-tag-stats">W:${stats.wins || 0} · K:${stats.kills || 0} · R:${rating}</span>
          <button class="remove-btn" data-id="${p.id}" title="Remove">×</button>
        </div>
      `;
    }).join('');

    list.innerHTML = tags;
    list.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', () => this.removePlayer(btn.dataset.id));
    });
  },
};

// ===========================================
// ROUND MANAGER (pairings + match flow)
// ===========================================
const RoundManager = {
  currentRound: 0,
  pairings: [],

  init() {
    this.load();
    this.wire();
    this.render();
  },

  load() {
    try {
      this.currentRound = parseInt(localStorage.getItem(STORAGE_KEYS.currentRound) || '0');
      this.pairings = JSON.parse(localStorage.getItem(STORAGE_KEYS.pairings) || '[]');
    } catch (e) {
      this.currentRound = 0;
      this.pairings = [];
    }
  },

  save() {
    localStorage.setItem(STORAGE_KEYS.currentRound, String(this.currentRound));
    localStorage.setItem(STORAGE_KEYS.pairings, JSON.stringify(this.pairings));

    // Also save pairings to Firebase
    if (Firebase && Firebase.isInitialized()) {
      Firebase.setPairings(this.pairings).catch(e => console.warn('Firebase setPairings failed:', e));
    }
  },

  wire() {
    document.getElementById('start-round-btn').addEventListener('click', () => this.startRound());
    document.getElementById('reset-round-btn').addEventListener('click', () => this.reset());
  },

  startRound() {
    if (Lobby.players.length < 2) {
      alert('Need at least 2 players in the lobby.');
      return;
    }
    const hasPending = this.pairings.some(p => p.status === 'pending' || p.status === 'in_progress');
    if (hasPending) {
      if (!confirm('There are unfinished matches in the current round. Start a new round anyway?')) return;
    }

    this.currentRound++;
    this.pairings = this.createPairings();

    // Auto-launch all non-bye matches — students will start on their own devices
    this.pairings.forEach(p => {
      if (p.status !== 'bye') {
        p.status = 'in_progress';
      }
    });

    this.save();
    this.render();
  },

  createPairings() {
    const isFirstRound = this.currentRound === 1;
    const lb = Leaderboard.getData();

    let ordered;
    if (isFirstRound) {
      ordered = [...Lobby.players].sort(() => Math.random() - 0.5);
    } else {
      ordered = [...Lobby.players].sort((a, b) => {
        const aR = Leaderboard.computeRating(lb[a.name] || {});
        const bR = Leaderboard.computeRating(lb[b.name] || {});
        return bR - aR;
      });
    }

    const pairs = [];
    for (let i = 0; i < ordered.length - 1; i += 2) {
      pairs.push({
        matchId: 'm' + Date.now().toString(36) + '_' + i,
        p1Id: ordered[i].id, p1Name: ordered[i].name,
        p2Id: ordered[i + 1].id, p2Name: ordered[i + 1].name,
        status: 'pending', winner: null,
        round: this.currentRound,
      });
    }

    if (ordered.length % 2 === 1) {
      const byeP = ordered[ordered.length - 1];
      pairs.push({
        matchId: 'm' + Date.now().toString(36) + '_bye',
        p1Id: byeP.id, p1Name: byeP.name,
        p2Id: null, p2Name: 'BYE',
        status: 'bye', winner: byeP.name,
        round: this.currentRound,
      });
    }
    return pairs;
  },

  playMatch(matchId) {
    const pair = this.pairings.find(p => p.matchId === matchId);
    if (!pair || pair.status === 'done' || pair.status === 'bye') return;

    // Save match info for fallback (single-device mode)
    localStorage.setItem(STORAGE_KEYS.p1Name, pair.p1Name);
    localStorage.setItem(STORAGE_KEYS.p2Name, pair.p2Name);
    localStorage.setItem(STORAGE_KEYS.currentMatchId, matchId);

    pair.status = 'in_progress';
    this.save(); // Writes to Firebase too — students will detect and auto-launch
    this.render();

    // No window.open() — students launch on their own devices via Firebase listener
  },

  reset() {
    if (!confirm('Reset current round? Pending pairings will be cleared.')) return;
    this.currentRound = 0;
    this.pairings = [];
    localStorage.removeItem(STORAGE_KEYS.currentRound);
    localStorage.removeItem(STORAGE_KEYS.pairings);
    localStorage.removeItem(STORAGE_KEYS.currentMatchId);
    this.render();
  },

  render() {
    const titleEl = document.getElementById('round-title');
    const listEl = document.getElementById('pairings-list');
    const btnEl = document.getElementById('start-round-btn');

    if (this.currentRound === 0) {
      titleEl.textContent = 'No round started';
      btnEl.textContent = 'Start Round 1 (random pairings)';
    } else {
      const done = this.pairings.filter(p => p.status === 'done' || p.status === 'bye').length;
      const total = this.pairings.length;
      titleEl.textContent = `Round ${this.currentRound} · ${done}/${total} matches complete`;
      btnEl.textContent = `Start Round ${this.currentRound + 1} (paired by rating)`;
    }

    if (this.pairings.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No pairings yet. Add players above then start a round.</p>';
      return;
    }

    listEl.innerHTML = this.pairings.map((p, i) => {
      let statusBadge, actionBtn;
      if (p.status === 'bye') {
        statusBadge = '<span class="status-badge bye">BYE</span>';
        actionBtn = '<span class="bye-text">auto-advance</span>';
      } else if (p.status === 'done') {
        const score = p.p1Kills !== undefined ? ` (${p.p1Kills}-${p.p2Kills})` : '';
        statusBadge = `<span class="status-badge done">✓ ${p.winner}${score}</span>`;
        actionBtn = '';
      } else if (p.status === 'in_progress') {
        statusBadge = '<span class="status-badge in-progress">🔴 LIVE</span>';
        actionBtn = `<button class="ghost-btn small" data-mid="${p.matchId}" data-action="play">↗ Reopen</button>`;
      } else {
        statusBadge = '<span class="status-badge pending">PENDING</span>';
        actionBtn = `<button class="play-btn" data-mid="${p.matchId}" data-action="play">▶ Play</button>`;
      }
      return `
        <div class="pairing-row ${p.status}">
          <div class="pairing-num">#${i + 1}</div>
          <div class="pairing-players">
            <span class="pairing-p1">${p.p1Name}</span>
            <span class="vs">vs</span>
            <span class="pairing-p2">${p.p2Name}</span>
          </div>
          <div class="pairing-status">${statusBadge}</div>
          <div class="pairing-action">${actionBtn}</div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('button[data-action="play"]').forEach(btn => {
      btn.addEventListener('click', () => this.playMatch(btn.dataset.mid));
    });
  },
};

// ===========================================
// SPECTATOR (live mini-canvases for active matches)
// ===========================================
const Spectator = {
  matches: new Map(),
  lastUpdate: new Map(),
  receivedFromBC: 0,     // counter — how many state messages received via BroadcastChannel
  receivedFromLS: 0,     // counter — how many via localStorage polling
  lastStateTs: new Map(),  // per-match: last seen ts (to dedupe BC vs LS)

  init() {
    // 1) Firebase listener (multi-device sync, highest priority) — may be deferred
    this.attachFirebase();

    // 2) BroadcastChannel (works over http://, sometimes works over file://)
    if (eventChannel) {
      eventChannel.addEventListener('message', (e) => this.handleMessage(e.data));
    }

    // 3) Storage event listener (cross-tab) — works in most browsers
    window.addEventListener('storage', (e) => {
      if (!e.key) return;
      if (e.key.startsWith('combat:spectate:') && e.newValue) {
        try { this.handleMessage(JSON.parse(e.newValue), 'ls'); } catch (err) {}
      }
    });

    // 4) localStorage polling — guaranteed-to-work fallback (file:// safe)
    setInterval(() => this.pollLocalStorage(), 200);
    setInterval(() => this.pruneStale(), 2000);
    this.pollLocalStorage();   // initial scan
  },

  _firebaseAttached: false,
  attachFirebase() {
    if (this._firebaseAttached) return;
    if (typeof Firebase === 'undefined' || !Firebase.isInitialized()) return;
    this._firebaseAttached = true;
    console.log('[Spectator] ✓ Firebase listener attached for live matches');
    Firebase.db.ref(`tournaments/${Firebase.tournamentId}/matches`).on('child_changed', (snap) => {
      const matchId = snap.key;
      const matchData = snap.val();
      if (matchData && matchData.state) {
        this.handleMessage(matchData.state, 'firebase');
      }
    });
  },

  handleMessage(msg, source = 'bc') {
    if (!msg) return;
    if (msg.type === 'state-update') {
      // Dedupe: skip if we already saw this exact timestamp (BC may double-deliver)
      const prevTs = this.lastStateTs.get(msg.matchId);
      if (prevTs && msg.ts === prevTs) return;
      this.lastStateTs.set(msg.matchId, msg.ts);

      this.matches.set(msg.matchId, msg);
      this.lastUpdate.set(msg.matchId, Date.now());
      if (source === 'bc') this.receivedFromBC++; else this.receivedFromLS++;
      this.render();
    } else if (msg.type === 'match-ended') {
      setTimeout(() => {
        this.matches.delete(msg.matchId);
        this.lastUpdate.delete(msg.matchId);
        this.lastStateTs.delete(msg.matchId);
        this.render();
      }, 2500);
      Leaderboard.render();
      RoundManager.load();
      RoundManager.render();
      Lobby.render();
    }
  },

  pollLocalStorage() {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('combat:spectate:')) {
        try {
          const state = JSON.parse(localStorage.getItem(key));
          if (state && state.ts && Date.now() - state.ts < 3000) {
            this.handleMessage(state, 'ls');
          }
        } catch (e) {}
      }
    }
  },

  pruneStale() {
    const now = Date.now();
    let changed = false;
    for (const [mid, ts] of this.lastUpdate) {
      if (now - ts > 3500) {
        this.matches.delete(mid);
        this.lastUpdate.delete(mid);
        this.lastStateTs.delete(mid);
        try { localStorage.removeItem('combat:spectate:' + mid); } catch (e) {}
        changed = true;
      }
    }
    if (changed) this.render();
  },

  render() {
    const sectionEl = document.getElementById('spectator-section');
    const container = document.getElementById('spectator-grid');

    if (this.matches.size === 0) {
      sectionEl.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    sectionEl.style.display = 'block';

    const activeIds = [...this.matches.keys()].slice(0, 6);

    // Remove tiles no longer active
    container.querySelectorAll('.spec-tile').forEach(tile => {
      if (!activeIds.includes(tile.dataset.mid)) tile.remove();
    });

    for (const mid of activeIds) {
      let tile = container.querySelector(`[data-mid="${mid}"]`);
      const state = this.matches.get(mid);
      if (!tile) {
        tile = document.createElement('div');
        tile.className = 'spec-tile';
        tile.dataset.mid = mid;
        tile.innerHTML = `
          <div class="spec-header">
            <span class="spec-p1"></span>
            <span class="spec-time">--</span>
            <span class="spec-p2"></span>
          </div>
          <canvas class="spec-canvas" width="320" height="190"></canvas>
        `;
        container.appendChild(tile);
      }
      this.renderTile(tile, state);
    }
  },

  renderTile(tile, state) {
    const p1 = state.tanks[0];
    const p2 = state.tanks[1];
    tile.querySelector('.spec-p1').innerHTML =
      `<b style="color:#ff5252">${p1.name}</b> · ${p1.kills}K · ${p1.points}p`;
    tile.querySelector('.spec-p2').innerHTML =
      `${p2.kills}K · ${p2.points}p · <b style="color:#4fc3f7">${p2.name}</b>`;
    const m = Math.floor(state.time / 60);
    const s = Math.floor(state.time % 60);
    tile.querySelector('.spec-time').textContent = `${m}:${s.toString().padStart(2, '0')}`;

    const canvas = tile.querySelector('.spec-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const sx = W / 1280, sy = H / 760;

    // Background
    ctx.fillStyle = '#2f5631';
    ctx.fillRect(0, 0, W, H);

    // Walls (matches game's map.js layout)
    ctx.fillStyle = '#5a6470';
    const drawWall = (x, y, w, h) => ctx.fillRect(x * sx, y * sy, Math.max(1, w * sx), Math.max(1, h * sy));
    const cx = 640, cy = 380, mw = 1280, mh = 760;

    // Border
    drawWall(0, 0, mw, 26);
    drawWall(0, mh - 26, mw, 26);
    drawWall(0, 0, 26, mh);
    drawWall(mw - 26, 0, 26, mh);
    // I-bars top/bottom
    drawWall(cx - 20, 80, 40, 110);
    drawWall(cx - 20, mh - 190, 40, 110);
    // Corner bars
    drawWall(130, 90, 120, 30);
    drawWall(mw - 250, 90, 120, 30);
    drawWall(130, mh - 120, 120, 30);
    drawWall(mw - 250, mh - 120, 120, 30);
    // Left bracket ]
    drawWall(320, 220, 32, 320);
    drawWall(220, 220, 100, 32);
    drawWall(220, 508, 100, 32);
    // Right bracket [
    drawWall(mw - 352, 220, 32, 320);
    drawWall(mw - 320, 220, 100, 32);
    drawWall(mw - 320, 508, 100, 32);
    // Mid accents
    drawWall(480, cy - 14, 90, 28);
    drawWall(mw - 570, cy - 14, 90, 28);

    // Tanks
    for (let i = 0; i < state.tanks.length; i++) {
      const t = state.tanks[i];
      const color = i === 0 ? '#ff5252' : '#4fc3f7';
      if (!t.alive) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        const x = t.x * sx, y = t.y * sy;
        ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
        ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4);
        ctx.stroke();
        continue;
      }
      // Body
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(t.x * sx, t.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
      // Barrel
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(t.x * sx, t.y * sy);
      ctx.lineTo(t.x * sx + Math.cos(t.angle) * 9, t.y * sy + Math.sin(t.angle) * 9);
      ctx.stroke();
      // Shield
      if (t.shielded) {
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(t.x * sx, t.y * sy, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (t.frozen) {
        ctx.fillStyle = 'rgba(128,222,234,0.4)';
        ctx.beginPath();
        ctx.arc(t.x * sx, t.y * sy, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Bullets
    const bulletColors = { bullet: '#ffd54f', cannon: '#ff5722', seeker: '#e040fb' };
    for (const b of state.bullets) {
      ctx.fillStyle = bulletColors[b.type] || '#fff';
      ctx.beginPath();
      ctx.arc(b.x * sx, b.y * sy, b.type === 'cannon' ? 2 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

// ===========================================
// TEACHER (top-level coordinator + existing Questions/Settings)
// ===========================================
const Teacher = {
  questions: null,
  questionsLabel: '',

  init() {
    this.loadFromStorage();
    this.wireEvents();
    this.renderBankStatus();

    Lobby.init();
    RoundManager.init();
    Spectator.init();
    Leaderboard.render();

    // Attach Firebase listeners now if it's already initialized;
    // otherwise the init script in teacher.html will call this once Firebase comes online.
    this.attachFirebaseListeners();

    // Refresh on tab visibility / cross-tab storage events
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.refreshAll();
    });
    window.addEventListener('storage', () => this.refreshAll());

    document.getElementById('refresh-lb').addEventListener('click', () => this.refreshAll());

    // Poll a timestamp the game tab writes after each match — guarantees
    // the leaderboard refreshes within 500ms even when storage events don't fire.
    this.lastSeenUpdate = parseInt(localStorage.getItem('combat:lastUpdate') || '0');
    setInterval(() => {
      const lu = parseInt(localStorage.getItem('combat:lastUpdate') || '0');
      if (lu > this.lastSeenUpdate) {
        this.lastSeenUpdate = lu;
        this.refreshAll();
      }
    }, 500);
  },

  _firebaseAttached: false,
  attachFirebaseListeners() {
    if (this._firebaseAttached) return;
    if (typeof Firebase === 'undefined' || !Firebase.isInitialized()) {
      // Retry shortly — Firebase init is async
      setTimeout(() => this.attachFirebaseListeners(), 300);
      return;
    }
    this._firebaseAttached = true;
    console.log('[Teacher] ✓ Firebase listeners attached');

    // Re-init spectator's Firebase hook now that it's available
    if (typeof Spectator !== 'undefined' && Spectator.attachFirebase) {
      Spectator.attachFirebase();
    }

    Firebase.listenToLeaderboard((leaderboard) => {
      // Convert Firebase leaderboard to localStorage format for compatibility
      let lb = {};
      leaderboard.forEach(player => {
        lb[player.name] = {
          wins: player.wins,
          losses: player.losses,
          kills: player.kills,
          quizScore: player.quizScore,
          rating: player.rating
        };
      });
      localStorage.setItem(STORAGE_KEYS.leaderboard, JSON.stringify(lb));
      Leaderboard.render();
    });

    // Listen to the players list so the teacher sees students appear in real time
    Firebase.db.ref(`tournaments/${Firebase.tournamentId}/players`).on('value', (snap) => {
      const data = snap.val() || {};
      // Filter out any entries that don't have a usable name (defensive — bad data from old wipes)
      const players = Object.entries(data)
        .filter(([id, p]) => p && typeof p.name === 'string' && p.name.trim().length > 0)
        .map(([id, p]) => ({ id, name: p.name, joinedAt: Date.now() }));

      // Also clean any corrupted entries in the local list before merging
      const cleanLocal = (Lobby.players || []).filter(
        m => m && typeof m.name === 'string' && m.name.trim().length > 0
      );

      const merged = [...cleanLocal];
      for (const p of players) {
        if (!merged.some(m => m.name.toLowerCase() === p.name.toLowerCase())) {
          merged.push(p);
        }
      }
      Lobby.players = merged;
      Lobby.save();
      Lobby.render();
    });
  },

  refreshAll() {
    Lobby.load();
    Lobby.render();
    RoundManager.load();
    RoundManager.render();
    Leaderboard.render();
  },

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.questions);
      if (raw) {
        this.questions = JSON.parse(raw);
        this.questionsLabel = localStorage.getItem(STORAGE_KEYS.questionsLabel) || `Custom (${this.questions.length} questions)`;
      } else {
        this.questions = TEST_QUESTIONS;
        this.questionsLabel = `Built-in test bank (${TEST_QUESTIONS.length} questions)`;
      }
    } catch (e) {
      this.questions = TEST_QUESTIONS;
      this.questionsLabel = `Built-in test bank (${TEST_QUESTIONS.length} questions)`;
    }

    const quizT = localStorage.getItem(STORAGE_KEYS.quizTimer) || '60';
    const combatT = localStorage.getItem(STORAGE_KEYS.combatTimer) || '120';
    document.getElementById('t-quiz-timer').value = quizT;
    document.getElementById('t-combat-timer').value = combatT;
  },

  wipeEverything() {
    const msg = 'DELETE EVERYTHING? This will permanently clear all:\n- Players & lobby list\n- All game records & leaderboard\n- Pairings & rounds\n- Custom question bank\n- Game settings\n\nThis action cannot be undone.';
    if (!confirm(msg)) return;

    // Clear all localStorage keys starting with 'combat:'
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('combat:')) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => localStorage.removeItem(key));

    // Reset to defaults
    this.questions = TEST_QUESTIONS;
    this.questionsLabel = `Built-in test bank (${TEST_QUESTIONS.length} questions)`;
    this.renderBankStatus();

    // Refresh all UI
    Lobby.render();
    RoundManager.render();
    Leaderboard.render();

    console.log('[Teacher] 🗑 Wiped everything! All data cleared.');
    alert('✓ All data has been cleared. The dashboard has been reset to defaults.');
  },

  wireEvents() {
    const fileInput = document.getElementById('csv-file');
    fileInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) this.handleFile(f);
    });

    const dropLabel = document.querySelector('.file-drop-label');
    dropLabel.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropLabel.classList.add('dragover');
    });
    dropLabel.addEventListener('dragleave', () => dropLabel.classList.remove('dragover'));
    dropLabel.addEventListener('drop', (e) => {
      e.preventDefault();
      dropLabel.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f) this.handleFile(f);
    });

    document.getElementById('use-test-bank').addEventListener('click', () => {
      this.questions = TEST_QUESTIONS;
      this.questionsLabel = `Built-in test bank (${TEST_QUESTIONS.length} questions)`;
      localStorage.removeItem(STORAGE_KEYS.questions);
      localStorage.removeItem(STORAGE_KEYS.questionsLabel);
      this.renderBankStatus();
    });

    document.getElementById('download-sample').addEventListener('click', () => {
      const csv = CSV.sampleQuestions();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'combat_sample_questions.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Settings auto-save on change
    document.getElementById('t-quiz-timer').addEventListener('change', (e) => {
      localStorage.setItem(STORAGE_KEYS.quizTimer, e.target.value);
    });
    document.getElementById('t-combat-timer').addEventListener('change', (e) => {
      localStorage.setItem(STORAGE_KEYS.combatTimer, e.target.value);
    });

    document.getElementById('reset-leaderboard').addEventListener('click', () => Leaderboard.reset());
    document.getElementById('wipe-everything-btn').addEventListener('click', () => this.wipeEverything());
  },

  handleFile(file) {
    const errorsEl = document.getElementById('csv-errors');
    errorsEl.innerHTML = '';
    if (!file.name.match(/\.csv$/i) && file.type !== 'text/csv') {
      errorsEl.innerHTML = `<div class="error-item">Please choose a .csv file</div>`;
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const { questions, errors } = CSV.parseQuestions(e.target.result);
      if (errors.length > 0) {
        const items = errors.slice(0, 10).map(err => `<div class="error-item">${err}</div>`).join('');
        const extra = errors.length > 10 ? `<div class="error-item">…and ${errors.length - 10} more</div>` : '';
        errorsEl.innerHTML = `<div class="error-header">${errors.length} row(s) skipped:</div>${items}${extra}`;
      }
      if (questions.length === 0) {
        errorsEl.innerHTML += `<div class="error-item critical">No valid questions found.</div>`;
        return;
      }
      this.questions = questions;
      this.questionsLabel = `${file.name} (${questions.length} questions)`;
      localStorage.setItem(STORAGE_KEYS.questions, JSON.stringify(questions));
      localStorage.setItem(STORAGE_KEYS.questionsLabel, this.questionsLabel);
      this.renderBankStatus();
    };
    reader.readAsText(file);
  },

  renderBankStatus() {
    const el = document.getElementById('bank-status');
    const easyCount = this.questions.filter(q => q.difficulty === 'easy').length;
    const hardCount = this.questions.filter(q => q.difficulty === 'hard').length;
    el.innerHTML = `
      <span class="status-pill active">${this.questionsLabel}</span>
      <span class="status-pill">${easyCount} easy</span>
      <span class="status-pill">${hardCount} hard</span>
    `;
  },

};

document.addEventListener('DOMContentLoaded', () => Teacher.init());
