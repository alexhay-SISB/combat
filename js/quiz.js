// ===== Quiz: per-player quiz state =====

const READ_TIME = 1.5;          // seconds before answers enable
const FEEDBACK_RIGHT = 0.7;     // brief flash on correct
const FEEDBACK_WRONG = 3.0;     // longer penalty on wrong (anti-guessing)

// Streak bonus thresholds (correct in a row → bonus pts on that answer)
function getStreakBonus(streak) {
  if (streak >= 9) return 3;
  if (streak >= 6) return 2;
  if (streak >= 3) return 1;
  return 0;
}

class Quiz {
  constructor(playerId, questionBank) {
    this.playerId = playerId;
    this.questions = [...questionBank].sort(() => Math.random() - 0.5);
    this.currentIndex = 0;
    this.score = 0;
    this.answered = 0;
    this.correct = 0;
    this.streak = 0;        // current consecutive-correct streak
    this.bestStreak = 0;    // best streak achieved this quiz
    this.feedback = null;   // { type, pickedIndex, correctIndex, timeLeft, totalTime, pointsEarned, bonusPoints }
    this.locked = false;
    this.readTime = READ_TIME;
  }

  currentQuestion() {
    return this.questions[this.currentIndex % this.questions.length];
  }

  canAnswer() {
    return !this.locked && this.readTime <= 0;
  }

  answer(optionIndex) {
    if (!this.canAnswer()) return null;
    const q = this.currentQuestion();
    const isCorrect = optionIndex === q.correct;
    this.answered++;

    let pointsEarned = 0;
    let bonusPoints = 0;

    if (isCorrect) {
      this.correct++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      // Points per question: easy = 5, hard = 10.
      const basePts = q.difficulty === 'hard' ? 10 : 5;
      bonusPoints = getStreakBonus(this.streak);
      pointsEarned = basePts + bonusPoints;
      this.score += pointsEarned;
    } else {
      this.streak = 0;          // wrong breaks the streak
    }

    const totalFeedback = isCorrect ? FEEDBACK_RIGHT : FEEDBACK_WRONG;
    this.feedback = {
      type: isCorrect ? 'correct' : 'wrong',
      pickedIndex: optionIndex,
      correctIndex: q.correct,
      timeLeft: totalFeedback,
      totalTime: totalFeedback,
      pointsEarned,
      bonusPoints,
    };
    this.locked = true;
    return isCorrect;
  }

  update(dt) {
    if (this.readTime > 0) {
      this.readTime = Math.max(0, this.readTime - dt);
    }
    if (this.feedback) {
      this.feedback.timeLeft -= dt;
      if (this.feedback.timeLeft <= 0) {
        this.feedback = null;
        this.currentIndex++;
        this.locked = false;
        this.readTime = READ_TIME;  // reset read timer for next question
      }
    }
  }
}
