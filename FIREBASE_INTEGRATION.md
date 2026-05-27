# Firebase Integration Summary

## What Changed

The Combat game now supports **multi-device multiplayer** using Firebase Realtime Database for real-time state synchronization.

### Before (localStorage only)
- ❌ Single-device tournament (all tabs on one computer)
- ❌ No cross-device synchronization
- ❌ Manual localhost testing only

### After (localStorage + Firebase)
- ✅ Multiple iPads can join the same tournament
- ✅ Teacher's pairing assignments sync instantly to students
- ✅ Live game state broadcasts to spectator dashboard
- ✅ Persistent leaderboard across devices
- ✅ Falls back to localStorage if Firebase unavailable (backward compatible)

---

## Architecture

### Three-Layer Sync Strategy

1. **Firebase (Primary)** — Multi-device, real-time
   - Used when Firebase is initialized with valid config
   - Fastest, most reliable across devices

2. **BroadcastChannel (Secondary)** — Same-domain, same-protocol
   - Works between browser tabs on http:// or https://
   - Doesn't work on file:// protocol

3. **localStorage (Fallback)** — Works everywhere
   - Polled every 200-500ms
   - Works offline, on file://, with no external dependencies
   - Backward compatible with old deployment

### Files Modified

**New Files:**
- `js/firebase.js` — FirebaseManager class with CRUD operations
- `js/firebase-config.js` — Configuration template (user fills in their credentials)
- `FIREBASE_SETUP.md` — Step-by-step Firebase setup guide

**Modified Files:**
- `student.html` — Added Firebase SDK script tags
- `teacher.html` — Added Firebase SDK script tags
- `js/main.js` — Initialize Firebase on page load
- `js/game.js` — Write game state to Firebase via `broadcastState()` and `saveMatchResult()`
- `js/lobby-student.js` — Listen to Firebase pairings instead of just localStorage
- `js/teacher.js` — Write pairings to Firebase, listen for leaderboard updates

---

## Data Flow

### Tournament Setup (Teacher → Students)

```
Teacher Dashboard
    ↓
RoundManager.startRound()
    ├→ localStorage['combat:pairings']
    └→ Firebase.setPairings()
    
Student Lobby (any device)
    ↓
Polls localStorage OR Firebase listener:
    - StudentLobby.poll() (500ms, localStorage fallback)
    - Firebase.listenToPairings() (real-time, if Firebase available)
    ↓
Student sees pairing instantly
```

### Match State Broadcasting (Game → Teacher)

```
Game.update() → Game.broadcastState() every ~80ms
    ├→ BroadcastChannel (if available)
    ├→ Firebase.broadcastMatchState() (if available)
    └→ localStorage['combat:spectate:matchId'] (fallback)

Teacher Spectator
    ├→ Firebase listener (real-time, high priority)
    ├→ BroadcastChannel listener (fast, same-domain)
    ├→ storage event listener (cross-tab)
    └→ localStorage polling (guaranteed, 200ms)
    ↓
Live mini-canvases update in real-time
```

### Match Results (Game → Leaderboard)

```
Game.endMatch() → Game.saveMatchResult()
    ├→ localStorage['combat:leaderboard']
    ├→ Firebase.endMatch() (updates player stats)
    └→ BroadcastChannel message

Teacher Dashboard
    ← Firebase.listenToLeaderboard() (real-time updates)
    ← storage event listener (fallback)
    ← polling loop (backup)
    ↓
Leaderboard renders with new stats
```

---

## API Reference

### FirebaseManager (js/firebase.js)

**Initialization:**
```javascript
await Firebase.init(FIREBASE_CONFIG);  // async, called from main.js
Firebase.isInitialized();               // bool
```

**Player Management:**
```javascript
Firebase.addPlayer(playerId, playerName);           // async
Firebase.updatePlayerStats(playerId, stats);        // async
```

**Pairings (Teacher writes, Students read):**
```javascript
Firebase.setPairings(pairingsArray);                // async (teacher)
Firebase.listenToPairings(callback);                // real-time (students)
```

**Match State (Game broadcasts, Spectator receives):**
```javascript
Firebase.broadcastMatchState(matchId, gameState);   // async (~80ms throttle)
Firebase.listenToMatchState(matchId, callback);     // real-time
```

**Match Results:**
```javascript
Firebase.endMatch(matchId, p1, p2, winner, p1Score, p2Score);  // async
```

**Leaderboard:**
```javascript
Firebase.listenToLeaderboard(callback);             // real-time
```

---

## Database Schema

```
tournaments/{tournamentId}/
  └─ players/{playerId}
     ├─ name: string
     ├─ wins: number
     ├─ losses: number
     ├─ kills: number
     ├─ quizScore: number
     └─ rating: number

  └─ matches/{matchId}
     ├─ p1, p2: player IDs
     ├─ p1Name, p2Name: strings
     ├─ status: "active" | "completed"
     ├─ round: number
     ├─ startTime: timestamp
     ├─ endTime: timestamp (when completed)
     └─ state: { tanks: [...], bullets: [...], time: number, ts: number }

  └─ pairings/
     ├─ match0: { p1Id, p1Name, p2Id, p2Name, status, round }
     ├─ match1: { ... }
     └─ ...
```

---

## Backward Compatibility

**The game still works without Firebase:**
- If `FIREBASE_CONFIG` is not set (default template values), Firebase init skips silently
- All state falls back to localStorage + BroadcastChannel + polling
- Single-device tournament mode works as before
- Old deployments continue to work

**To disable Firebase:**
1. Leave `firebase-config.js` with placeholder `apiKey: "YOUR_API_KEY"`
2. Game detects this and uses localStorage only
3. No breaking changes

---

## Performance Considerations

### Bandwidth
- Game state broadcast: ~500 bytes every 80ms (~5 KB/s per match)
- Firebase free tier: 100 MB/month easily covers classroom use
- For context: 1 match = ~100 KB data over 5 minutes

### Latency
- Firebase (good WiFi): <100ms
- BroadcastChannel (same browser): <10ms
- localStorage polling: ~200ms

### Concurrency
- Multiple students joining simultaneously: No race conditions (Firebase handles conflicts)
- Multiple teachers (not supported yet, but wouldn't corrupt data): Safe

---

## Testing Checklist

### Local Testing (Single Device)
- [ ] Teacher and student pages work on localhost
- [ ] Pairings created by teacher show up in student lobby within 1s
- [ ] Live spectator shows running match
- [ ] Leaderboard updates after match ends
- [ ] Works with no Firebase config (localStorage only)

### Multi-Device Testing
- [ ] Teacher opens dashboard on laptop
- [ ] 2+ students open game on separate iPads
- [ ] Students join lobby
- [ ] Teacher creates pairings
- [ ] Pairings appear on iPads within 1s (should be instant)
- [ ] Match starts and spectator shows live state
- [ ] Match ends, leaderboard updates on both devices

### Edge Cases
- [ ] Firebase disconnected mid-match (should fall back to localStorage)
- [ ] Student joins while round is active (they see correct pairing)
- [ ] Network lag (should eventually sync, no duplicates)
- [ ] Page refresh during match (match resumes)

---

## Deployment

### GitHub Pages
1. No changes needed—Game already deploys to GitHub Pages
2. Add your Firebase config to `js/firebase-config.js` before committing
3. **Warning**: Firebase config contains sensitive info; consider using environment variables for production

### Netlify / Vercel
1. Same as GitHub Pages
2. Option to set Firebase config via environment variables (more secure)

### School Server / Raspberry Pi
1. Copy game files to local server
2. Update `FIREBASE_CONFIG` in `js/firebase-config.js`
3. Open `index.html` from http:// URL (not file://)

---

## Next Steps

1. **Set up Firebase**: Follow `FIREBASE_SETUP.md`
2. **Test single-device**: Confirm teacher + students work on one computer
3. **Test multi-device**: Confirm pairings sync across iPads
4. **Go live**: Share the public URL with your class
5. **Monitor**: Check Firebase Console for any errors

---

## Known Limitations

- No user authentication (anyone with the URL can join)
- No private tournaments (all data in one project)
- No undo (if you start a match, you can't un-start it)
- Max 6 live matches in spectator view (by design, for teacher dashboard performance)

These can be enhanced in future versions if needed.

---

## Rollback

If you want to revert to localStorage-only mode:
1. Set `apiKey: "YOUR_API_KEY"` in `firebase-config.js`
2. Commit and push
3. Game will automatically fall back to localStorage
4. No data loss (localStorage persists)

