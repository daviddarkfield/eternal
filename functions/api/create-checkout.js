export async function onRequestPost({ request, env }) {
  const origin = new URL(request.url).origin;

  // Where Stripe sends the user after checkout
  const successUrl = `${origin}/?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${origin}/`;

  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const body = new URLSearchParams();

  // Core Checkout settings
  body.set("mode", "payment");
  body.set("success_url", successUrl);
  body.set("cancel_url", cancelUrl);

  // ✅ Force Checkout to render in dark mode (matches your site aesthetic)
  body.set("ui_mode", "hosted"); // default; explicit for clarity
  body.set("theme", "dark");

  // Price: $1.99 USD (Stripe uses cents)
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][unit_amount]", "199");
  body.set("line_items[0][price_data][product_data][name]", "ETERNAL — listen now");
  body.set("line_items[0][price_data][product_data][description]", "Immersive audio experience");

  // Optional metadata (handy later)
  body.set("metadata[product]", "ETERNAL");

  // Optional UX tightening (safe defaults)
  // If you *want* emails collected by Stripe:
  // body.set("customer_creation", "if_required");

  // If you want to require an email (usually good):
  // body.set("customer_email", ""); // can't set blank; Stripe collects it anyway on Checkout

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
    return new Response(JSON.stringify({ error: data }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ url: data.url }), {
    headers: { "content-type": "application/json" },
  });
}
