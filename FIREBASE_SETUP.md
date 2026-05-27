# Firebase Setup Guide for Combat Game

This guide walks you through setting up Firebase Realtime Database to enable multi-device multiplayer gameplay.

## Why Firebase?

Firebase replaces localStorage for state synchronization, enabling:
- **Multiple iPads**: Students on separate devices can join the same tournament
- **Real-time pairing**: Teacher's pairings sync instantly to all students
- **Live spectating**: Live match state broadcasts to the teacher dashboard
- **Persistent leaderboard**: Scores survive across devices and sessions

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Create a project** (or select existing if you have one)
3. Enter a project name (e.g., `combat-game`)
4. Follow the setup wizard:
   - Enable Google Analytics: Optional (can skip)
   - Select default location: Choose a region close to your school
5. Click **Create project** and wait for it to initialize

## Step 2: Set Up Realtime Database

1. In Firebase Console, go to **Build → Realtime Database**
2. Click **Create Database**
3. Choose your region and click **Next**
4. Start in **Test Mode** (for now—lock it down later if deploying to production)
   - Test Mode allows reads/writes from the app without authentication
5. Click **Enable**

## Step 3: Get Your Firebase Config

1. In Firebase Console, go to **Project Settings** (gear icon, top-left)
2. Scroll down to **Your apps** section
3. Click the `</> ` (Web) icon if you haven't created a web app yet
4. Enter app name (e.g., `Combat`)
5. Click **Register app**
6. Copy the Firebase config object that appears:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};
```

## Step 4: Add Config to Combat Game

1. Open `/js/firebase-config.js` in the Combat Game folder
2. Replace the placeholder config with your real Firebase config:

```javascript
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};
```

3. Save the file

## Step 5: (Optional) Secure Your Database

**WARNING**: Test Mode allows anyone with your project ID to read/write data. For production:

1. Go to **Realtime Database → Rules**
2. Replace the rules with:

```json
{
  "rules": {
    "tournaments": {
      "$tournamentId": {
        ".read": true,
        ".write": false,
        "players": {
          ".write": true
        },
        "matches": {
          ".write": true
        },
        "pairings": {
          ".write": true
        },
        "leaderboard": {
          ".write": true
        }
      }
    }
  }
}
```

This allows reads everywhere and writes only to player/match/pairing/leaderboard data.

## Step 6: Test the Connection

1. Open the game: `https://alexhay-sisb.github.io/combat/` (or your local dev server)
2. Open developer console (F12 → Console tab)
3. Look for messages:
   - ✅ **Good**: `"Firebase connected for multi-device sync"`
   - ❌ **Bad**: `"Firebase config not set; using localStorage only"`

If you see the error, double-check that `firebase-config.js` has your real config.

## Step 7: Test Multi-Device Gameplay

### Single Computer (Multiple Tabs)

1. Open teacher dashboard in one tab: `index.html` → Teacher
2. Open student page in another tab: `index.html` → Student
3. Add students, start a round, and play
4. Pairings should sync in real-time between tabs

### Multiple Devices (iPad + Computer)

1. Make sure your game is hosted (GitHub Pages, Netlify, etc.)
2. Get your public URL
3. Teacher opens dashboard on laptop
4. Students open the same URL on their iPads and join the student lobby
5. Teacher pairs students
6. Both students should see their pairing instantly (Firebase sync)

## Troubleshooting

### "Firebase config not set"
- Check that `firebase-config.js` doesn't have `apiKey: "YOUR_API_KEY"`
- Verify you copied the config correctly from Firebase Console

### "Firebase init failed"
- Check browser console (F12) for errors
- Make sure your Firebase project's Realtime Database is created and accessible
- Verify Test Mode is enabled (if not using authentication)

### Pairings not syncing
- Refresh the page
- Check that Firebase Realtime Database is accessible (try opening it in Firebase Console)
- In Test Mode, make sure rules allow writes to `tournaments/{tournamentId}/pairings`

### Old behavior works, Firebase doesn't
- The game still falls back to localStorage if Firebase fails
- If you see errors in console, file them so we can debug
- For now, you can test with localStorage only (just leave config at default)

## What Gets Stored in Firebase?

The database structure looks like:

```
/tournaments/default/
  ├─ players/{studentId}
  │   ├─ name: "Alex"
  │   ├─ wins: 2
  │   ├─ losses: 1
  │   ├─ quizScore: 45
  │   ├─ kills: 12
  │   └─ rating: 1650
  ├─ matches/{matchId}
  │   ├─ p1, p2, p1Name, p2Name
  │   ├─ status: "active" | "completed"
  │   ├─ state: { tanks: [...], bullets: [...], time: 120 }
  │   └─ ... (live game state)
  └─ pairings
      ├─ match0: { p1Id, p1Name, p2Id, p2Name, status, round }
      ├─ match1: { ... }
      └─ ...
```

## Next Steps

- **Testing**: Run matches on multiple devices and verify live spectating works
- **Database cleanup**: After testing, you may want to wipe the database via Firebase Console
- **Rate limits**: Firebase Realtime Database has generous free tier; for classroom use, you won't hit limits
- **Backups**: Firebase automatically backs up data; no manual backups needed

## Questions?

Check the console for detailed error messages (F12 → Console tab). All Firebase operations log their status.

Good luck, and have fun with Combat! 🎮
