import { DurableObject } from "cloudflare:workers";

const CORS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: CORS });

const normalizePhone = (value = "") => {
  const raw = String(value).trim().replace(/[\s()-]/g, "");
  if (/^\+254[17]\d{8}$/.test(raw)) return raw;
  if (/^254[17]\d{8}$/.test(raw)) return `+${raw}`;
  if (/^0[17]\d{8}$/.test(raw)) return `+254${raw.slice(1)}`;
  return raw;
};

const hash = async (value) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  avatar: u.avatar || "",
  createdAt: u.created_at
});

async function ensureSchema(env) {
  const userCols = await env.DB.prepare("PRAGMA table_info(users)").all();
  const hasAvatar = (userCols.results || []).some((c) => c.name === "avatar");
  if (!hasAvatar) {
    await env.DB.exec(
      "ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''"
    );
  }

  // The live database's sessions table is: id, user_id, expires_at, created_at.
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages(sender_id, recipient_id, created_at);
  `);
}

async function sessionToken(env, userId) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const sessionId = await hash(token);
  const createdAt = Date.now();
  const expiresAt = createdAt + 30 * 24 * 60 * 60 * 1000;

  await env.DB
    .prepare(
      "INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)"
    )
    .bind(sessionId, userId, expiresAt, createdAt)
    .run();

  return token;
}

async function authByToken(token, env) {
  if (!token) return null;

  const sessionId = await hash(token);
  const row = await env.DB
    .prepare(`
      SELECT
        s.id AS session_id,
        s.user_id,
        s.expires_at,
        u.id,
        u.name,
        u.phone,
        u.avatar,
        u.password_hash,
        u.created_at,
        u.updated_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
    `)
    .bind(sessionId)
    .first();

  if (!row || Date.now() >= row.expires_at) {
    if (row) {
      await env.DB
        .prepare("DELETE FROM sessions WHERE id = ?")
        .bind(row.session_id)
        .run();
    }
    return null;
  }

  return {
    sessionId: row.session_id,
    user: row
  };
}

async function auth(request, env) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : "";
  return authByToken(token, env);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return json(null);

    const url = new URL(request.url);

    try {
      await ensureSchema(env);

      if (url.pathname === "/api/health") {
        return json({ ok: true, service: "zuno-api" });
      }

      if (
        url.pathname === "/api/auth/register" &&
        request.method === "POST"
      ) {
        const body = await request.json();
        const name = body.name?.trim() || "";
        const phone = normalizePhone(body.phone);
        const password = body.password || "";

        if (
          !name ||
          !/^\+254[17]\d{8}$/.test(phone) ||
          password.length < 6
        ) {
          return json(
            {
              error:
                "Enter your full name, valid Kenyan phone number and a 6+ character password."
            },
            400
          );
        }

        const existing = await env.DB
          .prepare("SELECT id FROM users WHERE phone = ?")
          .bind(phone)
          .first();

        if (existing) {
          return json(
            { error: "An account with that phone number already exists." },
            409
          );
        }

        const id = crypto.randomUUID();
        const now = Date.now();
        const passwordHash = await hash(password);

        await env.DB
          .prepare(`
            INSERT INTO users
              (id,phone,name,password_hash,avatar,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?)
          `)
          .bind(id, phone, name, passwordHash, "", now, now)
          .run();

        const token = await sessionToken(env, id);

        return json(
          {
            token,
            user: {
              id,
              name,
              phone,
              avatar: "",
              createdAt: now
            }
          },
          201
        );
      }

      if (
        url.pathname === "/api/auth/login" &&
        request.method === "POST"
      ) {
        const body = await request.json();
        const phone = normalizePhone(body.phone);
        const password = body.password || "";

        const user = await env.DB
          .prepare(`
            SELECT id,name,phone,avatar,password_hash,created_at,updated_at
            FROM users
            WHERE phone = ?
          `)
          .bind(phone)
          .first();

        if (!user) {
          return json({ error: "Incorrect phone number or password." }, 401);
        }

        if (user.password_hash !== (await hash(password))) {
          return json({ error: "Incorrect phone number or password." }, 401);
        }

        const token = await sessionToken(env, user.id);

        return json({
          token,
          user: publicUser(user)
        });
      }

      if (
        url.pathname === "/api/auth/logout" &&
        request.method === "POST"
      ) {
        const current = await auth(request, env);
        if (current) {
          await env.DB
            .prepare("DELETE FROM sessions WHERE id = ?")
            .bind(current.sessionId)
            .run();
        }
        return json({ ok: true });
      }

      const current = await auth(request, env);
      if (!current) {
        return json({ error: "Authentication required." }, 401);
      }

      if (url.pathname === "/api/me" && request.method === "GET") {
        return json({ user: publicUser(current.user) });
      }

      if (url.pathname === "/api/me" && request.method === "PATCH") {
        const body = await request.json();
        const name = body.name?.trim();
        const avatar = body.avatar || "";

        if (name && name.length < 2) {
          return json({ error: "Name is too short." }, 400);
        }
        if (avatar.length > 1500000) {
          return json({ error: "Profile photo is too large." }, 400);
        }

        await env.DB
          .prepare(`
            UPDATE users
            SET name = COALESCE(?, name),
                avatar = ?,
                updated_at = ?
            WHERE id = ?
          `)
          .bind(name || null, avatar, Date.now(), current.user.id)
          .run();

        const user = await env.DB
          .prepare("SELECT id,name,phone,avatar,created_at FROM users WHERE id = ?")
          .bind(current.user.id)
          .first();

        return json({ user: user ? publicUser(user) : null });
      }

      if (url.pathname === "/api/users" && request.method === "GET") {
        const q = url.searchParams.get("q")?.trim().toLowerCase() || "";
        const rows = q
          ? await env.DB
              .prepare(`
                SELECT id,name,phone,avatar,created_at
                FROM users
                WHERE id <> ?
                  AND (lower(name) LIKE ? OR phone LIKE ?)
                ORDER BY name
                LIMIT 100
              `)
              .bind(current.user.id, `%${q}%`, `%${q}%`)
              .all()
          : await env.DB
              .prepare(`
                SELECT id,name,phone,avatar,created_at
                FROM users
                WHERE id <> ?
                ORDER BY name
                LIMIT 100
              `)
              .bind(current.user.id)
              .all();

        return json({ users: rows.results.map(publicUser) });
      }

      if (url.pathname === "/api/messages" && request.method === "GET") {
        const withUser = url.searchParams.get("with");
        if (!withUser) return json({ error: "with is required." }, 400);

        const rows = await env.DB
          .prepare(`
            SELECT id,sender_id,recipient_id,body,created_at
            FROM messages
            WHERE
              (sender_id = ? AND recipient_id = ?)
              OR
              (sender_id = ? AND recipient_id = ?)
            ORDER BY created_at ASC
            LIMIT 500
          `)
          .bind(current.user.id, withUser, withUser, current.user.id)
          .all();

        return json({ messages: rows.results });
      }

      if (url.pathname === "/api/messages" && request.method === "POST") {
        const body = await request.json();
        const recipientId = body.recipientId || "";
        const messageBody = body.body?.trim() || "";

        if (!recipientId || !messageBody) {
          return json(
            { error: "recipientId and body are required." },
            400
          );
        }

        if (messageBody.length > 5000) {
          return json({ error: "Message is too long." }, 400);
        }

        const recipient = await env.DB
          .prepare("SELECT id FROM users WHERE id = ?")
          .bind(recipientId)
          .first();

        if (!recipient) {
          return json({ error: "User not found." }, 404);
        }

        const id = crypto.randomUUID();
        const createdAt = Date.now();

        await env.DB
          .prepare(`
            INSERT INTO messages
              (id,sender_id,recipient_id,body,created_at)
            VALUES (?,?,?,?,?)
          `)
          .bind(
            id,
            current.user.id,
            recipientId,
            messageBody,
            createdAt
          )
          .run();

        return json(
          {
            message: {
              id,
              senderId: current.user.id,
              recipientId,
              body: messageBody,
              createdAt
            }
          },
          201
        );
      }

      if (
        url.pathname === "/ws" &&
        request.headers.get("Upgrade")?.toLowerCase() === "websocket"
      ) {
        const otherUser = url.searchParams.get("b") || "";
        const token = url.searchParams.get("token") || "";
        const socketAuth = await authByToken(token, env);

        if (!socketAuth) {
          return json({ error: "Authentication required." }, 401);
        }
        if (!otherUser) {
          return json({ error: "b is required." }, 400);
        }

        const room = env.CHAT_ROOM.idFromName(
          [socketAuth.user.id, otherUser].sort().join(":")
        );

        return env.CHAT_ROOM.get(room).fetch(request);
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error(String(error));
      return json({ error: "Server error" }, 500);
    }
  }
};

export class ChatRoom extends DurableObject {
  async fetch(request) {
    if (request.method === "POST") {
      const message = await request.text();
      for (const ws of this.ctx.getWebSockets()) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
      return new Response("ok");
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async webSocketMessage(ws, message) {
    for (const conn of this.ctx.getWebSockets()) {
      if (conn !== ws && conn.readyState === WebSocket.OPEN) {
        conn.send(
          typeof message === "string" ? message : "binary"
        );
      }
    }
  }

  async webSocketClose(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch {}
  }
}
