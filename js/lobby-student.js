// ===== Student Lobby =====
// State: name-entry -> waiting -> paired -> (quiz starts via game.js)

const StudentLobby = {
  myStudentId: null,
  myName: null,
  state: 'name',     // 'name' | 'waiting' | 'paired' | 'in_match'
  pollHandle: null,
  firebaseListenerActive: false,
  launchedMatchId: null,  // tracks which match we've already launched (prevents re-launching)

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

    this.enterNameEntry();

    // Pre-fill the input with last name typed in this tab (convenience only — they
    // still have to click "Join" to enter the lobby).
    const input = document.getElementById('lobby-name-input');
    if (input && previousName) input.value = previousName;

    this.wire();
    this.startPolling();
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

    // Show round info
    const quizT = localStorage.getItem('combat:quizTimer') || '60';
    const combatT = localStorage.getItem('combat:combatTimer') || '120';
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
    if (this.firebaseListenerActive) return;
    if (typeof Firebase === 'undefined' || !Firebase.isInitialized()) return;

    console.log('[Lobby] ✓ Attaching Firebase listener for pairings');
    Firebase.listenToPairings((pairingsObj) => {
      this.handlePairingsUpdate(pairingsObj);
    });
    this.firebaseListenerActive = true;

    // Also (re)add this player to Firebase, in case they joined before Firebase came online
    if (this.myStudentId && this.myName) {
      Firebase.addPlayer(this.myStudentId, this.myName).catch(e => console.warn('Firebase addPlayer (late) failed:', e));
    }
  },

  handlePairingsUpdate(pairingsObj) {
    if (!this.myStudentId) return;

    // Find my pair in the Firebase pairings object
    let myPair = null;
    Object.values(pairingsObj).forEach(pairing => {
      if (pairing.p1Id === this.myStudentId || pairing.p2Id === this.myStudentId) {
        myPair = pairing;
      }
    });

    this.processMyPair(myPair);
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

    // Start the quiz on this device
    const quizSecs = parseInt(localStorage.getItem('combat:quizTimer') || '60');
    const combatSecs = parseInt(localStorage.getItem('combat:combatTimer') || '120');

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

  // Called from game.js when a match ends to return the student to lobby
  returnToLobby() {
    this.enterWaiting();
  }
};

document.addEventListener('DOMContentLoaded', () => StudentLobby.init());
