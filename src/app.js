// ==========================================================================
// Azure AZ-900 Study Hub Application Logic
// ==========================================================================

// Global State
let allQuestions = [];
let appState = {
  activeView: 'welcome', // 'welcome' | 'practice' | 'exam' | 'results'
  
  // Practice Mode State
  practice: {
    currentIndex: 0,
    isAnswerRevealed: false,
    userSelections: [],
    shuffleEnabled: false,
    orderMap: [], // maps logical index to actual question index in allQuestions
    focusedOptionIndex: -1,
    answeredQuestions: {},
  },
  
  // Exam Mode State
  exam: {
    questions: [],
    currentIndex: 0,
    selections: [], // array of arrays containing selected option indices
    skipped: [],    // array of booleans indicating if a question was skipped
    timerInterval: null,
    timeRemaining: 0,
    totalTime: 0,   // total seconds allocated
    startTime: null,
    focusedOptionIndex: -1,
  },
  
  // Stats & Bookmarks
  history: [],
  bookmarks: [], // array of question IDs that are bookmarked
  searchMatches: [], // array of allQuestions indices matching search query
  historyPage: 1,
  historyPageSize: 5,
  historyDateFilter: '',
};

// DOM Elements
const views = {
  welcome: document.getElementById('welcome-view'),
  practice: document.getElementById('practice-view'),
  exam: document.getElementById('exam-view'),
  results: document.getElementById('results-view')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  // Check protocol and display warning banner for file://
  if (window.location.protocol === 'file:') {
    const banner = document.getElementById('protocol-warning-banner');
    if (banner) {
      banner.classList.remove('hide');
    }
  }
  setupEventListeners();
  loadHistory();
  loadBookmarks();
  await fetchQuestions();
});

// ==========================================================================
// Custom Dialog System (Promised-based Modals)
// ==========================================================================

function showConfirm(title, message, okText = 'Confirm', cancelText = 'Cancel') {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;
    
    modal.classList.remove('hide');
    
    function cleanUp() {
      modal.classList.add('hide');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    }
    
    function onOk() {
      cleanUp();
      resolve(true);
    }
    
    function onCancel() {
      cleanUp();
      resolve(false);
    }
    
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

function showAlert(title, message, okText = 'OK') {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-alert-modal');
    const titleEl = document.getElementById('alert-title');
    const messageEl = document.getElementById('alert-message');
    const okBtn = document.getElementById('alert-ok-btn');
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.textContent = okText;
    
    modal.classList.remove('hide');
    
    function onOk() {
      modal.classList.add('hide');
      okBtn.removeEventListener('click', onOk);
      resolve();
    }
    
    okBtn.addEventListener('click', onOk);
  });
}

// ==========================================================================
// Event Listeners & Setup
// ==========================================================================

function setupEventListeners() {
  // Logo / Home navigation
  document.getElementById('logo-btn').addEventListener('click', () => {
    confirmExitToHome();
  });

  // Start Practice Mode
  document.getElementById('start-practice-btn').addEventListener('click', async () => {
    const shuffle = document.getElementById('practice-shuffle').checked;
    const startQ = parseInt(document.getElementById('practice-start-index').value, 10) || 1;
    
    const saved = loadPracticeState();
    if (saved) {
      const resume = await showConfirm(
        'Resume Practice?',
        'You have a practice session in progress. Would you like to resume where you left off?',
        'Resume',
        'Start New'
      );
      if (resume) {
        initPractice(shuffle, startQ, saved);
        return;
      } else {
        clearPracticeState();
      }
    }
    initPractice(shuffle, startQ);
  });

  // Start Exam Mode
  document.getElementById('start-exam-btn').addEventListener('click', async () => {
    const qCount = parseInt(document.getElementById('exam-q-count').value, 10);
    const duration = parseInt(document.getElementById('exam-timer').value, 10);
    
    const saved = loadExamState();
    if (saved) {
      const minutes = Math.floor(saved.timeRemaining / 60);
      const seconds = saved.timeRemaining % 60;
      const timeStr = `${minutes}m ${seconds}s`;
      
      const resume = await showConfirm(
        'Resume Exam?',
        `You have an exam session in progress with ${timeStr} remaining. Would you like to resume?`,
        'Resume',
        'Start New'
      );
      if (resume) {
        initExam(qCount, duration, saved);
        return;
      } else {
        clearExamState();
      }
    }
    initExam(qCount, duration);
  });

  // Practice Mode Actions
  document.getElementById('practice-prev-btn').addEventListener('click', () => navigatePractice(-1));
  document.getElementById('practice-next-btn').addEventListener('click', () => navigatePractice(1));
  document.getElementById('practice-reveal-btn').addEventListener('click', revealPracticeAnswer);
  document.getElementById('practice-bookmark-btn').addEventListener('click', toggleBookmarkCurrentQuestion);
  
  const jumpInput = document.getElementById('practice-jump-input');
  jumpInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const targetVal = parseInt(jumpInput.value, 10);
      const totalAvailable = appState.practice.orderMap.length;
      if (targetVal >= 1 && targetVal <= totalAvailable) {
        jumpToPracticeQuestion(targetVal - 1);
      } else {
        jumpInput.value = appState.practice.currentIndex + 1;
      }
    }
  });

  // Practice Reset Session Button
  const practiceResetBtn = document.getElementById('practice-reset-btn');
  if (practiceResetBtn) {
    practiceResetBtn.addEventListener('click', async () => {
      const confirmed = await showConfirm(
        'Reset Practice Progress?',
        'Are you sure you want to clear all answered questions and restart this practice session from question 1?',
        'Reset',
        'Cancel'
      );
      if (confirmed) {
        clearPracticeState();
        const shuffle = appState.practice.shuffleEnabled;
        initPractice(shuffle, 1);
      }
    });
  }

  // Exam Mode Actions
  document.getElementById('exam-skip-btn').addEventListener('click', skipExamQuestion);
  document.getElementById('exam-next-btn').addEventListener('click', nextExamQuestion);
  document.getElementById('exam-submit-top-btn').addEventListener('click', () => submitExam(false));
  document.getElementById('exam-bookmark-btn').addEventListener('click', toggleBookmarkCurrentQuestion);

  // Results Actions
  document.getElementById('results-home-btn').addEventListener('click', () => switchView('welcome'));
  document.getElementById('results-retake-btn').addEventListener('click', () => {
    if (appState.exam.questions.length > 0) {
      // Retake exam with same parameters
      const qCount = appState.exam.questions.length;
      const duration = Math.round(appState.exam.totalTime / 60);
      initExam(qCount, duration);
    } else {
      switchView('welcome');
    }
  });

  // Review Filters
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const filter = e.target.getAttribute('data-filter');
      applyReviewFilter(filter);
    });
  });

  // Search Features
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearchInput);
  }
  document.getElementById('start-search-practice-btn').addEventListener('click', startSearchPractice);

  // Bookmark Practice
  document.getElementById('start-bookmarks-practice-btn').addEventListener('click', startBookmarksPractice);

  // History Filters
  const dateFilterInput = document.getElementById('history-date-filter');
  if (dateFilterInput) {
    dateFilterInput.addEventListener('input', (e) => {
      appState.historyDateFilter = e.target.value;
      appState.historyPage = 1;
      updateHistoryUI();
    });
  }
  
  const pageSizeInput = document.getElementById('history-page-size');
  if (pageSizeInput) {
    pageSizeInput.addEventListener('change', (e) => {
      appState.historyPageSize = e.target.value;
      appState.historyPage = 1;
      updateHistoryUI();
    });
  }

  // Reset Progress Button
  const resetBtn = document.getElementById('reset-progress-btn');
  resetBtn.addEventListener('click', async () => {
    const confirmed = await showConfirm(
      'Reset Progress', 
      'Are you sure you want to delete all exam history and progress stats? This cannot be undone.', 
      'Reset', 
      'Cancel'
    );
    if (confirmed) {
      localStorage.removeItem('az900_exam_history');
      clearPracticeState();
      clearExamState();
      appState.history = [];
      updateHistoryUI();
      updateHeaderStats();
    }
  });

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    if (appState.activeView === 'practice') {
      handlePracticeKeys(e);
    } else if (appState.activeView === 'exam') {
      handleExamKeys(e);
    }
  });
}

// Fetch Questions from JSON
async function fetchQuestions() {
  try {
    const response = await fetch('data/questions.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    allQuestions = await response.json();
    
    // Set bounds for start index input
    const startIndexInput = document.getElementById('practice-start-index');
    if (startIndexInput) {
      startIndexInput.max = allQuestions.length;
    }
    
    console.log(`Loaded ${allQuestions.length} questions into memory.`);
  } catch (error) {
    console.error('Failed to load questions:', error);
    showAlert('Error Loading Data', 'Failed to load exam data. Please make sure questions.json is available and generated.');
  }
}

// Switch Active View
function switchView(viewName) {
  // Clean up timers if leaving exam
  if (appState.activeView === 'exam' && viewName !== 'exam') {
    clearInterval(appState.exam.timerInterval);
  }

  // Update State
  appState.activeView = viewName;

  // Toggle active views
  Object.keys(views).forEach(key => {
    if (key === viewName) {
      views[key].classList.add('active');
    } else {
      views[key].classList.remove('active');
    }
  });

  // Scroll to top
  window.scrollTo(0, 0);

  // If returning to welcome, refresh UI elements
  if (viewName === 'welcome') {
    updateHistoryUI();
    updateHeaderStats();
    updateBookmarksUI();
    
    // Reset search bar on home
    const searchBar = document.getElementById('search-input');
    if (searchBar) searchBar.value = '';
    const searchPanel = document.getElementById('search-results-panel');
    if (searchPanel) searchPanel.classList.add('hide');
    appState.searchMatches = [];
  }
}

// Exit warning if in active exam
async function confirmExitToHome() {
  if (appState.activeView === 'exam') {
    const confirmed = await showConfirm(
      'Exit Exam?', 
      'An exam is currently in progress. If you leave, your answers will be discarded. Do you want to exit?', 
      'Exit', 
      'Stay'
    );
    if (confirmed) {
      switchView('welcome');
    }
  } else {
    switchView('welcome');
  }
}

// ==========================================================================
// Formatting Helper (Markdown to HTML)
// ==========================================================================

function formatMarkdown(text) {
  if (!text) return '';
  
  // Escape HTML to prevent injection
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  // Inline Code: `code`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Highlighting brackets: [text]
  html = html.replace(/\[([^\]]+)\]/g, '<span class="highlight-text">$1</span>');
  
  return html;
}

// ==========================================================================
// Practice Mode Logic
// ==========================================================================

function initPractice(shuffle, startIndex, resumeState = null) {
  if (resumeState) {
    appState.practice.shuffleEnabled = resumeState.shuffleEnabled;
    appState.practice.orderMap = resumeState.orderMap;
    appState.practice.currentIndex = resumeState.currentIndex;
    appState.practice.answeredQuestions = resumeState.answeredQuestions || {};
    appState.practice.focusedOptionIndex = -1;
  } else {
    appState.practice.shuffleEnabled = shuffle;
    appState.practice.answeredQuestions = {};
    appState.practice.focusedOptionIndex = -1;
    
    // Build Order Map of all questions
    const count = allQuestions.length;
    let indices = Array.from({ length: count }, (_, i) => i);
    
    if (shuffle) {
      // Shuffle indices (Fisher-Yates)
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    }
    
    appState.practice.orderMap = indices;
    
    // Determine index to start from
    let startingPos = 0;
    if (startIndex >= 1 && startIndex <= count) {
      if (shuffle) {
        // Find where question ID is in the shuffled array
        const targetId = startIndex; // ID is 1-indexed and matches sequential index
        const foundIdx = indices.findIndex(idx => allQuestions[idx].id === targetId);
        if (foundIdx !== -1) startingPos = foundIdx;
      } else {
        startingPos = startIndex - 1;
      }
    }
    
    appState.practice.currentIndex = startingPos;
  }
  
  renderPracticeQuestion();
  savePracticeState();
  switchView('practice');
}

function renderPracticeQuestion() {
  const logicalIndex = appState.practice.currentIndex;
  const actualIndex = appState.practice.orderMap[logicalIndex];
  const q = allQuestions[actualIndex];
  
  appState.practice.focusedOptionIndex = -1;
  
  const saved = appState.practice.answeredQuestions[logicalIndex];
  if (saved) {
    appState.practice.isAnswerRevealed = saved.isAnswerRevealed;
    appState.practice.userSelections = [...saved.userSelections];
  } else {
    appState.practice.isAnswerRevealed = false;
    appState.practice.userSelections = [];
  }
  
  // Update Tracking Elements
  document.getElementById('practice-current-num').textContent = logicalIndex + 1;
  document.getElementById('practice-total-num').textContent = appState.practice.orderMap.length;
  
  const jumpInput = document.getElementById('practice-jump-input');
  jumpInput.value = logicalIndex + 1;
  jumpInput.max = appState.practice.orderMap.length;
  
  // Render Text
  const questionContainer = document.getElementById('practice-question');
  questionContainer.innerHTML = formatMarkdown(q.question);
  
  // Render Options
  const optionsContainer = document.getElementById('practice-options');
  optionsContainer.innerHTML = '';
  
  const isMultiSelect = q.answers.length > 1;
  
  q.options.forEach((opt, idx) => {
    const card = document.createElement('div');
    card.className = 'option-card';
    if (isMultiSelect) {
      card.classList.add('multi-choice');
    }
    card.setAttribute('data-index', idx);
    if (idx === appState.practice.focusedOptionIndex) {
      card.classList.add('focused');
    }
    
    const isSelected = appState.practice.userSelections.includes(idx);
    if (appState.practice.isAnswerRevealed) {
      const isCorrect = q.answers.includes(idx);
      card.style.cursor = 'default';
      if (isCorrect) {
        card.classList.add('reveal-correct');
      } else if (isSelected) {
        card.classList.add('reveal-incorrect');
      }
    } else {
      if (isSelected) {
        card.classList.add('selected');
      }
    }
    
    const marker = document.createElement('div');
    marker.className = 'option-marker';
    
    const text = document.createElement('div');
    text.className = 'option-text';
    text.innerHTML = formatMarkdown(opt);
    
    card.appendChild(marker);
    card.appendChild(text);
    
    card.addEventListener('click', () => handlePracticeOptionSelect(idx));
    optionsContainer.appendChild(card);
  });
  
  // Update Buttons
  document.getElementById('practice-prev-btn').disabled = (logicalIndex === 0);
  document.getElementById('practice-next-btn').disabled = (logicalIndex === appState.practice.orderMap.length - 1);
  
  const revealBtn = document.getElementById('practice-reveal-btn');
  revealBtn.disabled = appState.practice.isAnswerRevealed;
  revealBtn.classList.remove('hide');
  
  // Update Bookmark Toggle Icon state
  updateBookmarkButtonUI();
}
 
function handlePracticeOptionSelect(index) {
  if (appState.practice.isAnswerRevealed) return; // locked once revealed
  
  appState.practice.focusedOptionIndex = index;
  updatePracticeFocusUI();
  
  const actualIndex = appState.practice.orderMap[appState.practice.currentIndex];
  const q = allQuestions[actualIndex];
  const isMultiSelect = q.answers.length > 1;
  
  const selections = appState.practice.userSelections;
  const foundIdx = selections.indexOf(index);
  
  if (isMultiSelect) {
    if (foundIdx !== -1) {
      selections.splice(foundIdx, 1);
    } else {
      selections.push(index);
    }
  } else {
    // Single select
    appState.practice.userSelections = [index];
  }
  
  // Save progress
  appState.practice.answeredQuestions[appState.practice.currentIndex] = {
    userSelections: [...appState.practice.userSelections],
    isAnswerRevealed: false
  };
  savePracticeState();
  
  // Update UI selected states
  const optionCards = document.querySelectorAll('#practice-options .option-card');
  optionCards.forEach(card => {
    const cardIdx = parseInt(card.getAttribute('data-index'), 10);
    if (appState.practice.userSelections.includes(cardIdx)) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
}

function revealPracticeAnswer() {
  if (appState.practice.isAnswerRevealed) return;
  
  const actualIndex = appState.practice.orderMap[appState.practice.currentIndex];
  const q = allQuestions[actualIndex];
  
  appState.practice.isAnswerRevealed = true;
  
  // Save progress
  appState.practice.answeredQuestions[appState.practice.currentIndex] = {
    userSelections: [...appState.practice.userSelections],
    isAnswerRevealed: true
  };
  savePracticeState();
  
  // Lock Options and Style them
  const optionCards = document.querySelectorAll('#practice-options .option-card');
  optionCards.forEach(card => {
    const cardIdx = parseInt(card.getAttribute('data-index'), 10);
    const isCorrect = q.answers.includes(cardIdx);
    const isSelected = appState.practice.userSelections.includes(cardIdx);
    
    // Remove hover scale/pointer
    card.style.cursor = 'default';
    card.classList.remove('selected');
    
    if (isCorrect) {
      card.classList.add('reveal-correct');
    } else if (isSelected) {
      card.classList.add('reveal-incorrect');
    }
  });
  
  // Disable Reveal Button
  document.getElementById('practice-reveal-btn').disabled = true;
}

function navigatePractice(direction) {
  const target = appState.practice.currentIndex + direction;
  if (target >= 0 && target < appState.practice.orderMap.length) {
    appState.practice.currentIndex = target;
    savePracticeState();
    renderPracticeQuestion();
  }
}

function jumpToPracticeQuestion(index) {
  appState.practice.currentIndex = index;
  savePracticeState();
  renderPracticeQuestion();
}

// ==========================================================================
// Exam Mode Logic
// ==========================================================================

function initExam(qCount, durationMinutes, resumeState = null) {
  // Clear any existing timer
  if (appState.exam.timerInterval) {
    clearInterval(appState.exam.timerInterval);
  }
  
  if (resumeState) {
    appState.exam.questions = resumeState.questions;
    appState.exam.currentIndex = resumeState.currentIndex;
    appState.exam.selections = resumeState.selections;
    appState.exam.skipped = resumeState.skipped;
    appState.exam.totalTime = resumeState.totalTime;
    appState.exam.timeRemaining = resumeState.timeRemaining;
    appState.exam.startTime = resumeState.startTime;
    appState.exam.focusedOptionIndex = -1;
  } else {
    // Select Q random questions from the pool
    const count = allQuestions.length;
    const pool = Array.from({ length: count }, (_, i) => i);
    const examIndices = [];
    
    const selectedCount = Math.min(qCount, count);
    
    // Fisher-Yates partial shuffle to extract random pool
    for (let i = 0; i < selectedCount; i++) {
      const r = i + Math.floor(Math.random() * (count - i));
      const temp = pool[i];
      pool[i] = pool[r];
      pool[r] = temp;
      examIndices.push(pool[i]);
    }
    
    // Set Exam State
    appState.exam.questions = examIndices.map(idx => allQuestions[idx]);
    appState.exam.currentIndex = 0;
    appState.exam.selections = Array.from({ length: selectedCount }, () => []);
    appState.exam.skipped = Array.from({ length: selectedCount }, () => false);
    appState.exam.totalTime = durationMinutes * 60;
    appState.exam.timeRemaining = durationMinutes * 60;
    appState.exam.startTime = Date.now();
    appState.exam.focusedOptionIndex = -1;
  }
  
  // Reset Timer Classes
  const timerDisplay = document.getElementById('exam-timer-display');
  timerDisplay.classList.remove('critical');
  
  // Start Timer Loop
  updateTimerUI();
  appState.exam.timerInterval = setInterval(updateExamTimer, 1000);
  
  // Render
  renderExamQuestion();
  saveExamState();
  switchView('exam');
}

async function updateExamTimer() {
  appState.exam.timeRemaining--;
  updateTimerUI();
  saveExamState();
  
  if (appState.exam.timeRemaining <= 0) {
    clearInterval(appState.exam.timerInterval);
    await showAlert('Time Limit Reached', 'Time limit reached! Submitting your exam automatically.');
    submitExam(true);
  }
}

function updateTimerUI() {
  const display = document.getElementById('exam-timer-display');
  const minutes = Math.floor(appState.exam.timeRemaining / 60);
  const seconds = appState.exam.timeRemaining % 60;
  
  display.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Alert color if under 5 minutes (300 seconds)
  if (appState.exam.timeRemaining < 300) {
    display.classList.add('critical');
  }
}

function renderExamQuestion() {
  const idx = appState.exam.currentIndex;
  const q = appState.exam.questions[idx];
  
  appState.exam.focusedOptionIndex = -1;
  saveExamState();
  
  // Update Tracker Info
  const answeredCount = appState.exam.selections.filter(sel => sel.length > 0).length;
  const totalCount = appState.exam.questions.length;
  const percent = Math.round((answeredCount / totalCount) * 100);
  
  const progressBar = document.getElementById('exam-progress-bar');
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
  
  const progressText = document.getElementById('exam-progress-text');
  if (progressText) {
    progressText.textContent = `${answeredCount} / ${totalCount} Answered`;
  }
  
  // Render Text
  const questionContainer = document.getElementById('exam-question');
  questionContainer.innerHTML = formatMarkdown(q.question);
  
  // Render Options
  const optionsContainer = document.getElementById('exam-options');
  optionsContainer.innerHTML = '';
  
  const isMultiSelect = q.answers.length > 1;
  const activeSelections = appState.exam.selections[idx];
  
  q.options.forEach((opt, optIdx) => {
    const card = document.createElement('div');
    card.className = 'option-card';
    if (isMultiSelect) {
      card.classList.add('multi-choice');
    }
    
    if (activeSelections.includes(optIdx)) {
      card.classList.add('selected');
    }
    
    card.setAttribute('data-index', optIdx);
    if (optIdx === appState.exam.focusedOptionIndex) {
      card.classList.add('focused');
    }
    
    const marker = document.createElement('div');
    marker.className = 'option-marker';
    
    const text = document.createElement('div');
    text.className = 'option-text';
    text.innerHTML = formatMarkdown(opt);
    
    card.appendChild(marker);
    card.appendChild(text);
    
    card.addEventListener('click', () => handleExamOptionSelect(optIdx));
    optionsContainer.appendChild(card);
  });
  
  // Next / Submit Button Text
  const nextBtn = document.getElementById('exam-next-btn');
  if (idx === appState.exam.questions.length - 1) {
    nextBtn.innerHTML = `Finish & Submit Exam <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
  } else {
    nextBtn.innerHTML = `Next Question <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
  }
  
  // Disable next if nothing selected
  nextBtn.disabled = (activeSelections.length === 0);
  
  // Update Bookmark Toggle Icon state
  updateBookmarkButtonUI();
}

function handleExamOptionSelect(optIndex) {
  appState.exam.focusedOptionIndex = optIndex;
  updateExamFocusUI();
  
  const idx = appState.exam.currentIndex;
  const q = appState.exam.questions[idx];
  const isMultiSelect = q.answers.length > 1;
  
  const currentSels = appState.exam.selections[idx];
  const foundIdx = currentSels.indexOf(optIndex);
  
  if (isMultiSelect) {
    if (foundIdx !== -1) {
      currentSels.splice(foundIdx, 1);
    } else {
      currentSels.push(optIndex);
    }
  } else {
    appState.exam.selections[idx] = [optIndex];
  }
  
  // Clear skipped mark on selection
  appState.exam.skipped[idx] = false;
  
  // Update Selection Classes
  const optionCards = document.querySelectorAll('#exam-options .option-card');
  optionCards.forEach(card => {
    const cardIdx = parseInt(card.getAttribute('data-index'), 10);
    if (appState.exam.selections[idx].includes(cardIdx)) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
  
  // Toggle Next button status
  document.getElementById('exam-next-btn').disabled = (appState.exam.selections[idx].length === 0);
  saveExamState();
}

function skipExamQuestion() {
  const idx = appState.exam.currentIndex;
  appState.exam.skipped[idx] = true;
  appState.exam.selections[idx] = []; // clear choices if skipped
  
  saveExamState();
  moveToNextOrWrap();
}

function nextExamQuestion() {
  const idx = appState.exam.currentIndex;
  
  if (idx === appState.exam.questions.length - 1) {
    submitExam(false);
  } else {
    moveToNextOrWrap();
  }
}

function moveToNextOrWrap() {
  const current = appState.exam.currentIndex;
  const total = appState.exam.questions.length;
  
  if (current < total - 1) {
    appState.exam.currentIndex++;
    renderExamQuestion();
  } else {
    // If on the last question, wrap back to the first unanswered/skipped question if any exist
    const unansweredIdx = appState.exam.selections.findIndex((sel, i) => sel.length === 0 && !appState.exam.skipped[i]);
    const skippedIdx = appState.exam.skipped.indexOf(true);
    
    const targetIdx = unansweredIdx !== -1 ? unansweredIdx : (skippedIdx !== -1 ? skippedIdx : 0);
    
    appState.exam.currentIndex = targetIdx;
    renderExamQuestion();
  }
}

async function submitExam(force = false) {
  if (!force) {
    const unanswered = appState.exam.selections.filter((sel, i) => sel.length === 0 && !appState.exam.skipped[i]).length;
    const skipped = appState.exam.skipped.filter(Boolean).length;
    
    let confirmMsg = 'Are you sure you want to finish and submit the exam?';
    if (unanswered > 0 || skipped > 0) {
      confirmMsg = `You have ${unanswered} unanswered and ${skipped} skipped questions. Are you sure you want to submit?`;
    }
    
    const confirmed = await showConfirm('Submit Exam?', confirmMsg, 'Submit', 'Cancel');
    if (!confirmed) {
      return;
    }
  }
  
  // Calculate Results
  clearInterval(appState.exam.timerInterval);
  clearExamState();
  
  let correctCount = 0;
  const total = appState.exam.questions.length;
  
  appState.exam.questions.forEach((q, idx) => {
    const userAns = appState.exam.selections[idx];
    const correctAns = q.answers;
    
    if (userAns.length === correctAns.length && userAns.every(val => correctAns.includes(val))) {
      correctCount++;
    }
  });
  
  const scorePercent = Math.round((correctCount / total) * 100);
  const isPassed = scorePercent >= 70;
  
  const timeTakenSec = appState.exam.totalTime - appState.exam.timeRemaining;
  const timeTakenMin = Math.floor(timeTakenSec / 60);
  const timeTakenRemSec = timeTakenSec % 60;
  const timeTakenStr = `${String(timeTakenMin).padStart(2, '0')}:${String(timeTakenRemSec).padStart(2, '0')}`;
  
  // Build and Save Score Record
  const record = {
    timestamp: Date.now(),
    score: scorePercent,
    correct: correctCount,
    total: total,
    timeTaken: timeTakenStr,
    outcome: isPassed ? 'Pass' : 'Fail',
    questions: appState.exam.questions.map(q => q.id),
    selections: appState.exam.selections.map(sel => [...sel]),
    skipped: [...appState.exam.skipped]
  };
  
  appState.history.unshift(record);
  saveHistory();
  
  // Load Results page values
  document.getElementById('results-score').textContent = `${scorePercent}%`;
  document.getElementById('results-correct').textContent = `${correctCount}/${total}`;
  document.getElementById('results-time').textContent = timeTakenStr;
  
  const badge = document.getElementById('results-outcome-badge');
  if (isPassed) {
    badge.textContent = 'Passed';
    badge.className = 'badge badge-outcome pass';
    document.getElementById('results-score').className = 'stat-num text-success';
  } else {
    badge.textContent = 'Failed';
    badge.className = 'badge badge-outcome fail';
    document.getElementById('results-score').className = 'stat-num text-danger';
  }
  
  // Ensure retake button is visible for newly completed exam
  document.getElementById('results-retake-btn').classList.remove('hide');
  
  // Render Breakdown Review list
  renderDetailedReview();
  
  switchView('results');
}

// ==========================================================================
// Results Review Listing
// ==========================================================================

function renderDetailedReview() {
  const container = document.getElementById('results-review-list');
  container.innerHTML = '';
  
  let correctCount = 0;
  let incorrectCount = 0;
  let skippedCount = 0;
  
  appState.exam.questions.forEach((q, idx) => {
    const userSels = appState.exam.selections[idx];
    const isSkipped = appState.exam.skipped[idx];
    const isCorrect = !isSkipped && userSels.length === q.answers.length && userSels.every(val => q.answers.includes(val));
    
    if (isCorrect) correctCount++;
    else if (isSkipped) skippedCount++;
    else incorrectCount++;
    
    const item = document.createElement('div');
    item.className = 'review-item';
    item.setAttribute('data-status', isCorrect ? 'correct' : 'incorrect');
    
    // Header Info
    const header = document.createElement('div');
    header.className = 'review-item-header';
    
    const qText = document.createElement('div');
    qText.className = 'review-q-text';
    qText.innerHTML = `<strong>Q${idx + 1}:</strong> ${formatMarkdown(q.question)}`;
    
    // Quick Add Bookmark icon for wrong answers in review screen
    const bookmarkBtnHtml = `
      <button class="bookmark-btn review-row-bookmark ${appState.bookmarks.includes(q.id) ? 'active' : ''}" data-qid="${q.id}" title="Toggle bookmark">
        <svg class="bookmark-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </button>
    `;

    const badgeWrapper = document.createElement('div');
    badgeWrapper.style.display = 'flex';
    badgeWrapper.style.alignItems = 'center';
    badgeWrapper.style.gap = '8px';

    const badge = document.createElement('span');
    if (isCorrect) {
      badge.className = 'review-badge correct';
      badge.textContent = 'Correct';
    } else if (isSkipped) {
      badge.className = 'review-badge skipped';
      badge.textContent = 'Skipped';
    } else {
      badge.className = 'review-badge incorrect';
      badge.textContent = 'Incorrect';
    }
    
    badgeWrapper.innerHTML = bookmarkBtnHtml;
    badgeWrapper.appendChild(badge);
    
    header.appendChild(qText);
    header.appendChild(badgeWrapper);
    item.appendChild(header);
    
    // Options review list
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'review-options';
    
    q.options.forEach((opt, optIdx) => {
      const optRow = document.createElement('div');
      optRow.className = 'review-opt';
      
      const isAnsCorrect = q.answers.includes(optIdx);
      const isAnsSelected = userSels.includes(optIdx);
      
      let icon = '';
      if (isAnsCorrect) {
        optRow.classList.add('is-correct');
        icon = '<span class="review-marker-icon">✅</span>';
      } else if (isAnsSelected) {
        optRow.classList.add('user-selected');
        icon = '<span class="review-marker-icon">❌</span>';
      } else {
        icon = '<span class="review-marker-icon">&nbsp;&nbsp;&nbsp;</span>';
      }
      
      optRow.innerHTML = `${icon} <span class="opt-content">${formatMarkdown(opt)}</span>`;
      optionsDiv.appendChild(optRow);
    });
    
    item.appendChild(optionsDiv);
    container.appendChild(item);
  });
  
  // Register click handlers for bookmarks in review list
  document.querySelectorAll('.review-row-bookmark').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.target.closest('.review-row-bookmark');
      const qid = parseInt(targetBtn.getAttribute('data-qid'), 10);
      const index = appState.bookmarks.indexOf(qid);
      if (index !== -1) {
        appState.bookmarks.splice(index, 1);
        targetBtn.classList.remove('active');
      } else {
        appState.bookmarks.push(qid);
        targetBtn.classList.add('active');
      }
      saveBookmarks();
    });
  });

  // Update count tabs
  document.getElementById('count-all').textContent = appState.exam.questions.length;
  document.getElementById('count-correct').textContent = correctCount;
  document.getElementById('count-incorrect').textContent = incorrectCount + skippedCount;
  
  // Set filter back to 'all' default
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector('.filter-btn[data-filter="all"]').classList.add('active');
}

function applyReviewFilter(filter) {
  const items = document.querySelectorAll('#results-review-list .review-item');
  items.forEach(item => {
    const status = item.getAttribute('data-status');
    if (filter === 'all') {
      item.classList.remove('hide');
    } else if (filter === 'correct' && status === 'correct') {
      item.classList.remove('hide');
    } else if (filter === 'incorrect' && status === 'incorrect') {
      item.classList.remove('hide');
    } else {
      item.classList.add('hide');
    }
  });
}

// ==========================================================================
// Search & Bookmarks Engine
// ==========================================================================

function handleSearchInput(e) {
  const query = e.target.value.toLowerCase().trim();
  const panel = document.getElementById('search-results-panel');
  const text = document.getElementById('search-results-text');
  
  if (query.length < 2) {
    panel.classList.add('hide');
    appState.searchMatches = [];
    return;
  }
  
  const matches = [];
  allQuestions.forEach((q, idx) => {
    if (q.question.toLowerCase().includes(query) || q.options.some(o => o.toLowerCase().includes(query))) {
      matches.push(idx);
    }
  });
  
  appState.searchMatches = matches;
  text.textContent = `Found ${matches.length} matching questions.`;
  if (matches.length > 0) {
    panel.classList.remove('hide');
  } else {
    panel.classList.add('hide');
  }
}

function startSearchPractice() {
  if (appState.searchMatches.length === 0) return;
  
  appState.practice.orderMap = [...appState.searchMatches];
  appState.practice.currentIndex = 0;
  appState.practice.isAnswerRevealed = false;
  appState.practice.userSelections = [];
  appState.practice.shuffleEnabled = false;
  
  renderPracticeQuestion();
  switchView('practice');
}

function startBookmarksPractice() {
  if (appState.bookmarks.length === 0) return;
  
  // Map bookmarked question IDs to allQuestions indices
  const indices = appState.bookmarks
    .map(id => allQuestions.findIndex(q => q.id === id))
    .filter(idx => idx !== -1);
  
  if (indices.length === 0) return;

  appState.practice.orderMap = indices;
  appState.practice.currentIndex = 0;
  appState.practice.isAnswerRevealed = false;
  appState.practice.userSelections = [];
  appState.practice.shuffleEnabled = false;
  
  renderPracticeQuestion();
  switchView('practice');
}

function loadBookmarks() {
  const stored = localStorage.getItem('az900_bookmarks');
  if (stored) {
    try {
      appState.bookmarks = JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse bookmarks:', e);
      appState.bookmarks = [];
    }
  }
  updateBookmarksUI();
}

function saveBookmarks() {
  localStorage.setItem('az900_bookmarks', JSON.stringify(appState.bookmarks));
  updateBookmarksUI();
}

function updateBookmarksUI() {
  const container = document.getElementById('bookmarks-container');
  const countSpan = document.getElementById('bookmark-count');
  
  if (appState.bookmarks.length === 0) {
    container.classList.add('hide');
  } else {
    container.classList.remove('hide');
    countSpan.textContent = appState.bookmarks.length;
  }
}

function toggleBookmarkCurrentQuestion() {
  let actualQId = null;
  if (appState.activeView === 'practice') {
    const actualIndex = appState.practice.orderMap[appState.practice.currentIndex];
    actualQId = allQuestions[actualIndex].id;
  } else if (appState.activeView === 'exam') {
    const idx = appState.exam.currentIndex;
    actualQId = appState.exam.questions[idx].id;
  }
  
  if (actualQId !== null) {
    const index = appState.bookmarks.indexOf(actualQId);
    if (index !== -1) {
      appState.bookmarks.splice(index, 1);
    } else {
      appState.bookmarks.push(actualQId);
    }
    saveBookmarks();
    updateBookmarkButtonUI();
  }
}

function updateBookmarkButtonUI() {
  let actualQId = null;
  let btn = null;
  
  if (appState.activeView === 'practice') {
    const actualIndex = appState.practice.orderMap[appState.practice.currentIndex];
    if (actualIndex !== undefined) {
      actualQId = allQuestions[actualIndex].id;
    }
    btn = document.getElementById('practice-bookmark-btn');
  } else if (appState.activeView === 'exam') {
    const idx = appState.exam.currentIndex;
    if (appState.exam.questions[idx] !== undefined) {
      actualQId = appState.exam.questions[idx].id;
    }
    btn = document.getElementById('exam-bookmark-btn');
  }
  
  if (btn && actualQId !== null) {
    if (appState.bookmarks.includes(actualQId)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }
}

// ==========================================================================
// History Storage & Metrics
// ==========================================================================

function loadHistory() {
  const stored = localStorage.getItem('az900_exam_history');
  if (stored) {
    try {
      appState.history = JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse stats history:', e);
      appState.history = [];
    }
  }
  updateHistoryUI();
  updateHeaderStats();
}

function saveHistory() {
  localStorage.setItem('az900_exam_history', JSON.stringify(appState.history));
}

function updateHistoryUI() {
  const container = document.getElementById('recent-stats-container');
  const list = document.getElementById('stats-list');
  const pagination = document.getElementById('history-pagination');
  list.innerHTML = '';
  pagination.innerHTML = '';
  
  if (appState.history.length === 0) {
    container.classList.add('hide');
    document.getElementById('reset-progress-btn').classList.add('hide');
    return;
  }
  
  container.classList.remove('hide');
  document.getElementById('reset-progress-btn').classList.remove('hide');
  
  // Apply date filter
  let filtered = appState.history;
  if (appState.historyDateFilter) {
    filtered = appState.history.filter(record => {
      const recordDate = new Date(record.timestamp);
      const recordDateString = recordDate.getFullYear() + '-' + 
                               String(recordDate.getMonth() + 1).padStart(2, '0') + '-' + 
                               String(recordDate.getDate()).padStart(2, '0');
      return recordDateString === appState.historyDateFilter;
    });
  }
  
  // Pagination sizing
  const pageSizeStr = appState.historyPageSize;
  const pageSize = pageSizeStr === 'all' ? filtered.length : parseInt(pageSizeStr, 10);
  
  const totalRecords = filtered.length;
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalRecords / pageSize)) : 1;
  
  // Clamp page selection
  if (appState.historyPage > totalPages) {
    appState.historyPage = totalPages;
  }
  if (appState.historyPage < 1) {
    appState.historyPage = 1;
  }
  
  const startIndex = (appState.historyPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);
  
  const pageItems = filtered.slice(startIndex, endIndex);
  
  if (pageItems.length === 0) {
    const emptyRow = document.createElement('div');
    emptyRow.className = 'stats-row';
    emptyRow.style.justifyContent = 'center';
    emptyRow.innerHTML = '<span style="color: var(--color-text-muted);">No attempts found matching the selected date.</span>';
    list.appendChild(emptyRow);
  } else {
    pageItems.forEach((record) => {
      const row = document.createElement('div');
      row.className = 'stats-row';
      
      const left = document.createElement('div');
      left.className = 'stats-row-left';
      
      const badge = document.createElement('span');
      badge.className = `badge-outcome ${record.outcome.toLowerCase()}`;
      badge.textContent = record.outcome;
      
      const dateStr = new Date(record.timestamp).toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      const dateSpan = document.createElement('span');
      dateSpan.textContent = dateStr;
      dateSpan.style.color = 'var(--color-text-muted)';
      
      left.appendChild(badge);
      left.appendChild(dateSpan);
      
      const right = document.createElement('div');
      right.className = 'stats-row-right';
      right.style.alignItems = 'center';
      right.style.gap = '16px';
      
      const statsText = document.createElement('div');
      statsText.style.display = 'flex';
      statsText.style.gap = '12px';
      
      const scoreVal = document.createElement('span');
      scoreVal.innerHTML = `Score: <strong>${record.score}%</strong>`;
      
      const timeVal = document.createElement('span');
      timeVal.innerHTML = `Time: <strong>${record.timeTaken}</strong>`;
      
      statsText.appendChild(scoreVal);
      statsText.appendChild(timeVal);
      
      right.appendChild(statsText);
      
      // If questions/selections data is available in the record, add "Review" button
      if (record.questions && record.selections) {
        const reviewBtn = document.createElement('button');
        reviewBtn.className = 'btn btn-secondary btn-sm review-attempt-btn';
        reviewBtn.textContent = 'Review';
        reviewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          reviewPastAttempt(record);
        });
        right.appendChild(reviewBtn);
      }
      
      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    });
  }
  
  // Render Pagination controls
  if (totalRecords > 0) {
    const info = document.createElement('div');
    info.className = 'pagination-info';
    info.textContent = `Showing ${startIndex + 1} - ${endIndex} of ${totalRecords} attempts`;
    
    const btns = document.createElement('div');
    btns.className = 'pagination-btns';
    
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn btn-secondary btn-sm';
    prevBtn.textContent = 'Prev';
    prevBtn.disabled = appState.historyPage === 1;
    prevBtn.addEventListener('click', () => {
      appState.historyPage--;
      updateHistoryUI();
    });
    
    const pageNumSpan = document.createElement('span');
    pageNumSpan.textContent = `Page ${appState.historyPage} of ${totalPages}`;
    pageNumSpan.style.alignSelf = 'center';
    pageNumSpan.style.fontSize = '0.9rem';
    pageNumSpan.style.fontWeight = '600';
    pageNumSpan.style.padding = '0 8px';
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-secondary btn-sm';
    nextBtn.textContent = 'Next';
    nextBtn.disabled = appState.historyPage === totalPages;
    nextBtn.addEventListener('click', () => {
      appState.historyPage++;
      updateHistoryUI();
    });
    
    btns.appendChild(prevBtn);
    btns.appendChild(pageNumSpan);
    btns.appendChild(nextBtn);
    
    pagination.appendChild(info);
    pagination.appendChild(btns);
  }
}

function reviewPastAttempt(record) {
  // Populate appState.exam with the historical data
  appState.exam.questions = record.questions.map(qid => allQuestions.find(q => q.id === qid)).filter(Boolean);
  appState.exam.selections = record.selections;
  appState.exam.skipped = record.skipped;
  appState.exam.totalTime = 0;
  appState.exam.timeRemaining = 0;
  
  // Update Results Page Title and Subtitle to show it is a past attempt
  document.getElementById('results-score').textContent = `${record.score}%`;
  document.getElementById('results-correct').textContent = `${record.correct}/${record.total}`;
  document.getElementById('results-time').textContent = record.timeTaken;
  
  const badge = document.getElementById('results-outcome-badge');
  const isPassed = record.outcome === 'Pass';
  if (isPassed) {
    badge.textContent = 'Passed';
    badge.className = 'badge badge-outcome pass';
    document.getElementById('results-score').className = 'stat-num text-success';
  } else {
    badge.textContent = 'Failed';
    badge.className = 'badge badge-outcome fail';
    document.getElementById('results-score').className = 'stat-num text-danger';
  }
  
  // Render Detailed Review list
  renderDetailedReview();
  
  // Hide Retake button since it is a historical review
  document.getElementById('results-retake-btn').classList.add('hide');
  
  switchView('results');
}

function updateHeaderStats() {
  const statsVal = document.getElementById('header-pass-ratio');
  
  if (appState.history.length === 0) {
    statsVal.textContent = 'N/A';
    return;
  }
  
  const passedCount = appState.history.filter(r => r.outcome === 'Pass').length;
  const ratio = Math.round((passedCount / appState.history.length) * 100);
  statsVal.textContent = `${ratio}%`;
}

// ==========================================================================
// Session State Persistence Helpers
// ==========================================================================

function savePracticeState() {
  localStorage.setItem('az900_practice_state', JSON.stringify({
    currentIndex: appState.practice.currentIndex,
    shuffleEnabled: appState.practice.shuffleEnabled,
    orderMap: appState.practice.orderMap,
    answeredQuestions: appState.practice.answeredQuestions
  }));
}

function loadPracticeState() {
  const stored = localStorage.getItem('az900_practice_state');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse practice state:', e);
    }
  }
  return null;
}

function clearPracticeState() {
  localStorage.removeItem('az900_practice_state');
  appState.practice.answeredQuestions = {};
  appState.practice.currentIndex = 0;
}

function saveExamState() {
  localStorage.setItem('az900_exam_state', JSON.stringify({
    questions: appState.exam.questions,
    currentIndex: appState.exam.currentIndex,
    selections: appState.exam.selections,
    skipped: appState.exam.skipped,
    timeRemaining: appState.exam.timeRemaining,
    totalTime: appState.exam.totalTime,
    startTime: appState.exam.startTime
  }));
}

function loadExamState() {
  const stored = localStorage.getItem('az900_exam_state');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse exam state:', e);
    }
  }
  return null;
}

function clearExamState() {
  localStorage.removeItem('az900_exam_state');
}

// ==========================================================================
// Keyboard Shortcut Handlers
// ==========================================================================

function handlePracticeKeys(e) {
  const key = e.key.toLowerCase();
  
  if (['1', '2', '3', '4', '5'].includes(key)) {
    const idx = parseInt(key, 10) - 1;
    toggleOptionIfValid(idx, 'practice');
  } else if (['a', 'b', 'c', 'd', 'e'].includes(key)) {
    const idx = key.charCodeAt(0) - 97; // 'a' is 97
    toggleOptionIfValid(idx, 'practice');
  }
  
  if (key === 'arrowleft') {
    navigatePractice(-1);
  } else if (key === 'arrowright') {
    navigatePractice(1);
  } else if (key === 'arrowdown' || key === 'arrowup') {
    e.preventDefault();
    const actualIndex = appState.practice.orderMap[appState.practice.currentIndex];
    const q = allQuestions[actualIndex];
    if (q) {
      const numOptions = q.options.length;
      if (appState.practice.focusedOptionIndex === -1) {
        appState.practice.focusedOptionIndex = key === 'arrowdown' ? 0 : numOptions - 1;
      } else {
        if (key === 'arrowdown') {
          appState.practice.focusedOptionIndex = (appState.practice.focusedOptionIndex + 1) % numOptions;
        } else {
          appState.practice.focusedOptionIndex = (appState.practice.focusedOptionIndex - 1 + numOptions) % numOptions;
        }
      }
      updatePracticeFocusUI();
    }
  } else if (key === 'enter') {
    if (appState.practice.focusedOptionIndex !== -1 && !appState.practice.isAnswerRevealed) {
      handlePracticeOptionSelect(appState.practice.focusedOptionIndex);
    } else if (!appState.practice.isAnswerRevealed) {
      revealPracticeAnswer();
    } else {
      navigatePractice(1);
    }
  } else if (key === ' ') {
    e.preventDefault();
    if (appState.practice.focusedOptionIndex !== -1 && !appState.practice.isAnswerRevealed) {
      handlePracticeOptionSelect(appState.practice.focusedOptionIndex);
    } else {
      revealPracticeAnswer();
    }
  } else if (key === 'r') {
    revealPracticeAnswer();
  }
}

function handleExamKeys(e) {
  const key = e.key.toLowerCase();
  
  if (['1', '2', '3', '4', '5'].includes(key)) {
    const idx = parseInt(key, 10) - 1;
    toggleOptionIfValid(idx, 'exam');
  } else if (['a', 'b', 'c', 'd', 'e'].includes(key)) {
    const idx = key.charCodeAt(0) - 97;
    toggleOptionIfValid(idx, 'exam');
  }
  
  if (key === 'arrowdown' || key === 'arrowup') {
    e.preventDefault();
    const q = appState.exam.questions[appState.exam.currentIndex];
    if (q) {
      const numOptions = q.options.length;
      if (appState.exam.focusedOptionIndex === -1) {
        appState.exam.focusedOptionIndex = key === 'arrowdown' ? 0 : numOptions - 1;
      } else {
        if (key === 'arrowdown') {
          appState.exam.focusedOptionIndex = (appState.exam.focusedOptionIndex + 1) % numOptions;
        } else {
          appState.exam.focusedOptionIndex = (appState.exam.focusedOptionIndex - 1 + numOptions) % numOptions;
        }
      }
      updateExamFocusUI();
    }
  } else if (key === 'enter' || key === 'arrowright') {
    if (key === 'enter' && appState.exam.focusedOptionIndex !== -1) {
      handleExamOptionSelect(appState.exam.focusedOptionIndex);
    } else {
      const idx = appState.exam.currentIndex;
      const selection = appState.exam.selections[idx];
      if (selection && selection.length > 0) {
        nextExamQuestion();
      }
    }
  } else if (key === ' ') {
    e.preventDefault();
    if (appState.exam.focusedOptionIndex !== -1) {
      handleExamOptionSelect(appState.exam.focusedOptionIndex);
    }
  } else if (key === 's') {
    skipExamQuestion();
  }
}

function toggleOptionIfValid(idx, mode) {
  if (mode === 'practice') {
    const actualIndex = appState.practice.orderMap[appState.practice.currentIndex];
    const q = allQuestions[actualIndex];
    if (q && idx >= 0 && idx < q.options.length) {
      handlePracticeOptionSelect(idx);
    }
  } else if (mode === 'exam') {
    const idxExam = appState.exam.currentIndex;
    const q = appState.exam.questions[idxExam];
    if (q && idx >= 0 && idx < q.options.length) {
      handleExamOptionSelect(idx);
    }
  }
}

function updatePracticeFocusUI() {
  const optionCards = document.querySelectorAll('#practice-options .option-card');
  optionCards.forEach((card, idx) => {
    if (idx === appState.practice.focusedOptionIndex) {
      card.classList.add('focused');
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      card.classList.remove('focused');
    }
  });
}

function updateExamFocusUI() {
  const optionCards = document.querySelectorAll('#exam-options .option-card');
  optionCards.forEach((card, idx) => {
    if (idx === appState.exam.focusedOptionIndex) {
      card.classList.add('focused');
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      card.classList.remove('focused');
    }
  });
}
