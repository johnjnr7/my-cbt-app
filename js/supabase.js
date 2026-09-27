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
// SYNC — Push to cloud
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

// ═══════════════════════════════════════════════════════
// SYNC — Pull from cloud
// ═══════════════════════════════════════════════════════
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
// UI
// ═══════════════════════════════════════════════════════
function updateAuthUI() {
  const btn = document.getElementById('auth-btn');
  const txt = document.getElementById('auth-btn-text');
  if (!btn || !txt) return;

  if (currentUser) {
    txt.textContent = currentUser.email?.split('@')[0] || 'Account';
    btn.onclick = signOutUser;
    btn.title = `${currentUser.email} — click to sign out`;
  } else {
    txt.textContent = 'Sign in';
    btn.onclick = signInWithGoogle;
    btn.title = 'Sign in with Google to sync progress';
  }
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session?.user || null;
  if (currentUser) await pullProgressFromCloud();
  updateAuthUI();
})();