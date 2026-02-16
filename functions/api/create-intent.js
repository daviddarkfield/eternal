export async function onRequestPost({ env }) {
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }), { status: 500 });
  }

  const body = new URLSearchParams();
  body.set("amount", "199");              // $1.99
  body.set("currency", "usd");
  body.set("automatic_payment_methods[enabled]", "true");
  body.set("description", "ETERNAL — listen now");
  body.set("metadata[product]", "ETERNAL");

  const resp = await fetch("https://api.stripe.com/v1/payment_intents", {
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

  return new Response(JSON.stringify({ id: data.id, clientSecret: data.client_secret }), {
    headers: { "content-type": "application/json" },
  });
}
