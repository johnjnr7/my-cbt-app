// ═══════════════════════════════════════════════════════
// AIM360 — Payments + Paywall
// ═══════════════════════════════════════════════════════
const PAYSTACK_PUBLIC_KEY = 'pk_live_8186ecdb1b8942a9c42b6fd333363980053903dd';
const SUBSCRIPTION_PRICE_KOBO = 1000000;   // ₦10,000
const FREE_TRIAL_TOPICS = 1;
const SUPABASE_FN_URL = `${SUPABASE_URL}/functions/v1`;

let currentSubscription = null;

async function loadSubscription() {
  if (!currentUser) { currentSubscription = null; updateSubscriptionUI(); return null; }
  const { data } = await supabaseClient
    .from('subscriptions')
    .select('*')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (data && data.status === 'active' && data.current_period_end &&
      new Date(data.current_period_end) < new Date()) {
    data.status = 'expired';
    supabaseClient.from('subscriptions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('user_id', currentUser.id).then(() => {});
  }

  currentSubscription = data;
  updateSubscriptionUI();
  return data;
}

function hasActiveSubscription() {
  if (!currentSubscription) return false;
  if (currentSubscription.status !== 'active') return false;
  const end = currentSubscription.current_period_end;
  return end && new Date(end).getTime() > Date.now();
}

function countPassedTopics() {
  let n = 0;
  for (const sub of SUBJECTS) {
    const data = dataCache[sub];
    if (!data) continue;
    for (const t of data.topics) if (getMastery(t.id) === 'mastered') n++;
  }
  return n;
}

function trialUsedUp() {
  return countPassedTopics() >= FREE_TRIAL_TOPICS;
}

function canAccessTopics() {
  return hasActiveSubscription() || !trialUsedUp();
}

function updateSubscriptionUI() {
  const wrap = document.getElementById('sub-status');
  if (!wrap) return;

  if (hasActiveSubscription()) {
    const end = new Date(currentSubscription.current_period_end);
    wrap.innerHTML = `<span class="sub-badge pro" title="Renews ${end.toLocaleDateString()}">💎 Pro</span>`;
    wrap.onclick = null;
  } else if (!currentUser) {
    wrap.innerHTML = `<button class="sub-badge cta">Sign in to go Pro</button>`;
    wrap.onclick = () => signInWithGoogle?.();
  } else {
    wrap.innerHTML = `<button class="sub-badge cta">🔓 Go Pro · ₦10,000/mo</button>`;
    wrap.onclick = openPaywallModal;
  }
}

function openPaywallModal() {
  const modal = document.getElementById('paywall-modal');
  if (!modal) return;
  if (!currentUser) {
    if (confirm('Sign in to unlock all topics. Continue with Google?')) {
      signInWithGoogle?.();
    }
    return;
  }
  modal.classList.remove('hidden');
}

function closePaywallModal() {
  document.getElementById('paywall-modal')?.classList.add('hidden');
}

function openPaystack() {
  if (!currentUser) { signInWithGoogle?.(); return; }

  const ref = `aim360_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const handler = PaystackPop.setup({
    key: PAYSTACK_PUBLIC_KEY,
    email: currentUser.email,
    amount: SUBSCRIPTION_PRICE_KOBO,
    currency: 'NGN',
    ref,
    metadata: {
      user_id: currentUser.id,
      custom_fields: [
        { display_name: 'Plan', variable_name: 'plan', value: 'AIM360 Monthly' }
      ],
    },
    callback: (response) => verifyPayment(response.reference),
    onClose: () => {},
  });
  handler.openIframe();
}

async function verifyPayment(reference) {
  const btn = document.getElementById('paywall-subscribe-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Verifying payment…'; }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const res = await fetch(`${SUPABASE_FN_URL}/paystack-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ reference }),
    });
    const out = await res.json();

    if (out.success) {
      await loadSubscription();
      closePaywallModal();
      document.getElementById('payment-success-modal')?.classList.remove('hidden');
      if (typeof renderDashboard === 'function') renderDashboard();
      const subSel = document.getElementById('subject-select');
      if (subSel && subSel.value) subSel.dispatchEvent(new Event('change'));
    } else {
      alert('Payment verification failed: ' + (out.error || 'Unknown'));
    }
  } catch (err) {
    console.error(err);
    alert('Could not verify payment. Please contact support.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Pay with Paystack →'; }
  }
}

async function logActivity(eventType, metadata = {}) {
  if (!currentUser) return;
  try {
    await supabaseClient.from('activity_log').insert({
      user_id: currentUser.id, event_type: eventType, metadata,
    });
  } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('paywall-x')?.addEventListener('click', closePaywallModal);
  document.getElementById('paywall-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'paywall-modal') closePaywallModal();
  });
  document.getElementById('paywall-subscribe-btn')?.addEventListener('click', openPaystack);
  document.getElementById('payment-success-close')?.addEventListener('click', () => {
    document.getElementById('payment-success-modal')?.classList.add('hidden');
  });
  setTimeout(() => logActivity('app_open'), 2000);
});

if (typeof supabaseClient !== 'undefined') {
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) await loadSubscription();
    else { currentSubscription = null; updateSubscriptionUI(); }
  });
  (async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;
    if (currentUser) await loadSubscription();
  })();
}