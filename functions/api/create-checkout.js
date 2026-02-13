export async function onRequestPost({ request, env }) {
  const origin = new URL(request.url).origin;

  const successUrl = `${origin}/?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${origin}/`;

  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }), { status: 500 });
  }

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", successUrl);
  body.set("cancel_url", cancelUrl);

  // 1 item @ $1.99 USD  (Stripe uses cents)
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][unit_amount]", "199");
  body.set("line_items[0][price_data][product_data][name]", "ETERNAL — listen now");
  body.set("metadata[product]", "ETERNAL");

  const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    return new Response(JSON.stringify({ error: data }), { status: 500 });
  }

  return new Response(JSON.stringify({ url: data.url }), {
    headers: { "content-type": "application/json" },
  });
}
