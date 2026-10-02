// ═══════════════════════════════════════════════════════
// AIM360 — Mock Exam + Calculator
// ═══════════════════════════════════════════════════════
const examState = {
  count: 20,
  timeMin: 20,
  questions: [],
  answers: [],
  flagged: [],
  current: 0,
  timeLeft: 0,
  timerInterval: null,
  startedAt: null,
  finished: false
};

function initExamSetup() {
  const subjBox = document.getElementById('exam-subjects');
  if (!subjBox) return;

  subjBox.innerHTML = '';
  for (const sub of SUBJECTS) {
    const label = document.createElement('label');
    label.className = 'exam-subject-chip';
    label.innerHTML = `<input type="checkbox" value="${sub}" checked><span>${SUBJECT_LABELS[sub]}</span>`;
    subjBox.appendChild(label);
  }

  document.querySelectorAll('#exam-count-row .exam-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#exam-count-row .exam-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      examState.count = parseInt(btn.dataset.count, 10);
    });
  });

  document.querySelectorAll('#exam-time-row .exam-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#exam-time-row .exam-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      examState.timeMin = parseInt(btn.dataset.time, 10);
    });
  });

  const startBtn = document.getElementById('exam-start-btn');
  if (startBtn) startBtn.addEventListener('click', startExam);
}

async function startExam() {
  // ── ACCESS GATE ──────────────────────────
  const access = await getUserAccess();
  if (!access) {
    alert('Please sign in to start an exam.');
    return;
  }
  if (!access.canTakeExam) {
    showUpgradeModal("You've used your free exam attempt. Upgrade to unlock unlimited exams.");
    return;
  }
  // ── END GATE ─────────────────────────────

  const selected = [];
  document.querySelectorAll('#exam-subjects input:checked').forEach(cb => selected.push(cb.value));

  if (selected.length === 0) {
    alert('Please select at least one subject.');
    return;
  }

  for (const sub of selected) {
    if (typeof loadSubject === 'function' && !dataCache[sub]) {
      await loadSubject(sub);
    }
  }

  const pool = [];
  for (const sub of selected) {
    const data = dataCache[sub];
    if (!data) continue;
    for (const topic of data.topics) {
      for (let i = 0; i < topic.questions.length; i++) {
        pool.push({
          ...topic.questions[i],
          _subject: sub,
          _topicName: topic.name,
          _topicId: topic.id,
          _originalIndex: i
        });
      }
    }
  }

  if (pool.length === 0) {
    alert('No questions available for the selected subjects.');
    return;
  }

  const picked = shuffle([...pool]).slice(0, Math.min(examState.count, pool.length));

  examState.questions = picked;
  examState.answers = new Array(picked.length).fill(null);
  examState.flagged = new Array(picked.length).fill(false);
  examState.current = 0;
  examState.timeLeft = examState.timeMin * 60;
  examState.startedAt = Date.now();
  examState.finished = false;

  // ── MARK THIS ATTEMPT FOR UNPAID USERS ───
  if (!access.isPaid) {
    await recordExamAttempt();
  }
  // ── END MARK ─────────────────────────────

  document.getElementById('exam-setup').classList.add('hidden');
  document.getElementById('exam-results').classList.add('hidden');
  document.getElementById('exam-running').classList.remove('hidden');

  if (!access.isPaid) {
  await recordExamAttempt();
}
  renderExamQuestion();
  startExamTimer();
}
function startExamTimer() {
  if (examState.timerInterval) clearInterval(examState.timerInterval);
  updateExamTimerDisplay();
  examState.timerInterval = setInterval(() => {
    examState.timeLeft--;
    updateExamTimerDisplay();
    if (examState.timeLeft <= 0) {
      clearInterval(examState.timerInterval);
      finishExam(true);
    }
  }, 1000);
}

function updateExamTimerDisplay() {
  const el = document.getElementById('exam-timer');
  if (!el) return;
  const m = Math.floor(examState.timeLeft / 60);
  const s = examState.timeLeft % 60;
  el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('warning', examState.timeLeft <= 60);
}

function renderExamQuestion() {
  const q = examState.questions[examState.current];
  if (!q) return;

  document.getElementById('exam-progress').textContent =
    `Q ${examState.current + 1} / ${examState.questions.length}`;
  document.getElementById('exam-question').textContent = q.q;

  const optDiv = document.getElementById('exam-options');
  optDiv.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = `${String.fromCharCode(65 + i)}. ${opt}`;
    if (examState.answers[examState.current] === i) btn.classList.add('selected');
    btn.addEventListener('click', () => {
      examState.answers[examState.current] = i;
      optDiv.querySelectorAll('.option-btn').forEach((b, bi) => {
        b.classList.toggle('selected', bi === i);
      });
      renderExamNavigator();
    });
    optDiv.appendChild(btn);
  });

  const prevBtn = document.getElementById('exam-prev-btn');
  const nextBtn = document.getElementById('exam-next-btn');
  const flagBtn = document.getElementById('exam-flag-btn');

  if (prevBtn) prevBtn.disabled = examState.current === 0;
  if (nextBtn) nextBtn.textContent =
    examState.current === examState.questions.length - 1 ? 'Finish →' : 'Next →';

  if (flagBtn) {
    const flagged = examState.flagged[examState.current];
    flagBtn.classList.toggle('active', flagged);
    flagBtn.textContent = flagged ? '⚑ Flagged' : '⚑ Flag';
  }

  renderExamNavigator();
}

function renderExamNavigator() {
  const nav = document.getElementById('exam-navigator');
  if (!nav) return;
  nav.innerHTML = '';
  examState.questions.forEach((_, i) => {
    const btn = document.createElement('button');
    btn.className = 'exam-nav-btn';
    btn.textContent = i + 1;
    if (examState.answers[i] !== null) btn.classList.add('answered');
    if (examState.flagged[i]) btn.classList.add('flagged');
    if (i === examState.current) btn.classList.add('current');
    btn.addEventListener('click', () => {
      examState.current = i;
      renderExamQuestion();
    });
    nav.appendChild(btn);
  });
}

function finishExam(timeUp) {
  if (examState.finished) return;
  examState.finished = true;
  if (examState.timerInterval) clearInterval(examState.timerInterval);

  let correct = 0;
  examState.questions.forEach((q, i) => {
    if (examState.answers[i] === q.answer) correct++;
  });

  const total = examState.questions.length;
  const pct = Math.round((correct / total) * 100);
  const elapsed = Math.round((Date.now() - examState.startedAt) / 1000);
  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;

  const perSub = {};
  examState.questions.forEach((q, i) => {
    const s = q._subject;
    if (!perSub[s]) perSub[s] = { correct: 0, total: 0 };
    perSub[s].total++;
    if (examState.answers[i] === q.answer) perSub[s].correct++;
  });

  document.getElementById('exam-running').classList.add('hidden');
  const res = document.getElementById('exam-results');
  res.classList.remove('hidden');

  let breakdownHtml = '';
  for (const s in perSub) {
    const d = perSub[s];
    breakdownHtml += `
      <div class="exam-result-row">
        <span>${SUBJECT_LABELS[s] || s}</span>
        <span>${d.correct}/${d.total}</span>
      </div>
    `;
  }

  res.innerHTML = `
    <h2 style="font-size:1.8rem;margin-bottom:8px">${timeUp ? '⏰ Time up!' : '✅ Exam complete'}</h2>
    <p class="exam-result-score">${correct}/${total} <span>(${pct}%)</span></p>
    <p style="color:var(--muted);margin-bottom:16px">Time taken: ${mm}:${String(ss).padStart(2, '0')}</p>
    <div class="exam-result-breakdown">${breakdownHtml}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px">
      <button class="cta-btn" id="exam-retake-btn" style="margin-top:0">Retake exam</button>
      <button class="btn-ghost" id="exam-back-btn">Back to setup</button>
    </div>
  `;

  document.getElementById('exam-retake-btn').addEventListener('click', () => startExam());
  document.getElementById('exam-back-btn').addEventListener('click', () => {
    document.getElementById('exam-results').classList.add('hidden');
    document.getElementById('exam-setup').classList.remove('hidden');
  });

  if (typeof logActivity === 'function') {
    logActivity('exam_completed', { correct, total, pct });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initExamSetup();
  initCalculator();

  const prevBtn = document.getElementById('exam-prev-btn');
  const nextBtn = document.getElementById('exam-next-btn');
  const flagBtn = document.getElementById('exam-flag-btn');
  const submitBtn = document.getElementById('exam-submit-btn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (examState.current > 0) { examState.current--; renderExamQuestion(); }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (examState.current < examState.questions.length - 1) {
        examState.current++;
        renderExamQuestion();
      } else if (confirm('Finish the exam and see your score?')) {
        finishExam(false);
      }
    });
  }

  if (flagBtn) {
    flagBtn.addEventListener('click', () => {
      examState.flagged[examState.current] = !examState.flagged[examState.current];
      renderExamQuestion();
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      if (confirm('Submit the exam now? Unanswered questions will be marked wrong.')) {
        finishExam(false);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════
// CALCULATOR
// ═══════════════════════════════════════════════════════
function initCalculator() {
  const panel = document.getElementById('calc-panel');
  const display = document.getElementById('calc-display');
  const openBtn = document.getElementById('exam-calc-btn');
  const closeBtn = document.getElementById('calc-close');

  if (!panel || !display) return;

  let current = '0';
  let previous = null;
  let operator = null;
  let justPressedEquals = false;

  function updateDisplay() { display.textContent = current; }

  function compute(a, b, op) {
    const x = parseFloat(a);
    const y = parseFloat(b);
    switch (op) {
      case '+': return x + y;
      case '-': return x - y;
      case '×': return x * y;
      case '÷': return y === 0 ? 'Error' : x / y;
      default: return y;
    }
  }

  panel.querySelectorAll('.calc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const num = btn.dataset.num;
      const op = btn.dataset.op;
      const action = btn.dataset.action;

      if (num !== undefined) {
        if (justPressedEquals) { current = '0'; justPressedEquals = false; }
        if (num === '.') {
          if (!current.includes('.')) current += '.';
        } else {
          current = current === '0' ? num : current + num;
        }
        updateDisplay();
        return;
      }

      if (op) {
        if (operator && previous !== null && !justPressedEquals) {
          const r = compute(previous, current, operator);
          current = String(r);
          updateDisplay();
        }
        previous = current;
        operator = op;
        current = '0';
        justPressedEquals = false;
        return;
      }

      if (action === 'clear') {
        current = '0'; previous = null; operator = null; justPressedEquals = false;
        updateDisplay();
      } else if (action === 'backspace') {
        current = current.length > 1 ? current.slice(0, -1) : '0';
        updateDisplay();
      } else if (action === 'sqrt') {
        const n = parseFloat(current);
        current = n < 0 ? 'Error' : String(Math.sqrt(n));
        updateDisplay();
      } else if (action === 'equals') {
        if (operator && previous !== null) {
          const r = compute(previous, current, operator);
          current = String(r);
          previous = null;
          operator = null;
          justPressedEquals = true;
          updateDisplay();
        }
      }
    });
  });

  if (openBtn) {
    openBtn.addEventListener('click', () => panel.classList.toggle('hidden'));
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
  }
}