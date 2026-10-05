// ═══════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════
const SUPABASE_URL = 'https://usukzxzrarlbaluscvzo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzdWt6eHpyYXJsYmFsdXNjdnpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MDc3ODcsImV4cCI6MjEwNjA4Mzc4N30.56VlSigB_3MBdqnQQ3uVVvwG_fzpC0MCQOUr9jOAfdQ';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    lock: async (_name, _acquireTimeout, fn) => fn()
  }
});

let currentUser = null;
let lastUserId = localStorage.getItem('aim360_last_user_id') || null;

// ─── User-scoped localStorage helpers ─────────────────
function userKey(key) {
  return currentUser ? `${key}_${currentUser.id}` : key;
}

function getUserProgress() {
  try {
    if (!currentUser) return {};
    return JSON.parse(localStorage.getItem(userKey('progress')) || '{}');
  } catch { return {}; }
}

function setUserProgress(p) {
  if (!currentUser) return;
  localStorage.setItem(userKey('progress'), JSON.stringify(p));
}

function getUserStreak() {
  try {
    if (!currentUser) return { count: 0, lastDate: null };
    return JSON.parse(localStorage.getItem(userKey('streak')) || '{"count":0,"lastDate":null}');
  } catch { return { count: 0, lastDate: null }; }
}

function setUserStreak(s) {
  if (!currentUser) return;
  localStorage.setItem(userKey('streak'), JSON.stringify(s));
}

// ─── FACEBOOK-STYLE VERIFIED BADGE ────────────────────
function verifiedTickHtml(size) {
  const cls = 'verified-tick' + (size ? ' ' + size : '');
  return `<span class="${cls}" title="Pro subscriber" aria-label="Verified"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#1877F2" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"/><path fill="#ffffff" d="M10.54 16.2l-3.9-3.91 1.41-1.41 2.49 2.49 5.29-5.77 1.47 1.36-6.76 7.24z"/></svg></span>`;
}

// ─── AUTH ─────────────────────────────────────────────
async function signInWithGoogle() {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) console.error('OAuth error:', error.message);
}

async function signUpWithEmail(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin }
  });

  if (error) return { error: error.message };

  await refreshEverythingAfterLogin();

  return { success: true, user: data.user };
}

async function signInWithEmail(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) return { error: error.message };

  await refreshEverythingAfterLogin();

  return { success: true, user: data.user };
}

function openWelcomeModal() {
  const modal = document.getElementById('welcome-modal');
  if (!modal) {
    signInWithGoogle();
    return;
  }
  modal.classList.remove('hidden');

    // ← ADD THIS
  if (typeof renderPromoBanner === 'function') renderPromoBanner();
}

function closeWelcomeModal() {
  document.getElementById('welcome-modal')?.classList.add('hidden');
}

async function signOutUser() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  updateAuthUI();
}

// ⚠️ CRITICAL: This listener must NOT be async and must NOT await DB work.
supabaseClient.auth.onAuthStateChange((event, session) => {
  console.log('[Auth]', event);
  currentUser = session?.user || null;
  updateAuthUI();
  closeWelcomeModal();

  if (typeof renderStreak === 'function') renderStreak();
  if (typeof renderDashboard === 'function') renderDashboard();

  if (currentUser) {
    setTimeout(() => {
      pullProgressFromCloud().catch(e => console.warn('[Sync]', e));
    }, 0);
  }
});

// ═══════════════════════════════════════════════════════
// SYNC
// ═══════════════════════════════════════════════════════
async function pushProgressToCloud() {
  if (!currentUser) return;

  const progress = getUserProgress();
  const streak = getUserStreak();
  const practiceDays = JSON.parse(localStorage.getItem(`practiceDays_${currentUser.id}`) || '[]');
  const bookmarks = JSON.parse(localStorage.getItem(`bookmarks_${currentUser.id}`) || '[]');

  const { error } = await supabaseClient
    .from('progress')
    .upsert({
      user_id: currentUser.id,
      data: progress,
      streak: streak,
      practice_days: practiceDays,
      bookmarks: bookmarks,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) console.error('[Sync] Push failed:', error.message);
  else console.log('[Sync] Progress pushed for', currentUser.email);
}

async function pullProgressFromCloud() {
  if (!currentUser) return;
  try {
    const { data, error } = await supabaseClient
      .from('progress')
      .select('data, streak, practice_days, bookmarks')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (error) { console.error('[Sync] Pull failed:', error.message); return; }

    // Handle different user — clear the OLD user's keys
    if (lastUserId && lastUserId !== currentUser.id) {
      console.log('[Sync] Different user — clearing old local data');
      localStorage.removeItem(`progress_${lastUserId}`);
      localStorage.removeItem(`streak_${lastUserId}`);
      localStorage.removeItem(`practiceDays_${lastUserId}`);
      localStorage.removeItem(`bookmarks_${lastUserId}`);
    }
    lastUserId = currentUser.id;
    localStorage.setItem('aim360_last_user_id', currentUser.id);

    if (!data) {
      // NEW USER — start clean
      setUserProgress({});
      setUserStreak({ count: 0, lastDate: null });
      localStorage.setItem(`practiceDays_${currentUser.id}`, '[]');
      localStorage.setItem(`bookmarks_${currentUser.id}`, '[]');
      return;
    }

    // ─── PROGRESS: cloud wins (contains quiz scores) ───
    setUserProgress(data.data || {});

    // ─── STREAK: keep the better one ───
    const localStreak = getUserStreak();
    const cloudStreak = data.streak || { count: 0, lastDate: null };
    setUserStreak(cloudStreak.count > localStreak.count ? cloudStreak : localStreak);

    // ─── PRACTICE DAYS: MERGE local + cloud (union of dates) ───
    const cloudDays = data.practice_days || [];
    const localDays = JSON.parse(localStorage.getItem(`practiceDays_${currentUser.id}`) || '[]');
    const mergedDays = Array.from(new Set([...cloudDays, ...localDays]));
    localStorage.setItem(`practiceDays_${currentUser.id}`, JSON.stringify(mergedDays));

    // ─── BOOKMARKS: MERGE local + cloud (union by key) ───
    const cloudBookmarks = data.bookmarks || [];
    const localBookmarks = JSON.parse(localStorage.getItem(`bookmarks_${currentUser.id}`) || '[]');
    const bookmarkMap = new Map();
    [...localBookmarks, ...cloudBookmarks].forEach(b => bookmarkMap.set(b.key, b));
    const mergedBookmarks = Array.from(bookmarkMap.values());
    localStorage.setItem(`bookmarks_${currentUser.id}`, JSON.stringify(mergedBookmarks));

    console.log('[Sync] Progress pulled for', currentUser.email,
                `(days: ${mergedDays.length}, bookmarks: ${mergedBookmarks.length})`);

    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderStreak === 'function') renderStreak();
    if (typeof renderBookmarksView === 'function') renderBookmarksView();
  } catch (e) {
    console.warn('[Sync] Pull error:', e);
  }
}

// ─── UI ───────────────────────────────────────────────
function updateAuthUI() {
  const btn = document.getElementById('auth-btn');
  const txt = document.getElementById('auth-btn-text');
  const profileBlock = document.getElementById('settings-profile');

  const isPro = typeof hasActiveSubscription === 'function' && hasActiveSubscription();

  if (btn && txt) {
    if (currentUser) {
      const name = getFirstName(currentUser);
      txt.innerHTML = isPro
        ? `<span class="pro-badge-name">${escapeHtml(name)}${verifiedTickHtml()}</span>`
        : escapeHtml(name);
      btn.onclick = () => openSettings();
      btn.title = `${currentUser.email} — open settings`;
    } else {
      txt.textContent = 'Sign in';
      btn.onclick = openWelcomeModal;
      btn.title = 'Sign in or create an account';
    }
  }

  if (profileBlock) {
    if (currentUser) {
      const name = getFullName(currentUser);
      const email = currentUser.email || '';
      const photo = getAvatarUrl(currentUser);
      const initial = (getFirstName(currentUser)[0] || '?').toUpperCase();

      profileBlock.innerHTML = `
        <div class="settings-profile-row">
          <div class="settings-avatar" style="${photo ? `background-image: url('${photo}')` : ''}">
            ${photo ? '' : initial}
          </div>
          <div class="settings-profile-info">
            <p class="settings-profile-name">${escapeHtml(name)}${isPro ? verifiedTickHtml('lg') : ''}</p>
            <p class="settings-profile-email">${escapeHtml(email)}</p>
          </div>
        </div>
        <button id="signout-btn" class="settings-signout">Sign out</button>
      `;
      document.getElementById('signout-btn').onclick = signOutUser;
    } else {
      profileBlock.innerHTML = `
        <p class="settings-profile-guest">Sign in to sync your progress across devices.</p>
        <button id="settings-signin-btn" class="cta-btn settings-signin-btn">Sign in</button>
      `;
      document.getElementById('settings-signin-btn').onclick = openWelcomeModal;
    }
  }
}

function getFirstName(user) {
  const meta = user.user_metadata || {};
  const full = meta.full_name || meta.name || '';
  if (full) return full.split(' ')[0];
  if (user.email) return user.email.split('@')[0];
  return 'Account';
}

function getFullName(user) {
  const meta = user.user_metadata || {};
  return meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Account');
}

function getAvatarUrl(user) {
  const meta = user.user_metadata || {};
  return meta.avatar_url || meta.picture || '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Re-render topbar after everything is loaded
window.addEventListener('load', () => {
  setTimeout(() => {
    if (typeof updateAuthUI === 'function') updateAuthUI();
  }, 600);
});