// functions/api/claim.js
// Purpose:
//  - Bind a paid PaymentIntent (pi_...) to the *paying device*.
//  - Client provides claim secret via URL fragment (#c=...) and sends it in a header.
//  - Server verifies payment, verifies claim secret, mints/stores deviceToken (if needed),
//    and sets an auth cookie eternal_device=<deviceToken>.
//
// IMPORTANT SECURITY PROPERTY:
//  - The claim secret must never be returned by /api/status.
//  - The claim secret should only exist client-side via URL fragment and never be logged by the server.

export async function onRequestPost({ request, env }) {
  const kv = env.ETERNAL_KV;
  if (!kv) return text("Missing ETERNAL_KV binding", 500);

  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) return text("Missing STRIPE_SECRET_KEY", 500);

  const url = new URL(request.url);
  const pi =
    url.searchParams.get("pi") ||
    url.searchParams.get("payment_intent") ||
    url.searchParams.get("session_id") ||
    "";

  if (!pi) return text("Missing pi", 400);

  // Claim secret must be provided in a header (derived from URL fragment)
  const claim = (request.headers.get("x-eternal-claim") || "").trim();
  if (!claim) return text("Missing claim", 401);

  // Load existing KV record (created in /api/create-intent)
  let rec = safeJson(await kv.get(pi)) || null;

  // If record missing, allow fallback for older flows:
  // create a minimal record so we can still claim after payment.
  if (!rec || typeof rec !== "object") {
    rec = { paid: false, consumed: false, createdAt: Date.now(), stripeStatus: "unknown" };
  }

  // Verify payment with Stripe (source of truth)
  const stripeResp = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi)}`,
    { headers: { Authorization: `Bearer ${stripeKey}` } }
  );

  const stripeData = await stripeResp.json().catch(() => ({}));
  if (!stripeResp.ok) return text("Stripe verify failed", 502);

  const paid = stripeData.status === "succeeded";
  if (!paid) return text("Not paid", 402);

  // Verify claim secret matches what we stored at intent creation time
  // If claimSecret is missing in KV, treat as unclaimable (forces fresh flow).
  if (!rec.claimSecret || typeof rec.claimSecret !== "string") {
    return text("CLAIM_NOT_AVAILABLE", 409);
  }
  if (!timingSafeEqualStr(rec.claimSecret, claim)) {
    return text("Invalid claim", 401);
  }

  // If already consumed, we can still set the cookie (harmless) but playback will be blocked.
  const consumed = !!rec.consumed;

  // Ensure device token exists
  if (!rec.deviceToken || typeof rec.deviceToken !== "string" || rec.deviceToken.length < 16) {
    rec.deviceToken = mintToken();
  }

  // Mark claimed (optional)
  rec.paid = true;
  rec.stripeStatus = stripeData.status;
  rec.updatedAt = Date.now();
  rec.claimedAt = rec.claimedAt || Date.now();
  rec.consumed = consumed;

  // OPTIONAL: invalidate claim secret after successful claim to prevent re-binding.
  // This enforces "device-bound" strictly. (If you ever want a “grace rebind”, we’d change this.)
  rec.claimSecret = null;

  await kv.put(pi, JSON.stringify(rec));

  // Set cookie for /api/audio gating.
  // HttpOnly prevents JS from reading it (good); SameSite=Lax is fine for same-site flows.
  const cookie = buildCookie("eternal_device", rec.deviceToken, {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: "/",
    sameSite: "Lax",
    secure: true,
    httpOnly: true,
  });

  return new Response(
    JSON.stringify({ ok: true, paid: true, consumed, claimed: true }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "set-cookie": cookie,
      },
    }
  );
}

function text(msg, status = 200) {
  return new Response(msg, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function mintToken() {
  const uuid = crypto.randomUUID();
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return `${uuid}.${hex}`;
}

function buildCookie(name, value, opts) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.secure) parts.push("Secure");
  if (opts.httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
}

// Timing-safe-ish string compare (helps avoid trivial oracle attacks)
function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.length !== bb.length) return false;
  // crypto.subtle is available in Workers, but simplest is constant-time loop:
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
