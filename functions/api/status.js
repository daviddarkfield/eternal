// functions/api/status.js
// IMPORTANT: status must NEVER mint/return deviceToken.
// Otherwise any device with the shared ?pi=... URL can "self-heal" and become authorized.

export async function onRequestGet({ request, env }) {
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) return json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, 500);

  const kv = env.ETERNAL_KV;
  if (!kv) return json({ ok: false, error: "Missing ETERNAL_KV binding" }, 500);

  const url = new URL(request.url);
  const pi = url.searchParams.get("pi");

  if (!pi) return json({ ok: true, state: "locked", paid: false }, 200);

  // Ask Stripe (source of truth for payment status)
  const resp = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi)}`,
    { headers: { Authorization: `Bearer ${stripeKey}` } }
  );

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    // Keep 200 to avoid breaking client UI flows; include error payload for debugging
    return json({ ok: false, state: "locked", paid: false, error: data }, 200);
  }

  const paid = data.status === "succeeded";

  if (!paid) {
    return json(
      {
        ok: true,
        state: "locked",
        paid: false,
        status: data.status,
        id: data.id,
      },
      200
    );
  }

  // Paid: read KV to surface server-side consumed state (but DO NOT mint/return tokens here)
  const existingRaw = await kv.get(pi);
  const rec = safeJson(existingRaw, null) || {};
  const consumed = !!rec.consumed;

  // Optional: keep Stripe status fresh in KV if record exists (no secrets added here)
  if (existingRaw) {
    const next = {
      ...rec,
      paid: true,
      stripeStatus: data.status,
      updatedAt: Date.now(),
      consumed,
    };
    await kv.put(pi, JSON.stringify(next));
  }

  return json(
    {
      ok: true,
      state: consumed ? "consumed" : "unlocked",
      paid: true,
      consumed,
      status: data.status,
      id: data.id,
    },
    200
  );
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

function safeJson(s, fallback) {
  try {
    if (!s) return fallback;
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}
