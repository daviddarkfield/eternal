export async function onRequestGet({ request, env }) {
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({ ok: false, error: "Missing STRIPE_SECRET_KEY" }), { status: 500 });
  }

  const url = new URL(request.url);
  const pi = url.searchParams.get("pi");

  if (!pi) {
    return new Response(JSON.stringify({ ok: true, state: "locked", paid: false }), {
      headers: { "content-type": "application/json" },
    });
  }

  const resp = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi)}`, {
    headers: { Authorization: `Bearer ${stripeKey}` }
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return new Response(JSON.stringify({ ok: false, state: "locked", paid: false, error: data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const paid = data.status === "succeeded";
  return new Response(JSON.stringify({
    ok: true,
    state: paid ? "unlocked" : "locked",
    paid,
    status: data.status,
    id: data.id,
  }), {
    headers: { "content-type": "application/json" },
  });
}
