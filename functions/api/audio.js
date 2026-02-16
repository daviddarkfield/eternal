export async function onRequestGet({ request, env }) {
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response("Missing STRIPE_SECRET_KEY", { status: 500 });
  }

  const url = new URL(request.url);
  const pi = url.searchParams.get("pi");
  if (!pi) return new Response("Missing pi", { status: 400 });

  // Verify payment intent succeeded
  const resp = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi)}`, {
    headers: { Authorization: `Bearer ${stripeKey}` }
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.status !== "succeeded") {
    return new Response("Payment not verified", { status: 403 });
  }

  // ---- Stream audio from R2 ----
  // You likely already have this part working. Keep your existing bucket binding + key.
  // Example assumes you bound an R2 bucket as env.ETERNAL_AUDIO and the object key is ETERNAL_BRAM3.m4a

  const key = "ETERNAL_BRAM3.m4a";

  if (!env.ETERNAL_AUDIO) {
    return new Response("Missing R2 binding ETERNAL_AUDIO", { status: 500 });
  }

  const obj = await env.ETERNAL_AUDIO.get(key);
  if (!obj) return new Response("Object not found", { status: 404 });

  return new Response(obj.body, {
    headers: {
      "Content-Type": "audio/mp4",
      "Cache-Control": "no-store",
      // Optional:
      // "Accept-Ranges": "bytes",
    }
  });
}
