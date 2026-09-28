// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════
const SUBJECTS = ['maths', 'physics', 'english', 'chemistry'];
const SUBJECT_LABELS = {
  maths: 'Mathematics',
  physics: 'Physics',
  english: 'English',
  chemistry: 'Chemistry'
};

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
let currentTopic = null;
let currentQuestions = [];
let currentIndex = 0;
let correctCount = 0;
let answered = false;
let bookmarksQuizMode = false;
const dataCache = {};

// ═══════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

function applyTheme(next) {
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateDarkToggle();
  renderDashboard();
}

function updateDarkToggle() {
  const toggle = document.getElementById('dark-toggle');
  if (!toggle) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  toggle.classList.toggle('on', isDark);
  toggle.setAttribute('aria-checked', isDark ? 'true' : 'false');
}

// ═══════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-' + btn.dataset.view).classList.add('active');

    if (btn.dataset.view === 'dashboard') renderDashboard();
    if (btn.dataset.view === 'subjects') renderSubjectsView();
    if (btn.dataset.view === 'bookmarks') renderBookmarksView();
  });
});

// ═══════════════════════════════════════════════════════
// GREETING
// ═══════════════════════════════════════════════════════
function updateGreeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  const el = document.getElementById('greeting');
  if (el) el.textContent = `Good ${part}, achiever.`;
}

// ═══════════════════════════════════════════════════════
// STREAK
// ═══════════════════════════════════════════════════════
function getStreak() {
  try { return JSON.parse(localStorage.getItem('streak')) || { count: 0, lastDate: null }; }
  catch { return { count: 0, lastDate: null }; }
}

function updateStreak() {
  const d = getStreak();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (d.lastDate === today) return d;
  d.count = d.lastDate === yesterday ? d.count + 1 : 1;
  d.lastDate = today;
  localStorage.setItem('streak', JSON.stringify(d));
  return d;
}

function renderStreak() {
  const el = document.getElementById('streak-count');
  if (el) el.textContent = getStreak().count;
}

// ═══════════════════════════════════════════════════════
// PRACTICE HISTORY
// ═══════════════════════════════════════════════════════
function getPracticeDays() {
  try { return JSON.parse(localStorage.getItem('practiceDays')) || []; }
  catch { return []; }
}

function recordPracticeDay() {
  const days = getPracticeDays();
  const today = new Date().toDateString();
  if (!days.includes(today)) {
    days.push(today);
    const cutoff = Date.now() - 365 * 86400000;
    const filtered = days.filter(d => new Date(d).getTime() >= cutoff);
    localStorage.setItem('practiceDays', JSON.stringify(filtered));
  }
}

// ═══════════════════════════════════════════════════════
// BOOKMARKS
// ═══════════════════════════════════════════════════════
function getBookmarks() {
  try { return JSON.parse(localStorage.getItem('bookmarks')) || []; }
  catch { return []; }
}

function saveBookmarks(list) {
  localStorage.setItem('bookmarks', JSON.stringify(list));
}

function isBookmarked(subject, topicId, questionIndex) {
  const key = `${subject}:${topicId}:${questionIndex}`;
  return getBookmarks().some(b => b.key === key);
}

function toggleBookmark(subject, topicId, questionIndex, questionText) {
  const key = `${subject}:${topicId}:${questionIndex}`;
  const list = getBookmarks();
  const existing = list.findIndex(b => b.key === key);

  if (existing >= 0) {
    list.splice(existing, 1);
    saveBookmarks(list);
    return false;
  } else {
    list.push({ key, subject, topicId, questionIndex, questionText });
    saveBookmarks(list);
    return true;
  }
}

function removeBookmark(key) {
  const list = getBookmarks().filter(b => b.key !== key);
  saveBookmarks(list);
}

// ═══════════════════════════════════════════════════════
// PROGRESS
// ═══════════════════════════════════════════════════════
function getProgress() {
  try { return JSON.parse(localStorage.getItem('progress')) || {}; }
  catch { return {}; }
}

function recordResult(topicId, correct, total) {
  const p = getProgress();
  if (!p[topicId]) p[topicId] = { correct: 0, total: 0 };
  p[topicId].correct += correct;
  p[topicId].total += total;
  localStorage.setItem('progress', JSON.stringify(p));
}

function getMastery(topicId) {
  const p = getProgress()[topicId];
  if (!p || p.total === 0) return 'not-started';
  const pct = p.correct / p.total;
  if (pct >= 0.8) return 'mastered';
  if (pct >= 0.4) return 'in-progress';
  return 'needs-review';
}

// ═══════════════════════════════════════════════════════
// TOPIC LOCKING
// ═══════════════════════════════════════════════════════
function getSortedTopics(sub) {
  const data = dataCache[sub];
  if (!data || !data.topics) return [];
  return [...data.topics].sort((a, b) => (a.order || 0) - (b.order || 0));
}

function isTopicPassed(topicId) {
  return getMastery(topicId) === 'mastered';
}

function getCurrentTopicIndex(sub) {
  const sorted = getSortedTopics(sub);
  for (let i = 0; i < sorted.length; i++) {
    if (!isTopicPassed(sorted[i].id)) return i;
  }
  return sorted.length;
}

function getTopicStatus(sub, topicIndex) {
  const currentIdx = getCurrentTopicIndex(sub);
  if (topicIndex < currentIdx) return 'passed';
  if (topicIndex === currentIdx) return 'current';
  return 'locked';
}

// ═══════════════════════════════════════════════════════
// DATA LOADER
// ═══════════════════════════════════════════════════════
async function loadSubject(sub) {
  if (dataCache[sub]) return dataCache[sub];
  try {
    const res = await fetch(`./data/${sub}.json`);
    if (!res.ok) throw new Error('missing');
    const data = await res.json();
    dataCache[sub] = data;
    return data;
  } catch {
    dataCache[sub] = { subject: SUBJECT_LABELS[sub], topics: [] };
    return dataCache[sub];
  }
}

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════
async function renderDashboard() {
  const stats = { mastered: 0, inProgress: 0, notStarted: 0 };
  const perSubject = {};

  for (const sub of SUBJECTS) {
    const data = await loadSubject(sub);
    let m = 0, ip = 0, ns = 0;
    data.topics.forEach(t => {
      const level = getMastery(t.id);
      if (level === 'mastered')         { m++; stats.mastered++; }
      else if (level === 'not-started') { ns++; stats.notStarted++; }
      else                              { ip++; stats.inProgress++; }
    });
    perSubject[sub] = { mastered: m, total: data.topics.length };
  }

  drawDonut(stats);
  renderSubjectRows(perSubject);
  renderTargetProjection(stats);
  renderFocusCard();
}

function drawDonut(stats) {
  const canvas = document.getElementById('progress-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 240;

  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const total = stats.mastered + stats.inProgress + stats.notStarted || 1;
  const cx = size / 2, cy = size / 2, r = 88;

  const slices = [
    { value: stats.mastered,   color: '#22c55e' },
    { value: stats.inProgress, color: '#eab308' },
    { value: stats.notStarted, color: '#ef4444' }
  ];

  let start = -Math.PI / 2;
  slices.forEach(s => {
    if (s.value === 0) return;
    const angle = (s.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    start += angle;
  });

  const bg = getComputedStyle(document.body).backgroundColor;
  const fg = getComputedStyle(document.body).color;
  const muted = getComputedStyle(document.body).getPropertyValue('--muted');

  ctx.beginPath();
  ctx.arc(cx, cy, 52, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();

  const pct = Math.round((stats.mastered / total) * 100);
  ctx.fillStyle = fg;
  ctx.font = 'bold 24px "Bricolage Grotesque", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${pct}%`, cx, cy - 6);

  ctx.font = '11px "Bricolage Grotesque", system-ui, sans-serif';
  ctx.fillStyle = muted;
  ctx.fillText('mastered', cx, cy + 14);

  const tag = document.getElementById('mastered-tag');
  if (tag) tag.textContent = `${stats.mastered} mastered`;
}

function renderSubjectRows(perSubject) {
  const list = document.getElementById('subject-stats');
  if (!list) return;
  list.innerHTML = '';
  SUBJECTS.forEach(sub => {
    const s = perSubject[sub];
    const pct = s.total ? Math.round((s.mastered / s.total) * 100) : 0;
    list.innerHTML += `
      <div class="subject-row">
        <span class="subj-name">${SUBJECT_LABELS[sub]}</span>
        <span class="subj-count">${s.mastered}/${s.total}</span>
        <span class="subj-bar"><i style="width:${pct}%"></i></span>
      </div>`;
  });
}

function renderTargetProjection(stats) {
  const projection = Math.min(400, stats.mastered * 4);
  const target = 360;
  const pct = Math.min(100, (projection / target) * 100);

  const bar = document.getElementById('target-bar');
  const proj = document.getElementById('proj-num');
  const left = document.getElementById('points-left');

  if (bar) bar.style.width = pct + '%';
  if (proj) proj.textContent = projection;
  if (left) {
    const remaining = Math.max(0, target - projection);
    left.textContent = remaining > 0
      ? `${remaining} points to your target`
      : `🎯 Target reached — keep pushing!`;
  }
}

async function renderFocusCard() {
  for (const sub of SUBJECTS) {
    const data = await loadSubject(sub);
    const sorted = getSortedTopics(sub);
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      if (getMastery(t.id) !== 'mastered') {
        const titleEl = document.getElementById('focus-title');
        const metaEl = document.getElementById('focus-meta');
        const descEl = document.getElementById('focus-desc');
        if (titleEl) titleEl.textContent = t.name;
        if (metaEl) {
          metaEl.innerHTML =
            `<span>${SUBJECT_LABELS[sub]}</span><span class="dot">•</span>` +
            `<span>Topic ${i + 1} of ${sorted.length}</span><span class="dot">•</span>` +
            `<span>+20 XP</span>`;
        }
        if (descEl) {
          descEl.textContent =
            `Work through ${t.questions ? t.questions.length : 0} exam-style questions. ` +
            `Score 80% to unlock the next topic.`;
        }
        return;
      }
    }
  }
  const titleEl = document.getElementById('focus-title');
  const descEl = document.getElementById('focus-desc');
  if (titleEl) titleEl.textContent = 'All topics mastered 🎉';
  if (descEl) descEl.textContent = 'Switch to full mock exams and lock in your 360+.';
}

// ═══════════════════════════════════════════════════════
// SUBJECTS VIEW
// ═══════════════════════════════════════════════════════
async function renderSubjectsView() {
  const grid = document.getElementById('subjects-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const sub of SUBJECTS) {
    const data = await loadSubject(sub);
    if (!data.topics.length) continue;

    const sorted = getSortedTopics(sub);
    const currentIdx = getCurrentTopicIndex(sub);
    const total = sorted.length;
    const done = currentIdx;
    const pct = Math.round((done / total) * 100);

    const card = document.createElement('div');
    card.className = 'subject-card';
    card.innerHTML = `
      <div class="subject-card-head">
        <h4>${SUBJECT_LABELS[sub]}</h4>
        <span class="subject-progress">${done}/${total}</span>
      </div>
      <div class="subject-progress-bar"><i style="width:${pct}%"></i></div>
      <p class="subject-next">
        ${done === total
          ? '🎉 All topics complete'
          : `Next up: <strong>${sorted[currentIdx].name}</strong>`}
      </p>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.querySelector('[data-view="practice"]').classList.add('active');
      document.getElementById('view-practice').classList.add('active');

      const subSel = document.getElementById('subject-select');
      subSel.value = sub;
      subSel.dispatchEvent(new Event('change'));
    });

    grid.appendChild(card);
  }
}

// ═══════════════════════════════════════════════════════
// PRACTICE
// ═══════════════════════════════════════════════════════
const subjectSelect = document.getElementById('subject-select');
const topicSelect   = document.getElementById('topic-select');
const quizArea      = document.getElementById('quiz-area');
const quizSummary   = document.getElementById('quiz-summary');

if (subjectSelect) {
  subjectSelect.addEventListener('change', async () => {
    const sub = subjectSelect.value;
    topicSelect.innerHTML = '<option value="">-- Topic --</option>';
    topicSelect.disabled = true;
    quizArea.classList.add('hidden');
    quizSummary.classList.add('hidden');
    if (!sub) return;

    await loadSubject(sub);
    const sorted = getSortedTopics(sub);

    sorted.forEach((t, i) => {
      const status = getTopicStatus(sub, i);
      const opt = document.createElement('option');

      if (status === 'locked') {
        opt.textContent = `🔒 ${t.name}`;
        opt.disabled = true;
      } else if (status === 'passed') {
        opt.textContent = `✅ ${t.name}`;
        opt.value = t.id;
      } else {
        opt.textContent = `▶ ${t.name}  (current)`;
        opt.value = t.id;
      }
      topicSelect.appendChild(opt);
    });

    topicSelect.disabled = false;

    const currentIdx = getCurrentTopicIndex(sub);
    if (currentIdx < sorted.length) {
      topicSelect.value = sorted[currentIdx].id;
      topicSelect.dispatchEvent(new Event('change'));
    }
  });
}

if (topicSelect) {
  topicSelect.addEventListener('change', async () => {
    const sub = subjectSelect.value;
    const topicId = topicSelect.value;
    if (!topicId) return;

    const data = await loadSubject(sub);
    const topic = data.topics.find(t => t.id === topicId);
    if (!topic || !topic.questions || !topic.questions.length) {
      alert('No questions in this topic yet.');
      return;
    }

    currentTopic = topic;
    currentQuestions = shuffle([...topic.questions]);
    currentIndex = 0;
    correctCount = 0;
    bookmarksQuizMode = false;

    quizSummary.classList.add('hidden');
    quizArea.classList.remove('hidden');
    renderQuestion();
  });
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderQuestion() {
  answered = false;
  const q = currentQuestions[currentIndex];
  const sub = subjectSelect ? subjectSelect.value : null;

  document.getElementById('question-text').textContent =
    `Q${currentIndex + 1}/${currentQuestions.length} — ${q.q}`;

  // ⭐ Bookmark star
  const star = document.getElementById('bookmark-star');
  if (star && currentTopic && sub) {
    const originalIdx = currentTopic.questions.findIndex(
      x => x.q === q.q && x.answer === q.answer
    );
    const qIdx = originalIdx >= 0 ? originalIdx : currentIndex;
    const isSaved = isBookmarked(sub, currentTopic.id, qIdx);

    star.classList.toggle('saved', isSaved);
    star.dataset.qIdx = qIdx;
    star.title = isSaved ? 'Remove bookmark' : 'Bookmark this question';

    const newStar = star.cloneNode(true);
    star.parentNode.replaceChild(newStar, star);

    newStar.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(newStar.dataset.qIdx, 10);
      const nowSaved = toggleBookmark(sub, currentTopic.id, idx, q.q);
      newStar.classList.toggle('saved', nowSaved);
      newStar.title = nowSaved ? 'Remove bookmark' : 'Bookmark this question';

      newStar.classList.remove('pop');
      void newStar.offsetWidth;
      newStar.classList.add('pop');
    });
  } else if (star) {
    star.classList.add('hidden');
  }

  const optionsDiv = document.getElementById('options');
  optionsDiv.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = `${String.fromCharCode(65 + i)}. ${opt}`;
    btn.addEventListener('click', () => selectAnswer(i, q.answer));
    optionsDiv.appendChild(btn);
  });

  const fb = document.getElementById('feedback');
  fb.textContent = '';
  fb.style.color = '';
  document.getElementById('next-btn').classList.add('hidden');
}

function selectAnswer(chosen, correct) {
  if (answered) return;
  answered = true;

  document.querySelectorAll('.option-btn').forEach((b, i) => {
    b.disabled = true;
    if (i === correct) b.classList.add('correct');
    if (i === chosen && chosen !== correct) b.classList.add('wrong');
  });

  const fb = document.getElementById('feedback');
  const q = currentQuestions[currentIndex];

  if (chosen === correct) {
    correctCount++;
    fb.style.color = 'var(--accent)';
    fb.textContent = '✅ Correct!';
  } else {
    fb.style.color = 'var(--danger)';
    fb.textContent = q.explanation ? `❌ Wrong. ${q.explanation}` : '❌ Wrong.';
  }

  document.getElementById('next-btn').classList.remove('hidden');
}

const nextBtn = document.getElementById('next-btn');
if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    currentIndex++;
    if (currentIndex < currentQuestions.length) renderQuestion();
    else finishQuiz();
  });
}

function finishQuiz() {
  quizArea.classList.add('hidden');
  quizSummary.classList.remove('hidden');

  recordResult(currentTopic.id, correctCount, currentQuestions.length);
  updateStreak();
  recordPracticeDay();
  renderStreak();

  if (typeof pushProgressToCloud === 'function') pushProgressToCloud();

  const pct = Math.round((correctCount / currentQuestions.length) * 100);
  const passed = pct >= 80;

  let unlockedMsg = '';
  if (bookmarksQuizMode) {
    unlockedMsg = `<p class="unlock-msg">📌 Bookmark review complete. Keep them starred or unstar to remove.</p>`;
  } else if (passed) {
    const sub = subjectSelect.value;
    const sorted = getSortedTopics(sub);
    const thisIdx = sorted.findIndex(t => t.id === currentTopic.id);
    const nextTopic = sorted[thisIdx + 1];
    unlockedMsg = nextTopic
      ? `<p class="unlock-msg">🔓 Next up: <strong>${nextTopic.name}</strong></p>`
      : `<p class="unlock-msg">🎉 Subject complete! Every topic passed.</p>`;
  } else {
    unlockedMsg = `<p class="unlock-msg warn">You need 80% to unlock the next topic. Try again.</p>`;
  }

  const heading = bookmarksQuizMode
    ? '📌 Bookmarks reviewed!'
    : (passed ? '✅ Topic passed!' : '📚 Not yet — try again');

  quizSummary.innerHTML = `
    <h2 style="font-size:1.6rem;margin-bottom:8px">${heading}</h2>
    <p style="margin:8px 0;font-size:1.05rem">
      You scored <strong>${correctCount}/${currentQuestions.length}</strong> (${pct}%)
    </p>
    <p style="color:var(--muted);font-size:0.9rem">Topic: <em>${currentTopic.name}</em></p>
    ${unlockedMsg}
    <button class="cta-btn" style="margin-top:20px" id="summary-next-btn">
      ${bookmarksQuizMode ? 'Back to bookmarks' : (passed ? 'Go to next topic →' : 'Try again')}
    </button>
  `;

  document.getElementById('summary-next-btn').addEventListener('click', () => {
    if (bookmarksQuizMode) {
      bookmarksQuizMode = false;
      const selector = document.querySelector('.selector');
      if (selector) selector.classList.remove('hidden');

      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.querySelector('[data-view="bookmarks"]').classList.add('active');
      document.getElementById('view-bookmarks').classList.add('active');
      renderBookmarksView();
      return;
    }
    subjectSelect.dispatchEvent(new Event('change'));
  });
}

// ═══════════════════════════════════════════════════════
// RESET SUBJECT
// ═══════════════════════════════════════════════════════
const resetBtn = document.getElementById('reset-subject');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    const sub = subjectSelect.value;
    if (!sub) return alert('Pick a subject first.');
    if (!confirm(`Reset all progress for ${SUBJECT_LABELS[sub]}? This can't be undone.`)) return;

    const p = getProgress();
    const data = dataCache[sub];
    if (data) data.topics.forEach(t => delete p[t.id]);
    localStorage.setItem('progress', JSON.stringify(p));

    subjectSelect.dispatchEvent(new Event('change'));
    renderDashboard();

    if (typeof pushProgressToCloud === 'function') pushProgressToCloud();
  });
}

// ═══════════════════════════════════════════════════════
// MOBILE SIDEBAR DRAWER
// ═══════════════════════════════════════════════════════
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('open');
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 900) sidebar.classList.remove('open');
    });
  });

  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 900 &&
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target !== sidebarToggle) {
      sidebar.classList.remove('open');
    }
  });
}

// ═══════════════════════════════════════════════════════
// CONTINUE LESSON BUTTON
// ═══════════════════════════════════════════════════════
const continueBtn = document.getElementById('continue-btn');
if (continueBtn) {
  continueBtn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelector('[data-view="practice"]').classList.add('active');
    document.getElementById('view-practice').classList.add('active');

    (async () => {
      for (const sub of SUBJECTS) {
        const data = await loadSubject(sub);
        if (getCurrentTopicIndex(sub) < data.topics.length) {
          subjectSelect.value = sub;
          subjectSelect.dispatchEvent(new Event('change'));
          return;
        }
      }
    })();
  });
}

// ═══════════════════════════════════════════════════════
// SETTINGS MODAL
// ═══════════════════════════════════════════════════════
const settingsBtn       = document.getElementById('settings-btn');
const settingsModal     = document.getElementById('settings-modal');
const settingsXBtn      = document.getElementById('settings-x-btn');
const darkToggle        = document.getElementById('dark-toggle');
const reminderToggle    = document.getElementById('reminder-toggle');
const reminderTimeInput = document.getElementById('reminder-time-input');
const settingsStatus    = document.getElementById('settings-status');
const resetAllBtn       = document.getElementById('reset-all-btn');

function openSettings() {
  if (!settingsModal) return;
  settingsModal.classList.remove('hidden');
  updateDarkToggle();
  updateReminderToggle();
  updateSettingsStatus();
  if (typeof updateAuthUI === 'function') updateAuthUI();
}

function closeSettings() {
  if (!settingsModal) return;
  settingsModal.classList.add('hidden');
}

if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
if (settingsXBtn) settingsXBtn.addEventListener('click', closeSettings);

if (settingsModal) {
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettings();
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsModal && !settingsModal.classList.contains('hidden')) {
    closeSettings();
  }
});

if (darkToggle) {
  darkToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

function updateReminderToggle() {
  if (!reminderToggle) return;
  const enabled = localStorage.getItem('reminderEnabled') === 'true' &&
                  'Notification' in window &&
                  Notification.permission === 'granted';
  reminderToggle.classList.toggle('on', enabled);
  reminderToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
}

if (reminderToggle) {
  reminderToggle.addEventListener('click', async () => {
    const currentlyOn = reminderToggle.classList.contains('on');
    if (currentlyOn) {
      localStorage.setItem('reminderEnabled', 'false');
      updateReminderToggle();
      updateSettingsStatus();
      return;
    }

    if (!('Notification' in window)) {
      settingsStatus.textContent = '❌ Notifications not supported on this device.';
      return;
    }
    if (Notification.permission === 'denied') {
      settingsStatus.textContent = '❌ Blocked — enable notifications in browser settings.';
      return;
    }

    let perm = Notification.permission;
    if (perm !== 'granted') {
      perm = await Notification.requestPermission();
    }

    if (perm === 'granted') {
      localStorage.setItem('reminderEnabled', 'true');
      try {
        new Notification('AIM360', {
          body: `Reminders set for ${formatTime(reminderTimeInput.value)}. We'll only nudge you if you skip practice.`
        });
      } catch (err) { console.warn(err); }
      scheduleSmartReminder();
      updateReminderToggle();
      updateSettingsStatus();
    } else {
      settingsStatus.textContent = '❌ Permission denied.';
    }
  });
}

if (reminderTimeInput) {
  const savedTime = localStorage.getItem('reminderTime') || '20:00';
  reminderTimeInput.value = savedTime;

  reminderTimeInput.addEventListener('change', () => {
    localStorage.setItem('reminderTime', reminderTimeInput.value);
    if (Notification.permission === 'granted' &&
        localStorage.getItem('reminderEnabled') === 'true') {
      scheduleSmartReminder();
    }
    updateSettingsStatus();
  });
}

function updateSettingsStatus() {
  if (!settingsStatus) return;
  const enabled = localStorage.getItem('reminderEnabled') === 'true';

  if (!('Notification' in window)) {
    settingsStatus.textContent = '❌ Notifications not supported on this device.';
    return;
  }
  if (Notification.permission === 'denied') {
    settingsStatus.textContent = '❌ Blocked — enable in browser settings.';
    return;
  }
  if (Notification.permission === 'granted' && enabled) {
    settingsStatus.textContent =
      `✅ Active — daily nudge at ${formatTime(reminderTimeInput.value)} if you skip practice.`;
    return;
  }
  settingsStatus.textContent = 'Notifications are off.';
}

if (resetAllBtn) {
  resetAllBtn.addEventListener('click', () => {
    if (!confirm('Reset ALL progress? This wipes every subject, streak, and history. Cannot be undone.')) return;
    if (!confirm('Really sure? Everything will be deleted.')) return;

    localStorage.removeItem('progress');
    localStorage.removeItem('streak');
    localStorage.removeItem('practiceDays');
    localStorage.removeItem('bookmarks');

    if (typeof pushProgressToCloud === 'function') pushProgressToCloud();

    closeSettings();
    location.reload();
  });
}

// ═══════════════════════════════════════════════════════
// GOOGLE CALENDAR REMINDER
// ═══════════════════════════════════════════════════════
const gcalBtn = document.getElementById('gcal-btn');

if (gcalBtn) {
  gcalBtn.addEventListener('click', () => {
    const time = (reminderTimeInput && reminderTimeInput.value) || '20:00';
    const [hh, mm] = time.split(':').map(Number);

    const start = new Date();
    start.setHours(hh, mm, 0, 0);
    if (start.getTime() <= Date.now()) start.setDate(start.getDate() + 1);

    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const fmt = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    };

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: '🔥 AIM360 — Study Session',
      dates: `${fmt(start)}/${fmt(end)}`,
      recur: 'RRULE:FREQ=DAILY',
      details: 'Daily JAMB prep. Open AIM360 and keep your streak alive:\nhttps://my-cbt-app-seven.vercel.app'
    });

    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank');
  });
}

// ═══════════════════════════════════════════════════════
// SMART REMINDER
// ═══════════════════════════════════════════════════════
function hasPracticedToday() {
  const s = getStreak();
  return s.lastDate === new Date().toDateString();
}

let reminderTimeout = null;

function scheduleSmartReminder() {
  if (reminderTimeout) clearTimeout(reminderTimeout);
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (localStorage.getItem('reminderEnabled') !== 'true') return;

  const [hh, mm] = (localStorage.getItem('reminderTime') || '20:00').split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(hh, mm, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const delay = next - now;

  reminderTimeout = setTimeout(() => {
    if (!hasPracticedToday()) {
      try {
        new Notification('🔥 Streak Alert!', {
          body: "You haven't practiced today. 5 quick questions to keep your streak alive!",
          tag: 'aim360-reminder'
        });
      } catch (err) { console.warn(err); }
    }
    scheduleSmartReminder();
  }, delay);
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

if ('Notification' in window &&
    Notification.permission === 'granted' &&
    localStorage.getItem('reminderEnabled') === 'true') {
  scheduleSmartReminder();
}

// ═══════════════════════════════════════════════════════
// STREAK CALENDAR
// ═══════════════════════════════════════════════════════
let calendarMonth = new Date().getMonth();
let calendarYear  = new Date().getFullYear();

const streakBadge    = document.getElementById('streak-badge');
const calendarModal  = document.getElementById('calendar-modal');
const calendarClose  = document.getElementById('calendar-close');
const calendarX      = document.getElementById('calendar-x');
const calendarPrev   = document.getElementById('calendar-prev');
const calendarNext   = document.getElementById('calendar-next');
const calendarTitle  = document.getElementById('calendar-title');
const calendarGrid   = document.getElementById('calendar-grid');
const calendarStreak = document.getElementById('calendar-streak');
const calendarTotal  = document.getElementById('calendar-total');

function openCalendar() {
  if (!calendarModal) return;
  calendarMonth = new Date().getMonth();
  calendarYear = new Date().getFullYear();
  renderCalendar();
  calendarModal.classList.remove('hidden');
}

function closeCalendar() {
  if (!calendarModal) return;
  calendarModal.classList.add('hidden');
}

function renderCalendar() {
  if (!calendarTitle || !calendarGrid) return;

  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  calendarTitle.textContent = `${monthNames[calendarMonth]} ${calendarYear}`;

  const days = getPracticeDays();
  const practicedSet = new Set(days);

  const firstDay = new Date(calendarYear, calendarMonth, 1);
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const today = new Date().toDateString();

  let html = '';
  const dayLabels = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  dayLabels.forEach(d => { html += `<div class="cal-label">${d}</div>`; });

  for (let i = 0; i < startWeekday; i++) {
    html += `<div class="cal-cell empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(calendarYear, calendarMonth, d);
    const dateStr = date.toDateString();
    const isPracticed = practicedSet.has(dateStr);
    const isToday = dateStr === today;

    let cls = 'cal-cell';
    if (isPracticed) cls += ' practiced';
    if (isToday) cls += ' today';

    html += `<div class="${cls}">${d}</div>`;
  }

  calendarGrid.innerHTML = html;

  const streakData = getStreak();
  const streakCount = streakData.count;
const totalDays = days.length;

if (calendarStreak) {
  calendarStreak.textContent = streakCount === 1
    ? `🔥 1 day streak`
    : `🔥 ${streakCount} day streak`;
}
if (calendarTotal) {
  calendarTotal.textContent = totalDays === 1
    ? `📅 1 day studied`
    : `📅 ${totalDays} days studied`;
}
}

if (streakBadge) streakBadge.addEventListener('click', openCalendar);
if (calendarClose) calendarClose.addEventListener('click', closeCalendar);
if (calendarX) calendarX.addEventListener('click', closeCalendar);

if (calendarModal) {
  calendarModal.addEventListener('click', (e) => {
    if (e.target === calendarModal) closeCalendar();
  });
}

if (calendarPrev) {
  calendarPrev.addEventListener('click', () => {
    calendarMonth--;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    renderCalendar();
  });
}

if (calendarNext) {
  calendarNext.addEventListener('click', () => {
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    renderCalendar();
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && calendarModal && !calendarModal.classList.contains('hidden')) {
    closeCalendar();
  }
});

// ═══════════════════════════════════════════════════════
// BOOKMARKS VIEW + QUIZ MODE
// ═══════════════════════════════════════════════════════
function renderBookmarksView() {
  const list = document.getElementById('bookmarks-list');
  const startBtn = document.getElementById('start-bookmarks-btn');
  if (!list) return;

  const bookmarks = getBookmarks();

  if (bookmarks.length === 0) {
    if (startBtn) startBtn.classList.add('hidden');
    list.innerHTML = `
      <div class="bookmarks-empty">
        <div class="bookmarks-empty-icon">⭐</div>
        <h3>No bookmarks yet</h3>
        <p>Tap the star on any question during practice to save it here for review.</p>
      </div>
    `;
    return;
  }

  if (startBtn) startBtn.classList.remove('hidden');

  const grouped = {};
  bookmarks.forEach(b => {
    if (!grouped[b.subject]) grouped[b.subject] = [];
    grouped[b.subject].push(b);
  });

  let html = '';
  SUBJECTS.forEach(sub => {
    const items = grouped[sub];
    if (!items || items.length === 0) return;

    html += `
      <div class="bookmarks-group">
        <div class="bookmarks-group-title">
          ${SUBJECT_LABELS[sub]}
          <span class="bookmarks-count">${items.length}</span>
        </div>
    `;

    items.forEach(b => {
      const topic = (dataCache[sub] && dataCache[sub].topics.find(t => t.id === b.topicId)) || null;
      const topicName = topic ? topic.name : 'Unknown topic';
      const preview = b.questionText.length > 120
        ? b.questionText.slice(0, 120) + '…'
        : b.questionText;

      html += `
        <div class="bookmark-card" data-key="${b.key}">
          <div class="bookmark-card-star">
            <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <div class="bookmark-card-body">
            <div class="bookmark-card-q">${escapeHtmlText(preview)}</div>
            <div class="bookmark-card-meta">
              <span class="bookmark-card-topic">${escapeHtmlText(topicName)}</span>
              <span>·</span>
              <span>Tap to remove</span>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
  });

  list.innerHTML = html;

  list.querySelectorAll('.bookmark-card').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.key;
      if (confirm('Remove this bookmark?')) {
        removeBookmark(key);
        renderBookmarksView();
      }
    });
  });
}

function escapeHtmlText(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

const startBookmarksBtn = document.getElementById('start-bookmarks-btn');
if (startBookmarksBtn) {
  startBookmarksBtn.addEventListener('click', () => {
    const bookmarks = getBookmarks();
    if (bookmarks.length === 0) return;

    const questions = [];
    bookmarks.forEach(b => {
      const data = dataCache[b.subject];
      if (!data) return;
      const topic = data.topics.find(t => t.id === b.topicId);
      if (!topic || !topic.questions[b.questionIndex]) return;
      questions.push({
        ...topic.questions[b.questionIndex],
        _subject: b.subject,
        _topicId: b.topicId
      });
    });

    if (questions.length === 0) {
      alert('Could not load bookmarked questions. Try refreshing.');
      return;
    }

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelector('[data-view="practice"]').classList.add('active');
    document.getElementById('view-practice').classList.add('active');

    bookmarksQuizMode = true;
    currentQuestions = shuffle(questions);
    currentIndex = 0;
    correctCount = 0;
    currentTopic = {
      id: '__bookmarks__',
      name: 'Bookmarks Review',
      questions: currentQuestions
    };

    quizSummary.classList.add('hidden');
    quizArea.classList.remove('hidden');

    const selector = document.querySelector('.selector');
    if (selector) selector.classList.add('hidden');

    renderQuestion();
  });
}

// ═══════════════════════════════════════════════════════
// WELCOME MODAL
// ═══════════════════════════════════════════════════════
const welcomeModal    = document.getElementById('welcome-modal');
const welcomeSwitch   = document.getElementById('welcome-switch');
const welcomeGoogle   = document.getElementById('welcome-google');
const welcomeGuest    = document.getElementById('welcome-guest');
const welcomeTitle    = document.getElementById('welcome-title');
const welcomeSubtitle = document.getElementById('welcome-subtitle');

let welcomeView = 'register';

function updateWelcomeView() {
  if (!welcomeTitle || !welcomeSubtitle || !welcomeSwitch) return;

  if (welcomeView === 'register') {
    welcomeTitle.textContent = 'Join AIM360';
    welcomeSubtitle.textContent = 'Sync your progress across all your devices and never lose a streak.';
    welcomeSwitch.innerHTML = 'Already have an account? <strong>Login</strong>';
  } else {
    welcomeTitle.textContent = 'Welcome back';
    welcomeSubtitle.textContent = 'Sign in to continue where you left off.';
    welcomeSwitch.innerHTML = 'New here? <strong>Create account</strong>';
  }
}

function showWelcome() {
  if (!welcomeModal) return;
  updateWelcomeView();
  welcomeModal.classList.remove('hidden');
}

function hideWelcome() {
  if (!welcomeModal) return;
  welcomeModal.classList.add('hidden');
  localStorage.setItem('welcomeDismissed', 'true');
}

function hasSupabaseSession() {
  try {
    const keys = Object.keys(localStorage);
    return keys.some(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  } catch { return false; }
}

window.addEventListener('load', () => {
  setTimeout(() => {
    const dismissed = localStorage.getItem('welcomeDismissed') === 'true';
    if (!dismissed && !hasSupabaseSession()) {
      showWelcome();
    }
  }, 600);
});

if (welcomeSwitch) {
  welcomeSwitch.addEventListener('click', () => {
    welcomeView = welcomeView === 'register' ? 'login' : 'register';
    updateWelcomeView();
  });
}

if (welcomeGoogle) {
  welcomeGoogle.addEventListener('click', () => {
    hideWelcome();
    if (typeof signInWithGoogle === 'function') signInWithGoogle();
  });
}

if (welcomeGuest) {
  welcomeGuest.addEventListener('click', () => {
    hideWelcome();
  });
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
updateGreeting();
renderStreak();
renderDashboard();
updateDarkToggle();
updateReminderToggle();