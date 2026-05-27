// ===== Firebase Configuration =====
// Replace these values with your Firebase project config from Firebase Console
// https://console.firebase.google.com

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
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
