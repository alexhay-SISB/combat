// ===== Firebase Module (Real-time Database Sync) =====
// Handles all writes and reads to Firebase RTDB for multi-device sync

class FirebaseManager {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.listeners = new Map(); // key -> { unsubscribe, callback }
    this.tournamentId = TOURNAMENT_ID || 'default';
  }

  // Initialize Firebase (called from student.html and teacher.html)
  async init(config) {
    if (this.initialized) return;

    try {
      // Import Firebase modules (global scope after SDK <script> tags)
      if (!window.firebase) {
        console.warn('Firebase SDK not loaded. Check <script> tags in HTML.');
        return false;
      }

      await firebase.initializeApp(config);
      this.db = firebase.database();
      this.initialized = true;
      console.log('Firebase initialized:', this.tournamentId);
      return true;
    } catch (e) {
      console.error('Firebase init error:', e);
      return false;
    }
  }

  // ===== Player Management =====

  async addPlayer(playerId, playerName) {
    if (!this.db) return false;
    try {
      await this.db.ref(`tournaments/${this.tournamentId}/players/${playerId}`).set({
        name: playerName,
        score: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        quizScore: 0,
        rating: 1600
      });
      return true;
    } catch (e) {
      console.error('Failed to add player:', e);
      return false;
    }
  }

  async updatePlayerStats(playerId, stats) {
    if (!this.db) return false;
    try {
      await this.db.ref(`tournaments/${this.tournamentId}/players/${playerId}`).update(stats);
      return true;
    } catch (e) {
      console.error('Failed to update player stats:', e);
      return false;
    }
  }

  // ===== Pairing Management (Teacher writes, Students read) =====

  async setPairings(pairingsArray) {
    if (!this.db) return false;
    try {
      const pairingsObj = {};
      pairingsArray.forEach((pairing, idx) => {
        pairingsObj[`match${idx}`] = pairing;
      });
      await this.db.ref(`tournaments/${this.tournamentId}/pairings`).set(pairingsObj);
      return true;
    } catch (e) {
      console.error('Failed to set pairings:', e);
      return false;
    }
  }

  listenToPairings(callback) {
    if (!this.db) return;
    const ref = this.db.ref(`tournaments/${this.tournamentId}/pairings`);

    const listener = ref.on('value', (snap) => {
      const data = snap.val();
      callback(data || {});
    }, (err) => {
      console.error('Pairings listener error:', err);
    });

    // Store unsubscribe method
    this.listeners.set('pairings', {
      unsubscribe: () => ref.off('value', listener),
      callback
    });
  }

  // ===== Match State (Game writes live state, others read) =====

  async startMatch(matchId, p1, p2, p1Name, p2Name) {
    if (!this.db) return false;
    try {
      await this.db.ref(`tournaments/${this.tournamentId}/matches/${matchId}`).set({
        p1,
        p2,
        p1Name,
        p2Name,
        status: 'active',
        startTime: firebase.database.ServerValue.TIMESTAMP,
        round: 1,
        state: {} // Will be updated by broadcastState()
      });
      return true;
    } catch (e) {
      console.error('Failed to start match:', e);
      return false;
    }
  }

  async broadcastMatchState(matchId, gameState) {
    if (!this.db) return false;
    try {
      await this.db.ref(`tournaments/${this.tournamentId}/matches/${matchId}/state`).set(gameState);
      return true;
    } catch (e) {
      console.error('Failed to broadcast match state:', e);
      return false;
    }
  }

  listenToMatchState(matchId, callback) {
    if (!this.db) return;
    const ref = this.db.ref(`tournaments/${this.tournamentId}/matches/${matchId}/state`);

    const listener = ref.on('value', (snap) => {
      const data = snap.val();
      callback(data || {});
    }, (err) => {
      console.error('Match state listener error:', err);
    });

    this.listeners.set(`match:${matchId}`, {
      unsubscribe: () => ref.off('value', listener),
      callback
    });
  }

  // ===== Player Input (Client sends, Host reads) =====

  async sendInput(matchId, playerNum, input) {
    if (!this.db) return false;
    try {
      // playerNum: 1 or 2
      await this.db.ref(`tournaments/${this.tournamentId}/matches/${matchId}/inputs/p${playerNum}`).set({
        ...input,
        ts: Date.now()
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  listenToInput(matchId, playerNum, callback) {
    if (!this.db) return;
    const ref = this.db.ref(`tournaments/${this.tournamentId}/matches/${matchId}/inputs/p${playerNum}`);
    const listener = ref.on('value', (snap) => {
      const data = snap.val();
      if (data) callback(data);
    });
    this.listeners.set(`input:${matchId}:p${playerNum}`, {
      unsubscribe: () => ref.off('value', listener)
    });
  }

  // ===== Quiz Scores (Each device writes own, both read) =====

  async sendQuizScore(matchId, playerNum, score) {
    if (!this.db) return false;
    try {
      await this.db.ref(`tournaments/${this.tournamentId}/matches/${matchId}/quizScores/p${playerNum}`).set(score);
      return true;
    } catch (e) {
      return false;
    }
  }

  listenToQuizScores(matchId, callback) {
    if (!this.db) return;
    const ref = this.db.ref(`tournaments/${this.tournamentId}/matches/${matchId}/quizScores`);
    const listener = ref.on('value', (snap) => {
      const data = snap.val() || {};
      callback({ p1: data.p1, p2: data.p2 });
    });
    this.listeners.set(`quizScores:${matchId}`, {
      unsubscribe: () => ref.off('value', listener)
    });
  }

  // ===== Match Results (Game writes, Teacher reads for leaderboard) =====

  async endMatch(matchId, p1, p2, winner, p1Score, p2Score) {
    if (!this.db) return false;
    try {
      const result = {
        winner,
        p1Score,
        p2Score,
        endTime: firebase.database.ServerValue.TIMESTAMP,
        status: 'completed'
      };

      // Update match record
      await this.db.ref(`tournaments/${this.tournamentId}/matches/${matchId}`).update(result);

      // Update player stats (read-modify-write for simplicity)
      const p1Ref = this.db.ref(`tournaments/${this.tournamentId}/players/${p1}`);
      const p2Ref = this.db.ref(`tournaments/${this.tournamentId}/players/${p2}`);

      // Player 1 update
      const p1Snap = await p1Ref.once('value');
      const p1Data = p1Snap.val() || { wins: 0, losses: 0, quizScore: 0, kills: 0 };
      p1Data.quizScore = (p1Data.quizScore || 0) + p1Score;
      if (p1Score > p2Score) {
        p1Data.wins = (p1Data.wins || 0) + 1;
      } else if (p1Score < p2Score) {
        p1Data.losses = (p1Data.losses || 0) + 1;
      }
      await p1Ref.update(p1Data);

      // Player 2 update
      const p2Snap = await p2Ref.once('value');
      const p2Data = p2Snap.val() || { wins: 0, losses: 0, quizScore: 0, kills: 0 };
      p2Data.quizScore = (p2Data.quizScore || 0) + p2Score;
      if (p2Score > p1Score) {
        p2Data.wins = (p2Data.wins || 0) + 1;
      } else if (p2Score < p1Score) {
        p2Data.losses = (p2Data.losses || 0) + 1;
      }
      await p2Ref.update(p2Data);

      return true;
    } catch (e) {
      console.error('Failed to end match:', e);
      return false;
    }
  }

  // ===== Leaderboard (Aggregated from players) =====

  listenToLeaderboard(callback) {
    if (!this.db) return;
    const ref = this.db.ref(`tournaments/${this.tournamentId}/players`);

    const listener = ref.on('value', (snap) => {
      const data = snap.val() || {};
      const leaderboard = [];

      Object.entries(data).forEach(([id, player]) => {
        leaderboard.push({
          id,
          name: player.name,
          wins: player.wins || 0,
          losses: player.losses || 0,
          kills: player.kills || 0,
          quizScore: player.quizScore || 0,
          rating: player.rating || 1600
        });
      });

      // Sort by rating (descending)
      leaderboard.sort((a, b) => b.rating - a.rating);
      callback(leaderboard);
    }, (err) => {
      console.error('Leaderboard listener error:', err);
    });

    this.listeners.set('leaderboard', {
      unsubscribe: () => ref.off('value', listener),
      callback
    });
  }

  // ===== Utility =====

  async clearTournament() {
    if (!this.db) return false;
    try {
      await this.db.ref(`tournaments/${this.tournamentId}`).remove();
      return true;
    } catch (e) {
      console.error('Failed to clear tournament:', e);
      return false;
    }
  }

  unlisten(key) {
    if (this.listeners.has(key)) {
      const { unsubscribe } = this.listeners.get(key);
      unsubscribe();
      this.listeners.delete(key);
    }
  }

  unlistenAll() {
    this.listeners.forEach(({ unsubscribe }) => unsubscribe());
    this.listeners.clear();
  }

  isInitialized() {
    return this.initialized;
  }
}

// Global instance
const Firebase = new FirebaseManager();
