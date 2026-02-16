export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id") || "";

  if (!sessionId) return new Response("Missing session_id", { status: 400 });

  const kv = env.ETERNAL_KV;
  if (!kv) return new Response("Missing ETERNAL_KV binding", { status: 500 });

  // Check KV
  let st = safeJson(await kv.get(sessionId)) || null;

  // If unknown but looks like PaymentIntent, verify with Stripe and cache
  if ((!st || !st.paid) && sessionId.startsWith("pi_")) {
    const ok = await verifyAndCachePaymentIntent(sessionId, env, kv);
    if (ok) st = safeJson(await kv.get(sessionId)) || st;
  }

  if (!st || !st.paid) {
    return new Response("Not paid", { status: 402 });
  }

  if (st.consumed) {
    return new Response("Already consumed", { status: 403 });
  }

  // Proxy/redirect to your public R2 audio (simple approach)
  // If you want streaming from R2 direct, keep this.
  const audioUrl = env.AUDIO_URL || "https://pub-36766e8b326f482baab0a316132216e7.r2.dev/ETERNAL_BRAM3.m4a";

  const resp = await fetch(audioUrl);
  if (!resp.ok) return new Response("Audio fetch failed", { status: 502 });

  const headers = new Headers(resp.headers);
  headers.set("cache-control", "no-store");

  return new Response(resp.body, { status: 200, headers });
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

async function verifyAndCachePaymentIntent(piId, env, kv) {
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) return false;

  const resp = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(piId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${stripeKey}` }
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return false;

  if (data.status === "succeeded") {
    await kv.put(piId, JSON.stringify({
      paid: true,
      consumed: false,
      paidAt: Date.now(),
      kind: "payment_intent"
    }));
    return true;
  }
  return false;
}
