/* ZUNO device-contact gate.
   Browser apps cannot silently read the phone book. On supported mobile browsers,
   the Contacts Picker lets the user explicitly choose contacts. We keep only
   normalized Kenyan numbers locally and filter ZUNO users to those numbers. */
const KEY='zuno_device_contacts_v1';
const ID_KEY='zuno_contact_user_ids_v1';
const normalize=v=>{const raw=String(v||'').trim().replace(/[\s()-]/g,'');if(/^\+254[17]\d{8}$/.test(raw))return raw;if(/^254[17]\d{8}$/.test(raw))return `+${raw}`;if(/^0[17]\d{8}$/.test(raw))return `+254${raw.slice(1)}`;return raw};
const get=key=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return []}};
const set=(key,v)=>localStorage.setItem(key,JSON.stringify(v));
const supported=()=>('contacts' in navigator)&&('ContactsManager' in window||typeof navigator.contacts?.select==='function');
async function pick(){
  if(!supported()) throw new Error('Your browser does not allow ZUNO to read device contacts. Open ZUNO in Chrome on Android or use the ZUNO app.');
  const props=['name','tel'];
  const rows=await navigator.contacts.select(props,{multiple:true});
  const phones=[...new Set(rows.flatMap(c=>Array.isArray(c.tel)?c.tel:[]).map(normalize).filter(x=>/^\+254[17]\d{8}$/.test(x)))];
  set(KEY,phones);return phones;
}
async function sync(){const phones=await pick();window.dispatchEvent(new CustomEvent('zuno-contacts-updated',{detail:{phones}}));return phones}
window.zunoContacts={supported,sync,getPhones:()=>get(KEY),clear:()=>{localStorage.removeItem(KEY);localStorage.removeItem(ID_KEY);window.dispatchEvent(new Event('zuno-contacts-updated'))}};
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input?.url||'';
  const method=(init?.method||input?.method||'GET').toUpperCase();
  const response=await originalFetch(input,init);
  if(!url.includes('/api/users')||method!=='GET'){
    if((url.includes('/api/messages')||url.includes('/api/call-signal'))&&method==='POST'){
      try{const clone=response.clone();const data=await clone.json();if(data?.message||data?.ok)return response}catch{}
    }
    return response;
  }
  try{
    const data=await response.clone().json();
    const phones=get(KEY);
    const allowed=phones.length?data.users.filter(u=>phones.includes(normalize(u.phone))):[];
    set(ID_KEY,allowed.map(u=>u.id));
    return new Response(JSON.stringify({...data,users:allowed}),{status:response.status,statusText:response.statusText,headers:new Headers(response.headers)});
  }catch{return response}
};
function installButton(){
  if(document.getElementById('zuno-contact-sync'))return;
  const b=document.createElement('button');b.id='zuno-contact-sync';b.type='button';b.textContent='Sync phone contacts';
  Object.assign(b.style,{position:'fixed',right:'18px',bottom:'92px',zIndex:'9999',padding:'11px 15px',borderRadius:'999px',border:'1px solid rgba(108,92,231,.45)',background:'#2D2D3A',color:'#fff',fontWeight:'600',fontSize:'13px',boxShadow:'0 8px 25px rgba(0,0,0,.25)',cursor:'pointer'});
  b.onclick=async()=>{b.disabled=true;b.textContent='Choose contacts…';try{await sync();location.reload()}catch(e){alert(e.message||'Unable to access contacts.')}finally{b.disabled=false;b.textContent='Sync phone contacts'}};
  document.body.appendChild(b);
}
window.addEventListener('DOMContentLoaded',()=>setTimeout(installButton,1200));
