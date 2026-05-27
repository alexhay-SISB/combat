# Combat Game: Firebase Deployment Guide

## What's New

Your Combat game now supports **true multi-device multiplayer** using Firebase Realtime Database. Students on separate iPads can now:
- Join the same tournament lobby
- Receive teacher's pairing assignments in real-time
- See live matches broadcast to the teacher's spectator dashboard
- Have their scores automatically sync across devices

## Quick Summary of Changes

### New Files
- `js/firebase.js` — Firebase Realtime Database manager (handles all sync)
- `js/firebase-config.js` — Configuration template (you fill this in)
- `FIREBASE_SETUP.md` — Detailed Firebase setup (read this first)
- `FIREBASE_QUICK_START.txt` — 2-minute setup summary
- `FIREBASE_INTEGRATION.md` — Technical architecture docs

### Modified Files
- `student.html` — Added Firebase SDK loading
- `teacher.html` — Added Firebase SDK loading + init
- `js/main.js` — Initialize Firebase on game start
- `js/game.js` — Broadcast game state to Firebase
- `js/lobby-student.js` — Listen to Firebase for pairing updates
- `js/teacher.js` — Write pairings to Firebase, listen for leaderboard changes

## Pre-Deployment Checklist

Before deploying to GitHub Pages or your school server:

### 1. Create a Firebase Project
- [ ] Go to https://console.firebase.google.com
- [ ] Create a new project called "combat-game"
- [ ] Enable Realtime Database (start in TEST MODE)
- [ ] Copy your Firebase config

### 2. Configure the Game
- [ ] Open `js/firebase-config.js`
- [ ] Replace `FIREBASE_CONFIG` with your real credentials
- [ ] Save and commit

### 3. Test Locally (Single Device)
```bash
cd /Users/alex/Desktop/combat-game
# Serve locally (e.g., using Python or a simple HTTP server)
python3 -m http.server 8000
```
- [ ] Open `http://localhost:8000/index.html`
- [ ] Test teacher dashboard (add players, start round)
- [ ] Test student page (join lobby, see pairing)
- [ ] Open console (F12) and check for "Firebase connected" message

### 4. Test Locally (Multiple Tabs)
- [ ] Open one tab as teacher: `http://localhost:8000/index.html` → Teacher
- [ ] Open second tab as student 1: `http://localhost:8000/index.html` → Student
- [ ] Open third tab as student 2: `http://localhost:8000/index.html` → Student
- [ ] Add both students in teacher tab
- [ ] Click "Start Round 1"
- [ ] Both student tabs should show they're paired (within 1 second)
- [ ] Start the match and verify live spectator shows both tanks

### 5. Push to GitHub Pages
```bash
cd /Users/alex/Desktop/combat-game
git add -A
git commit -m "Add Firebase integration for multi-device multiplayer"
git push origin main
```

### 6. Test on GitHub Pages
- [ ] Open `https://alexhay-sisb.github.io/combat/index.html`
- [ ] Test the same flows as step 4 (should work identically)

### 7. Test on iPad (if possible)
- [ ] Get your public URL from GitHub Pages
- [ ] Open on one iPad as teacher
- [ ] Open on different iPad as student
- [ ] Verify pairings sync in <1 second
- [ ] Play a match and verify it runs smoothly

## Deployment Options

### Option A: GitHub Pages (Already Set Up ✓)
**Pros:** Free, automatic deployment, easy to share URL
**Cons:** Public to anyone with the URL

```bash
git push origin main
# Game automatically deploys to:
# https://alexhay-sisb.github.io/combat/
```

**To update:** Just push to main branch
```bash
git commit -am "Fix XYZ"
git push origin main
# Updated within 30 seconds
```

### Option B: Netlify (Free, Recommended for Classroom)
1. Go to https://netlify.com and sign up
2. Click "New site from Git" → Connect GitHub → Select your repo
3. Deploy settings:
   - Build command: (leave empty — static files only)
   - Publish directory: `/` (root of repo)
4. Click "Deploy"
5. Share the custom URL with students

**Pros:** Free, faster than GitHub Pages, custom domain support
**Cons:** Requires Netlify account

### Option C: School Server / Self-Hosted
1. Copy game files to your server
2. Make sure files are served via `http://` or `https://` (not `file://`)
3. Update `js/firebase-config.js` with your Firebase credentials
4. Share the server URL with students

## Security Notes

### Test Mode vs. Production Mode

**Test Mode (Current):**
- ✅ Anyone can read and write to the database
- ✅ Perfect for classroom (no authentication needed)
- ❌ Not suitable for production/public deployments

**If you want to secure it later:**
1. Go to Firebase Console → Realtime Database → Rules
2. Set up authentication or IP-based rules
3. See `FIREBASE_SETUP.md` for example rules

### Firebase Config in Git

Your Firebase config (`js/firebase-config.js`) contains:
- `apiKey` (public, safe to share)
- `projectId` (public, safe to share)
- Other IDs (public, safe to share)

**It does NOT contain:**
- Your Firebase admin key
- Your database security rules
- Any secrets

So it's safe to commit to GitHub. However, if you want extra security:
1. Add `js/firebase-config.js` to `.gitignore`
2. Set Firebase config via environment variables in your deployment platform

## Testing Checklist

After deployment, verify:

### Teacher Dashboard
- [ ] Can add players to lobby
- [ ] Can start a round (creates pairings)
- [ ] Can click "Play" to launch student window
- [ ] Live spectator shows running matches
- [ ] Leaderboard updates after match ends

### Student Page (Single Device)
- [ ] Can enter name and join lobby
- [ ] Can see other players in lobby
- [ ] Can see pairing when teacher pairs them
- [ ] Can play a match (quiz + combat)
- [ ] Match results display correctly

### Multi-Device (iPad + Laptop)
- [ ] Student joins from iPad
- [ ] Teacher sees student in lobby on laptop
- [ ] Teacher pairs students
- [ ] Pairing appears on iPad in <1 second
- [ ] Both devices can play the match simultaneously

## Troubleshooting

### Game works on one computer but not across iPads

**Check 1: Is Firebase config set?**
```javascript
// In js/firebase-config.js, should NOT be:
apiKey: "YOUR_API_KEY"

// Should be your REAL Firebase config from Firebase Console
```

**Check 2: Open browser console (F12 → Console) and look for:**
```
✅ Firebase initialized: default
✅ Firebase connected for multi-device sync

❌ Firebase config not set; using localStorage only
   → Fix: Update firebase-config.js
```

**Check 3: Check Firebase Console**
1. Go to https://console.firebase.google.com
2. Select your project
3. Go to Realtime Database
4. You should see data under `tournaments/default/`

**Check 4: Network latency**
- Pairings might take 1-2 seconds on slow WiFi
- This is normal (localStorage polling fallback takes 500ms)
- If it takes >5 seconds, WiFi might be the issue

### "Permission denied" errors in console

**Solution:**
1. Firebase Console → Realtime Database → Rules
2. Should have default rules allowing reads/writes in Test Mode
3. If not, delete database and recreate it (careful with production data!)

### Pairings sync on laptop but not iPad

**Possible causes:**
1. iPad is on different WiFi network (should still work, but slower)
2. iPad has offline mode enabled
3. Firebase database region is very far (higher latency)

**Solution:**
1. Refresh iPad page
2. Check Firebase Console → Realtime Database → you should see updates in real-time
3. Check browser console on iPad (F12) for "Permission denied" errors

## Monitoring

### Firebase Console
After launching, occasionally check:

**Realtime Database:**
- Should see `tournaments/default/` with players, matches, pairings
- Should see data updates in real-time as matches play

**Rules:**
- Should be in Test Mode (allows reads/writes)
- If you see "Rule validation failed", the database rules are broken

**Usage:**
- Monitor storage usage (free tier: 1 GB, you'll use <100 MB)
- Monitor bandwidth (free tier: 100 MB/month, class use rarely exceeds this)

## Rollback

If you want to revert to localStorage-only mode (no Firebase):

```bash
# Edit js/firebase-config.js
# Change back to:
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",  // Revert to placeholder
  ...
};

# Commit and push
git commit -am "Revert to localStorage mode"
git push origin main

# Game will automatically fall back to localStorage
# No data loss (localStorage persists)
```

## Next Steps

1. **Follow FIREBASE_SETUP.md** to create a Firebase project
2. **Test locally** on your computer
3. **Deploy to GitHub Pages** (or your server of choice)
4. **Test on iPads** with real students
5. **Monitor** during first few classes for any issues

## Support

If you run into issues:

1. **Check console** (F12 → Console tab) for error messages
2. **Read FIREBASE_INTEGRATION.md** for technical details
3. **Verify Firebase Console** shows your data
4. **Try single-device first** (one laptop) before multi-device (iPads)

Good luck, and enjoy your multiplayer Combat game! 🎮

---

**Files to keep handy:**
- `FIREBASE_QUICK_START.txt` — 2-minute setup summary
- `FIREBASE_SETUP.md` — Detailed Firebase setup
- `FIREBASE_INTEGRATION.md` — Technical architecture
- This file — Deployment guide
