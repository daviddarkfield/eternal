// functions/api/status.js
export async function onRequestGet({ request, env }) {
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, 500);
  }

  const kv = env.ETERNAL_KV;
  if (!kv) {
    return json({ ok: false, error: "Missing ETERNAL_KV binding" }, 500);
  }

  const url = new URL(request.url);
  const pi = url.searchParams.get("pi");

  if (!pi) {
    return json({ ok: true, state: "locked", paid: false }, 200);
  }

  // 1) Ask Stripe (source of truth for payment status)
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

  // If not paid, no KV mutation needed
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

  // 2) Paid: ensure KV record exists + has a deviceToken
  const existingRaw = await kv.get(pi);
  let rec = safeJson(existingRaw, null);

  if (!rec || typeof rec !== "object") {
    rec = {
      paid: true,
      consumed: false,
      stripeStatus: data.status,
      createdAt: Date.now(),
    };
  }

  // Normalize / keep up to date
  rec.paid = true;
  rec.stripeStatus = data.status;
  rec.updatedAt = Date.now();
  rec.consumed = !!rec.consumed;

  if (!rec.deviceToken || typeof rec.deviceToken !== "string" || rec.deviceToken.length < 16) {
    rec.deviceToken = mintToken();
  }

  await kv.put(pi, JSON.stringify(rec));

  return json(
    {
      ok: true,
      state: rec.consumed ? "consumed" : "unlocked",
      paid: true,
      consumed: rec.consumed,
      status: data.status,
      id: data.id,
      deviceToken: rec.deviceToken, // client stores in localStorage + mirrors into cookie
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

function mintToken() {
  // UUID + 32 bytes random hex -> long unguessable token
  const uuid = crypto.randomUUID();
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return `${uuid}.${hex}`;
}
