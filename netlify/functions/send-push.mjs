import webpush from 'web-push';

// Sends Web Push notifications. Called by the Apps Script reminder trigger with
// a batch of subscriptions. VAPID keys live in Netlify env (never in the client
// or the Sheet). Gated by a shared PUSH_SECRET.
export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  if (body.secret !== process.env.PUSH_SECRET) return json({ ok: false, error: 'unauthorized' }, 401);

  const { VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ ok: false, error: 'vapid not configured' }, 500);
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:ripple@example.com', VAPID_PUBLIC, VAPID_PRIVATE);

  const subscriptions = Array.isArray(body.subscriptions) ? body.subscriptions : [];
  const payload = JSON.stringify({ title: body.title || 'Ripple', body: body.body || '', url: body.url || '/' });

  const results = await Promise.allSettled(
    subscriptions.map((s) => webpush.sendNotification(s, payload))
  );

  let sent = 0;
  const gone = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') sent++;
    else if (r.reason && (r.reason.statusCode === 404 || r.reason.statusCode === 410)) gone.push(subscriptions[i]?.endpoint);
  });

  return json({ ok: true, sent, gone });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}
