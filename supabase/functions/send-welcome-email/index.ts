import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
console.log('KEY LENGTH:', RESEND_API_KEY?.length);
console.log('KEY PREFIX:', RESEND_API_KEY?.substring(0, 6));
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') || 'AIM360 <onboarding@resend.dev>';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const { email, name } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing email' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const firstName = (name || email.split('@')[0]).split(' ')[0];

    const html = `<!DOCTYPE html>
<html><body style="margin:0;background:#f4f5f2;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#0d4a35;color:#fff;padding:24px;border-radius:14px 14px 0 0;">
      <div style="font-weight:800;font-size:20px;letter-spacing:-0.02em;">AIM360</div>
      <div style="font-size:11px;letter-spacing:0.16em;color:#c9f26b;font-weight:700;margin-top:2px;">JAMB PREP</div>
    </div>
    <div style="background:#fff;padding:32px 28px;border:1px solid #e4e7e2;border-top:none;border-radius:0 0 14px 14px;">
      <h1 style="margin:0 0 16px;font-size:24px;color:#0a1a12;letter-spacing:-0.02em;">Welcome, ${firstName}! 🎉</h1>
      <p style="margin:0 0 14px;line-height:1.6;color:#0a1a12;">
        You just joined <strong>AIM360</strong> — your personal JAMB prep companion.
      </p>
      <p style="margin:0 0 14px;line-height:1.6;color:#0a1a12;">
        Here's what you can do right now:
      </p>
      <ul style="margin:0 0 20px;padding-left:20px;line-height:1.9;color:#0a1a12;">
        <li>Practice 4 subjects: Maths, Physics, English, Chemistry</li>
        <li>Track your streak and progress</li>
        <li>Unlock topics as you master them</li>
      </ul>
      <p style="margin:0 0 14px;line-height:1.6;color:#0a1a12;">
        Your <strong>first topic is free</strong>. When you're ready to unlock everything, upgrade to Pro for ₦10,000/month.
      </p>
      <a href="https://www.aim360.com.ng/" style="display:inline-block;background:#c9f26b;color:#0d4a35;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;margin-top:12px;">
        Start learning →
      </a>
      <hr style="border:none;border-top:1px solid #e4e7e2;margin:28px 0 16px;">
      <p style="font-size:12px;color:#6b7d77;margin:0;">
        You're receiving this because you signed up for AIM360. Keep pushing — 360 is achievable.
      </p>
    </div>
  </div>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: `Welcome to AIM360, ${firstName}! 🎉`,
        html,
      }),
    });

    const out = await res.json();
    console.log('Resend response:', out);

    return new Response(JSON.stringify({ success: res.ok, details: out }), {
      status: res.ok ? 200 : 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});