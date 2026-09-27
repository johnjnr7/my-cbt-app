// ═══════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════
const SUPABASE_URL = 'https://usukzxzrarlbaluscvzo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzdWt6eHpyYXJsYmFsdXNjdnpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MDc3ODcsImV4cCI6MjEwNjA4Mzc4N30.56VlSigB_3MBdqnQQ3uVVvwG_fzpC0MCQOUr9jOAfdQ';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// ═══════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════
async function signInWithGoogle() {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) console.error('OAuth error:', error.message);
}

async function signOutUser() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  updateAuthUI();
}

supabaseClient.auth.onAuthStateChange(async (event, session) => {
  console.log('[Auth]', event);
  currentUser = session?.user || null;
  if (currentUser) await pullProgressFromCloud();
  updateAuthUI();
});

// ═══════════════════════════════════════════════════════
// SYNC
// ═══════════════════════════════════════════════════════
async function pushProgressToCloud() {
  if (!currentUser) return;
  const progress = JSON.parse(localStorage.getItem('progress') || '{}');
  const streak = JSON.parse(localStorage.getItem('streak') || '{"count":0,"lastDate":null}');

  const { error } = await supabaseClient
    .from('progress')
    .upsert({
      user_id: currentUser.id,
      data: progress,
      streak: streak,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) console.error('[Sync] Push failed:', error.message);
  else console.log('[Sync] Progress pushed');
}

async function pullProgressFromCloud() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient
    .from('progress')
    .select('data, streak')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (error) { console.error('[Sync] Pull failed:', error.message); return; }
  if (!data) return;

  const localProgress = JSON.parse(localStorage.getItem('progress') || '{}');
  const merged = mergeProgress(localProgress, data.data || {});
  localStorage.setItem('progress', JSON.stringify(merged));

  const localStreak = JSON.parse(localStorage.getItem('streak') || '{"count":0,"lastDate":null}');
  const cloudStreak = data.streak || { count: 0, lastDate: null };
  const better = (cloudStreak.count > localStreak.count) ? cloudStreak : localStreak;
  localStorage.setItem('streak', JSON.stringify(better));

  console.log('[Sync] Progress pulled');
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderStreak === 'function') renderStreak();
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

// ═══════════════════════════════════════════════════════
// UI — Updates the auth button and settings profile block
// ═══════════════════════════════════════════════════════
function updateAuthUI() {
  const btn = document.getElementById('auth-btn');
  const txt = document.getElementById('auth-btn-text');
  const profileBlock = document.getElementById('settings-profile');

  if (btn && txt) {
    if (currentUser) {
      const name = getFirstName(currentUser);
      txt.textContent = name;
      btn.onclick = () => openSettings();
      btn.title = `${currentUser.email} — open settings`;
    } else {
      txt.textContent = 'Sign in';
      btn.onclick = signInWithGoogle;
      btn.title = 'Sign in with Google to sync progress';
    }
  }

  // Settings modal profile section
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
            <p class="settings-profile-name">${escapeHtml(name)}</p>
            <p class="settings-profile-email">${escapeHtml(email)}</p>
          </div>
        </div>
        <button id="signout-btn" class="settings-signout">Sign out</button>
      `;
      document.getElementById('signout-btn').onclick = signOutUser;
    } else {
      profileBlock.innerHTML = `
        <p class="settings-profile-guest">Sign in with Google to sync your progress across devices.</p>
        <button id="settings-signin-btn" class="cta-btn settings-signin-btn">Sign in with Google</button>
      `;
      document.getElementById('settings-signin-btn').onclick = signInWithGoogle;
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

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session?.user || null;
  if (currentUser) await pullProgressFromCloud();
  updateAuthUI();
})();continuue
