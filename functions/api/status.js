export async function onRequestGet({ env, request }) {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) {
      return new Response(JSON.stringify({ state: "locked" }), {
        headers: { "content-type": "application/json" }
      });
    }
  
    const key = `eternal:session:${sessionId}`;
    const raw = await env.ETERNAL_KV.get(key);
    if (!raw) {
      return new Response(JSON.stringify({ state: "unpaid" }), {
        headers: { "content-type": "application/json" }
      });
    }
  
    const rec = JSON.parse(raw);
    const now = Date.now();
  
    if (rec.completedAt && rec.completedAt > 0) {
      return new Response(JSON.stringify({ state: "consumed" }), {
        headers: { "content-type": "application/json" }
      });
    }
  
    if (rec.expiresAt && now > rec.expiresAt) {
      return new Response(JSON.stringify({ state: "expired" }), {
        headers: { "content-type": "application/json" }
      });
    }
  
    return new Response(JSON.stringify({ state: "paid" }), {
      headers: { "content-type": "application/json" }
    });
  }
  