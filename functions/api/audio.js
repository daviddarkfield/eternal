export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  // Accept BOTH, so we can move fully to PaymentIntents without breaking anything.
  const token =
    url.searchParams.get("pi") ||
    url.searchParams.get("payment_intent") ||
    url.searchParams.get("session_id") ||
    "";

  if (!token) return new Response("Missing pi/session_id", { status: 400 });

  const kv = env.ETERNAL_KV;
  if (!kv) return new Response("Missing ETERNAL_KV binding", { status: 500 });

  let st = safeJson(await kv.get(token)) || null;

  // If unknown but looks like a PaymentIntent, verify with Stripe and cache
  if ((!st || !st.paid) && token.startsWith("pi_")) {
    const ok = await verifyAndCachePaymentIntent(token, env, kv);
    if (ok) st = safeJson(await kv.get(token)) || st;
  }

  if (!st || !st.paid) return new Response("Not paid", { status: 402 });
  if (st.consumed) return new Response("Already consumed", { status: 403 });

  const audioUrl =
    env.AUDIO_URL ||
    "https://pub-36766e8b326f482baab0a316132216e7.r2.dev/ETERNAL_BRAM3.m4a";

  const resp = await fetch(audioUrl);
  if (!resp.ok) return new Response("Audio fetch failed", { status: 502 });

  const headers = new Headers(resp.headers);
  headers.set("content-type", headers.get("content-type") || "audio/mp4");
  headers.set("cache-control", "no-store");

  return new Response(resp.body, { status: 200, headers });
}

async function verifyAndCachePaymentIntent(pi, env, kv) {
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) return false;

  const resp = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi)}`, {
    headers: { Authorization: `Bearer ${stripeKey}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return false;

  const paid = data.status === "succeeded";
  if (!paid) return false;

  await kv.put(pi, JSON.stringify({
    paid: true,
    consumed: false,
    createdAt: Date.now(),
    stripeStatus: data.status
  }));
  return true;
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

