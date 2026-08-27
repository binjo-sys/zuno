const USERS_KEY='zuno_users_v1';
const SESSION_KEY='zuno_session_v1';
const CHATS_KEY='zuno_chats_v1';

function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value))}

export function registerUser({name,email,password}){
 const users=read(USERS_KEY,[]); const normalized=email.trim().toLowerCase();
 if(users.some(u=>u.email===normalized)) throw new Error('An account with that email already exists.');
 const user={id:crypto.randomUUID(),name:name.trim(),email:normalized,password,createdAt:Date.now()};
 users.push(user); write(USERS_KEY,users); write(SESSION_KEY,{id:user.id}); return user;
}
export function loginUser(email,password){
 const user=read(USERS_KEY,[]).find(u=>u.email===email.trim().toLowerCase()&&u.password===password);
 if(!user) throw new Error('Incorrect email or password.'); write(SESSION_KEY,{id:user.id}); return user;
}
export function logout(){localStorage.removeItem(SESSION_KEY)}
export function currentUser(){const s=read(SESSION_KEY,null); return s?read(USERS_KEY,[]).find(u=>u.id===s.id)||null:null}
export function users(){return read(USERS_KEY,[])}
export function chats(){return read(CHATS_KEY,{})}
export function saveChats(value){write(CHATS_KEY,value)}
