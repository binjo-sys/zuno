import { DurableObject } from 'cloudflare:workers';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const now = () => Date.now();
const id = () => crypto.randomUUID();
const normalizePhone = (value) => {
  const raw = String(value || '').replace(/[\s()-]/g, '');
  if (/^0\d{9}$/.test(raw)) return '+254' + raw.slice(1);
  if (/^254\d{9}$/.test(raw)) return '+' + raw;
  if (/^\+254\d{9}$/.test(raw)) return raw;
  throw new Error('Enter a valid Kenyan phone number.');
};
const hex = (bytes) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join('');
async function hashPassword(password, salt = crypto.randomUUID()) {
  const data = new TextEncoder().encode(salt + ':' + password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return `${salt}:${hex(digest)}`;
}
async function verifyPassword(password, stored) {
  const [salt] = String(stored).split(':');
  return (await hashPassword(password, salt)) === stored;
}
async function getUser(request, env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return env.DB.prepare(`SELECT u.id,u.phone,u.name,u.avatar_key FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?`).bind(token, now()).first();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, '');
    try {
      if (request.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS' }});
      if (path === '/health') return json({ ok:true, service:'zuno-api', time:now() });

      if (request.method === 'POST' && path === '/auth/register') {
        const { name, phone, password } = await request.json();
        if (!name?.trim() || !password || password.length < 8) return json({ error:'Name and an 8+ character password are required.' },400);
        const normalized = normalizePhone(phone);
        const exists = await env.DB.prepare('SELECT id FROM users WHERE phone=?').bind(normalized).first();
        if (exists) return json({ error:'A ZUNO account already exists for this phone number.' },409);
        const userId = id(), timestamp = now();
        await env.DB.prepare('INSERT INTO users(id,phone,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(userId,normalized,name.trim(),await hashPassword(password),timestamp,timestamp).run();
        const sessionId=id();
        await env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(sessionId,userId,timestamp+2592000000,timestamp).run();
        return json({ token:sessionId, user:{id:userId,phone:normalized,name:name.trim(),avatarKey:null} },201);
      }

      if (request.method === 'POST' && path === '/auth/login') {
        const { phone, password } = await request.json();
        const normalized=normalizePhone(phone);
        const user=await env.DB.prepare('SELECT * FROM users WHERE phone=?').bind(normalized).first();
        if (!user || !(await verifyPassword(password,user.password_hash))) return json({ error:'Incorrect phone number or password.' },401);
        const sessionId=id(), timestamp=now();
        await env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(sessionId,user.id,timestamp+2592000000,timestamp).run();
        return json({ token:sessionId,user:{id:user.id,phone:user.phone,name:user.name,avatarKey:user.avatar_key} });
      }

      const user=await getUser(request,env);
      if (!user) return json({error:'Authentication required.'},401);
      if (request.method==='GET' && path==='/me') return json({user});
      if (request.method==='POST' && path==='/auth/logout') {
        const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
        await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(token).run();
        return json({ok:true});
      }
      if (request.method==='POST' && path==='/profile/avatar') {
        const contentType=request.headers.get('content-type')||'';
        if (!contentType.startsWith('image/')) return json({error:'Upload an image.'},400);
        const bytes=await request.arrayBuffer();
        if (bytes.byteLength>5*1024*1024) return json({error:'Profile picture must be 5MB or smaller.'},413);
        const key=`avatars/${user.id}/${crypto.randomUUID()}`;
        await env.MEDIA.put(key,bytes,{httpMetadata:{contentType}});
        if (user.avatar_key) await env.MEDIA.delete(user.avatar_key);
        await env.DB.prepare('UPDATE users SET avatar_key=?,updated_at=? WHERE id=?').bind(key,now(),user.id).run();
        return json({avatarKey:key});
      }
      if (request.method==='GET' && path.startsWith('/media/')) {
        const key=decodeURIComponent(path.slice('/media/'.length));
        const object=await env.MEDIA.get(key);
        if (!object) return new Response('Not found',{status:404});
        return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'application/octet-stream','cache-control':'private, max-age=3600'}});
      }
      return json({error:'Not found'},404);
    } catch (error) { return json({error:error.message||'Server error'},500); }
  }
};

export class ChatRoom extends DurableObject {
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required',{status:426});
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null,{status:101,webSocket:pair[0]});
  }
  async webSocketMessage(ws,message) {
    const payload=JSON.stringify({type:'message',payload:message,at:now()});
    for (const client of this.ctx.getWebSockets()) client.send(payload);
  }
  async webSocketClose(ws,code,reason) { ws.close(code,reason); }
}
