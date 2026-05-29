// ===== Student Lobby =====
// State: name-entry -> waiting -> paired -> (quiz starts via game.js)

// Bumped on every release; logged + shown as a tiny badge so we can tell at a
// glance whether a device is running stale cached JS.
const LOBBY_VERSION = 'v25';

const StudentLobby = {
  myStudentId: null,
  myName: null,
  state: 'name',     // 'name' | 'waiting' | 'paired' | 'in_match'
  pollHandle: null,
  firebaseListenerActive: false,
  leaderboardListenerActive: false,
  questionsListenerActive: false,
  _lastLeaderboard: null,    // cached latest snapshot — used to repaint after returnToLobby
  launchedMatchId: null,  // tracks which match we've already launched (prevents re-launching)
  _originalLobbyHTML: null, // cached so we can restore it after a match overwrites the overlay

  init() {
    // On EVERY page load (including refresh) start fresh at the name entry screen.
    // We no longer auto-restore from sessionStorage — that caused refreshes to
    // resurrect a stale identity and show "people in the lobby" the user didn't
    // expect. The previous name is pre-filled into the input as a convenience.
    const previousName = sessionStorage.getItem('combat:myName') || '';

    // Clear any stale identity so a refresh acts as a clean rejoin.
    sessionStorage.removeItem('combat:myStudentId');
    sessionStorage.removeItem('combat:myName');
    this.myStudentId = null;
    this.myName = null;

    // Cache the lobby overlay HTML so we can rebuild it after a match end
    // overwrites the .overlay-content (game.js endMatch replaces innerHTML).
    const overlay = document.getElementById('lobby-overlay');
    const content = overlay ? overlay.querySelector('.overlay-content') : null;
    if (content) this._originalLobbyHTML = content.innerHTML;

    this.enterNameEntry();

    // Pre-fill the input with last name typed in this tab (convenience only — they
    // still have to click "Join" to enter the lobby).
    const input = document.getElementById('lobby-name-input');
    if (input && previousName) input.value = previousName;

    this.wire();
    this.startPolling();

    // Visible version badge — pinned in the corner of the page so you can verify
    // each device is running the latest JS. If you see an old version here after
    // refreshing, the device is serving a cached HTML.
    console.log(`%c[Lobby] Build ${LOBBY_VERSION}`, 'color:#4caf50;font-weight:bold');
    if (!document.getElementById('build-badge')) {
      const badge = document.createElement('div');
      badge.id = 'build-badge';
      badge.textContent = LOBBY_VERSION;
      badge.style.cssText = 'position:fixed;bottom:6px;right:8px;z-index:9999;'
        + 'font:11px/1 -apple-system,sans-serif;color:#4caf50;'
        + 'background:rgba(0,0,0,0.5);padding:3px 6px;border-radius:4px;'
        + 'pointer-events:none;letter-spacing:1px;';
      document.body.appendChild(badge);
    }
  },

  wire() {
    const input = document.getElementById('lobby-name-input');
    const joinBtn = document.getElementById('lobby-join-btn');
    const leaveBtn = document.getElementById('lobby-leave-btn');

    const tryJoin = () => {
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      this.joinLobby(name);
    };

    joinBtn.addEventListener('click', tryJoin);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') tryJoin(); });
    leaveBtn.addEventListener('click', () => this.leaveLobby());
  },

  joinLobby(name) {
    // Read current player list
    let players = [];
    try { players = JSON.parse(localStorage.getItem('combat:players') || '[]'); }
    catch (e) { players = []; }

    // Defensive: drop any entries that don't have a usable name
    players = (Array.isArray(players) ? players : []).filter(
      p => p && typeof p.name === 'string' && p.name.trim().length > 0
    );

    // Reuse ID if name already exists (no duplicate adds)
    let existing = players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      this.myStudentId = existing.id;
    } else {
      this.myStudentId = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      players.push({ id: this.myStudentId, name, joinedAt: Date.now() });
      localStorage.setItem('combat:players', JSON.stringify(players));
    }
    this.myName = name;

    // Also add player to Firebase if available
    if (Firebase && Firebase.isInitialized()) {
      Firebase.addPlayer(this.myStudentId, name).catch(e => console.warn('Firebase addPlayer failed:', e));
    }

    sessionStorage.setItem('combat:myStudentId', this.myStudentId);
    sessionStorage.setItem('combat:myName', this.myName);

    this.enterWaiting();

    // Reconnect support: if this name is already in a live match, drop straight
    // back into it rather than waiting. Run now (cached snapshot) AND once more
    // shortly after, to catch the case where Firebase data lands a beat later.
    this.checkForActiveMatch();
    setTimeout(() => this.checkForActiveMatch(), 800);
  },

  leaveLobby() {
    if (!confirm('Leave the lobby? Your name will be removed.')) return;

    if (this.myStudentId) {
      let players = [];
      try { players = JSON.parse(localStorage.getItem('combat:players') || '[]'); }
      catch (e) { players = []; }
      players = players.filter(p => p.id !== this.myStudentId);
      localStorage.setItem('combat:players', JSON.stringify(players));
    }

    sessionStorage.removeItem('combat:myStudentId');
    sessionStorage.removeItem('combat:myName');
    this.myStudentId = null;
    this.myName = null;
    this.enterNameEntry();
  },

  enterNameEntry() {
    this.state = 'name';
    document.getElementById('lobby-name-state').classList.remove('hidden');
    document.getElementById('lobby-waiting-state').classList.add('hidden');
    document.getElementById('lobby-paired-state').classList.add('hidden');
    setTimeout(() => document.getElementById('lobby-name-input').focus(), 100);
  },

  enterWaiting() {
    this.state = 'waiting';
    document.getElementById('lobby-name-state').classList.add('hidden');
    document.getElementById('lobby-waiting-state').classList.remove('hidden');
    document.getElementById('lobby-paired-state').classList.add('hidden');
    document.getElementById('lobby-my-name').textContent = this.myName;
    this.updateLobbyInfo();
  },

  enterPaired(pair) {
    this.state = 'paired';
    document.getElementById('lobby-name-state').classList.add('hidden');
    document.getElementById('lobby-waiting-state').classList.add('hidden');
    document.getElementById('lobby-paired-state').classList.remove('hidden');
    document.getElementById('paired-my-name').textContent = this.myName;
    const oppName = pair.p1Id === this.myStudentId ? pair.p2Name : pair.p1Name;
    document.getElementById('paired-opponent').textContent = oppName;

    // Show round info — prefer the timers stamped on the pairing (synced to all
    // devices) so the hint matches what the match will actually use.
    const quizT = pair.quizSecs != null ? pair.quizSecs : (localStorage.getItem('combat:quizTimer') || '60');
    const combatT = pair.combatSecs != null ? pair.combatSecs : (localStorage.getItem('combat:combatTimer') || '120');
    document.getElementById('round-info').innerHTML = `
      Round ${pair.round} · Quiz ${quizT}s · Combat ${combatT}s
    `;
  },

  updateLobbyInfo() {
    let players = [];
    try { players = JSON.parse(localStorage.getItem('combat:players') || '[]'); }
    catch (e) { players = []; }

    const others = players.filter(p => p.id !== this.myStudentId);
    const info = document.getElementById('lobby-info');
    if (others.length === 0) {
      info.innerHTML = `You're first in the lobby. Waiting for others to join…`;
    } else {
      const names = others.slice(0, 6).map(p => p.name).join(' · ');
      const more = others.length > 6 ? ` +${others.length - 6} more` : '';
      info.innerHTML = `<b>${players.length}</b> player${players.length === 1 ? '' : 's'} in lobby:<br>${names}${more}`;
    }
  },

  startPolling() {
    // Try to set up Firebase listener now (and retry every poll if not yet ready)
    this.tryAttachFirebaseListener();

    // Also keep localStorage polling as fallback
    this.pollHandle = setInterval(() => {
      this.tryAttachFirebaseListener();  // retry until Firebase is ready
      this.poll();
    }, 500);
    this.poll();
  },

  tryAttachFirebaseListener() {
    if (typeof Firebase === 'undefined' || !Firebase.isInitialized()) return;

    if (!this.firebaseListenerActive) {
      console.log('[Lobby] ✓ Attaching Firebase listener for pairings');
      Firebase.listenToPairings((pairingsObj) => {
        this.handlePairingsUpdate(pairingsObj);
      });
      this.firebaseListenerActive = true;

      // Also (re)add this player to Firebase, in case they joined before Firebase came online
      if (this.myStudentId && this.myName) {
        Firebase.addPlayer(this.myStudentId, this.myName).catch(e => console.warn('Firebase addPlayer (late) failed:', e));
      }
    }

    if (!this.leaderboardListenerActive) {
      console.log('[Lobby] ✓ Attaching Firebase listener for leaderboard');
      Firebase.listenToLeaderboard((leaderboard) => {
        this._lastLeaderboard = leaderboard; // cache so returnToLobby can repaint
        this.renderLeaderboard(leaderboard);
      });
      this.leaderboardListenerActive = true;
    }

    // Subscribe to the teacher-published question bank. Whenever the teacher
    // uploads a CSV (or switches back to the test bank), we mirror it into THIS
    // device's localStorage so Game.applyTeacherSettings() picks it up at the
    // next quiz start. Without this, students fall back to TEST_QUESTIONS.
    if (!this.questionsListenerActive && typeof Firebase.listenToQuestions === 'function') {
      console.log('[Lobby] ✓ Attaching Firebase listener for question bank');
      Firebase.listenToQuestions((questions, label) => {
        if (questions && questions.length > 0) {
          try {
            localStorage.setItem('combat:questions', JSON.stringify(questions));
            if (label) localStorage.setItem('combat:questionsLabel', label);
            console.log(`[Lobby] ✓ Received ${questions.length} questions from teacher (${label || 'no label'})`);
            // If a Game object exists, re-apply settings so a *next* quiz uses
            // the new bank immediately. (Quiz already in flight keeps its set.)
            if (typeof Game !== 'undefined' && typeof Game.applyTeacherSettings === 'function') {
              Game.applyTeacherSettings();
            }
          } catch (e) {
            console.warn('[Lobby] Failed to cache questions locally:', e);
          }
        }
      });
      this.questionsListenerActive = true;
    }
  },

  // Renders the live leaderboard shown on the waiting screen.
  // `leaderboard` is the array provided by Firebase.listenToLeaderboard.
  renderLeaderboard(leaderboard) {
    const wrap = document.getElementById('lobby-leaderboard');
    if (!wrap) return; // panel not in DOM (e.g. legacy lobby HTML)

    const validName = (n) => typeof n === 'string' && n.trim().length > 0 &&
                              n !== 'undefined' && n !== 'null';
    const rows = (leaderboard || [])
      .filter(p => p && validName(p.name))
      .sort((a, b) => (b.rating || 0) - (a.rating || 0));

    if (rows.length === 0) {
      wrap.innerHTML = `<div class="lb-empty">No matches played yet — go win one!</div>`;
      return;
    }

    const tbody = rows.map((p, i) => {
      const isMe = this.myName && p.name === this.myName;
      return `
        <tr class="${isMe ? 'me' : ''}">
          <td>${i + 1}</td>
          <td class="lb-name">${p.name}${isMe ? ' <span class="me-tag">YOU</span>' : ''}</td>
          <td>${p.wins || 0}</td>
          <td>${p.losses || 0}</td>
          <td>${p.kills || 0}</td>
          <td><b>${p.rating || 0}</b></td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div class="lb-title">🏆 Leaderboard</div>
      <table class="lb-table">
        <thead>
          <tr><th>#</th><th>Player</th><th>W</th><th>L</th><th>Kills</th><th>Rating</th></tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>`;
  },

  handlePairingsUpdate(pairingsObj) {
    // Always cache the latest snapshot — even before this player has an ID —
    // so checkForActiveMatch() can re-evaluate it the instant they (re)join.
    this._lastPairings = pairingsObj || {};

    if (!this.myStudentId) return;

    // Find my pair in the Firebase pairings object
    let myPair = null;
    Object.values(this._lastPairings).forEach(pairing => {
      if (pairing.p1Id === this.myStudentId || pairing.p2Id === this.myStudentId) {
        myPair = pairing;
      }
    });

    this.processMyPair(myPair);
  },

  // Called right after (re)joining with a name. If this player was already
  // paired into a live match (e.g. they got disconnected mid-quiz and are
  // rejoining with the same name → same student ID), jump STRAIGHT back into
  // the match instead of sitting in the waiting room. Checks the cached
  // Firebase snapshot first, then the localStorage fallback.
  checkForActiveMatch() {
    if (!this.myStudentId) return;
    if (this._lastPairings) {
      this.handlePairingsUpdate(this._lastPairings);
    }
    this.poll(); // localStorage fallback path
  },

  poll() {
    if (!this.myStudentId) return;

    // Check pairings for my matchup (localStorage fallback)
    let pairings = [];
    try { pairings = JSON.parse(localStorage.getItem('combat:pairings') || '[]'); }
    catch (e) { return; }

    const myPair = pairings.find(p =>
      p.p1Id === this.myStudentId || p.p2Id === this.myStudentId
    );

    this.processMyPair(myPair);

    if (!myPair && this.state === 'waiting') {
      this.updateLobbyInfo();
    }
  },

  // Shared logic for both Firebase and localStorage paths
  processMyPair(myPair) {
    if (myPair) {
      if (myPair.status === 'done') {
        if (this.state !== 'waiting') this.enterWaiting();
      } else if (myPair.status === 'bye') {
        if (this.state !== 'waiting') this.enterWaiting();
        document.getElementById('lobby-info').innerHTML = `🎉 You got a <b>BYE</b> for Round ${myPair.round} — auto-advancing!`;
      } else if (myPair.status === 'in_progress') {
        // Match is starting — auto-launch the game!
        if (this.launchedMatchId !== myPair.matchId) {
          this.launchedMatchId = myPair.matchId;
          this.launchGame(myPair);
        }
      } else {
        // 'pending' or other status — show paired state, waiting to start
        if (this.state !== 'paired') this.enterPaired(myPair);
      }
    } else {
      if (this.state === 'paired') this.enterWaiting();
    }
  },

  // Launch the game on THIS device for this pairing
  launchGame(pair) {
    this.state = 'in_match';

    // Determine which player I am
    const myPlayerNum = (pair.p1Id === this.myStudentId) ? 1 : 2;
    const opponentName = myPlayerNum === 1 ? pair.p2Name : pair.p1Name;
    const opponentId = myPlayerNum === 1 ? pair.p2Id : pair.p1Id;

    // PER-TAB / PER-DEVICE state → sessionStorage (NOT localStorage which is shared between tabs)
    sessionStorage.setItem('combat:currentMatchId', pair.matchId);
    sessionStorage.setItem('combat:p1Name', pair.p1Name);
    sessionStorage.setItem('combat:p2Name', pair.p2Name);
    sessionStorage.setItem('combat:p1Id', pair.p1Id);
    sessionStorage.setItem('combat:p2Id', pair.p2Id);
    sessionStorage.setItem('combat:myPlayerNum', String(myPlayerNum));
    sessionStorage.setItem('combat:opponentName', opponentName);
    sessionStorage.setItem('combat:opponentId', opponentId);
    sessionStorage.setItem('combat:isHost', myPlayerNum === 1 ? '1' : '0');

    // ALSO write to localStorage for backward-compat (single-device mode reads these)
    localStorage.setItem('combat:currentMatchId', pair.matchId);
    localStorage.setItem('combat:p1Name', pair.p1Name);
    localStorage.setItem('combat:p2Name', pair.p2Name);

    // Hide the lobby overlay
    const lobbyOverlay = document.getElementById('lobby-overlay');
    if (lobbyOverlay) lobbyOverlay.classList.add('hidden');

    // Start the quiz on this device.
    // Prefer the timer values stamped onto the pairing by the teacher — these are
    // synced via Firebase so EVERY player in EVERY match gets identical limits.
    // Fall back to local storage / defaults only if an older pairing lacks them.
    const quizSecs = parseInt(
      pair.quizSecs != null ? pair.quizSecs : (localStorage.getItem('combat:quizTimer') || '60'), 10);
    const combatSecs = parseInt(
      pair.combatSecs != null ? pair.combatSecs : (localStorage.getItem('combat:combatTimer') || '120'), 10);

    // Set body class so CSS can hide opponent's quiz panel
    document.body.classList.add('playing-as-p' + myPlayerNum);

    console.log(`[Lobby] Launching as P${myPlayerNum} (${this.myName}) vs ${opponentName} — matchId=${pair.matchId}`);

    // Trigger game start
    if (typeof Game !== 'undefined' && Game.startQuiz) {
      // Re-detect network role NOW that sessionStorage has match info
      if (Game.detectNetworkRole) Game.detectNetworkRole();
      Game.startQuiz(quizSecs, combatSecs);
    } else {
      console.error('Game not ready yet — reloading page to start match');
      location.reload();
    }
  },

  // Called from game.js when a match ends so the student STAYS logged in and
  // returns to the lobby (rather than reloading the page, which would wipe their
  // identity). Restores the lobby overlay HTML that endMatch overwrote, re-binds
  // event handlers, clears match-scoped state, and re-enters the waiting state.
  returnToLobby() {
    // Stop the game loop and clear canvas
    if (typeof Game !== 'undefined') {
      Game.state = 'lobby';
      Game.ended = false;
      // Detach firebase match listeners (we'll re-attach when a new match starts)
      if (typeof Firebase !== 'undefined' && Firebase.isInitialized) {
        try {
          if (Game.matchId) Firebase.unlisten(`match:${Game.matchId}`);
        } catch (e) {}
      }
    }

    // Clear per-match body class set by launchGame()
    document.body.classList.remove('playing-as-p1', 'playing-as-p2');

    // Clear per-match storage so a new round starts fresh.
    sessionStorage.removeItem('combat:currentMatchId');
    sessionStorage.removeItem('combat:p1Name');
    sessionStorage.removeItem('combat:p2Name');
    sessionStorage.removeItem('combat:p1Id');
    sessionStorage.removeItem('combat:p2Id');
    sessionStorage.removeItem('combat:myPlayerNum');
    sessionStorage.removeItem('combat:opponentName');
    sessionStorage.removeItem('combat:opponentId');
    sessionStorage.removeItem('combat:isHost');
    localStorage.removeItem('combat:currentMatchId');

    // Reset launch guard so we can be paired into a new match
    this.launchedMatchId = null;

    // Restore the original lobby overlay HTML (endMatch replaced it with results).
    const overlay = document.getElementById('lobby-overlay');
    const content = overlay ? overlay.querySelector('.overlay-content') : null;
    if (content && this._originalLobbyHTML) {
      content.innerHTML = this._originalLobbyHTML;
      // Re-bind the (new) name/join/leave elements
      this.wire();
    }

    // Make sure the overlay itself is visible (combat hid it)
    if (overlay) overlay.classList.remove('hidden');

    // Re-enter the waiting state — identity is preserved in this.myStudentId / myName
    this.enterWaiting();

    // Repaint the leaderboard immediately using the cached snapshot. The Firebase
    // listener may have already fired during the match (while the DOM didn't yet
    // exist), so without this we'd see an empty leaderboard until the next push.
    if (this._lastLeaderboard) {
      this.renderLeaderboard(this._lastLeaderboard);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => StudentLobby.init());
