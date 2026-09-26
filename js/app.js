// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════
const DAILY_REMINDER_HOUR = 20; // 8 PM

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

// ═══════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════
const themeBtn = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

themeBtn.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  renderDashboard();
});

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
// TOPIC LOCKING — one topic at a time, in order
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

  quizSummary.classList.add('hidden');
  quizArea.classList.remove('hidden');
  renderQuestion();
});

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
  document.getElementById('question-text').textContent =
    `Q${currentIndex + 1}/${currentQuestions.length} — ${q.q}`;

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

document.getElementById('next-btn').addEventListener('click', () => {
  currentIndex++;
  if (currentIndex < currentQuestions.length) renderQuestion();
  else finishQuiz();
});

function finishQuiz() {
  quizArea.classList.add('hidden');
  quizSummary.classList.remove('hidden');

  recordResult(currentTopic.id, correctCount, currentQuestions.length);
  updateStreak();
  renderStreak();

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
  });
}

// ═══════════════════════════════════════════════════════
// MOBILE SIDEBAR DRAWER
// ═══════════════════════════════════════════════════════
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

if (sidebarToggle) {
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
// PWA INSTALL + NOTIFICATIONS
// ═══════════════════════════════════════════════════════
const installBtn = document.getElementById('install-btn');
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (window.triggerInstall) {
      const accepted = await window.triggerInstall();
      if (!accepted) alert('Install dismissed. Try again from browser menu → "Add to Home Screen".');
    } else {
      alert('To install: open browser menu → "Add to Home Screen".');
    }
  });
}

const notifyBtn = document.getElementById('notify-btn');
if (notifyBtn) {
  notifyBtn.addEventListener('click', async () => {
    if (!('Notification' in window)) return alert('Notifications not supported.');
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification('AIM360', {
        body: '✅ Daily reminders enabled. Practice at 8 PM!',
        icon: './icons/icon-192.png'
      });
      scheduleLocalReminder();
    } else {
      alert('Notifications blocked.');
    }
  });
}

function scheduleLocalReminder() {
  const now = new Date();
  const next = new Date();
  next.setHours(DAILY_REMINDER_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  setTimeout(() => {
    if (Notification.permission === 'granted') {
      new Notification('🔥 Streak Alert!', {
        body: "You haven't practiced today. 5 quick questions to keep the streak alive!",
        icon: './icons/icon-192.png'
      });
    }
    scheduleLocalReminder();
  }, next - now);
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
updateGreeting();
renderStreak();
renderDashboard();