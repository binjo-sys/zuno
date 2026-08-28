import { DurableObject } from 'cloudflare:workers';

type Env = {
  DB: D1Database;
  CHAT_ROOM: DurableObjectNamespace<ChatRoom>;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string;
  password_hash: string;
  created_at: number;
};

const SESSION_DAYS = 30;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    },
  });

function normalizePhone(value = '') {
  const raw = value.trim().replace(/[\s()-]/g, '');
  if (raw.startsWith('+254')) return raw;
  if (raw.startsWith('254')) return `+${raw}`;
  if (raw.startsWith('0')) return `+254${raw.slice(1)}`;
  return raw;
}

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function publicUser(row: Pick<UserRow, 'id' | 'name' | 'phone' | 'avatar' | 'created_at'>) {
  return { id: row.id, name: row.name, phone: row.phone, avatar: row.avatar || '', createdAt: row.created_at };
}

async function createSession(env: Env, userId: string) {
  const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await hash(rawToken);
  await env.DB.prepare('INSERT INTO sessions (token_hash,user_id,created_at) VALUES (?,?,?)')
    .bind(tokenHash, userId, Date.now())
    .run();
  return rawToken;
}

async function authenticatedUser(request: Request, env: Env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  const tokenHash = await hash(token);
  const session = await env.DB.prepare(
    'SELECT s.user_id,u.id,u.name,u.email,u.phone,u.avatar,u.password_hash,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?',
  ).bind(tokenHash).first<UserRow>();

  if (!session) return null;
  if (Date.now() - session.created_at > SESSION_DAYS * 24 * 60 * 60 * 1000) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run();
    return null;
  }
  return { tokenHash, user: session };
}

async function requireUser(request: Request, env: Env) {
  const auth = await authenticatedUser(request, env);
  if (!auth) throw new Response(JSON.stringify({ error: 'Authentication required.' }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    },
  });
  return auth;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return json(null);
    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return json({ ok: true, service: 'zuno-api' });
      }

      if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        const body = await request.json<{ name?: string; phone?: string; password?: string; avatar?: string }>();
        const name = body.name?.trim();
        const phone = normalizePhone(body.phone);
        const password = body.password || '';
        const avatar = body.avatar || '';

        if (!name || !/^\+254[17]\d{8}$/.test(phone) || password.length < 6) {
          return json({ error: 'Enter your full name, a valid Kenyan phone number and a 6+ character password.' }, 400);
        }
        if (avatar.length > 1_500_000) return json({ error: 'Profile photo is too large.' }, 400);

        const existing = await env.DB.prepare('SELECT id FROM users WHERE phone=? OR email=?').bind(phone, phone).first<{ id: string }>();
        if (existing) return json({ error: 'An account with that phone number already exists.' }, 409);

        const id = crypto.randomUUID();
        const passwordHash = await hash(password);
        await env.DB.prepare(
          'INSERT INTO users (id,name,email,phone,avatar,password_hash,created_at) VALUES (?,?,?,?,?,?,?)',
        ).bind(id, name, phone, phone, avatar, passwordHash, Date.now()).run();

        const token = await createSession(env, id);
        return json({ user: { id, name, phone, avatar }, token }, 201);
      }

      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        const body = await request.json<{ phone?: string; password?: string }>();
        const phone = normalizePhone(body.phone);
        const password = body.password || '';
        if (!/^\+254[17]\d{8}$/.test(phone) || !password) {
          return json({ error: 'Enter a valid Kenyan phone number and password.' }, 400);
        }

        const row = await env.DB.prepare(
          'SELECT id,name,email,phone,avatar,password_hash,created_at FROM users WHERE phone=? OR email=?',
        ).bind(phone, phone).first<UserRow>();
        if (!row || row.password_hash !== await hash(password)) {
          return json({ error: 'Incorrect phone number or password.' }, 401);
        }

        const token = await createSession(env, row.id);
        return json({ user: publicUser(row), token });
      }

      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        const auth = await authenticatedUser(request, env);
        if (auth) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(auth.tokenHash).run();
        return json({ ok: true });
      }

      if (url.pathname === '/api/me' && request.method === 'GET') {
        const auth = await requireUser(request, env);
        return json({ user: publicUser(auth.user) });
      }

      if (url.pathname === '/api/me' && request.method === 'PATCH') {
        const auth = await requireUser(request, env);
        const body = await request.json<{ name?: string; avatar?: string }>();
        const name = body.name?.trim();
        const avatar = body.avatar ?? auth.user.avatar ?? '';
        if (name && name.length < 2) return json({ error: 'Name is too short.' }, 400);
        if (avatar.length > 1_500_000) return json({ error: 'Profile photo is too large.' }, 400);

        await env.DB.prepare('UPDATE users SET name=COALESCE(?,name), avatar=? WHERE id=?')
          .bind(name || null, avatar, auth.user.id).run();
        const row = await env.DB.prepare(
          'SELECT id,name,phone,avatar,created_at FROM users WHERE id=?',
        ).bind(auth.user.id).first<Pick<UserRow, 'id' | 'name' | 'phone' | 'avatar' | 'created_at'>>();
        return json({ user: row ? publicUser(row) : null });
      }

      if (url.pathname === '/api/users' && request.method === 'GET') {
        const auth = await requireUser(request, env);
        const q = url.searchParams.get('q')?.trim().toLowerCase() || '';
        const rows = q
          ? await env.DB.prepare(
              'SELECT id,name,phone,avatar,created_at FROM users WHERE id<>? AND (lower(name) LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 100',
            ).bind(auth.user.id, `%${q}%`, `%${q}%`).all<Pick<UserRow, 'id' | 'name' | 'phone' | 'avatar' | 'created_at'>>()
          : await env.DB.prepare(
              'SELECT id,name,phone,avatar,created_at FROM users WHERE id<>? ORDER BY name LIMIT 100',
            ).bind(auth.user.id).all<Pick<UserRow, 'id' | 'name' | 'phone' | 'avatar' | 'created_at'>>();
        return json({ users: rows.results.map(publicUser) });
      }

      if (url.pathname === '/api/messages' && request.method === 'GET') {
        const auth = await requireUser(request, env);
        const withUser = url.searchParams.get('with');
        if (!withUser) return json({ error: 'with is required.' }, 400);
        const rows = await env.DB.prepare(
          'SELECT id,sender_id,recipient_id,body,created_at FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY created_at ASC LIMIT 500',
        ).bind(auth.user.id, withUser, withUser, auth.user.id).all();
        return json({ messages: rows.results });
      }

      if (url.pathname === '/api/messages' && request.method === 'POST') {
        const auth = await requireUser(request, env);
        const body = await request.json<{ recipientId?: string; body?: string }>();
        const text = body.body?.trim() || '';
        const recipientId = body.recipientId || '';
        if (!recipientId || !text) return json({ error: 'recipientId and body are required.' }, 400);
        if (text.length > 5000) return json({ error: 'Message is too long.' }, 400);

        const recipient = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(recipientId).first<{ id: string }>();
        if (!recipient) return json({ error: 'User not found.' }, 404);

        const id = crypto.randomUUID();
        const createdAt = Date.now();
        await env.DB.prepare(
          'INSERT INTO messages (id,sender_id,recipient_id,body,created_at) VALUES (?,?,?,?,?)',
        ).bind(id, auth.user.id, recipientId, text, createdAt).run();

        const room = env.CHAT_ROOM.idFromName([auth.user.id, recipientId].sort().join(':'));
        await env.CHAT_ROOM.get(room).fetch('https://zuno.internal/broadcast', {
          method: 'POST',
          body: JSON.stringify({ id, senderId: auth.user.id, recipientId, body: text, createdAt }),
        });
        return json({ message: { id, senderId: auth.user.id, recipientId, body: text, createdAt } }, 201);
      }

      if (url.pathname === '/ws' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        const a = url.searchParams.get('a');
        const b = url.searchParams.get('b');
        const token = url.searchParams.get('token') || '';
        if (!a || !b || !token) return json({ error: 'a, b and token are required.' }, 400);
        const tokenHash = await hash(token);
        const session = await env.DB.prepare('SELECT user_id,created_at FROM sessions WHERE token_hash=?').bind(tokenHash).first<{ user_id: string; created_at: number }>();
        if (!session || session.user_id !== a || Date.now() - session.created_at > SESSION_DAYS * 24 * 60 * 60 * 1000) {
          return json({ error: 'Authentication required.' }, 401);
        }
        const room = env.CHAT_ROOM.idFromName([a, b].sort().join(':'));
        return env.CHAT_ROOM.get(room).fetch(request);
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error(JSON.stringify({ error: String(error), path: url.pathname }));
      return json({ error: 'Server error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

export class ChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request) {
    if (request.method === 'POST') {
      const message = await request.text();
      for (const ws of this.ctx.getWebSockets()) ws.send(message);
      return new Response('ok');
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    for (const conn of this.ctx.getWebSockets()) {
      if (conn !== ws) conn.send(typeof message === 'string' ? message : 'binary');
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
  }
}
