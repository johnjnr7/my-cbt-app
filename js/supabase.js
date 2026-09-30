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

  // Fire welcome email (fire and forget)
  if (data?.user) {
    fetch(`${SUPABASE_URL}/functions/v1/send-welcome-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        userId: data.user.id,
        name: email.split('@')[0]
      })
    }).catch(err => console.warn('Welcome email failed:', err));
  }

  return { success: true, user: data.user };
}

async function signInWithEmail(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  if (error) return { error: error.message };
  return { success: true, user: data.user };
}

function openWelcomeModal() {
  const modal = document.getElementById('welcome-modal');
  if (!modal) {
    signInWithGoogle();
    return;
  }
  modal.classList.remove('hidden');
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
// Supabase holds an auth lock while running listeners — awaiting inside
// here deadlocks every subsequent DB call on the page.
supabaseClient.auth.onAuthStateChange((event, session) => {
  console.log('[Auth]', event);
  currentUser = session?.user || null;
  updateAuthUI();
  closeWelcomeModal();

  // ⭐ Re-render streak + dashboard now that we know who the user is
  if (typeof renderStreak === 'function') renderStreak();
  if (typeof renderDashboard === 'function') renderDashboard();

  if (currentUser) {
    setTimeout(() => {
      pullProgressFromCloud().catch(e => console.warn('[Sync]', e));
    }, 0);
  }
});



async function pullProgressFromCloud() {
  if (!currentUser) return;
  try {
    const { data, error } = await supabaseClient
      .from('progress')
      .select('data, streak')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (error) { console.error('[Sync] Pull failed:', error.message); return; }

    // Handle different user
    if (lastUserId && lastUserId !== currentUser.id) {
      console.log('[Sync] Different user — clearing old local data');
      localStorage.removeItem(userKey('progress'));
      localStorage.removeItem(userKey('streak'));
    }
    lastUserId = currentUser.id;
    localStorage.setItem('aim360_last_user_id', currentUser.id);

    if (!data) {
      // NEW USER — start clean
      setUserProgress({});
      setUserStreak({ count: 0, lastDate: null });
    } else {
      // Existing user — pull cloud data
      setUserProgress(data.data || {});
      setUserStreak(data.streak || { count: 0, lastDate: null });
    }

    console.log('[Sync] Progress pulled for', currentUser.email);
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderStreak === 'function') renderStreak();
  } catch (e) {
    console.warn('[Sync] Pull error:', e);
  }
}

function mergeProgress(local, cloud) {
  const merged = { ...cloud };
  for (const id in local) {
    if (!merged[id]) merged[id] = local[id];
    else merged[id] = {
      correct: Math.max(local[id].correct, merged[id].correct),
      total: Math.max(local[id].total, merged[id].total)
    };
  }
  return merged;
}

function updateAuthUI() {
  const btn = document.getElementById('auth-btn');
  const txt = document.getElementById('auth-btn-text');
  const profileBlock = document.getElementById('settings-profile');

  const isPro = typeof hasActiveSubscription === 'function' && hasActiveSubscription();

  if (btn && txt) {
    if (currentUser) {
      const name = getFirstName(currentUser);

      // Blue verified tick next to name for Pro users
            txt.innerHTML = isPro
        ? `<span class="pro-badge-name">${escapeHtml(name)}<span class="verified-tick" title="Pro subscriber" aria-label="Verified"></span></span>`
        : escapeHtml(name);

      // Blue ring around the person icon for Pro users
      const inner = btn.querySelector('.auth-btn-inner');
      if (inner) inner.classList.toggle('pro-ring', isPro);

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
                    <p class="settings-profile-name">${escapeHtml(name)}${isPro ? '<span class="verified-tick lg" title="Pro subscriber" aria-label="Verified"></span>' : ''}</p>
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