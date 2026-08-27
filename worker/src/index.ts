import { DurableObject } from 'cloudflare:workers';

type Env = { DB: D1Database; CHAT_ROOM: DurableObjectNamespace<ChatRoom> };

type AuthBody = { name?: string; email?: string; password?: string };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' } });
async function hash(value: string) { const bytes = new TextEncoder().encode(value); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''); }

export default { async fetch(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json(null);
  const url = new URL(request.url);
  try {
    if (url.pathname === '/api/health') return json({ ok: true, service: 'zuno-api' });
    if (url.pathname === '/api/auth/register' && request.method === 'POST') {
      const body = await request.json<AuthBody>(); const name = body.name?.trim(); const email = body.email?.trim().toLowerCase(); const password = body.password;
      if (!name || !email || !password || password.length < 6) return json({ error: 'Name, email and a 6+ character password are required.' }, 400);
      const id = crypto.randomUUID(); const passwordHash = await hash(password);
      await env.DB.prepare('INSERT INTO users (id,name,email,password_hash,created_at) VALUES (?,?,?,?,?)').bind(id,name,email,passwordHash,Date.now()).run();
      return json({ user: { id, name, email } }, 201);
    }
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      const body = await request.json<AuthBody>(); const email = body.email?.trim().toLowerCase(); const password = body.password;
      if (!email || !password) return json({ error: 'Email and password are required.' }, 400);
      const row = await env.DB.prepare('SELECT id,name,email,password_hash FROM users WHERE email=?').bind(email).first<{id:string,name:string,email:string,password_hash:string}>();
      if (!row || row.password_hash !== await hash(password)) return json({ error: 'Incorrect email or password.' }, 401);
      return json({ user: { id: row.id, name: row.name, email: row.email } });
    }
    if (url.pathname === '/api/users' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT id,name,email FROM users ORDER BY name LIMIT 100').all(); return json({ users: rows.results });
    }
    if (url.pathname === '/api/messages' && request.method === 'GET') {
      const me = url.searchParams.get('me'); const withUser = url.searchParams.get('with');
      if (!me || !withUser) return json({ error: 'me and with are required.' }, 400);
      const rows = await env.DB.prepare('SELECT id,sender_id,recipient_id,body,created_at FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY created_at ASC LIMIT 500').bind(me,withUser,withUser,me).all(); return json({ messages: rows.results });
    }
    if (url.pathname === '/api/messages' && request.method === 'POST') {
      const body = await request.json<{senderId?:string;recipientId?:string;body?:string}>();
      if (!body.senderId || !body.recipientId || !body.body?.trim()) return json({ error: 'senderId, recipientId and body are required.' }, 400);
      const id = crypto.randomUUID(); const createdAt = Date.now(); const text = body.body.trim();
      await env.DB.prepare('INSERT INTO messages (id,sender_id,recipient_id,body,created_at) VALUES (?,?,?,?,?)').bind(id,body.senderId,body.recipientId,text,createdAt).run();
      const room = env.CHAT_ROOM.idFromName([body.senderId,body.recipientId].sort().join(':')); await env.CHAT_ROOM.get(room).fetch('https://zuno.internal/broadcast', { method:'POST', body: JSON.stringify({ id, senderId:body.senderId, recipientId:body.recipientId, body:text, createdAt }) });
      return json({ message:{ id, senderId:body.senderId, recipientId:body.recipientId, body:text, createdAt } }, 201);
    }
    if (url.pathname === '/ws' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') { const a=url.searchParams.get('a'), b=url.searchParams.get('b'); if(!a||!b) return json({error:'a and b are required.'},400); const room=env.CHAT_ROOM.idFromName([a,b].sort().join(':')); return env.CHAT_ROOM.get(room).fetch(request); }
    return json({ error: 'Not found' }, 404);
  } catch (error) { console.error(JSON.stringify({ error: String(error), path: url.pathname })); return json({ error: 'Server error' }, 500); }
} } satisfies ExportedHandler<Env>;

export class ChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong')); }
  async fetch(request: Request) { if (request.method === 'POST') { const message = await request.text(); for (const ws of this.ctx.getWebSockets()) ws.send(message); return new Response('ok'); } const pair = new WebSocketPair(); const [client, server] = Object.values(pair); this.ctx.acceptWebSocket(server); return new Response(null,{status:101,webSocket:client}); }
  async webSocketMessage(ws: WebSocket, message: string|ArrayBuffer) { for (const conn of this.ctx.getWebSockets()) if(conn!==ws) conn.send(typeof message==='string'?message:'binary'); }
  async webSocketClose(ws: WebSocket, code: number, reason: string) { ws.close(code, reason); }
}
