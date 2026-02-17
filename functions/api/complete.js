// functions/api/complete.js
export async function onRequestPost({ request, env }) {
  const kv = env.ETERNAL_KV;
  if (!kv) return json({ ok: false, error: "Missing ETERNAL_KV binding" }, 500);

  let body = {};
  try {
    body = await request.json();
  } catch {}

  // Accept pi / payment_intent / session_id (legacy)
  const pi =
    (body && (body.pi || body.payment_intent || body.paymentIntent || body.session_id)) || "";

  if (!pi) return json({ ok: false, error: "Missing pi/payment_intent/session_id" }, 400);

  const prev = safeJson(await kv.get(pi)) || {};

  if (!prev.paid) {
    // If KV is missing but this looks like a PaymentIntent, try Stripe verify so completion still works.
    if (String(pi).startsWith("pi_")) {
      const ok = await verifyAndCachePaymentIntent(pi, env, kv);
      if (ok) {
        const refreshed = safeJson(await kv.get(pi)) || prev;
        if (refreshed && refreshed.paid) {
          return await markConsumed(pi, refreshed, kv);
        }
      }
    }
    return json({ ok: false, error: "Not paid" }, 402);
  }

  return await markConsumed(pi, prev, kv);
}

async function markConsumed(pi, prev, kv) {
  const next = {
    ...prev,
    paid: true,
    consumed: true,
    consumedAt: Date.now(),
  };

  await kv.put(pi, JSON.stringify(next));
  return json({ ok: true, id: pi, consumed: true });
}

async function verifyAndCachePaymentIntent(pi, env, kv) {
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) return false;

  const resp = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi)}`,
    { headers: { Authorization: `Bearer ${stripeKey}` } }
  );

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return false;
  if (data.status !== "succeeded") return false;

  const existing = safeJson(await kv.get(pi)) || {};
  const rec = {
    ...existing,
    paid: true,
    consumed: !!existing.consumed,
    createdAt: existing.createdAt || Date.now(),
    stripeStatus: data.status,
    updatedAt: Date.now(),
  };

  // If a device token already exists, keep it; otherwise mint (so /api/audio can enforce it)
  if (!rec.deviceToken || typeof rec.deviceToken !== "string" || rec.deviceToken.length < 16) {
    rec.deviceToken = mintToken();
  }

  await kv.put(pi, JSON.stringify(rec));
  return true;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function mintToken() {
  const uuid = crypto.randomUUID();
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return `${uuid}.${hex}`;
}
