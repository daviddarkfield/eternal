export async function onRequestGet({ env }) {
  const publishableKey = env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return new Response(JSON.stringify({ error: "Missing STRIPE_PUBLISHABLE_KEY" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ publishableKey }), {
    headers: { "content-type": "application/json" },
  });
}
