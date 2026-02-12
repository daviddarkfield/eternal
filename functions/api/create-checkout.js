// functions/api/create-checkout.js

export async function onRequestPost({ env, request }) {
    const origin = new URL(request.url).origin;
  
    // Where Stripe should send the user after checkout
    const successUrl = env.SUCCESS_URL || `${origin}/?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = env.CANCEL_URL  || `${origin}/`;
  
    // Guard: env var must exist (prevents "undefined" Stripe key confusion)
    const stripeKey = env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: { message: "Missing STRIPE_SECRET_KEY in Cloudflare Pages env." } }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
  
    const body = new URLSearchParams();
    body.set("mode", "payment");
    body.set("success_url", successUrl);
    body.set("cancel_url", cancelUrl);
  
    // 1 item @ $1.00 USD
    body.set("line_items[0][quantity]", "1");
    body.set("line_items[0][price_data][currency]", "usd");
    body.set("line_items[0][price_data][unit_amount]", "100");
    body.set("line_items[0][price_data][product_data][name]", "ETERNAL — listen now");
    body.set("line_items[0][price_data][product_data][description]", "Immersive audio experience (one-time listen)");
  
    // Optional: helps later if you want to filter sessions
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
      return new Response(JSON.stringify({ error: data }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  
    return new Response(JSON.stringify({ url: data.url }), {
      headers: { "content-type": "application/json" },
    });
  }
  
