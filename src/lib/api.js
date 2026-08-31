const API_BASE=(import.meta.env.VITE_API_URL||'https://zuno-api.langatemmanuel817.workers.dev/api').replace(/\/$/,'');
const SESSION_KEY='zuno_api_session';
export const getSession=()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}};
export const saveSession=value=>localStorage.setItem(SESSION_KEY,JSON.stringify(value));
export const clearSession=()=>localStorage.removeItem(SESSION_KEY);
async function request(path,options={}){const session=getSession();const headers=new Headers(options.headers||{});if(options.body&&!headers.has('content-type')&&!(options.body instanceof Blob))headers.set('content-type','application/json');if(session?.token)headers.set('authorization',`Bearer ${session.token}`);const res=await fetch(`${API_BASE}${path}`,{...options,headers});let data=null;try{data=await res.json()}catch{}if(!res.ok)throw new Error(data?.error||`Request failed (${res.status})`);return data}
export const api={
 register:(name,phone,password,username='',about='')=>request('/auth/register',{method:'POST',body:JSON.stringify({name,phone,password,username,about})}),
 login:(phone,password)=>request('/auth/login',{method:'POST',body:JSON.stringify({phone,password})}),
 logout:()=>request('/auth/logout',{method:'POST'}),
 me:async()=>{const r=await request('/me');return r.user},
 updateMe:async patch=>{const r=await request('/me',{method:'PATCH',body:JSON.stringify(patch)});return r.user},
 presence:()=>request('/presence',{method:'POST'}),
 users:async(q='')=>{const r=await request(`/users${q?`?q=${encodeURIComponent(q)}`:''}`);return r.users||[]},
 friends:async()=>{const r=await request('/friends');return r.users||r.friends||[]},
 follow:async userId=>request(`/friends/follow/${encodeURIComponent(userId)}`,{method:'POST'}),
 unfollow:async userId=>request(`/friends/follow/${encodeURIComponent(userId)}`,{method:'DELETE'}),
 sendFriendRequest:async userId=>request('/friends/requests',{method:'POST',body:JSON.stringify({userId})}),
 respondFriendRequest:async(id,status)=>request(`/friends/requests/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status})}),
 removeFriend:async userId=>request(`/friends/${encodeURIComponent(userId)}`,{method:'DELETE'}),
 pulseRooms:async()=>{const r=await request('/pulse/rooms');return r.rooms||[]},
 createPulseRoom:async(title,topic='')=>{const r=await request('/pulse/rooms',{method:'POST',body:JSON.stringify({title,topic})});return r.room},
 pulsePolls:async(roomId='')=>{const r=await request(`/pulse/polls${roomId?`?room=${encodeURIComponent(roomId)}`:''}`);return r.polls||[]},
 createPulsePoll:async(question,options,roomId=null)=>{const r=await request('/pulse/polls',{method:'POST',body:JSON.stringify({question,options,roomId})});return r.poll},
 votePulsePoll:async(pollId,optionId)=>request(`/pulse/polls/${encodeURIComponent(pollId)}/vote`,{method:'POST',body:JSON.stringify({optionId})}),
 messages:async withUser=>{const r=await request(`/messages?with=${encodeURIComponent(withUser)}`);return r.messages||[]},
 sendMessage:async(recipientId,body)=>{const r=await request('/messages',{method:'POST',body:JSON.stringify({recipientId,body})});return r.message},
 vybes:async()=>{const r=await request('/vybes');return r.vybes||[]},
 createVybe:async(body,image='')=>{const r=await request('/vybes',{method:'POST',body:JSON.stringify({body,image})});return r.vybe},
 deleteVybe:async id=>request(`/vybes/${encodeURIComponent(id)}`,{method:'DELETE'}),
 likeVybe:async id=>{const r=await request(`/vybes/${encodeURIComponent(id)}/like`,{method:'POST'});return r.vybe},
 commentVybe:async(id,body)=>{const r=await request(`/vybes/${encodeURIComponent(id)}/comments`,{method:'POST',body:JSON.stringify({body})});return r.comment},
 shareVybe:async id=>{const r=await request(`/vybes/${encodeURIComponent(id)}/share`,{method:'POST'});return r.vybe},
 sendCallSignal:(recipientId,signal)=>request('/call-signal',{method:'POST',body:JSON.stringify({recipientId,signal})),
 connectCalls:({onSignal,onOpen,onClose})=>{let stopped=false,ws=null,retryTimer=null,retryDelay=1000;const connect=()=>{if(stopped)return;const session=getSession();if(!session?.token)return;const base=API_BASE.replace(/^http/,'ws').replace(/\/api$/,'');ws=new WebSocket(`${base}/call-ws?token=${encodeURIComponent(session.token)}`);ws.onopen=()=>{retryDelay=1000;onOpen?.()};ws.onmessage=event=>{try{onSignal?.(JSON.parse(event.data))}catch{}};ws.onerror=()=>{};ws.onclose=()=>{onClose?.();if(!stopped){retryTimer=setTimeout(connect,retryDelay);retryDelay=Math.min(retryDelay*2,15000)}}};connect();return()=>{stopped=true;if(retryTimer)clearTimeout(retryTimer);try{ws?.close()}catch{}}},
 connectChat:({otherUserId,onMessage,onOpen,onClose})=>{const session=getSession();if(!session?.token)return()=>{};const base=API_BASE.replace(/^http/,'ws').replace(/\/api$/,'');const ws=new WebSocket(`${base}/ws?b=${encodeURIComponent(otherUserId)}&token=${encodeURIComponent(session.token)}`);ws.onopen=()=>onOpen?.();ws.onmessage=event=>{try{onMessage?.(JSON.parse(event.data))}catch{}};ws.onclose=()=>onClose?.();return()=>{try{ws.close()}catch{}}}
};
export const API_BASE_URL=API_BASE.replace(/\/api$/,'');
export const mediaUrl=value=>value?.startsWith?.('data:')?value:'';
