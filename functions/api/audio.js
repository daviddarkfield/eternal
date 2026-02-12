export async function onRequestGet({ env, request }) {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) return new Response("Missing session_id", { status: 400 });
  
    const key = `eternal:session:${sessionId}`;
    const raw = await env.ETERNAL_KV.get(key);
    if (!raw) return new Response("Not paid", { status: 402 });
  
    const rec = JSON.parse(raw);
    const now = Date.now();
  
    if (rec.completedAt && rec.completedAt > 0) return new Response("Consumed", { status: 403 });
    if (rec.expiresAt && now > rec.expiresAt) return new Response("Expired", { status: 403 });
  
    // Fetch from R2 (store object as "eternal.m4a")
    const obj = await env.ETERNAL_R2.get("eternal.m4a");
    if (!obj) return new Response("Audio missing", { status: 500 });
  
    const headers = new Headers();
    headers.set("Content-Type", "audio/mp4");
    headers.set("Cache-Control", "no-store");
    if (obj.httpEtag) headers.set("ETag", obj.httpEtag);
  
    // Content-Length helps progress bar
    if (obj.size != null) headers.set("Content-Length", String(obj.size));
  
    return new Response(obj.body, { headers });
  }
  