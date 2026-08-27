import { DurableObject } from "cloudflare:workers";

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","access-control-allow-origin":"*","access-control-allow-headers":"content-type,authorization","access-control-allow-methods":"GET,POST,OPTIONS"}});

export default { async fetch(request,env){
  if(request.method==='OPTIONS') return json({ok:true});
  const url=new URL(request.url);
  if(url.pathname==='/health') return json({ok:true,service:'zuno-api'});
  if(url.pathname==='/api/ws'){
    if(request.headers.get('Upgrade')!=='websocket') return json({error:'WebSocket upgrade required'},426);
    const room=env.CHAT_ROOM.getByName(url.searchParams.get('room')||'general');
    return room.fetch(request);
  }
  if(url.pathname==='/api/users' && request.method==='GET'){
    const q=(url.searchParams.get('q')||'').trim();
    const result=await env.DB.prepare('SELECT id,name,email,created_at FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY name LIMIT 20').bind(`%${q}%`,`%${q}%`).all();
    return json(result.results);
  }
  if(url.pathname==='/api/messages' && request.method==='GET'){
    const room=url.searchParams.get('room')||'general';
    const result=await env.DB.prepare('SELECT id,room_id,user_id,username,body,created_at FROM messages WHERE room_id=? ORDER BY created_at DESC LIMIT 100').bind(room).all();
    return json(result.results.reverse());
  }
  if(url.pathname==='/api/messages' && request.method==='POST'){
    const body=await request.json().catch(()=>null);
    if(!body?.roomId||!body?.userId||!body?.username||!body?.body) return json({error:'roomId, userId, username and body are required'},400);
    const id=crypto.randomUUID(); const createdAt=Date.now();
    await env.DB.prepare('INSERT INTO messages(id,room_id,user_id,username,body,created_at) VALUES(?,?,?,?,?,?)').bind(id,body.roomId,body.userId,body.username,String(body.body).slice(0,4000),createdAt).run();
    const room=env.CHAT_ROOM.getByName(body.roomId); await room.broadcast(JSON.stringify({type:'message',id,roomId:body.roomId,userId:body.userId,username:body.username,body:String(body.body).slice(0,4000),createdAt}));
    return json({id,createdAt},201);
  }
  return json({service:'ZUNO API',endpoints:['/health','/api/users','/api/messages','/api/ws']});
} };

export class ChatRoom extends DurableObject {
  async fetch(request){
    if(request.headers.get('Upgrade')!=='websocket') return new Response('Expected WebSocket',{status:426});
    const pair=new WebSocketPair(); const [client,server]=Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({connectedAt:Date.now()});
    return new Response(null,{status:101,webSocket:client});
  }
  async broadcast(message){for(const ws of this.ctx.getWebSockets()){if(ws.readyState===WebSocket.OPEN) ws.send(message)}}
  async webSocketMessage(ws,message){
    try{const data=JSON.parse(message); if(data.type==='ping') ws.send(JSON.stringify({type:'pong',ts:Date.now()}));}
    catch{}
  }
  async webSocketClose(ws,code,reason){ws.close(code,reason)}
}
