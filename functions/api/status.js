// functions/api/status.js
export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const sessionId = (url.searchParams.get("session_id") || "").trim();

    if (!sessionId) {
      return json({ ok: true, state: "locked", reason: "missing_session_id" }, 200);
    }

    const stripeKey = (env.STRIPE_SECRET_KEY || "").trim();
    if (!stripeKey) {
      return json({ ok: false, state: "error", error: "Missing STRIPE_SECRET_KEY env var" }, 500);
    }

    const resp = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${stripeKey}` } }
    );

    const raw = await resp.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

    if (!resp.ok) {
      return json({ ok: false, state: "error", error: "Stripe request failed", stripe: data }, 502);
    }

    const payment_status = data?.payment_status || null;
    const paid = payment_status === "paid";

    return json({
      ok: true,
      state: paid ? "unlocked" : "locked",
      paid,
      payment_status,
      // Helpful debug fields:
      status: data?.status || null,
      id: data?.id || sessionId,
    }, 200);

  } catch (err) {
    return json({ ok: false, state: "error", error: String(err?.message || err) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
