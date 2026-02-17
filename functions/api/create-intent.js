// functions/api/create-intent.js
export async function onRequestPost({ env }) {
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, 500);
  }

  const kv = env.ETERNAL_KV;
  if (!kv) {
    return json({ ok: false, error: "Missing ETERNAL_KV binding" }, 500);
  }

  // Mint a one-time “claim” secret that will be passed ONLY via URL fragment (#c=...),
  // so it won't be sent to the server on link sharing and won’t appear in request logs.
  const claimSecret = mintSecret();

  const body = new URLSearchParams();
  body.set("amount", "199"); // $1.99
  body.set("currency", "usd");
  body.set("automatic_payment_methods[enabled]", "true");
  body.set("description", "ETERNAL — listen now");
  body.set("metadata[product]", "ETERNAL");

  // Optional: helpful for correlating in Stripe dashboard
  body.set("metadata[claim_hint]", claimSecret.slice(0, 10));

  const resp = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return json({ ok: false, error: data }, 500);
  }

  // Store initial KV record under PI id, including claimSecret.
  // Payment verification and device token minting happens later (in /api/claim and /api/audio).
  const pi = data.id;

  await kv.put(
    pi,
    JSON.stringify({
      paid: false,
      consumed: false,
      createdAt: Date.now(),
      stripeStatus: data.status || "requires_payment_method",
      claimSecret,
      // deviceToken will be minted ONLY after a successful claim
      // deviceToken: undefined
      claimedAt: 0,
    })
  );

  return json(
    {
      ok: true,
      id: pi,
      clientSecret: data.client_secret,
      claimSecret, // pay.html will redirect to /?pi=...#c=<claimSecret>
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

function mintSecret() {
  // Long unguessable secret; we’ll compare as a string in KV.
  const uuid = crypto.randomUUID();
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return `${uuid}.${hex}`;
}
