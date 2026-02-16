export async function onRequestPost({ request, env }) {
  const kv = env.ETERNAL_KV;
  if (!kv) return json({ ok: false, error: "Missing ETERNAL_KV binding" }, 500);

  let body = {};
  try { body = await request.json(); } catch {}

  const sessionId = body.session_id || "";
  if (!sessionId) return json({ ok: false, error: "Missing session_id" }, 400);

  const prev = safeJson(await kv.get(sessionId)) || {};
  if (!prev.paid) {
    // Don't allow completing unpaid sessions
    return json({ ok: false, error: "Not paid" }, 402);
  }

  const next = {
    ...prev,
    paid: true,
    consumed: true,
    consumedAt: Date.now()
  };

  await kv.put(sessionId, JSON.stringify(next));
  return json({ ok: true, id: sessionId, consumed: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}
function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}
