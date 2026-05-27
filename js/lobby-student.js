// ===== Student Lobby =====
// State: name-entry -> waiting -> paired -> (quiz starts via game.js)

const StudentLobby = {
  myStudentId: null,
  myName: null,
  state: 'name',     // 'name' | 'waiting' | 'paired' | 'in_match'
  pollHandle: null,
  firebaseListenerActive: false,

  init() {
    // sessionStorage holds per-tab identity (so multiple tabs are different students)
    this.myStudentId = sessionStorage.getItem('combat:myStudentId');
    this.myName = sessionStorage.getItem('combat:myName');

    if (this.myStudentId && this.myName) {
      // Already joined — go straight to waiting state
      this.enterWaiting();
    } else {
      this.enterNameEntry();
    }

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
    // Set up Firebase listener if available
    if (Firebase && Firebase.isInitialized() && !this.firebaseListenerActive) {
      Firebase.listenToPairings((pairingsObj) => {
        this.handlePairingsUpdate(pairingsObj);
      });
      this.firebaseListenerActive = true;
    }

    // Also keep localStorage polling as fallback
    this.pollHandle = setInterval(() => this.poll(), 500);
    this.poll();
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

    if (myPair) {
      if (myPair.status === 'done') {
        if (this.state !== 'waiting') this.enterWaiting();
      } else if (myPair.status === 'bye') {
        if (this.state !== 'waiting') this.enterWaiting();
        document.getElementById('lobby-info').innerHTML = `🎉 You got a <b>BYE</b> for Round ${myPair.round} — auto-advancing!`;
      } else {
        if (this.state !== 'paired') this.enterPaired(myPair);
      }
    } else {
      if (this.state === 'paired') this.enterWaiting();
    }
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

    if (myPair) {
      // I'm in a pairing
      if (myPair.status === 'done') {
        // Match was already played; back to waiting
        if (this.state !== 'waiting') this.enterWaiting();
      } else if (myPair.status === 'bye') {
        // I got a bye
        if (this.state !== 'waiting') this.enterWaiting();
        document.getElementById('lobby-info').innerHTML = `🎉 You got a <b>BYE</b> for Round ${myPair.round} — auto-advancing!`;
      } else {
        // pending / ready / in_progress
        if (this.state !== 'paired') this.enterPaired(myPair);
      }
    } else {
      if (this.state === 'paired') this.enterWaiting();
      this.updateLobbyInfo();
    }
  },

  // Called from game.js when a match ends to return the student to lobby
  returnToLobby() {
    this.enterWaiting();
  }
};

document.addEventListener('DOMContentLoaded', () => StudentLobby.init());
