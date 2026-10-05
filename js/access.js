// =====================================================
// ACCESS CONTROL — free trial + paid gating
// =====================================================

// Central access resolver. Returns null if no user.
async function getUserAccess() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const { data, error } = await supabaseClient
    .from('subscriptions')
    .select('status, current_period_end, exam_attempts, practice_attempts, promo_expires_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;

  const now = new Date();

  const isPaid =
    data.status === 'active' &&
    data.current_period_end &&
    new Date(data.current_period_end) > now;

  const onPromo =
    !isPaid &&
    data.promo_expires_at &&
    new Date(data.promo_expires_at) > now;

  const hasFullAccess = isPaid || onPromo;

  return {
    isPaid,
    onPromo,
    promoExpiresAt: data.promo_expires_at ? new Date(data.promo_expires_at) : null,

    canTakeExam:       hasFullAccess || (data.exam_attempts || 0) < 1,
    canTakePractice:   hasFullAccess || (data.practice_attempts || 0) < 1,
    canSeeLeaderboard: hasFullAccess,

    // Tick stays payer-only
    showTick: isPaid,
  };
}

// ---------- Upgrade modal (used everywhere) ----------
function showUpgradeModal(message) {
  document.querySelector('#upgradeModalRoot')?.remove();

  const modal = document.createElement('div');
  modal.id = 'upgradeModalRoot';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;">
      <div style="background:#fff;max-width:420px;width:100%;padding:28px;border-radius:16px;text-align:center;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
        <div style="font-size:40px;margin-bottom:8px;">🔒</div>
        <h2 style="margin:0 0 12px;color:#0d4a35;">Unlock Full Access</h2>
        <p style="margin:0 0 22px;color:#0a1a12;line-height:1.6;">${message}</p>
        <button onclick="document.getElementById('upgradeModalRoot').remove(); openPaywallModal();"
  style="display:inline-block;background:#0d4a35;color:#c9f26b;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;border:none;cursor:pointer;">
  Upgrade Now
</button>
        <button onclick="document.getElementById('upgradeModalRoot').remove()"
          style="display:block;margin:14px auto 0;background:none;border:none;color:#6b7d77;cursor:pointer;font-size:13px;">
          Maybe later
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// ---------- Signup welcome modal ----------
function showTrialWelcomeModal() {
  document.querySelector('#trialWelcomeRoot')?.remove();

  const modal = document.createElement('div');
  modal.id = 'trialWelcomeRoot';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;">
      <div style="background:#fff;max-width:460px;width:100%;padding:30px;border-radius:16px;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
        <div style="text-align:center;font-size:44px;margin-bottom:6px;">🎉</div>
        <h2 style="margin:0 0 14px;color:#0d4a35;text-align:center;">Welcome to AIM360!</h2>
        <p style="margin:0 0 16px;color:#0a1a12;line-height:1.7;">Your free trial unlocks:</p>
        <ul style="margin:0 0 20px;padding-left:22px;line-height:2;color:#0a1a12;">
          <li>✅ <strong>1 free exam</strong> session</li>
          <li>✅ <strong>1 free practice</strong> session</li>
          <li>🔒 Leaderboard — <em>upgrade to unlock</em></li>
        </ul>
        <p style="margin:0 0 20px;color:#6b7d77;line-height:1.6;font-size:14px;">
          Upgrade anytime to unlock unlimited exams, unlimited practice, and the leaderboard.
        </p>
        <button onclick="document.getElementById('trialWelcomeRoot').remove()"
          style="width:100%;background:#0d4a35;color:#c9f26b;border:none;padding:14px;border-radius:10px;font-weight:700;cursor:pointer;font-size:15px;">
          Got it — let's go
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// ---------- Increment helpers ----------
async function recordExamAttempt() {
  await supabaseClient.rpc('increment_exam_attempt');
}

async function recordPracticeAttempt() {
  await supabaseClient.rpc('increment_practice_attempt');
}