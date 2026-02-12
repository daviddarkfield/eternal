async function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let out = 0;
    for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return out === 0;
  }
  
  async function hmacSHA256Hex(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  
  function parseStripeSigHeader(sigHeader) {
    // Example: "t=...,v1=...,v0=..."
    const parts = Object.fromEntries(sigHeader.split(",").map(p => p.split("=").map(s => s.trim())));
    return { t: parts.t, v1: parts.v1 };
  }
  
  export async function onRequestPost({ env, request }) {
    const sig = request.headers.get("stripe-signature");
    if (!sig) return new Response("Missing signature", { status: 400 });
  
    const raw = await request.text();
    const { t, v1 } = parseStripeSigHeader(sig);
    if (!t || !v1) return new Response("Bad signature header", { status: 400 });
  
    const signedPayload = `${t}.${raw}`;
    const expected = await hmacSHA256Hex(env.STRIPE_WEBHOOK_SECRET, signedPayload);
  
    const ok = await timingSafeEqual(expected, v1);
    if (!ok) return new Response("Invalid signature", { status: 400 });
  
    const event = JSON.parse(raw);
  
    // We only care about successful Checkout completion
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const sessionId = session.id;
      const now = Date.now();
      const expiresAt = now + 24 * 60 * 60 * 1000;
  
      const key = `eternal:session:${sessionId}`;
  
      const record = {
        sessionId,
        paidAt: now,
        expiresAt,
        completedAt: 0
      };
  
      await env.ETERNAL_KV.put(key, JSON.stringify(record), {
        expirationTtl: 24 * 60 * 60 // KV auto-expire in 24h
      });
    }
  
    return new Response("ok", { status: 200 });
  }
  