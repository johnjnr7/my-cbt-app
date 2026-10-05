import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL       = Deno.env.get('FROM_EMAIL') || 'AIM360 <onboarding@resend.dev>';
const WEBHOOK_SECRET   = Deno.env.get('WEBHOOK_SECRET')!;

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeFirstName(raw: string): string {
  if (!raw) return 'Scholar';
  const first = String(raw).trim().split(/\s+/)[0] || '';
  const cleaned = first.replace(/[^A-Za-z\-']/g, '');
  if (cleaned.length < 2) return 'Scholar';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const incoming = req.headers.get('x-webhook-secret');
  if (!incoming || incoming !== WEBHOOK_SECRET) {
    console.warn('send-welcome-email: rejected — bad or missing secret');
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = await req.json();
    const record = payload?.record;

    if (!record?.email || typeof record.email !== 'string') {
      return json({ skipped: 'no valid email' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) {
      return json({ skipped: 'invalid email format' });
    }

    const firstName = safeFirstName(record.full_name || '');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: record.email,
        subject: `Welcome to AIM360, ${firstName} 🎉`,
        html: renderWelcome(firstName),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('send-welcome-email: Resend error', res.status, err);
      return json({ error: 'send failed' }, 500);
    }

    return json({ success: true });
  } catch (e) {
    console.error('send-welcome-email error:', (e as Error).message);
    return json({ error: 'internal error' }, 500);
  }
});

function renderWelcome(name: string) {
  const safe = escapeHtml(name);
  return `<!DOCTYPE html><html><body style="margin:0;background:#f4f5f2;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
      <div style="background:#0d4a35;color:#fff;padding:20px 24px;border-radius:14px 14px 0 0;">
        <div style="font-weight:800;font-size:18px;letter-spacing:-0.02em;">AIM360</div>
        <div style="font-size:11px;letter-spacing:0.16em;color:#c9f26b;font-weight:700;margin-top:2px;">JAMB PREP</div>
      </div>
      <div style="background:#fff;padding:32px 24px;border:1px solid #e4e7e2;border-top:none;border-radius:0 0 14px 14px;">
        <h1 style="margin:0 0 16px;font-size:22px;color:#0a1a12;">Welcome, ${safe} 🎉</h1>
        <p style="margin:0 0 14px;line-height:1.6;color:#0a1a12;">
          You just joined <strong>AIM360</strong> — the smartest way to prep for JAMB.
        </p>
        <p style="margin:0 0 14px;line-height:1.6;color:#0a1a12;">
          Here's how to get the most out of your account:
        </p>
        <ul style="margin:0 0 20px;padding-left:20px;line-height:1.8;color:#0a1a12;">
          <li>Take a practice test to see where you stand</li>
          <li>Review your weak subjects daily</li>
          <li>Track your progress and watch your score climb</li>
          <li>Virtual Classroom Access (Weekly Sessions)</li>
        </ul>
        <div style="text-align:center;margin:28px 0;">
          <a href="https://aim360.com.ng" style="display:inline-block;background:#0d4a35;color:#c9f26b;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;">
            Start Practicing →
          </a>
        </div>
        <p style="margin:0;line-height:1.6;color:#0a1a12;font-weight:600;">
          Keep pushing,<br>The AIM360 Team
        </p>
        <hr style="border:none;border-top:1px solid #e4e7e2;margin:24px 0 16px;">
        <p style="font-size:12px;color:#6b7d77;margin:0;">AIM360 — JAMB Prep · Keep pushing.</p>
      </div>
    </div>
  </body></html>`;
}