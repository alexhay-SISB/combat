// Security boundary is database.rules.json. Browser checks are only for clear UX.
const CombatAccess = {
  teacherEmail: 'alexander.hay@sisbschool.com',
  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },
  isTeacher(user) {
    return !!user && user.email === this.teacherEmail && user.emailVerified &&
      user.providerData.some(p => p.providerId === 'google.com');
  },
  async startTeacher() {
    const message = document.getElementById('teacher-auth-message');
    if (!window.firebase?.auth) { message.textContent = 'Firebase could not load. Check your connection and reload.'; return; }
    const app = firebase.apps.find(a => a.name === '[DEFAULT]') || firebase.initializeApp(FIREBASE_CONFIG);
    const auth = app.auth();
    const login = document.getElementById('teacher-sign-in');
    login.onclick = async () => {
      login.disabled = true;
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({prompt: 'select_account', login_hint: this.teacherEmail});
        await auth.signInWithPopup(provider);
      } catch (error) {
        message.textContent = error.code === 'auth/operation-not-allowed'
          ? 'Enable Google in Firebase Authentication → Sign-in method first.'
          : error.code === 'auth/unauthorized-domain'
          ? 'Add alexhay-sisb.github.io to Firebase Authentication → Settings → Authorised domains.'
          : error.message;
      } finally { login.disabled = false; }
    };
    document.getElementById('teacher-sign-out').onclick = () => auth.signOut();
    let started = false;
    auth.onAuthStateChanged(async user => {
      if (!this.isTeacher(user)) {
        if (started) { location.reload(); return; }
        message.textContent = user && !user.isAnonymous ? `Please choose ${this.teacherEmail}. This account is not authorised.` : '';
        return;
      }
      if (started) return;
      started = true;
      if (!await Firebase.init(FIREBASE_CONFIG)) { started = false; message.textContent = 'Could not connect. Reload and try again.'; return; }
      document.getElementById('teacher-auth').hidden = true;
      document.querySelector('.teacher-shell').hidden = false;
      Teacher.init();
    });
  },
  renderRequests(requests) {
    const box = document.getElementById('join-requests');
    box.replaceChildren();
    for (const [uid, request] of Object.entries(requests || {})) {
      if (request.status === 'rejected') continue;
      const row = document.createElement('p');
      const name = document.createElement('span');
      name.textContent = `${request.name} `;
      row.append(name);
      for (const [label, action] of [ ['Approve', () => Firebase.approveStudent(uid)],
        ['Decline', () => Firebase.db.ref(`tournaments/${Firebase.tournamentId}/joinRequests/${uid}`).update({status:'rejected'})] ]) {
        const button = document.createElement('button');
        button.textContent = label; button.className = 'ghost-btn small';
        button.onclick = async () => {
          button.disabled = true;
          try { await action(); } catch(error) { Firebase.reportError(error); button.disabled = false; }
        };
        row.append(button);
      }
      box.append(row);
    }
    if (!box.childElementCount) box.textContent = 'No students waiting.';
  }
};

Object.assign(FirebaseManager.prototype, {
  async registerPlayer(playerName, preferredId) {
    if (this._initializing) await this._initializing;
    if (!this.db) throw new Error('Multiplayer is not connected. Reload and try again.');
    const name = String(playerName || '').trim();
    if (!name || name.length > 60) throw new Error('Use a player name of 1–60 characters.');
    if (window.COMBAT_TEACHER) return this.registerTeacherPlayer(name, preferredId);
    const uid = this.app.auth().currentUser.uid;
    const base = `tournaments/${this.tournamentId}`;
    const memberRef = this.db.ref(`${base}/members/${uid}`);
    let member = (await memberRef.once('value')).val();
    if (!member) {
      const requestRef = this.db.ref(`${base}/joinRequests/${uid}`);
      await requestRef.set({name, status: 'pending'});
      member = await new Promise((resolve, reject) => {
        let timer;
        const clean = () => { clearTimeout(timer); memberRef.off('value', approved); requestRef.off('value', declined); };
        const fail = error => { clean(); reject(error); };
        const approved = snap => { if (snap.val()) { clean(); resolve(snap.val()); } };
        const declined = snap => { if (snap.val()?.status === 'rejected') fail(new Error('The teacher declined this join request. Ask your teacher before trying again.')); };
        timer = setTimeout(() => fail(new Error('Still waiting for teacher approval. Ask your teacher, then press Join again.')), 120000);
        memberRef.on('value', approved, fail);
        requestRef.on('value', declined, fail);
      });
    }
    const playerRef = this.db.ref(`${base}/players/${member.playerId}`);
    const player = (await playerRef.once('value')).val();
    if (!player || player.ownerUid !== uid) throw new Error('Your player access has changed. Reload and ask the teacher to approve you again.');
    if (player.name.trim().toLowerCase() !== name.toLowerCase()) {
      throw new Error(`This device is registered as ${player.name}. Use that name, or ask the teacher to remove the old player first.`);
    }
    await playerRef.child('active').set(true);
    this.classReady = true;
    this.unlisten('membership');
    const listener = memberRef.on('value', snap => {
      if (!snap.exists() && this.classReady) {
        this.classReady = false;
        this.unlistenAll();
        // Removed devices must rejoin and be approved; discard stale class data.
        Object.keys(localStorage).filter(k => k.startsWith('combat:')).forEach(k => localStorage.removeItem(k));
        location.reload();
      }
    });
    this.listeners.set('membership', {unsubscribe: () => memberRef.off('value', listener)});
    this.clearError();
    return {...player, id: member.playerId};
  },

  async approveStudent(uid) {
    const ref = this.db.ref(`tournaments/${this.tournamentId}`);
    await ref.once('value');
    const newId = this.db.ref().push().key;
    let reason = 'This request is no longer pending.';
    const result = await ref.transaction(data => {
      if (data === null) return null; // Force server retry when the local cache is empty.
      if (!data?.joinRequests?.[uid] || data.joinRequests[uid].status !== 'pending') return;
      const name = data.joinRequests[uid].name.trim();
      const players = data.players || (data.players = {});
      const id = Object.keys(players).sort().find(id => players[id]?.name?.trim().toLowerCase() === name.toLowerCase()) || newId;
      if (players[id]?.ownerUid && players[id].ownerUid !== uid) {
        reason = 'That name belongs to another device. Remove the old player first if this is a replacement device.';
        return;
      }
      const previous = data.members?.[uid]?.playerId;
      if (previous && previous !== id) { reason = 'This device already has a player. Remove that player first.'; return; }
      players[id] = {...(players[id] || {name, joinedAt: Date.now(), score:0, wins:0, losses:0, kills:0, quizScore:0, rating:1600}), active:true, ownerUid:uid};
      (data.members || (data.members = {}))[uid] = {playerId:id};
      delete data.joinRequests[uid];
      return data;
    }, undefined, false);
    if (!result.committed || !result.snapshot.child(`members/${uid}`).exists()) throw new Error(reason);
    this.clearError();
  },

  watchSecurity() {
    this.unlisten('requests'); this.unlisten('results');
    const base = this.db.ref(`tournaments/${this.tournamentId}`);
    const requests = base.child('joinRequests');
    const reqListener = requests.on('value', snap => CombatAccess.renderRequests(snap.val()), error => this.reportError(error));
    this.listeners.set('requests', {unsubscribe: () => requests.off('value', reqListener)});
    const matches = base.child('matches');
    const handle = snap => {
      if (snap.val()?.result && !snap.val().resultApplied) this.finalizeResult(snap.key).catch(error => this.reportError(error));
    };
    matches.on('child_added', handle); matches.on('child_changed', handle);
    this.listeners.set('results', {unsubscribe: () => {matches.off('child_added', handle); matches.off('child_changed', handle);}});
  },

  async finalizeResult(matchId) {
    const base = this.db.ref(`tournaments/${this.tournamentId}`);
    const data = (await base.once('value')).val();
    const match = data?.matches?.[matchId], access = data?.matchAccess?.[matchId];
    if (!match?.result || match.resultApplied || !access) return;
    const result = match.result;
    if (![0,1,2].includes(result.winner) ||
        !['p1Kills','p2Kills','p1QuizScore','p2QuizScore'].every(k => Number.isInteger(result[k]) && result[k] >= 0 && result[k] <= 100000)) return;
    // Per-player transactions avoid competing with every live match's 30fps
    // state stream. The durable marker makes retries / multiple teachers safe,
    // including reconnecting after only one of the two players was updated.
    for (const n of [1,2]) {
      const saved = await base.child(`players/${access[`p${n}Id`]}`).transaction(player => {
        if (player === null) return null;
        if (player._appliedMatches?.[matchId]) return;
        player.kills = (player.kills || 0) + result[`p${n}Kills`];
        player.quizScore = (player.quizScore || 0) + result[`p${n}QuizScore`];
        player.wins = (player.wins || 0) + (result.winner === n ? 1 : 0);
        player.losses = (player.losses || 0) + (result.winner && result.winner !== n ? 1 : 0);
        player.rating = player.wins * 100 + player.kills * 5 + player.quizScore;
        (player._appliedMatches || (player._appliedMatches = {}))[matchId] = true;
        return player;
      }, undefined, false);
      if (!saved.snapshot.child(`_appliedMatches/${matchId}`).exists()) return;
    }
    const winner = result.winner ? access[`p${result.winner}Name`] : 'draw';
    await base.child('pairings').transaction(pairings => {
      if (pairings === null) return null;
      let found = false;
      for (const pair of Object.values(pairings)) {
        if (pair.matchId === matchId) { Object.assign(pair, {...result, winner, status:'done'}); found = true; }
      }
      return found ? pairings : undefined; // Never overwrite a newer round.
    }, undefined, false);
    await base.child(`matchAccess/${matchId}`).transaction(current => {
      if (current === null) return null;
      current.active = false;
      return current;
    }, undefined, false);
    await base.child(`matches/${matchId}`).transaction(current => {
      if (current === null) return null; // Do not resurrect a wiped class.
      if (current.resultApplied) return;
      return {...current, resultApplied:true, status:'completed', winner, endTime:Date.now()};
    }, undefined, false);
  },

  async resetStats() {
    const ref = this.db.ref(`tournaments/${this.tournamentId}/players`);
    await ref.once('value');
    await ref.transaction(players => {
      if (!players) return null;
      for (const player of Object.values(players)) Object.assign(player, {score:0,wins:0,losses:0,kills:0,quizScore:0,rating:1600});
      return players;
    }, undefined, false);
  }
});
