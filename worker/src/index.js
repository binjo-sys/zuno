import { DurableObject } from "cloudflare:workers";

const CORS={"content-type":"application/json","access-control-allow-origin":"*","access-control-allow-headers":"content-type, authorization","access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:CORS});
const normalizePhone=(value="")=>{const raw=String(value).trim().replace(/[\s()-]/g,"");if(/^\+254[17]\d{8}$/.test(raw))return raw;if(/^254[17]\d{8}$/.test(raw))return `+${raw}`;if(/^0[17]\d{8}$/.test(raw))return `+254${raw.slice(1)}`;return raw;};
const hash=async(value)=>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");};
const publicUser=u=>({id:u.id,name:u.name,phone:u.phone,avatar:u.avatar||"",username:u.username||"",about:u.about||"",createdAt:u.created_at,lastSeen:u.last_seen||0});
const validUsername=v=>typeof v==="string"&&/^[A-Za-z0-9_]{3,24}$/.test(v);
const publicVybe=r=>({id:r.id,body:r.body,image:r.image||"",createdAt:r.created_at,user:{id:r.user_id,name:r.name,username:r.username||"",avatar:r.avatar||""},likes:Number(r.likes||0),comments:Number(r.comments||0),shares:Number(r.shares||0),liked:Boolean(r.liked)});

async function sessionToken(env,userId){const token=crypto.randomUUID()+crypto.randomUUID();const sessionId=await hash(token);const createdAt=Date.now();const expiresAt=createdAt+30*24*60*60*1000;await env.DB.prepare("INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)").bind(sessionId,userId,expiresAt,createdAt).run();return token;}
async function authByToken(token,env){if(!token)return null;const sessionId=await hash(token);const row=await env.DB.prepare(`SELECT s.id AS session_id,s.user_id,s.expires_at,u.id,u.name,u.phone,u.avatar,u.username,u.about,u.last_seen,u.password_hash,u.created_at,u.updated_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?`).bind(sessionId).first();if(!row||Date.now()>=row.expires_at){if(row)await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(row.session_id).run();return null;}return {sessionId:row.session_id,user:row};}
const auth=async(request,env)=>{const h=request.headers.get("authorization")||"";const token=h.startsWith("Bearer ")?h.slice(7).trim():"";return authByToken(token,env);};

export default{async fetch(request,env){
  if(request.method==="OPTIONS")return json(null);
  const url=new URL(request.url);
  try{
    if(url.pathname==="/api/health")return json({ok:true,service:"zuno-api"});

    if(url.pathname==="/call-ws"&&request.headers.get("Upgrade")?.toLowerCase()==="websocket"){
      const token=url.searchParams.get("token")||"";
      const aa=await authByToken(token,env);
      if(!aa)return json({error:"Authentication required."},401);
      const room=env.CHAT_ROOM.idFromName(`call:${aa.user.id}`);
      return env.CHAT_ROOM.get(room).fetch(request);
    }

    if(url.pathname==="/api/auth/register"&&request.method==="POST"){
      const b=await request.json();
      const name=b.name?.trim()||"",phone=normalizePhone(b.phone),password=b.password||"",username=typeof b.username==="string"?b.username.trim():"",about=typeof b.about==="string"?b.about.trim():"";
      if(!name||!/^\+254[17]\d{8}$/.test(phone)||password.length<6)return json({error:"Enter your full name, valid Kenyan phone number and a 6+ character password."},400);
      if(username&&!validUsername(username))return json({error:"Username must be 3-24 characters using letters, numbers or underscores."},400);
      if(about.length>160)return json({error:"About must be 160 characters or fewer."},400);
      if(await env.DB.prepare("SELECT id FROM users WHERE phone=?").bind(phone).first())return json({error:"An account with that phone number already exists."},409);
      if(username&&await env.DB.prepare("SELECT id FROM users WHERE lower(username)=lower(?)").bind(username).first())return json({error:"That username is already taken."},409);
      const id=crypto.randomUUID(),now=Date.now();
      await env.DB.prepare("INSERT INTO users(id,phone,name,password_hash,avatar,username,about,last_seen,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,phone,name,await hash(password),"",username||null,about,now,now,now).run();
      const token=await sessionToken(env,id);
      return json({token,user:{id,name,phone,avatar:"",username,about,createdAt:now,lastSeen:now}},201);
    }

    if(url.pathname==="/api/auth/login"&&request.method==="POST"){
      const b=await request.json();const phone=normalizePhone(b.phone),password=b.password||"";
      const u=await env.DB.prepare("SELECT id,name,phone,avatar,username,about,last_seen,password_hash,created_at,updated_at FROM users WHERE phone=?").bind(phone).first();
      if(!u||u.password_hash!==await hash(password))return json({error:"Incorrect phone number or password."},401);
      const token=await sessionToken(env,u.id);const now=Date.now();
      await env.DB.prepare("UPDATE users SET last_seen=? WHERE id=?").bind(now,u.id).run();u.last_seen=now;
      return json({token,user:publicUser(u)});
    }

    if(url.pathname==="/api/auth/logout"&&request.method==="POST"){
      const a=await auth(request,env);
      if(a){await env.DB.prepare("UPDATE users SET last_seen=0 WHERE id=?").bind(a.user.id).run();await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(a.sessionId).run();}
      return json({ok:true});
    }

    const a=await auth(request,env);
    if(!a)return json({error:"Authentication required."},401);

    if(url.pathname==="/api/vybes"&&request.method==="GET"){
      const rows=await env.DB.prepare(`SELECT v.id,v.user_id,v.body,v.image,v.created_at,u.name,u.username,u.avatar,
        (SELECT COUNT(*) FROM vybe_likes l WHERE l.vybe_id=v.id) likes,
        (SELECT COUNT(*) FROM vybe_comments c WHERE c.vybe_id=v.id) comments,
        (SELECT COUNT(*) FROM vybe_shares s WHERE s.vybe_id=v.id) shares,
        EXISTS(SELECT 1 FROM vybe_likes ml WHERE ml.vybe_id=v.id AND ml.user_id=?) liked
        FROM vybes v JOIN users u ON u.id=v.user_id ORDER BY v.created_at DESC LIMIT 100`).bind(a.user.id).all();
      return json({vybes:rows.results.map(publicVybe)});
    }

    if(url.pathname==="/api/vybes"&&request.method==="POST"){
      const b=await request.json();const body=typeof b.body==="string"?b.body.trim():"";const image=typeof b.image==="string"?b.image:"";
      if(!body&&!image)return json({error:"Write something or add a photo."},400);
      if(body.length>2000)return json({error:"VYBE text must be 2000 characters or fewer."},400);
      if(image.length>1500000)return json({error:"Photo is too large. Choose an image under 1MB."},400);
      if(image&&!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(image))return json({error:"Unsupported image format."},400);
      const id=crypto.randomUUID(),now=Date.now();
      await env.DB.prepare("INSERT INTO vybes(id,user_id,body,image,created_at) VALUES(?,?,?,?,?)").bind(id,a.user.id,body,image,now).run();
      return json({vybe:publicVybe({id,user_id:a.user.id,body,image,created_at:now,name:a.user.name,username:a.user.username,avatar:a.user.avatar,likes:0,comments:0,shares:0,liked:false})},201);
    }

    const vybeMatch=url.pathname.match(/^\/api\/vybes\/([^/]+)$/);
    if(vybeMatch&&request.method==="DELETE"){
      const id=decodeURIComponent(vybeMatch[1]);const v=await env.DB.prepare("SELECT id FROM vybes WHERE id=? AND user_id=?").bind(id,a.user.id).first();
      if(!v)return json({error:"VYBE not found or you do not own it."},404);
      await env.DB.batch([env.DB.prepare("DELETE FROM vybe_likes WHERE vybe_id=?").bind(id),env.DB.prepare("DELETE FROM vybe_comments WHERE vybe_id=?").bind(id),env.DB.prepare("DELETE FROM vybe_shares WHERE vybe_id=?").bind(id),env.DB.prepare("DELETE FROM vybes WHERE id=?").bind(id)]);
      return json({ok:true});
    }

    const likeMatch=url.pathname.match(/^\/api\/vybes\/([^/]+)\/like$/);
    if(likeMatch&&request.method==="POST"){
      const id=decodeURIComponent(likeMatch[1]);if(!await env.DB.prepare("SELECT id FROM vybes WHERE id=?").bind(id).first())return json({error:"VYBE not found."},404);
      const existing=await env.DB.prepare("SELECT 1 FROM vybe_likes WHERE vybe_id=? AND user_id=?").bind(id,a.user.id).first();
      if(existing)await env.DB.prepare("DELETE FROM vybe_likes WHERE vybe_id=? AND user_id=?").bind(id,a.user.id).run();else await env.DB.prepare("INSERT INTO vybe_likes(vybe_id,user_id,created_at) VALUES(?,?,?)").bind(id,a.user.id,Date.now()).run();
      const row=await env.DB.prepare(`SELECT v.id,v.user_id,v.body,v.image,v.created_at,u.name,u.username,u.avatar,(SELECT COUNT(*) FROM vybe_likes WHERE vybe_id=v.id) likes,(SELECT COUNT(*) FROM vybe_comments WHERE vybe_id=v.id) comments,(SELECT COUNT(*) FROM vybe_shares WHERE vybe_id=v.id) shares,EXISTS(SELECT 1 FROM vybe_likes WHERE vybe_id=v.id AND user_id=?) liked FROM vybes v JOIN users u ON u.id=v.user_id WHERE v.id=?`).bind(a.user.id,id).first();
      return json({vybe:publicVybe(row)});
    }

    const commentMatch=url.pathname.match(/^\/api\/vybes\/([^/]+)\/comments$/);
    if(commentMatch&&request.method==="GET"){
      const id=decodeURIComponent(commentMatch[1]);const rows=await env.DB.prepare("SELECT c.id,c.vybe_id,c.user_id,c.body,c.created_at,u.name,u.username,u.avatar FROM vybe_comments c JOIN users u ON u.id=c.user_id WHERE c.vybe_id=? ORDER BY c.created_at ASC LIMIT 200").bind(id).all();
      return json({comments:rows.results.map(c=>({id:c.id,vybeId:c.vybe_id,body:c.body,createdAt:c.created_at,user:{id:c.user_id,name:c.name,username:c.username||"",avatar:c.avatar||""}}))});
    }
    if(commentMatch&&request.method==="POST"){
      const id=decodeURIComponent(commentMatch[1]);const b=await request.json();const body=typeof b.body==="string"?b.body.trim():"";
      if(!body)return json({error:"Comment cannot be empty."},400);if(body.length>500)return json({error:"Comment must be 500 characters or fewer."},400);if(!await env.DB.prepare("SELECT id FROM vybes WHERE id=?").bind(id).first())return json({error:"VYBE not found."},404);
      const cid=crypto.randomUUID(),now=Date.now();await env.DB.prepare("INSERT INTO vybe_comments(id,vybe_id,user_id,body,created_at) VALUES(?,?,?,?,?)").bind(cid,id,a.user.id,body,now).run();
      return json({comment:{id:cid,vybeId:id,body,createdAt:now,user:{id:a.user.id,name:a.user.name,username:a.user.username||"",avatar:a.user.avatar||""}}},201);
    }

    const shareMatch=url.pathname.match(/^\/api\/vybes\/([^/]+)\/share$/);
    if(shareMatch&&request.method==="POST"){
      const id=decodeURIComponent(shareMatch[1]);if(!await env.DB.prepare("SELECT id FROM vybes WHERE id=?").bind(id).first())return json({error:"VYBE not found."},404);
      const existing=await env.DB.prepare("SELECT 1 FROM vybe_shares WHERE vybe_id=? AND user_id=?").bind(id,a.user.id).first();
      if(!existing)await env.DB.prepare("INSERT INTO vybe_shares(vybe_id,user_id,created_at) VALUES(?,?,?)").bind(id,a.user.id,Date.now()).run();
      const row=await env.DB.prepare(`SELECT v.id,v.user_id,v.body,v.image,v.created_at,u.name,u.username,u.avatar,(SELECT COUNT(*) FROM vybe_likes WHERE vybe_id=v.id) likes,(SELECT COUNT(*) FROM vybe_comments WHERE vybe_id=v.id) comments,(SELECT COUNT(*) FROM vybe_shares WHERE vybe_id=v.id) shares,EXISTS(SELECT 1 FROM vybe_likes WHERE vybe_id=v.id AND user_id=?) liked FROM vybes v JOIN users u ON u.id=v.user_id WHERE v.id=?`).bind(a.user.id,id).first();
      return json({vybe:publicVybe(row)});
    }

    if(url.pathname==="/api/presence"&&request.method==="POST"){
      const now=Date.now();await env.DB.prepare("UPDATE users SET last_seen=?,updated_at=? WHERE id=?").bind(now,now,a.user.id).run();return json({ok:true,lastSeen:now});
    }

    if(url.pathname==="/api/call-signal"&&request.method==="POST"){
      const b=await request.json();const recipientId=String(b.recipientId||"");const signal=b.signal;
      if(!recipientId||!signal)return json({error:"recipientId and signal are required."},400);
      const recipient=await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(recipientId).first();
      if(!recipient)return json({error:"User not found."},404);
      const payload=JSON.stringify({fromUserId:a.user.id,signal});
      const room=env.CHAT_ROOM.idFromName(`call:${recipientId}`);
      await env.CHAT_ROOM.get(room).fetch("https://zuno.internal/call-signal",{method:"POST",body:payload});
      return json({ok:true});
    }

    if(url.pathname==="/api/me"&&request.method==="GET")return json({user:publicUser(a.user)});

    if(url.pathname==="/api/me"&&request.method==="PATCH"){
      const b=await request.json();const name=typeof b.name==="string"?b.name.trim():undefined;const avatar=typeof b.avatar==="string"?b.avatar:"";const username=typeof b.username==="string"?b.username.trim():undefined;const about=typeof b.about==="string"?b.about.trim():undefined;
      if(name!==undefined&&name.length<2)return json({error:"Name is too short."},400);if(avatar.length>1500000)return json({error:"Profile photo is too large."},400);if(username!==undefined&&username!==""&&!validUsername(username))return json({error:"Username must be 3-24 characters using letters, numbers or underscores."},400);if(about!==undefined&&about.length>160)return json({error:"About must be 160 characters or fewer."},400);
      if(username!==undefined&&username!==""&&await env.DB.prepare("SELECT id FROM users WHERE lower(username)=lower(?) AND id<>?").bind(username,a.user.id).first())return json({error:"That username is already taken."},409);
      await env.DB.prepare("UPDATE users SET name=COALESCE(?,name),avatar=?,username=?,about=?,updated_at=? WHERE id=?").bind(name===undefined?null:name,avatar,username===undefined?(a.user.username||null):(username||null),about===undefined?(a.user.about||""):about,Date.now(),a.user.id).run();
      const u=await env.DB.prepare("SELECT id,name,phone,avatar,username,about,last_seen,created_at FROM users WHERE id=?").bind(a.user.id).first();return json({user:u?publicUser(u):null});
    }

    if(url.pathname==="/api/users"&&request.method==="GET"){
      const q=url.searchParams.get("q")?.trim().toLowerCase()||"";
      const rows=q?await env.DB.prepare("SELECT id,name,phone,avatar,username,about,last_seen,created_at FROM users WHERE id<>? AND (lower(name) LIKE ? OR lower(COALESCE(username,'')) LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 100").bind(a.user.id,`%${q}%`,`%${q}%`,`%${q}%`).all():await env.DB.prepare("SELECT id,name,phone,avatar,username,about,last_seen,created_at FROM users WHERE id<>? ORDER BY name LIMIT 100").bind(a.user.id).all();
      return json({users:rows.results.map(publicUser)});
    }

    if(url.pathname==="/api/messages"&&request.method==="GET"){
      const withUser=url.searchParams.get("with");if(!withUser)return json({error:"with is required."},400);
      const rows=await env.DB.prepare("SELECT id,sender_id,recipient_id,body,created_at FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY created_at ASC LIMIT 500").bind(a.user.id,withUser,withUser,a.user.id).all();
      return json({messages:rows.results});
    }

    if(url.pathname==="/api/messages"&&request.method==="POST"){
      const b=await request.json();const recipientId=b.recipientId||"",body=b.body?.trim()||"";
      if(!recipientId||!body)return json({error:"recipientId and body are required."},400);if(body.length>5000)return json({error:"Message is too long."},400);
      if(!await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(recipientId).first())return json({error:"User not found."},404);
      const id=crypto.randomUUID(),createdAt=Date.now();
      await env.DB.prepare("INSERT INTO messages(id,sender_id,recipient_id,body,created_at) VALUES(?,?,?,?,?)").bind(id,a.user.id,recipientId,body,createdAt).run();
      const room=env.CHAT_ROOM.idFromName([a.user.id,recipientId].sort().join(":"));
      await env.CHAT_ROOM.get(room).fetch("https://zuno.internal/broadcast",{method:"POST",body:JSON.stringify({id,senderId:a.user.id,recipientId,body,createdAt})});
      return json({message:{id,senderId:a.user.id,recipientId,body,createdAt}},201);
    }

    if(url.pathname==="/ws"&&request.headers.get("Upgrade")?.toLowerCase()==="websocket"){
      const b=url.searchParams.get("b")||"",token=url.searchParams.get("token")||"",aa=await authByToken(token,env);if(!aa)return json({error:"Authentication required."},401);if(!b)return json({error:"b is required"},400);
      const room=env.CHAT_ROOM.idFromName([aa.user.id,b].sort().join(":"));return env.CHAT_ROOM.get(room).fetch(request);
    }

    return json({error:"Not found"},404);
  }catch(e){console.error(String(e));return json({error:"Server error"},500);}
}};

export class ChatRoom extends DurableObject{
  async fetch(request){
    if(request.method==="POST"){
      const message=await request.text();
      for(const ws of this.ctx.getWebSockets())if(ws.readyState===WebSocket.OPEN)ws.send(message);
      return new Response("ok");
    }
    const pair=new WebSocketPair();const [client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,message){
    for(const conn of this.ctx.getWebSockets())if(conn!==ws&&conn.readyState===WebSocket.OPEN)conn.send(typeof message==="string"?message:"binary");
  }
  async webSocketClose(ws,code,reason){try{ws.close(code,reason)}catch{}}
}
