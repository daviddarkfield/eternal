export async function onRequestPost({ env, request }) {
    const origin = new URL(request.url).origin;
  
    // Where Stripe should send the user after checkout
    const successUrl = env.SUCCESS_URL || `${origin}/?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = env.CANCEL_URL  || `${origin}/`;
  
    const body = new URLSearchParams();
    body.set("mode", "payment");
    body.set("success_url", successUrl);
    body.set("cancel_url", cancelUrl);
  
    // 1 item @ $1.00 USD
    body.set("line_items[0][quantity]", "1");
    body.set("line_items[0][price_data][currency]", "usd");
    body.set("line_items[0][price_data][unit_amount]", "100");
    body.set("line_items[0][price_data][product_data][name]", "ETERNAL (one-time listen)");
    body.set("line_items[0][price_data][product_data][description]", "Immersive audio experience");
  
    // Optional: helps later if you want to filter sessions
    body.set("metadata[product]", "ETERNAL");
  
    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body
    });
  
    const data = await resp.json();
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: data }), { status: 500 });
    }
  
    return new Response(JSON.stringify({ url: data.url }), {
      headers: { "content-type": "application/json" }
    });
  }
  