import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')!;
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY         = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    if (!auth) return json({ error: 'Missing auth' }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = auth.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    const { reference } = await req.json();
    if (!reference) return json({ error: 'Missing reference' }, 400);

    const { data: existing } = await sb
      .from('payments').select('id').eq('reference', reference).maybeSingle();
    if (existing) return json({ error: 'Reference already used' }, 409);

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );
    const v = await res.json();

    if (!v.status || v.data?.status !== 'success') {
      return json({ error: 'Payment not successful', details: v }, 400);
    }
    const tx = v.data;

    if (tx.amount < 1000000) return json({ error: 'Insufficient amount' }, 400);

    const metaUserId = tx.metadata?.user_id;
    if (metaUserId && metaUserId !== user.id) {
      return json({ error: 'Reference does not belong to user' }, 403);
    }

    const now = new Date();
    const addDays = (d: Date, n: number) =>
      new Date(d.getTime() + n * 24 * 60 * 60 * 1000);

    await sb.from('payments').insert({
      user_id: user.id,
      email: tx.customer?.email,
      reference: tx.reference,
      amount: tx.amount,
      status: 'success',
      channel: tx.channel,
      currency: tx.currency,
      paid_at: tx.paid_at,
      metadata: tx.metadata,
    });

    const { data: sub } = await sb
      .from('subscriptions').select('*').eq('user_id', user.id).maybeSingle();

    const base = (sub?.current_period_end && new Date(sub.current_period_end) > now)
      ? new Date(sub.current_period_end)
      : now;
    const newEnd = addDays(base, 30);

    if (sub) {
      await sb.from('subscriptions').update({
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: newEnd.toISOString(),
        last_payment_at: now.toISOString(),
        last_payment_reference: tx.reference,
        total_paid: (sub.total_paid || 0) + tx.amount,
        updated_at: now.toISOString(),
      }).eq('user_id', user.id);
    } else {
      await sb.from('subscriptions').insert({
        user_id: user.id,
        email: tx.customer?.email,
        full_name: user.user_metadata?.full_name || '',
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: newEnd.toISOString(),
        last_payment_at: now.toISOString(),
        last_payment_reference: tx.reference,
        total_paid: tx.amount,
      });
    }

    await sb.from('activity_log').insert({
      user_id: user.id,
      event_type: 'payment_success',
      metadata: { amount: tx.amount, reference: tx.reference },
    });

    return json({ success: true, reference: tx.reference, periodEnd: newEnd });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});