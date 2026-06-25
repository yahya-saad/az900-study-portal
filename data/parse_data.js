const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, 'data.md');
const jsonPath = path.join(__dirname, 'questions.json');

function parseMarkdown() {
  if (!fs.existsSync(mdPath)) {
    console.error(`Error: data.md not found at ${mdPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(mdPath, 'utf8');
  const lines = content.split(/\r?\n/);

  const questions = [];
  let currentQuestion = null;

  // Regex to match option lines: optional leading hyphen/space, then [ ] or [x] / [X], then the option text
  const optionRegex = /^(?:-\s*)?\[([ xX])\]\s*(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('### ')) {
      // Save previous question
      if (currentQuestion) {
        questions.push(currentQuestion);
      }

      // Start new question
      const questionText = line.substring(4).trim();
      currentQuestion = {
        id: questions.length + 1,
        question: questionText,
        options: [],
        answers: []
      };
    } else if (currentQuestion) {
      const match = line.match(optionRegex);
      if (match) {
        const mark = match[1].toLowerCase();
        const optionText = match[2].trim();
        const isCorrect = mark === 'x';

        currentQuestion.options.push(optionText);
        if (isCorrect) {
          currentQuestion.answers.push(currentQuestion.options.length - 1);
        }
      }
    }
  }

  // Push the final question
  if (currentQuestion) {
    questions.push(currentQuestion);
  }

  console.log(`Parsed ${questions.length} questions successfully.`);
  
  // Basic validation checks
  let invalidCount = 0;
  questions.forEach((q, idx) => {
    if (!q.question) {
      console.warn(`Warning: Question at index ${idx} is empty.`);
      invalidCount++;
    }
    if (q.options.length === 0) {
      console.warn(`Warning: Question ${q.id} ("${q.question.substring(0, 30)}...") has no options.`);
      invalidCount++;
    }
    if (q.answers.length === 0) {
      console.warn(`Warning: Question ${q.id} ("${q.question.substring(0, 30)}...") has no correct answers.`);
      invalidCount++;
    }
  });

  if (invalidCount === 0) {
    console.log('All parsed questions passed basic validation structure checks.');
  } else {
    console.warn(`Found ${invalidCount} validation issues.`);
  }

  fs.writeFileSync(jsonPath, JSON.stringify(questions, null, 2), 'utf8');
  console.log(`Saved output to ${jsonPath}`);
}

parseMarkdown();
