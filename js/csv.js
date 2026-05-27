// ===== CSV parsing for question uploads =====

const CSV = {
  // Parse CSV text into rows (handles quoted fields with commas inside)
  parse(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { cell += c; }
      } else {
        if (c === '"') { inQuotes = true; }
        else if (c === ',') { row.push(cell.trim()); cell = ''; }
        else if (c === '\n') {
          row.push(cell.trim()); cell = '';
          if (row.some(v => v !== '')) rows.push(row);
          row = [];
        } else if (c !== '\r') { cell += c; }
      }
    }
    if (cell !== '' || row.length > 0) {
      row.push(cell.trim());
      if (row.some(v => v !== '')) rows.push(row);
    }
    return rows;
  },

  // Parse questions from CSV. Format:
  // question_text, answer_1, answer_2, answer_3, answer_4, correct_answer, difficulty, subject
  // correct_answer can be: a number 1-4, OR the full text of the correct option
  // difficulty: "easy" or "hard"
  parseQuestions(text) {
    const rows = this.parse(text);
    const questions = [];
    const errors = [];
    let startIdx = 0;

    if (rows.length === 0) {
      return { questions: [], errors: ['File is empty.'] };
    }

    // Detect optional header row
    const firstCell = (rows[0][0] || '').toLowerCase();
    if (
      firstCell.includes('question') ||
      firstCell.includes('text') ||
      firstCell.startsWith('q')
    ) {
      startIdx = 1;
    }

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 6) {
        errors.push(`Row ${i + 1}: needs at least 6 columns (got ${row.length})`);
        continue;
      }

      const [text, a1, a2, a3, a4, correctRaw, diffRaw, subjectRaw] = row;
      if (!text || !a1 || !a2 || !a3 || !a4) {
        errors.push(`Row ${i + 1}: missing question or answer fields`);
        continue;
      }

      // Resolve correct answer
      let correctIdx = -1;
      const numMatch = parseInt(correctRaw, 10);
      if (!isNaN(numMatch) && numMatch >= 1 && numMatch <= 4 && String(numMatch) === correctRaw.trim()) {
        correctIdx = numMatch - 1;
      } else {
        const options = [a1, a2, a3, a4];
        correctIdx = options.findIndex(
          (opt) => opt.toLowerCase().trim() === correctRaw.toLowerCase().trim()
        );
      }
      if (correctIdx < 0) {
        errors.push(`Row ${i + 1}: correct answer "${correctRaw}" doesn't match any option or 1-4`);
        continue;
      }

      const diffLower = (diffRaw || '').toLowerCase();
      const difficulty = diffLower.includes('hard') ? 'hard' : 'easy';

      questions.push({
        text: text.trim(),
        options: [a1.trim(), a2.trim(), a3.trim(), a4.trim()],
        correct: correctIdx,
        difficulty,
        subject: (subjectRaw || '').trim(),
      });
    }

    return { questions, errors };
  },

  // Generate a sample CSV string (for download)
  sampleQuestions() {
    return [
      'question_text,answer_1,answer_2,answer_3,answer_4,correct_answer,difficulty,subject',
      'What is the capital of France?,London,Paris,Berlin,Madrid,Paris,easy,Geography',
      'What is 12 × 8?,86,92,96,108,96,easy,Math',
      'What is the chemical symbol for gold?,Go,Gd,Au,Ag,Au,easy,Chemistry',
      'Solve for x: 3x + 7 = 22,3,5,7,15,5,hard,Math',
      'What is Avogadro\'s number (to 3 sig figs)?,6.02 × 10²²,6.02 × 10²³,6.02 × 10²⁴,9.81 × 10²³,2,hard,Chemistry',
      'Who wrote "Romeo and Juliet"?,Charles Dickens,Mark Twain,William Shakespeare,Jane Austen,William Shakespeare,easy,English',
    ].join('\n');
  },
};
