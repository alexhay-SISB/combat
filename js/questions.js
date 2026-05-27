// ===== Test Question Bank =====
// Mix of easy (1pt) and hard (2pt) IGCSE-style questions.
// Will be replaced by CSV upload in the teacher dashboard.

const TEST_QUESTIONS = [
  // === GEOGRAPHY ===
  {
    text: "What is the capital of France?",
    options: ["London", "Paris", "Berlin", "Madrid"],
    correct: 1, difficulty: 'easy', subject: 'Geography'
  },
  {
    text: "Which is the longest river in the world?",
    options: ["Amazon", "Yangtze", "Nile", "Mississippi"],
    correct: 2, difficulty: 'easy', subject: 'Geography'
  },
  {
    text: "Which country has the largest GDP by nominal value (2024)?",
    options: ["China", "Germany", "USA", "Japan"],
    correct: 2, difficulty: 'hard', subject: 'Geography'
  },
  {
    text: "What tectonic plate boundary causes the San Andreas Fault?",
    options: ["Convergent", "Divergent", "Transform", "Subduction"],
    correct: 2, difficulty: 'hard', subject: 'Geography'
  },

  // === MATH ===
  {
    text: "What is 12 × 8?",
    options: ["86", "92", "96", "108"],
    correct: 2, difficulty: 'easy', subject: 'Math'
  },
  {
    text: "What is the square root of 144?",
    options: ["10", "11", "12", "14"],
    correct: 2, difficulty: 'easy', subject: 'Math'
  },
  {
    text: "Solve for x:  3x + 7 = 22",
    options: ["3", "5", "7", "15"],
    correct: 1, difficulty: 'hard', subject: 'Math'
  },
  {
    text: "What is the value of sin(30°)?",
    options: ["0.5", "0.707", "0.866", "1"],
    correct: 0, difficulty: 'hard', subject: 'Math'
  },

  // === SCIENCE ===
  {
    text: "What gas do plants absorb from the atmosphere?",
    options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"],
    correct: 2, difficulty: 'easy', subject: 'Biology'
  },
  {
    text: "What is the chemical symbol for gold?",
    options: ["Go", "Gd", "Au", "Ag"],
    correct: 2, difficulty: 'easy', subject: 'Chemistry'
  },
  {
    text: "What is the speed of light in a vacuum (m/s)?",
    options: ["3 × 10⁶", "3 × 10⁷", "3 × 10⁸", "3 × 10⁹"],
    correct: 2, difficulty: 'hard', subject: 'Physics'
  },
  {
    text: "Which organelle is the powerhouse of the cell?",
    options: ["Nucleus", "Ribosome", "Mitochondria", "Golgi body"],
    correct: 2, difficulty: 'easy', subject: 'Biology'
  },
  {
    text: "What is Avogadro's number (to 3 sig figs)?",
    options: ["6.02 × 10²²", "6.02 × 10²³", "6.02 × 10²⁴", "9.81 × 10²³"],
    correct: 1, difficulty: 'hard', subject: 'Chemistry'
  },

  // === BUSINESS ===
  {
    text: "What does 'GDP' stand for?",
    options: ["Gross Domestic Product", "Global Demand Price", "General Dividend Plan", "Government Debt Position"],
    correct: 0, difficulty: 'easy', subject: 'Business'
  },
  {
    text: "What is the formula for Net Profit?",
    options: ["Revenue − Costs", "Revenue + Costs", "Revenue × Tax", "Sales − Tax"],
    correct: 0, difficulty: 'easy', subject: 'Business'
  },
  {
    text: "What is 'limited liability'?",
    options: [
      "Owners can lose only what they invested",
      "Owners are personally liable for all debts",
      "A type of insurance for staff",
      "A tax on company profits"
    ],
    correct: 0, difficulty: 'hard', subject: 'Business'
  },
  {
    text: "Which of these is a primary sector activity?",
    options: ["Manufacturing", "Mining", "Banking", "Retailing"],
    correct: 1, difficulty: 'hard', subject: 'Business'
  },

  // === HISTORY ===
  {
    text: "In what year did World War II end?",
    options: ["1943", "1944", "1945", "1946"],
    correct: 2, difficulty: 'easy', subject: 'History'
  },
  {
    text: "Who was the first president of the United States?",
    options: ["Thomas Jefferson", "John Adams", "George Washington", "Benjamin Franklin"],
    correct: 2, difficulty: 'easy', subject: 'History'
  },
  {
    text: "The Treaty of Versailles was signed in which year?",
    options: ["1918", "1919", "1920", "1921"],
    correct: 1, difficulty: 'hard', subject: 'History'
  },

  // === ENGLISH / LITERATURE ===
  {
    text: "Who wrote 'Romeo and Juliet'?",
    options: ["Charles Dickens", "Mark Twain", "William Shakespeare", "Jane Austen"],
    correct: 2, difficulty: 'easy', subject: 'English'
  },
  {
    text: "What literary device is 'the wind whispered'?",
    options: ["Simile", "Personification", "Metaphor", "Hyperbole"],
    correct: 1, difficulty: 'hard', subject: 'English'
  },

  // === GENERAL ===
  {
    text: "How many continents are there?",
    options: ["5", "6", "7", "8"],
    correct: 2, difficulty: 'easy', subject: 'General'
  },
  {
    text: "What is the largest planet in our solar system?",
    options: ["Earth", "Saturn", "Jupiter", "Neptune"],
    correct: 2, difficulty: 'easy', subject: 'Science'
  },
  {
    text: "Which language has the most native speakers worldwide?",
    options: ["English", "Hindi", "Spanish", "Mandarin Chinese"],
    correct: 3, difficulty: 'hard', subject: 'General'
  },
];
