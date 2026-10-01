// ═══════════════════════════════════════════════════════
// AIM360 — Admin dashboard
// ═══════════════════════════════════════════════════════
const SUPABASE_FN_URL_ADMIN = `${SUPABASE_URL}/functions/v1`;
let adminUser = null;
let allUsers = [];

document.addEventListener('DOMContentLoaded', () => {
  let handled = false;

  const finish = async (session) => {
    if (handled) return;
    handled = true;

    if (!session) return deny('You need to sign in first.');
    adminUser = session.user;

    const { data: adminRow } = await supabaseClient
      .from('admins').select('user_id').eq('user_id', adminUser.id).maybeSingle();
    if (!adminRow) return deny('Your account is not an admin.');

    document.getElementById('admin-loading').classList.add('hidden');
    document.getElementById('admin-app').classList.remove('hidden');

    setupTabs();
    await Promise.all([loadOverview(), loadUsers(), loadCampaigns(), loadActivity()]);
  };

  // Use the auth event — we KNOW this fires (you saw it in console)
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      finish(session);
    }
  });

  // Fallback: if no event in 3s, check manually
  setTimeout(async () => {
    if (handled) return;
    try {
      const { data } = await supabaseClient.auth.getSession();
      finish(data?.session);
    } catch { finish(null); }
  }, 3000);
});

function deny(msg) {
  document.getElementById('admin-loading').classList.add('hidden');
  document.getElementById('admin-denied').classList.remove('hidden');
  document.getElementById('admin-denied-msg').textContent = msg;
}

function setupTabs() {
  document.querySelectorAll('.admin-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
  document.getElementById('admin-signout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    location.href = 'index.html';
  });
  document.getElementById('refresh-btn').addEventListener('click', loadOverview);
  document.getElementById('user-search').addEventListener('input', filterUsers);
  document.getElementById('user-status-filter').addEventListener('change', filterUsers);
  document.getElementById('email-filter').addEventListener('change', updateRecipientCount);
  document.getElementById('email-send-btn').addEventListener('click', sendBulkEmail);
}

async function loadOverview() {
  const { data: subs = [] } = await supabaseClient.from('subscriptions').select('*');
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 864e5);
  const weekAhead = new Date(now.getTime() + 7 * 864e5);

  let active = 0, trial = 0, expired = 0, mrr = 0, newWeek = 0;
  const expiring = [];

  subs.forEach(s => {
    const end = s.current_period_end ? new Date(s.current_period_end) : null;
    const isActive = s.status === 'active' && end && end > now;
    if (isActive) {
      active++;
      mrr += 10000;
      if (end <= weekAhead) expiring.push(s);
    } else if (s.status === 'trial') trial++;
    else expired++;
    if (s.created_at && new Date(s.created_at) > weekAgo) newWeek++;
  });

  document.getElementById('stat-total').textContent = subs.length;
  document.getElementById('stat-total-sub').textContent = `+${newWeek} this week`;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-active-sub').textContent = subs.length
    ? `${Math.round((active / subs.length) * 100)}% conversion` : '0%';
  document.getElementById('stat-trial').textContent = trial;
  document.getElementById('stat-trial-sub').textContent = trial ? 'Ready to convert' : '—';
  document.getElementById('stat-expired').textContent = expired;
  document.getElementById('stat-expired-sub').textContent = expired ? 'Win them back' : '—';
  document.getElementById('stat-mrr').textContent = '₦' + mrr.toLocaleString();
  document.getElementById('stat-new').textContent = newWeek;

  const expList = document.getElementById('expiring-list');
  expList.innerHTML = expiring.length
    ? expiring.map(s => `
        <div class="expiring-item">
          <div>
            <div class="expiring-name">${esc(s.full_name || '—')}</div>
            <div class="expiring-email">${esc(s.email || '')}</div>
          </div>
          <div class="expiring-date">${fmtDate(s.current_period_end)}</div>
        </div>`).join('')
    : '<p class="admin-empty">No subscriptions expiring soon.</p>';

  await Promise.all([loadRetention(), loadActivityChart()]);
}

async function loadRetention() {
  const now = Date.now();
  const [dauD, wauD, mauD] = await Promise.all([
    supabaseClient.from('activity_log').select('user_id').gte('created_at', new Date(now - 864e5).toISOString()),
    supabaseClient.from('activity_log').select('user_id').gte('created_at', new Date(now - 7 * 864e5).toISOString()),
    supabaseClient.from('activity_log').select('user_id').gte('created_at', new Date(now - 30 * 864e5).toISOString()),
  ]);
  const uniq = arr => new Set((arr || []).map(x => x.user_id)).size;
  const dau = uniq(dauD.data), wau = uniq(wauD.data), mau = uniq(mauD.data);

  document.getElementById('dau-num').textContent = dau;
  document.getElementById('wau-num').textContent = wau;
  document.getElementById('mau-num').textContent = mau;
  const sticky = mau ? Math.round((dau / mau) * 100) : 0;
  document.getElementById('retention-note').textContent =
    `Stickiness (DAU/MAU): ${sticky}%. ${mau ? `Retention pulse looks ${sticky >= 20 ? 'healthy 💚' : 'worth watching ⚠️'}.` : ''}`;
}

async function loadActivityChart() {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 864e5);
  const { data } = await supabaseClient.from('activity_log')
    .select('created_at').gte('created_at', start.toISOString());

  const buckets = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - (29 - i) * 864e5);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  (data || []).forEach(r => { const k = r.created_at.slice(0, 10); if (k in buckets) buckets[k]++; });

  const vals = Object.values(buckets);
  const max = Math.max(...vals, 1);
  document.getElementById('activity-chart').innerHTML =
    `<div class="bar-chart">${vals.map((v, i) =>
      `<div class="bar-col" title="${Object.keys(buckets)[i]}: ${v}">
         <div class="bar-fill" style="height:${(v / max) * 100}%"></div>
       </div>`).join('')}</div>`;
}

async function loadUsers() {
  const { data } = await supabaseClient.from('subscriptions')
    .select('*').order('created_at', { ascending: false });
  allUsers = data || [];
  renderUsers(allUsers);
}

function renderUsers(users) {
  const tbody = document.getElementById('users-tbody');
  if (!users.length) { tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">No users found.</td></tr>'; return; }
  const now = new Date();
  tbody.innerHTML = users.map(u => {
    const end = u.current_period_end ? new Date(u.current_period_end) : null;
    const isActive = u.status === 'active' && end && end > now;
    const status = isActive ? 'active' : (u.status === 'trial' ? 'trial' : 'expired');
    return `<tr>
     <td><div class="user-name">${esc(u.full_name || (u.email ? u.email.split('@')[0] : 'Anonymous'))}</div><div class="user-email">${esc(u.email || '')}</div></td>
      <td><span class="status-pill status-${status}">${status}</span></td>
      <td>${end ? fmtDate(end) : '—'}</td>
      <td>₦${((u.total_paid || 0) / 100).toLocaleString()}</td>
      <td>${fmtDate(u.created_at)}</td>
    </tr>`;
  }).join('');
}

function filterUsers() {
  const q = document.getElementById('user-search').value.toLowerCase();
  const s = document.getElementById('user-status-filter').value;
  const now = new Date();
  const filtered = allUsers.filter(u => {
    const mq = !q || (u.email || '').toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q);
    let ms = true;
    if (s) {
      const end = u.current_period_end ? new Date(u.current_period_end) : null;
      const isActive = u.status === 'active' && end && end > now;
      ms = (isActive ? 'active' : (u.status === 'trial' ? 'trial' : 'expired')) === s;
    }
    return mq && ms;
  });
  renderUsers(filtered);
}

async function updateRecipientCount() {
  const f = document.getElementById('email-filter').value;
  let q = supabaseClient.from('subscriptions').select('user_id', { count: 'exact', head: true });
  if (f !== 'all') q = q.eq('status', f);
  const { count } = await q;
  document.getElementById('recipient-count').textContent = `Will send to ${count || 0} users.`;
}

async function sendBulkEmail() {
  const subject = document.getElementById('email-subject').value.trim();
  const body    = document.getElementById('email-body').value.trim();
  const filter  = document.getElementById('email-filter').value;
  const status  = document.getElementById('email-status');
  const btn     = document.getElementById('email-send-btn');

  if (!subject || !body) {
    status.textContent = '⚠️ Subject and message required';
    status.style.color = 'var(--danger)'; return;
  }
  if (!confirm(`Send to all ${filter} users? This cannot be undone.`)) return;

  btn.disabled = true; btn.textContent = 'Sending…'; status.textContent = '';

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const res = await fetch(`${SUPABASE_FN_URL_ADMIN}/send-bulk-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ subject, body, filter }),
    });
    const out = await res.json();
    if (out.success) {
      status.textContent = `✅ Sent to ${out.sent} users (${out.failed} failed)`;
      status.style.color = 'var(--accent)';
      document.getElementById('email-subject').value = '';
      document.getElementById('email-body').value = '';
      await loadCampaigns();
    } else {
      status.textContent = '❌ ' + (out.error || 'Send failed');
      status.style.color = 'var(--danger)';
    }
  } catch (e) {
    status.textContent = '❌ Network error';
    status.style.color = 'var(--danger)';
  } finally {
    btn.disabled = false; btn.textContent = 'Send now';
  }
}

async function loadCampaigns() {
  const { data } = await supabaseClient.from('email_campaigns')
    .select('*').order('sent_at', { ascending: false }).limit(10);
  const el = document.getElementById('campaigns-list');
  el.innerHTML = (data && data.length)
    ? data.map(c => `<div class="campaign-item">
        <div class="campaign-subject">${esc(c.subject)}</div>
        <div class="campaign-meta">${c.recipient_count} recipients · ${fmtDate(c.sent_at)}</div>
      </div>`).join('')
    : '<p class="admin-empty">No campaigns yet.</p>';
}

async function loadActivity() {
  const { data } = await supabaseClient.from('activity_log')
    .select('*').order('created_at', { ascending: false }).limit(100);
  const el = document.getElementById('activity-feed');
  el.innerHTML = (data && data.length)
    ? data.map(a => `<div class="activity-item">
        <div class="activity-dot"></div>
        <div class="activity-body">
          <div class="activity-type">${esc(a.event_type)}</div>
          <div class="activity-time">${timeAgo(a.created_at)}</div>
        </div>
      </div>`).join('')
    : '<p class="admin-empty">No activity yet.</p>';
}

const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}