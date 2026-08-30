const API_BASE = (import.meta.env.VITE_API_URL || 'https://zuno-api.langatemmanuel817.workers.dev/api').replace(/\/$/,'');
const SESSION_KEY='zuno_api_session';
export const getSession=()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}};
export const saveSession=(value)=>localStorage.setItem(SESSION_KEY,JSON.stringify(value));
export const clearSession=()=>localStorage.removeItem(SESSION_KEY);
async function request(path,options={}){const session=getSession();const headers=new Headers(options.headers||{});if(options.body && !headers.has('content-type') && !(options.body instanceof Blob))headers.set('content-type','application/json');if(session?.token)headers.set('authorization',`Bearer ${session.token}`);const res=await fetch(`${API_BASE}${path}`,{...options,headers});let data=null;try{data=await res.json()}catch{}if(!res.ok)throw new Error(data?.error||`Request failed (${res.status})`);return data}
export const api={
 register:async(name,phone,password,username='',about='')=>request('/auth/register',{method:'POST',body:JSON.stringify({name,phone,password,username,about})}),
 login:async(phone,password)=>request('/auth/login',{method:'POST',body:JSON.stringify({phone,password})}),
 logout:async()=>request('/auth/logout',{method:'POST'}),
 me:async()=>{const r=await request('/me');return r.user},
 updateMe:async(patch)=>{const r=await request('/me',{method:'PATCH',body:JSON.stringify(patch)});return r.user},
 presence:async()=>request('/presence',{method:'POST'}),
 users:async(q='')=>{const r=await request(`/users${q?`?q=${encodeURIComponent(q)}`:''}`);return r.users||[]},
 messages:async(withUser)=>{const r=await request(`/messages?with=${encodeURIComponent(withUser)}`);return r.messages||[]},
 sendMessage:async(recipientId,body)=>{const r=await request('/messages',{method:'POST',body:JSON.stringify({recipientId,body})});return r.message},
 sendCallSignal:async(recipientId,signal)=>request('/call-signal',{method:'POST',body:JSON.stringify({recipientId,signal})),
 connectCalls:({onSignal,onOpen,onClose})=>{
   let stopped=false;
   let ws=null;
   let retryTimer=null;
   let retryDelay=1000;
   const connect=()=>{
     if(stopped)return;
     const session=getSession();
     if(!session?.token)return;
     const base=API_BASE.replace(/^http/,'ws').replace(/\/api$/,'');
     ws=new WebSocket(`${base}/call-ws?token=${encodeURIComponent(session.token)}`);
     ws.onopen=()=>{retryDelay=1000;onOpen?.()};
     ws.onmessage=(event)=>{try{const data=JSON.parse(event.data);onSignal?.(data)}catch{}};
     ws.onerror=()=>{};
     ws.onclose=()=>{
       onClose?.();
       if(!stopped){
         retryTimer=setTimeout(connect,retryDelay);
         retryDelay=Math.min(retryDelay*2,15000);
       }
     };
   };
   connect();
   return ()=>{stopped=true;if(retryTimer)clearTimeout(retryTimer);try{ws?.close()}catch{}};
 },
 connectChat:({otherUserId,onMessage,onOpen,onClose})=>{
   const session=getSession();
   if(!session?.token) return ()=>{};
   const base=API_BASE.replace(/^http/,'ws').replace(/\/api$/,'');
   const url=`${base}/ws?b=${encodeURIComponent(otherUserId)}&token=${encodeURIComponent(session.token)}`;
   const ws=new WebSocket(url);
   ws.onopen=()=>onOpen?.();
   ws.onmessage=(event)=>{try{const data=JSON.parse(event.data);onMessage?.(data)}catch{}};
   ws.onclose=()=>onClose?.();
   return ()=>{try{ws.close()}catch{}}
 }
};
export const API_BASE_URL=API_BASE.replace(/\/api$/,'');
export const mediaUrl=(value)=>value?.startsWith?.('data:')?value:'';
