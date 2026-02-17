// functions/api/audio.js
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  // Accept PaymentIntent id (pi_...) OR legacy session_id
  const pi =
    url.searchParams.get("pi") ||
    url.searchParams.get("payment_intent") ||
    url.searchParams.get("session_id") ||
    "";

  if (!pi) return new Response("Missing pi/session_id", { status: 400 });

  const kv = env.ETERNAL_KV;
  if (!kv) return new Response("Missing ETERNAL_KV binding", { status: 500 });

  let st = safeJson(await kv.get(pi)) || null;

  // If unknown but looks like a PaymentIntent, verify with Stripe and cache *paid/consumed only*.
  // CRITICAL: DO NOT mint deviceToken here. That must happen only in /api/claim.
  if ((!st || !st.paid) && pi.startsWith("pi_")) {
    const ok = await verifyAndCachePaymentIntent(pi, env, kv);
    if (ok) st = safeJson(await kv.get(pi)) || st;
  }

  if (!st || !st.paid) return new Response("Not paid", { status: 402 });
  if (st.consumed) return new Response("Already consumed", { status: 403 });

  // ---- Device-bound token gating (cookie transport) ----
  // Cookie is set ONLY by /api/claim after verifying claimSecret from URL fragment.
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const deviceCookie = (cookies.eternal_device || "").trim();

  // If token hasn’t been minted yet (new PI not claimed, or older KV), refuse and require claim.
  if (!st.deviceToken || typeof st.deviceToken !== "string" || st.deviceToken.length < 16) {
    return new Response("DEVICE_TOKEN_REQUIRED", { status: 401 });
  }

  if (!deviceCookie || deviceCookie !== st.deviceToken) {
    return new Response("DEVICE_TOKEN_REQUIRED", { status: 401 });
  }
  // -----------------------------------------------

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

  const resp = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi)}`,
    { headers: { Authorization: `Bearer ${stripeKey}` } }
  );

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return false;

  if (data.status !== "succeeded") return false;

  const existing = safeJson(await kv.get(pi)) || {};

  // Cache paid state, but DO NOT add deviceToken here.
  // deviceToken must only be minted by /api/claim after claimSecret validation.
  const rec = {
    ...existing,
    paid: true,
    consumed: !!existing.consumed,
    createdAt: existing.createdAt || Date.now(),
    stripeStatus: data.status,
    updatedAt: Date.now(),
  };

  await kv.put(pi, JSON.stringify(rec));
  return true;
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}
