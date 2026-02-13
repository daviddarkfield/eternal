// functions/api/audio.js
export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const sessionId = (url.searchParams.get("session_id") || "").trim();

    if (!sessionId) {
      return json({ ok: false, error: "Missing session_id" }, 400);
    }

    const stripeKey = (env.STRIPE_SECRET_KEY || "").trim();
    if (!stripeKey) {
      return json({ ok: false, error: "Missing STRIPE_SECRET_KEY env var" }, 500);
    }

    const audioUrl = (env.AUDIO_URL || "").trim();
    if (!audioUrl) {
      return json({ ok: false, error: "Missing AUDIO_URL env var" }, 500);
    }

    const resp = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${stripeKey}` } }
    );

    const raw = await resp.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

    if (!resp.ok) {
      return json({ ok: false, error: "Stripe request failed", stripe: data }, 502);
    }

    if (data?.payment_status !== "paid") {
      return json({ ok: false, error: "Not paid", payment_status: data?.payment_status || null }, 403);
    }

    return Response.redirect(audioUrl, 302);

  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
