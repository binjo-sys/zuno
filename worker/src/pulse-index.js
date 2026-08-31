import baseWorker, { ChatRoom } from './index.js';

const CORS={"content-type":"application/json","access-control-allow-origin":"*","access-control-allow-headers":"content-type, authorization","access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:CORS});
const hash=async(value)=>{const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')};
async function auth(request,env){const h=request.headers.get('authorization')||'';const token=h.startsWith('Bearer ')?h.slice(7).trim():'';if(!token)return null;const id=await hash(token);const row=await env.DB.prepare(`SELECT s.id AS session_id,s.user_id,s.expires_at,u.id,u.name,u.username,u.avatar,u.about,u.last_seen FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?`).bind(id).first();if(!row||Date.now()>=row.expires_at)return null;return row}

export default {async fetch(request,env,ctx){
  if(request.method==='OPTIONS')return json(null);
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/pulse/')){
    try{
      const me=await auth(request,env);if(!me)return json({error:'Authentication required.'},401);
      if(url.pathname==='/api/pulse/rooms'&&request.method==='GET'){
        const rows=await env.DB.prepare(`SELECT r.id,r.title,r.topic,r.created_at,r.creator_id,u.name AS creator_name,u.username AS creator_username,u.avatar AS creator_avatar,(SELECT COUNT(*) FROM pulse_polls p WHERE p.room_id=r.id) poll_count FROM pulse_rooms r JOIN users u ON u.id=r.creator_id ORDER BY r.created_at DESC LIMIT 50`).all();
        return json({rooms:rows.results.map(r=>({id:r.id,title:r.title,topic:r.topic,createdAt:r.created_at,creator:{id:r.creator_id,name:r.creator_name,username:r.creator_username||'',avatar:r.creator_avatar||''},pollCount:Number(r.poll_count||0)}))});
      }
      if(url.pathname==='/api/pulse/rooms'&&request.method==='POST'){
        const b=await request.json();const title=typeof b.title==='string'?b.title.trim():'';const topic=typeof b.topic==='string'?b.topic.trim():'';
        if(title.length<3)return json({error:'Room title must be at least 3 characters.'},400);if(title.length>80||topic.length>40)return json({error:'Room title or topic is too long.'},400);
        const id=crypto.randomUUID(),now=Date.now();await env.DB.prepare('INSERT INTO pulse_rooms(id,creator_id,title,topic,created_at) VALUES(?,?,?,?,?)').bind(id,me.user_id,title,topic,now).run();
        return json({room:{id,title,topic,createdAt:now,creator:{id:me.user_id,name:me.name,username:me.username||'',avatar:me.avatar||''},pollCount:0}},201);
      }
      if(url.pathname==='/api/pulse/polls'&&request.method==='GET'){
        const roomId=url.searchParams.get('room')||'';const rows=await env.DB.prepare(`SELECT p.id,p.room_id,p.creator_id,p.question,p.created_at,u.name AS creator_name,u.username AS creator_username,u.avatar AS creator_avatar FROM pulse_polls p JOIN users u ON u.id=p.creator_id ${roomId?'WHERE p.room_id=?':''} ORDER BY p.created_at DESC LIMIT 100`).bind(...(roomId?[roomId]:[])).all();
        const polls=[];for(const p of rows.results){const opts=await env.DB.prepare(`SELECT o.id,o.label,o.position,(SELECT COUNT(*) FROM pulse_votes v WHERE v.option_id=o.id) votes FROM pulse_poll_options o WHERE o.poll_id=? ORDER BY o.position`).bind(p.id).all();const voted=await env.DB.prepare('SELECT option_id FROM pulse_votes WHERE poll_id=? AND user_id=?').bind(p.id,me.user_id).first();polls.push({id:p.id,roomId:p.room_id,question:p.question,createdAt:p.created_at,creator:{id:p.creator_id,name:p.creator_name,username:p.creator_username||'',avatar:p.creator_avatar||''},options:opts.results.map(o=>({id:o.id,label:o.label,votes:Number(o.votes||0)})),votedOptionId:voted?.option_id||null})}
        return json({polls});
      }
      if(url.pathname==='/api/pulse/polls'&&request.method==='POST'){
        const b=await request.json();const question=typeof b.question==='string'?b.question.trim():'';const options=Array.isArray(b.options)?b.options.map(x=>String(x).trim()).filter(Boolean).slice(0,6):[];const roomId=b.roomId?String(b.roomId):null;
        if(question.length<5)return json({error:'Poll question is too short.'},400);if(question.length>180||options.length<2)return json({error:'Add a question and at least two options.'},400);if(options.some(x=>x.length>80))return json({error:'Poll options must be 80 characters or fewer.'},400);if(roomId&&!await env.DB.prepare('SELECT id FROM pulse_rooms WHERE id=?').bind(roomId).first())return json({error:'Room not found.'},404);
        const id=crypto.randomUUID(),now=Date.now();const statements=[env.DB.prepare('INSERT INTO pulse_polls(id,room_id,creator_id,question,created_at) VALUES(?,?,?,?,?)').bind(id,roomId,me.user_id,question,now),...options.map((label,i)=>env.DB.prepare('INSERT INTO pulse_poll_options(id,poll_id,label,position) VALUES(?,?,?,?)').bind(crypto.randomUUID(),id,label,i))];await env.DB.batch(statements);
        const created=await env.DB.prepare('SELECT id,label FROM pulse_poll_options WHERE poll_id=? ORDER BY position').bind(id).all();
        return json({poll:{id,roomId,question,createdAt:now,creator:{id:me.user_id,name:me.name,username:me.username||'',avatar:me.avatar||''},options:created.results.map(o=>({id:o.id,label:o.label,votes:0})),votedOptionId:null}},201);
      }
      const voteMatch=url.pathname.match(/^\/api\/pulse\/polls\/([^/]+)\/vote$/);
      if(voteMatch&&request.method==='POST'){
        const pollId=decodeURIComponent(voteMatch[1]);const b=await request.json();const optionId=String(b.optionId||'');const option=await env.DB.prepare('SELECT id FROM pulse_poll_options WHERE id=? AND poll_id=?').bind(optionId,pollId).first();if(!option)return json({error:'Poll option not found.'},404);
        const existing=await env.DB.prepare('SELECT option_id FROM pulse_votes WHERE poll_id=? AND user_id=?').bind(pollId,me.user_id).first();if(existing)await env.DB.prepare('UPDATE pulse_votes SET option_id=?,created_at=? WHERE poll_id=? AND user_id=?').bind(optionId,Date.now(),pollId,me.user_id).run();else await env.DB.prepare('INSERT INTO pulse_votes(poll_id,option_id,user_id,created_at) VALUES(?,?,?,?)').bind(pollId,optionId,me.user_id,Date.now()).run();
        const rows=await env.DB.prepare(`SELECT id,label,(SELECT COUNT(*) FROM pulse_votes v WHERE v.option_id=o.id) votes FROM pulse_poll_options o WHERE poll_id=? ORDER BY position`).bind(pollId).all();return json({options:rows.results.map(o=>({id:o.id,label:o.label,votes:Number(o.votes||0)})),votedOptionId:optionId});
      }
      return json({error:'Not found'},404);
    }catch(e){console.error(e);return json({error:'Server error'},500)}
  }
  return baseWorker.fetch(request,env,ctx);
}};
export { ChatRoom };
