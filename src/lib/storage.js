const USERS_KEY='zuno_users_v2';
const SESSION_KEY='zuno_session_v2';
const CHATS_KEY='zuno_chats_v2';

function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value))}

export function normalizePhone(value=''){
 const raw=value.trim().replace(/[\s()-]/g,'');
 if(raw.startsWith('+254')) return raw;
 if(raw.startsWith('254')) return `+${raw}`;
 if(raw.startsWith('0')) return `+254${raw.slice(1)}`;
 return raw;
}
export function registerUser({name,phone,password,avatar=''}){
 const users=read(USERS_KEY,[]); const normalized=normalizePhone(phone);
 if(!/^\+254[17]\d{8}$/.test(normalized)) throw new Error('Enter a valid Kenyan phone number.');
 if(users.some(u=>u.phone===normalized)) throw new Error('An account with that phone number already exists.');
 const user={id:crypto.randomUUID(),name:name.trim(),phone:normalized,password,avatar,verified:false,createdAt:Date.now()};
 users.push(user); write(USERS_KEY,users); write(SESSION_KEY,{id:user.id}); return user;
}
export function loginUser(phone,password){
 const normalized=normalizePhone(phone);
 const user=read(USERS_KEY,[]).find(u=>u.phone===normalized&&u.password===password);
 if(!user) throw new Error('Incorrect phone number or password.'); write(SESSION_KEY,{id:user.id}); return user;
}
export function updateCurrentUser(patch){
 const session=read(SESSION_KEY,null); if(!session) return null;
 const list=read(USERS_KEY,[]); const index=list.findIndex(u=>u.id===session.id); if(index<0) return null;
 list[index]={...list[index],...patch}; write(USERS_KEY,list); return list[index];
}
export function logout(){localStorage.removeItem(SESSION_KEY)}
export function currentUser(){const s=read(SESSION_KEY,null); return s?read(USERS_KEY,[]).find(u=>u.id===s.id)||null:null}
export function users(){return read(USERS_KEY,[])}
export function chats(){return read(CHATS_KEY,{})}
export function saveChats(value){write(CHATS_KEY,value)}
