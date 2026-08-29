const API_BASE = (import.meta.env.VITE_API_URL || 'https://zuno-api.langatemmanuel817.workers.dev/api').replace(/\/$/,'');
const SESSION_KEY='zuno_api_session';
export const getSession=()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}};
export const saveSession=(value)=>localStorage.setItem(SESSION_KEY,JSON.stringify(value));
export const clearSession=()=>localStorage.removeItem(SESSION_KEY);
async function request(path,options={}){const session=getSession();const headers=new Headers(options.headers||{});if(options.body && !headers.has('content-type') && !(options.body instanceof Blob))headers.set('content-type','application/json');if(session?.token)headers.set('authorization',`Bearer ${session.token}`);const res=await fetch(`${API_BASE}${path}`,{...options,headers});let data=null;try{data=await res.json()}catch{}if(!res.ok)throw new Error(data?.error||`Request failed (${res.status})`);return data}
export const api={
 register:async(name,phone,password)=>request('/auth/register',{method:'POST',body:JSON.stringify({name,phone,password})}),
 login:async(phone,password)=>request('/auth/login',{method:'POST',body:JSON.stringify({phone,password})}),
 logout:async()=>request('/auth/logout',{method:'POST'}),
 me:async()=>{const r=await request('/me');return r.user},
 updateMe:async(patch)=>{const r=await request('/me',{method:'PATCH',body:JSON.stringify(patch)});return r.user},
 users:async(q='')=>{const r=await request(`/users${q?`?q=${encodeURIComponent(q)}`:''}`);return r.users||[]},
 messages:async(withUser)=>{const r=await request(`/messages?with=${encodeURIComponent(withUser)}`);return r.messages||[]},
 sendMessage:async(recipientId,body)=>{const r=await request('/messages',{method:'POST',body:JSON.stringify({recipientId,body})});return r.message}
};
export const API_BASE_URL=API_BASE.replace(/\/api$/,'');
export const mediaUrl=(value)=>value?.startsWith?.('data:')?value:'';
