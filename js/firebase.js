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
    if (this.initialized) return true;

    try {
      // The compat SDK exposes `firebase` on window.
      if (!window.firebase || !firebase.initializeApp) {
        console.error('[Firebase] SDK not loaded as compat — check that the HTML uses firebase-app-compat.js and firebase-database-compat.js.');
        return false;
      }

      // initializeApp is synchronous in compat SDK; no await needed
      firebase.initializeApp(config);
      this.db = firebase.database();
      this.initialized = true;
      console.log('[Firebase] ✓ initialized — tournament:', this.tournamentId);

      // Connection ping — proves RTDB is actually reachable (not just SDK loaded)
      this.db.ref('.info/connected').on('value', (snap) => {
        const connected = !!snap.val();
        console.log(`[Firebase] RTDB connection: ${connected ? '✓ ONLINE' : '✗ OFFLINE'}`);
        const badge = document.getElementById('fb-status-badge');
        if (badge) {
          badge.textContent = connected ? '● MULTI-DEVICE' : '● RECONNECTING…';
          badge.style.background = connected ? 'rgba(76,175,80,0.9)' : 'rgba(255,152,0,0.95)';
        }
      });

      return true;
    } catch (e) {
      // If "Firebase App named '[DEFAULT]' already exists", treat as initialized
      if (String(e).includes('already exists')) {
        try {
          this.db = firebase.database();
          this.initialized = true;
          console.log('[Firebase] ✓ already initialized — reusing app');
          return true;
        } catch (e2) {
          console.error('[Firebase] init recover failed:', e2);
        }
      }
      console.error('[Firebase] init error:', e);
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

  // Record a finished match.
  //   matchId         — used as the matches/<id> key
  //   p1Id, p2Id      — the SAME keys used by addPlayer(). If unavailable (single-device
  //                     mode without a lobby) callers should fall back to the player name.
  //   p1Name, p2Name  — display names (also persisted so leaderboard can read them)
  //   winnerName      — exact name of the winner, or null for a draw
  //   p1Kills, p2Kills — kills delta to add to each player's running total
  //   p1QuizScore, p2QuizScore — quiz score delta to add
  async endMatch(matchId, p1Id, p2Id, p1Name, p2Name, winnerName, p1Kills, p2Kills, p1QuizScore, p2QuizScore) {
    if (!this.db) return false;
    try {
      const result = {
        winner: winnerName || null,
        p1Id, p2Id, p1Name, p2Name,
        p1Kills, p2Kills,
        p1QuizScore, p2QuizScore,
        endTime: firebase.database.ServerValue.TIMESTAMP,
        status: 'completed'
      };

      // Update match record
      await this.db.ref(`tournaments/${this.tournamentId}/matches/${matchId}`).update(result);

      // Update player stats (read-modify-write — keyed by player ID, NOT name, so the
      // record stays the SAME row created by addPlayer()).
      const p1Ref = this.db.ref(`tournaments/${this.tournamentId}/players/${p1Id}`);
      const p2Ref = this.db.ref(`tournaments/${this.tournamentId}/players/${p2Id}`);

      // Player 1 update
      const p1Snap = await p1Ref.once('value');
      const p1Data = p1Snap.val() || { wins: 0, losses: 0, quizScore: 0, kills: 0 };
      p1Data.name = p1Name;                                            // ensure name present
      p1Data.kills = (p1Data.kills || 0) + (p1Kills || 0);
      p1Data.quizScore = (p1Data.quizScore || 0) + (p1QuizScore || 0);
      if (winnerName && p1Name && winnerName === p1Name) {
        p1Data.wins = (p1Data.wins || 0) + 1;
      } else if (winnerName && p2Name && winnerName === p2Name) {
        p1Data.losses = (p1Data.losses || 0) + 1;
      }
      p1Data.rating = (p1Data.wins || 0) * 100 + (p1Data.kills || 0) * 5 + (p1Data.quizScore || 0);
      await p1Ref.update(p1Data);

      // Player 2 update
      const p2Snap = await p2Ref.once('value');
      const p2Data = p2Snap.val() || { wins: 0, losses: 0, quizScore: 0, kills: 0 };
      p2Data.name = p2Name;
      p2Data.kills = (p2Data.kills || 0) + (p2Kills || 0);
      p2Data.quizScore = (p2Data.quizScore || 0) + (p2QuizScore || 0);
      if (winnerName && p2Name && winnerName === p2Name) {
        p2Data.wins = (p2Data.wins || 0) + 1;
      } else if (winnerName && p1Name && winnerName === p1Name) {
        p2Data.losses = (p2Data.losses || 0) + 1;
      }
      p2Data.rating = (p2Data.wins || 0) * 100 + (p2Data.kills || 0) * 5 + (p2Data.quizScore || 0);
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
