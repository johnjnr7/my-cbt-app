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
const dataCache = {};

// ─── User-scoped localStorage helpers ──────────────────
function scopedKey(key) {
  return (typeof currentUser !== 'undefined' && currentUser)
    ? `${key}_${currentUser.id}`
    : key;
}

async function refreshEverythingAfterLogin() {
  // Run loaders in parallel — they're independent
  const tasks = [];

  if (typeof loadLeaderboard === 'function')  tasks.push(loadLeaderboard('all'));
  if (typeof loadProfileStats === 'function') tasks.push(loadProfileStats());
  if (typeof loadDashboard === 'function')    tasks.push(loadDashboard());
  if (typeof updateHeaderUser === 'function') tasks.push(updateHeaderUser());
  if (typeof loadSubjects === 'function')     tasks.push(loadSubjects());
  if (typeof loadProgress === 'function')     tasks.push(loadProgress());
  if (typeof renderPromoTimer === 'function')  tasks.push(renderPromoTimer());

  await Promise.allSettled(tasks);
}

async function refreshAllViews() {
  const tasks = [];

  // These exist in your codebase for sure
  if (typeof loadLeaderboard === 'function')   tasks.push(loadLeaderboard('all'));
  if (typeof loadProfileStats === 'function')  tasks.push(loadProfileStats());
  if (typeof loadSubscription === 'function')  tasks.push(loadSubscription());

  // Add these if they exist in your code — comment out any that error
  if (typeof renderDashboard === 'function')   tasks.push(Promise.resolve(renderDashboard()));
  if (typeof loadProgress === 'function')      tasks.push(loadProgress());
  if (typeof updateHeaderUser === 'function')  tasks.push(updateHeaderUser());

  await Promise.allSettled(tasks);
}
// ═══════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════
const savedTheme = localStorage.getItem('theme') || 'dark';
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
    if (btn.dataset.view === 'leaderboard' && typeof loadLeaderboard === 'function') {
      loadLeaderboard('all');
    }
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
  if (typeof getUserStreak === 'function') return getUserStreak();
  try { return JSON.parse(localStorage.getItem(scopedKey('streak'))) || { count: 0, lastDate: null }; }
  catch { return { count: 0, lastDate: null }; }
}

function updateStreak() {
  const d = getStreak();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (d.lastDate === today) return d;
  d.count = d.lastDate === yesterday ? d.count + 1 : 1;
  d.lastDate = today;
  if (typeof setUserStreak === 'function') setUserStreak(d);
  else localStorage.setItem(scopedKey('streak'), JSON.stringify(d));
  return d;
}

function renderStreak() {
  const el = document.getElementById('streak-count');
  if (el) el.textContent = getStreak().count;
}

// ═══════════════════════════════════════════════════════
// PRACTICE HISTORY (user-scoped)
// ═══════════════════════════════════════════════════════
function getPracticeDays() {
  try { return JSON.parse(localStorage.getItem(scopedKey('practiceDays'))) || []; }
  catch { return []; }
}

function recordPracticeDay() {
  const days = getPracticeDays();
  const today = new Date().toDateString();
  if (!days.includes(today)) {
    days.push(today);
    const cutoff = Date.now() - 365 * 86400000;
    const filtered = days.filter(d => new Date(d).getTime() >= cutoff);
    localStorage.setItem(scopedKey('practiceDays'), JSON.stringify(filtered));

    // ⭐ Push to cloud so calendar syncs across devices
    if (typeof pushProgressToCloud === 'function') {
      setTimeout(() => pushProgressToCloud(), 500);
    }
  }
}
if (typeof pushProgressToCloud === 'function') {
  setTimeout(() => pushProgressToCloud(), 500);
}
// ═══════════════════════════════════════════════════════
// BOOKMARKS (user-scoped)
// ═══════════════════════════════════════════════════════
function getBookmarks() {
  try { return JSON.parse(localStorage.getItem(scopedKey('bookmarks'))) || []; }
  catch { return []; }
}

function saveBookmarks(list) {
  localStorage.setItem(scopedKey('bookmarks'), JSON.stringify(list));
}

function isBookmarked(subject, topicId, questionIndex) {
  const key = `${subject}:${topicId}:${questionIndex}`;
  return getBookmarks().some(b => b.key === key);
}

function toggleBookmark(subject, topicId, questionIndex, questionText) {
  const key = `${subject}:${topicId}:${questionIndex}`;
  const list = getBookmarks();
  const existing = list.findIndex(b => b.key === key);

  let result;
  if (existing >= 0) {
    list.splice(existing, 1);
    saveBookmarks(list);
    result = false;
  } else {
    list.push({ key, subject, topicId, questionIndex, questionText });
    saveBookmarks(list);
    result = true;
  }

  // ⭐ Push to cloud so bookmarks sync across devices
  if (typeof pushProgressToCloud === 'function') {
    setTimeout(() => pushProgressToCloud(), 500);
  }

  return result;
}

function removeBookmark(key) {
  const list = getBookmarks().filter(b => b.key !== key);
  saveBookmarks(list);
}

// ═══════════════════════════════════════════════════════
// PROGRESS
// ═══════════════════════════════════════════════════════
function getProgress() {
  if (typeof getUserProgress === 'function') return getUserProgress();
  try { return JSON.parse(localStorage.getItem(scopedKey('progress'))) || {}; }
  catch { return {}; }
}

function recordResult(topicId, correct, total) {
  const p = getProgress();
  const prev = p[topicId];

  // Keep the BEST attempt (highest percentage) — not the sum
  const newPct = total > 0 ? correct / total : 0;
  const prevPct = prev && prev.total > 0 ? prev.correct / prev.total : 0;

  if (!prev || newPct >= prevPct) {
    p[topicId] = { correct, total };
  }

  if (typeof setUserProgress === 'function') setUserProgress(p);
  else localStorage.setItem(scopedKey('progress'), JSON.stringify(p));
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

    // PAYWALL GATE
    if (typeof canAccessTopics === 'function' && !canAccessTopics()) {
      document.getElementById('quiz-area').classList.add('hidden');
      if (typeof openPaywallModal === 'function') openPaywallModal();
      return;
    }

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

    quizSummary.classList.add('hidden');
    quizArea.classList.remove('hidden');
    document.querySelector('.selector')?.classList.remove('hidden'); // ensure selector visible
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
  const sub = subjectSelect.value;

  document.getElementById('question-text').textContent =
    `Q${currentIndex + 1}/${currentQuestions.length} — ${q.q}`;

  // Bookmark star
  const star = document.getElementById('bookmark-star');
  if (star && currentTopic) {
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

// ═══════════════════════════════════════════════════════
// BOOKMARKS VIEW
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

  if (typeof loadSubscription === 'function') loadSubscription();
  updateStreak();
  recordPracticeDay();
  renderStreak();

  if (typeof pushProgressToCloud === 'function') pushProgressToCloud();

  const pct = Math.round((correctCount / currentQuestions.length) * 100);
  const passed = pct >= 80;
  const sub = subjectSelect.value;

  let unlockedMsg = '';
  if (passed) {
    const sorted = getSortedTopics(sub);
    const thisIdx = sorted.findIndex(t => t.id === currentTopic.id);
    const nextTopic = sorted[thisIdx + 1];
    unlockedMsg = nextTopic
      ? `<p class="unlock-msg">🔓 Next up: <strong>${nextTopic.name}</strong></p>`
      : `<p class="unlock-msg">🎉 Subject complete! Every topic passed.</p>`;
  } else {
    unlockedMsg = `<p class="unlock-msg warn">You need 80% to unlock the next topic. Try again.</p>`;
  }

  const heading = passed ? '✅ Topic passed!' : '📚 Not yet — try again';

  quizSummary.innerHTML = `
    <h2 style="font-size:1.6rem;margin-bottom:8px">${heading}</h2>
    <p style="margin:8px 0;font-size:1.05rem">
      You scored <strong>${correctCount}/${currentQuestions.length}</strong> (${pct}%)
    </p>
    <p style="color:var(--muted);font-size:0.9rem">Topic: <em>${currentTopic.name}</em></p>
    ${unlockedMsg}
    <button class="cta-btn" style="margin-top:20px" id="summary-next-btn">
      ${passed ? 'Go to next topic →' : 'Try again'}
    </button>
  `;

  document.getElementById('summary-next-btn').addEventListener('click', () => {
    // Restore selector so user can pick again
    document.querySelector('.selector')?.classList.remove('hidden');
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

    if (typeof setUserProgress === 'function') setUserProgress(p);
    else localStorage.setItem(scopedKey('progress'), JSON.stringify(p));

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
    // Close drawer when Go Pro button is tapped in sidebar
    if (window.innerWidth <= 900 &&
        e.target.closest('#sub-status-mobile .sub-badge')) {
      setTimeout(() => sidebar.classList.remove('open'), 100);
      return;
    }
    // Close on backdrop click
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
    // ── SIGN-IN GATE ──
    if (typeof currentUser === 'undefined' || !currentUser) {
      document.getElementById('welcome-modal')?.classList.remove('hidden');
      return;
    }
    // ── END GATE ──

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
const settingsBtn      = document.getElementById('settings-btn');
const settingsModal    = document.getElementById('settings-modal');
const settingsXBtn     = document.getElementById('settings-x-btn');
const darkToggle       = document.getElementById('dark-toggle');
const reminderToggle   = document.getElementById('reminder-toggle');
const reminderTimeInput = document.getElementById('reminder-time-input');
const settingsStatus   = document.getElementById('settings-status');
const resetAllBtn      = document.getElementById('reset-all-btn');

function openSettings() {
  if (!settingsModal) return;
  settingsModal.classList.remove('hidden');
  updateDarkToggle();
  updateReminderToggle();
  updateSettingsStatus();
  loadProfileStats();
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

    const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;

    if (uid) {
      localStorage.removeItem(`progress_${uid}`);
      localStorage.removeItem(`streak_${uid}`);
      localStorage.removeItem(`practiceDays_${uid}`);
      localStorage.removeItem(`bookmarks_${uid}`);
    }
    // Also clear legacy keys
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

    if (start.getTime() <= Date.now()) {
      start.setDate(start.getDate() + 1);
    }

    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const fmt = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    };

    const dates = `${fmt(start)}/${fmt(end)}`;

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: '🔥 AIM360 — Study Session',
      dates: dates,
      recur: 'RRULE:FREQ=DAILY',
      details: 'Daily JAMB prep. Open AIM360 and keep your streak alive:\nhttps://aim360.vercel.app'
    });

    const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
    window.open(url, '_blank');
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

const streakBadge     = document.getElementById('streak-badge');
const calendarModal   = document.getElementById('calendar-modal');
const calendarClose   = document.getElementById('calendar-close');
const calendarX       = document.getElementById('calendar-x');
const calendarPrev    = document.getElementById('calendar-prev');
const calendarNext    = document.getElementById('calendar-next');
const calendarTitle   = document.getElementById('calendar-title');
const calendarGrid    = document.getElementById('calendar-grid');
const calendarStreak  = document.getElementById('calendar-streak');
const calendarTotal   = document.getElementById('calendar-total');

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
  if (calendarStreak) calendarStreak.textContent = `🔥 ${streakData.count} day streak`;
  if (calendarTotal) calendarTotal.textContent = `📅 ${days.length} days studied total`;
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
// BOOKMARKS QUIZ MODE
// ═══════════════════════════════════════════════════════
let bookmarksQuizMode = false;

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
    document.querySelector('.selector')?.classList.add('hidden');
    renderQuestion();
  });
}

const summaryNextBtn = document.getElementById('summary-next-btn');
if (summaryNextBtn) {
  summaryNextBtn.addEventListener('click', () => {
    document.querySelector('.selector')?.classList.remove('hidden');
    if (currentTopic && currentTopic.id === '__bookmarks__') {
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

// Welcome modal — block dismissal when not signed in
const welcomeModal = document.getElementById('welcome-modal');
if (welcomeModal) {
  welcomeModal.addEventListener('click', (e) => {
    // Only close if user is signed in
    if (e.target.id === 'welcome-modal' && typeof currentUser !== 'undefined' && currentUser) {
      welcomeModal.classList.add('hidden');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !welcomeModal.classList.contains('hidden')) {
      // Only close if user is signed in
      if (typeof currentUser !== 'undefined' && currentUser) {
        welcomeModal.classList.add('hidden');
      }
    }
  });
}

// ═══════════════════════════════════════════════════════
// EMAIL/PASSWORD AUTH UI
// ═══════════════════════════════════════════════════════
(function () {
  let mode = 'signup';

  const modal = document.getElementById('welcome-modal');
  if (!modal) return;

  const titleEl    = document.getElementById('welcome-title');
  const subtitleEl = document.getElementById('welcome-subtitle');
  const submitBtn  = document.getElementById('welcome-submit');
  const switchText = document.getElementById('welcome-switch-text');
  const switchCta  = document.getElementById('welcome-switch-cta');
  const switchBtn  = document.getElementById('welcome-switch');
  const form       = document.getElementById('welcome-form');
  const emailInput = document.getElementById('welcome-email');
  const passInput  = document.getElementById('welcome-password');
  const statusEl   = document.getElementById('welcome-status');
  const googleBtn  = document.getElementById('welcome-google');
  const togglePwBtn = document.getElementById('toggle-password');

  function setMode(next) {
  mode = next;
  statusEl.textContent = '';
  statusEl.className = 'welcome-status';

  if (mode === 'signup') {
    titleEl.textContent = 'Join AIM360';
    subtitleEl.textContent = 'Create an account to sync progress across all your devices.';
    submitBtn.textContent = 'Create account';
    switchText.textContent = 'Already have an account?';
    switchCta.textContent = 'Login';
    passInput.setAttribute('autocomplete', 'new-password');
  } else {
    titleEl.textContent = 'Welcome back';
    subtitleEl.textContent = 'Sign in to pick up where you left off.';
    submitBtn.textContent = 'Sign in';
    switchText.textContent = "Don't have an account?";
    switchCta.textContent = 'Sign up';
    passInput.setAttribute('autocomplete', 'current-password');
  }
}

  switchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    setMode(mode === 'signup' ? 'login' : 'signup');
  });

  if (googleBtn) {
    googleBtn.addEventListener('click', () => signInWithGoogle());
  }

  if (togglePwBtn) {
    togglePwBtn.addEventListener('click', () => {
      const isPassword = passInput.type === 'password';
      passInput.type = isPassword ? 'text' : 'password';

      const eyeOpen = togglePwBtn.querySelector('.eye-open');
      const eyeClosed = togglePwBtn.querySelector('.eye-closed');
      if (eyeOpen && eyeClosed) {
        eyeOpen.style.display = isPassword ? 'none' : 'block';
        eyeClosed.style.display = isPassword ? 'block' : 'none';
      }

      togglePwBtn.classList.toggle('revealed', isPassword);
      togglePwBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      togglePwBtn.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passInput.value;

    if (!email || !password) return;
    if (password.length < 6) {
      statusEl.textContent = 'Password must be at least 6 characters.';
      statusEl.className = 'welcome-status error';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
    statusEl.textContent = '';
    statusEl.className = 'welcome-status';

    try {
      if (mode === 'signup') {
        const result = await signUpWithEmail(email, password);
        if (result.error) {
          statusEl.textContent = result.error;
          statusEl.className = 'welcome-status error';
        } else {
          statusEl.textContent = '✅ Account created! Welcome to AIM360.';
          statusEl.className = 'welcome-status success';
          setTimeout(() => {
            modal.classList.add('hidden');
            if (typeof renderDashboard === 'function') renderDashboard();
          }, 1200);
        }
      } else {
        const result = await signInWithEmail(email, password);
        if (result.error) {
          statusEl.textContent = result.error;
          statusEl.className = 'welcome-status error';
        } else {
          modal.classList.add('hidden');
          if (typeof renderDashboard === 'function') renderDashboard();
        }
      }
    } catch (err) {
      statusEl.textContent = 'Something went wrong. Try again.';
      statusEl.className = 'welcome-status error';
      console.error(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    }
  });

  setMode('signup');
})();


// ═══════════════════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════════════════
let lbCurrentFilter = 'all';
let lbCachedData = [];

async function loadLeaderboard(filter = 'all') {
  const podium = document.getElementById('lb-podium');
  const list = document.getElementById('lb-list');
  const you = document.getElementById('lb-you');
  if (!podium || !list || !you) return;

  // ── ACCESS GATE ──────────────────────────
const access = await getUserAccess();
if (!access?.canSeeLeaderboard) {
  podium.innerHTML = '';
  list.innerHTML = `
    <div class="lb-empty">
      <div class="lb-empty-icon">🔒</div>
      <strong>Leaderboard is for paid members</strong>
      <p style="margin-top:8px">Upgrade to see how you rank against other scholars.</p>
      <button onclick="showUpgradeModal('Unlock the leaderboard to see where you stand.')"
        style="margin-top:16px;background:#0d4a35;color:#c9f26b;border:none;padding:12px 24px;border-radius:10px;font-weight:700;cursor:pointer;">
        Upgrade Now
      </button>
    </div>`;
  you.innerHTML = '';
  return;
}
// ── END GATE ─────────────────────────────

  lbCurrentFilter = filter;
  podium.innerHTML = '<div class="lb-loading">Loading…</div>';
  list.innerHTML = '';
  you.innerHTML = '';

  try {
    const { data, error } = await supabaseClient.rpc('get_leaderboard', {
      p_filter: filter,
      p_limit: 50
    });

    if (error) {
      console.error('[Leaderboard]', error);
      podium.innerHTML = '';
      list.innerHTML = `<div class="lb-empty"><div class="lb-empty-icon">⚠️</div>Couldn't load leaderboard. Try again later.</div>`;
      return;
    }

    lbCachedData = data || [];
    renderLeaderboard();
  } catch (e) {
    console.error('[Leaderboard]', e);
    podium.innerHTML = '';
    list.innerHTML = `<div class="lb-empty"><div class="lb-empty-icon">⚠️</div>Couldn't load leaderboard.</div>`;
  }
}

function renderLeaderboard() {
  const podium = document.getElementById('lb-podium');
  const list = document.getElementById('lb-list');
  const you = document.getElementById('lb-you');
  const myId = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;

  if (lbCachedData.length === 0) {
    podium.innerHTML = '';
    list.innerHTML = `
      <div class="lb-empty">
        <div class="lb-empty-icon">🏆</div>
        <strong>No scores yet</strong>
        <p style="margin-top:8px">Be the first to finish a topic and claim the top spot.</p>
      </div>`;
    you.innerHTML = '';
    return;
  }

  // Top 3 podium
  const top3 = lbCachedData.slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  const classes = ['gold', 'silver', 'bronze'];

  podium.innerHTML = '';
  // Order: silver (2nd), gold (1st), bronze (3rd)
  const order = [1, 0, 2];
  order.forEach((dataIdx, pos) => {
    const u = top3[dataIdx];
    if (!u) return;
    const initial = (u.display_name || '?').trim()[0].toUpperCase();
    const avatarStyle = u.avatar_url ? `background-image: url('${u.avatar_url}'); background-color: transparent;` : '';
    const tick = u.is_pro ? verifiedTickHtml() : '';
    podium.innerHTML += `
      <div class="lb-podium-card ${classes[dataIdx]}">
        <div class="lb-medal">${medals[dataIdx]}</div>
        <div class="lb-podium-avatar" style="${avatarStyle}">${u.avatar_url ? '' : initial}</div>
        <div class="lb-podium-name">${escapeHtmlText(u.display_name || 'Anonymous')}${tick}</div>
        <div class="lb-podium-score">${u.score}</div>
        <div class="lb-podium-sub">🔥 ${u.streak_count} days streak</div>
      </div>
    `;
  });

  // Rank 4+
  const rest = lbCachedData.slice(3);
  list.innerHTML = rest.map(u => {
    const initial = (u.display_name || '?').trim()[0].toUpperCase();
    const avatarStyle = u.avatar_url ? `background-image: url('${u.avatar_url}'); background-color: transparent;` : '';
    const tick = u.is_pro ? verifiedTickHtml() : '';
    const me = myId && u.user_id === myId ? ' me' : '';
    return `
      <div class="lb-row${me}">
        <span class="lb-rank">${u.rank}</span>
        <div class="lb-avatar" style="${avatarStyle}">${u.avatar_url ? '' : initial}</div>
        <span class="lb-name">${escapeHtmlText(u.display_name || 'Anonymous')}${tick}</span>
        <span class="lb-streak">🔥 ${u.streak_count}</span>
        <span class="lb-score">${u.score}</span>
      </div>
    `;
  }).join('');

  // "You" pinned row (if user not in top 50)
  const myRow = lbCachedData.find(u => u.user_id === myId);
  if (myRow && myRow.rank > 3) {
    const initial = (myRow.display_name || '?').trim()[0].toUpperCase();
    const avatarStyle = myRow.avatar_url ? `background-image: url('${myRow.avatar_url}'); background-color: transparent;` : '';
    const tick = myRow.is_pro ? verifiedTickHtml() : '';
    you.innerHTML = `
      <div class="lb-row me">
        <span class="lb-rank">${myRow.rank}</span>
        <div class="lb-avatar" style="${avatarStyle}">${myRow.avatar_url ? '' : initial}</div>
        <span class="lb-name">${escapeHtmlText(myRow.display_name || 'You')}${tick}</span>
        <span class="lb-streak">🔥 ${myRow.streak_count}</span>
        <span class="lb-score">${myRow.score}</span>
      </div>
    `;
  } else {
    you.innerHTML = '';
  }
}

// Wire up filter buttons
document.addEventListener('DOMContentLoaded', () => {
  const filters = document.getElementById('lb-filters');
  if (!filters) return;

  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('.lb-filter');
    if (!btn) return;
    filters.querySelectorAll('.lb-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadLeaderboard(btn.dataset.filter);
  });
});


async function loadProfileStats() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;

  const { data, error } = await supabaseClient
    .from('progress')
    .select('streak, data')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error || !data) {
    document.getElementById('stat-streak').textContent = '0';
    document.getElementById('stat-xp').textContent = '0';
    return;
  }

  // Streak
  const streak = data.streak?.count ?? 0;
  document.getElementById('stat-streak').textContent = streak;

  // XP — sum every topic's `correct` value × 20
  let totalCorrect = 0;
  if (data.data && typeof data.data === 'object') {
    for (const key of Object.keys(data.data)) {
      const topic = data.data[key];
      if (topic && typeof topic.correct === 'number') {
        totalCorrect += topic.correct;
      }
    }
  }
  const totalXP = totalCorrect * 20;
  document.getElementById('stat-xp').textContent = totalXP;
}

// ═══════════════════════════════════════════════
// STREAK & MILESTONES MODAL
// ═══════════════════════════════════════════════

const STREAK_MILESTONES = [
  { days: 3,   name: 'Getting Started',   icon: '🌱', desc: '3-day practice streak' },
  { days: 7,   name: 'One Week Strong',   icon: '🔥', desc: '7-day practice streak' },
  { days: 14,  name: 'Two-Week Grinder',  icon: '💪', desc: '14-day practice streak' },
  { days: 30,  name: 'One Month Focused', icon: '🏆', desc: '30-day practice streak' },
  { days: 60,  name: 'Unstoppable',       icon: '💎', desc: '60-day practice streak' },
  { days: 100, name: 'JAMB Legend',       icon: '👑', desc: '100-day practice streak' },
];

let streakModalData = null;
let streakModalViewDate = new Date();

async function openStreakModal() {
  const modal = document.getElementById('streak-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  await loadStreakModalData();
  renderStreakModal();
}

function closeStreakModal() {
  const modal = document.getElementById('streak-modal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

async function loadStreakModalData() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    streakModalData = null;
    return;
  }

  const { data: progress } = await supabaseClient
    .from('progress')
    .select('streak, data, practice_days, all_time_best_streak')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!progress) {
    streakModalData = null;
    return;
  }

  const days = parsePracticeDays(progress.practice_days);

  let totalCorrect = 0;
  if (progress.data && typeof progress.data === 'object') {
    for (const key of Object.keys(progress.data)) {
      const t = progress.data[key];
      if (t && typeof t.correct === 'number') totalCorrect += t.correct;
    }
  }

  const streak = progress.streak?.count ?? 0;
  const best = Math.max(progress.all_time_best_streak || 0, streak);

  streakModalData = {
    streak,
    best,
    days,
    totalXP: totalCorrect * 20,
  };
}

function parsePracticeDays(raw) {
  const set = new Set();
  if (!raw) return set;

  const MONTHS = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  function normalize(str) {
    if (!str) return null;
    str = String(str).trim();

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

    // "Wed Sep 30 2026" format
    const parts = str.split(/\s+/);
    if (parts.length >= 4) {
      const month = MONTHS[parts[1].toLowerCase().slice(0, 3)];
      const day = parts[2].padStart(2, '0');
      const year = parts[3];
      if (month && day && year) return `${year}-${month}-${day}`;
    }
    return null;
  }

  const add = (val) => {
    const norm = normalize(val);
    if (norm) set.add(norm);
  };

  if (Array.isArray(raw)) {
    raw.forEach(add);
  } else if (typeof raw === 'object') {
    Object.keys(raw).forEach(k => { if (raw[k]) add(k); });
  }
  return set;
}

function renderStreakModal() {
  const d = streakModalData;
  if (!d) {
    document.getElementById('streak-days-grid').innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#6b7d77;">Sign in to see your streak</div>';
    return;
  }

  // ── Ring & percent ──
  const streak = d.streak || 0;

  // Next milestone (or 100 for legend)
  const nextMilestone = STREAK_MILESTONES.find(m => m.days > streak);
  const goal = nextMilestone ? nextMilestone.days : 100;
  const pct = Math.min(100, Math.round((streak / goal) * 100));

  const ring = document.getElementById('streak-ring-fill');
  if (ring) {
    const circumference = 2 * Math.PI * 70;   // r = 70
    const offset = circumference - (pct / 100) * circumference;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = offset;
  }
  document.getElementById('streak-ring-number').textContent = streak;
  document.getElementById('streak-percent').textContent = `${pct}%`;

  // ── User name + tick ──
  const userEl = document.getElementById('streak-user-name');
  const tickEl = document.getElementById('streak-user-tick');
  if (currentUser) {
    userEl.textContent = getFullName(currentUser);
    tickEl.innerHTML = (typeof verifiedTickHtml === 'function')
      ? verifiedTickHtml()
      : '';
  } else {
    userEl.textContent = 'Guest';
    tickEl.innerHTML = '';
  }

  // ── Badge pill (highest unlocked) ──
  const unlocked = STREAK_MILESTONES.filter(m => streak >= m.days);
  const highest = unlocked[unlocked.length - 1];
  const pill = document.getElementById('streak-badge-pill');
  if (highest) {
    document.getElementById('streak-badge-icon').textContent = highest.icon;
    document.getElementById('streak-badge-name').textContent = highest.name;
    pill.style.display = 'inline-flex';
  } else {
    pill.style.display = 'none';
  }

  // ── Calendar ──
  renderStreakCalendar(d.days);

  // ── Stats ──
  document.getElementById('streak-best').textContent = `${d.best} Days`;
  document.getElementById('streak-unlocks').textContent = `${unlocked.length} Medals`;

  // ── Milestones list ──
  const list = document.getElementById('streak-milestones-list');
  list.innerHTML = '';
  STREAK_MILESTONES.forEach(m => {
    const isUnlocked = streak >= m.days;
    list.innerHTML += `
      <div class="streak-milestone ${isUnlocked ? 'unlocked' : ''}">
        <div class="streak-milestone-icon">${m.icon}</div>
        <div class="streak-milestone-info">
          <div class="streak-milestone-name">${m.name}</div>
          <div class="streak-milestone-desc">${m.desc}</div>
        </div>
        <div class="streak-milestone-requirement">${m.days} Days</div>
      </div>
    `;
  });
}

function toggleStreakMilestones() {
  const list = document.getElementById('streak-milestones-list');
  const btn = document.getElementById('streak-toggle-milestones');
  if (!list) return;

  const visible = list.style.display !== 'none';
  list.style.display = visible ? 'none' : 'flex';
  btn.textContent = visible ? 'View all milestones ▾' : 'Hide milestones ▴';
}

function renderStreakCalendar(daysSet) {
  const view = streakModalViewDate;
  const year = view.getFullYear();
  const month = view.getMonth();

  const monthNames = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                      'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  document.getElementById('streak-month-label').textContent =
    `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const todayKey = fmtDate(new Date());

  const grid = document.getElementById('streak-days-grid');
  grid.innerHTML = '';

  for (let i = 0; i < startOffset; i++) {
    grid.innerHTML += '<div class="streak-day empty"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = fmtDate(new Date(year, month, day));
    const done = daysSet.has(dateKey);
    const isToday = dateKey === todayKey;
    grid.innerHTML += `
      <div class="streak-day ${done ? 'done' : ''} ${isToday ? 'today' : ''}">
        ${done ? '✓' : day}
      </div>
    `;
  }
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('streak-prev-month')?.addEventListener('click', () => {
    streakModalViewDate.setMonth(streakModalViewDate.getMonth() - 1);
    if (streakModalData) renderStreakCalendar(streakModalData.days);
  });
    document.getElementById('streak-badge')?.addEventListener('click', openStreakModal);
  document.getElementById('streak-next-month')?.addEventListener('click', () => {
    streakModalViewDate.setMonth(streakModalViewDate.getMonth() + 1);
    if (streakModalData) renderStreakCalendar(streakModalData.days);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeStreakModal();
  });
});

async function renderPromoBanner() {
  const banner = document.getElementById('promo-banner');
  const spotsEl = document.getElementById('promo-spots');
  if (!banner || !spotsEl) return;

  try {
    const { data, error } = await supabaseClient.rpc('get_early_promo_spots_left');
    if (error) {
      console.warn('[Promo] count failed:', error.message);
      return;
    }

    const spots = data ?? 0;
    if (spots > 0) {
      spotsEl.textContent = spots;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  } catch (e) {
    console.warn('[Promo] error:', e);
  }
}

// Refresh promo banner whenever the welcome modal becomes visible
const observer = new MutationObserver(() => {
  const modal = document.getElementById('welcome-modal');
  if (modal && !modal.classList.contains('hidden')) {
    if (typeof renderPromoBanner === 'function') renderPromoBanner();
  }
});

let promoCountdownInterval = null;

async function renderPromoTimer() {
  const banner = document.getElementById('promo-timer-banner');
  const el = document.getElementById('promo-timer-countdown');
  if (!banner || !el) return;

  if (promoCountdownInterval) {
    clearInterval(promoCountdownInterval);
    promoCountdownInterval = null;
  }

  if (typeof currentUser === 'undefined' || !currentUser) {
    banner.style.display = 'none';
    return;
  }

  try {
    const { data: sub } = await supabaseClient
      .from('subscriptions')
      .select('promo_expires_at, status, current_period_end')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (!sub) { banner.style.display = 'none'; return; }

    const now = new Date();

    const isPaid =
      sub.status === 'active' &&
      sub.current_period_end &&
      new Date(sub.current_period_end) > now;

    const onPromo =
      !isPaid &&
      sub.promo_expires_at &&
      new Date(sub.promo_expires_at) > now;

    if (!onPromo) { banner.style.display = 'none'; return; }

    banner.style.display = 'flex';

    const update = () => {
      const ms = new Date(sub.promo_expires_at) - new Date();
      if (ms <= 0) {
        el.textContent = 'Expired';
        banner.style.display = 'none';
        if (promoCountdownInterval) clearInterval(promoCountdownInterval);
        return;
      }
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      el.textContent = `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    };

    update();
    promoCountdownInterval = setInterval(update, 1000);   // every second now
  } catch (e) {
    console.warn('[PromoTimer] error:', e);
    banner.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('welcome-modal');
  if (modal) {
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
});

// Run promo timer after auth state is ready
// After DOM is fully loaded and auth has had time to initialize
window.addEventListener('load', () => {
  setTimeout(() => {
    if (typeof renderPromoTimer === 'function') renderPromoTimer();
  }, 1500);
});

// ═══════════════════════════════════════════
// PWA — Service Worker registration
// ═══════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => console.log('[PWA] Service worker registered:', reg.scope))
      .catch((err) => console.warn('[PWA] SW registration failed:', err));
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