import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') || 'AIM360 <onboarding@resend.dev>';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const auth = req.headers.get('Authorization');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = auth?.replace('Bearer ', '');
    const { data: { user } } = await sb.auth.getUser(token!);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { data: adminRow } = await sb
      .from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!adminRow) return json({ error: 'Forbidden' }, 403);

    const { subject, body, filter = 'all' } = await req.json();
    if (!subject || !body) return json({ error: 'Missing subject or body' }, 400);

    let query = sb.from('subscriptions').select('email, full_name, status, current_period_end');
    if (filter === 'active') {
      query = query.eq('status', 'active').gt('current_period_end', new Date().toISOString());
    } else if (filter === 'trial') {
      query = query.eq('status', 'trial');
    } else if (filter === 'expired') {
      query = query.eq('status', 'expired');
    }

    const { data: recipients, error } = await query;
    if (error) return json({ error: error.message }, 500);

    let sent = 0, failed = 0;
    const recipientsList = recipients || [];

    for (const r of recipientsList) {
      if (!r.email) continue;
      const firstName = (r.full_name || '').split(' ')[0] || 'superhuman';
      const html = renderEmail(body.replace(/\{\{name\}\}/g, firstName), firstName);
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: FROM_EMAIL, to: r.email, subject, html }),
        });
        if (res.ok) sent++; else failed++;
      } catch { failed++; }
    }

    await sb.from('email_campaigns').insert({
      subject, body,
      recipient_count: sent,
      recipient_filter: filter,
      sent_by: user.id,
    });

    return json({ success: true, sent, failed, total: recipientsList.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function renderEmail(body: string, name: string) {
  const paragraphs = body.split('\n').filter(Boolean).map(p =>
    `<p style="margin:0 0 14px;line-height:1.6;color:#0a1a12;">${p}</p>`
  ).join('');

  return `<!DOCTYPE html><html><body style="margin:0;background:#f4f5f2;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
      <div style="background:#0d4a35;color:#fff;padding:20px 24px;border-radius:14px 14px 0 0;">
        <div style="font-weight:800;font-size:18px;letter-spacing:-0.02em;">AIM360</div>
        <div style="font-size:11px;letter-spacing:0.16em;color:#c9f26b;font-weight:700;margin-top:2px;">JAMB PREP</div>
      </div>
      <div style="background:#fff;padding:28px 24px;border:1px solid #e4e7e2;border-top:none;border-radius:0 0 14px 14px;">
        <p style="margin:0 0 14px;color:#0a1a12;font-weight:600;">Hi ${name},</p>
        ${paragraphs}
        <hr style="border:none;border-top:1px solid #e4e7e2;margin:24px 0 16px;">
        <p style="font-size:12px;color:#6b7d77;margin:0;">AIM360 — JAMB Prep · Keep pushing.</p>
      </div>
    </div>
  </body></html>`;
}