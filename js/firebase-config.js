// ===== Firebase Configuration =====
// Replace these values with your Firebase project config from Firebase Console
// https://console.firebase.google.com

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDm4Y8lIaWe7gTCiy7SV8YTaPyYRMgLIxw",
  authDomain: "combat-29fb0.firebaseapp.com",
  // Realtime Database in Asia Southeast 1 region
  databaseURL: "https://combat-29fb0-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "combat-29fb0",
  storageBucket: "combat-29fb0.firebasestorage.app",
  messagingSenderId: "904791328168",
  appId: "1:904791328168:web:e9dccabf927a5623e0899d"
};

// Database references (used by firebase.js)
// Database structure:
// /tournaments/{tournamentId}
//   /players/{playerId}
//     name, score, wins, losses, kills, quizScore, rating
//   /matches/{matchId}
//     p1, p2, p1Name, p2Name, status, round, state
//   /pairings (RoundManager sets this)
//     matchN: { p1, p2, p1Name, p2Name }
//   /leaderboard (auto-updated by game.js)
//     {playerId}: { name, wins, losses, kills, quizScore, rating }

const TOURNAMENT_ID = "default"; // Change if running multiple tournaments
