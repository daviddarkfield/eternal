export async function onRequestPost({ env, request }) {
    const { session_id } = await request.json().catch(() => ({}));
    if (!session_id) return new Response("Missing session_id", { status: 400 });
  
    const key = `eternal:session:${session_id}`;
    const raw = await env.ETERNAL_KV.get(key);
    if (!raw) return new Response("Not found", { status: 404 });
  
    const rec = JSON.parse(raw);
    if (!rec.completedAt || rec.completedAt === 0) {
      rec.completedAt = Date.now();
      // keep same TTL behaviour; if it’s consumed, it can stay until KV expiry
      await env.ETERNAL_KV.put(key, JSON.stringify(rec));
    }
  
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" }
    });
  }
  