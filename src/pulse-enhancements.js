import { api, getSession } from './lib/api';

const ID='pulse-live-discover';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const initials=n=>String(n||'User').split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase();

async function render(){
  if(!getSession()) return;
  const main=document.querySelector('.app main');
  if(!main || document.getElementById(ID)) return;
  const sections=[...main.querySelectorAll('.section-title')];
  const target=sections.find(s=>s.textContent.includes('Community pulse'));
  if(!target) return;
  let users=[];
  try{ users=(await api.users()).filter(u=>String(u.id)!==String(getSession()?.user?.id)).slice(0,4); }catch{return;}
  if(!users.length)return;
  const box=document.createElement('section');
  box.id=ID;box.className='live-discover';
  box.innerHTML=`<div class="live-discover-head"><div><span class="kicker">DISCOVER</span><h2>People on PULSE</h2><p>Connect with people who are already here.</p></div><span class="live-count">● LIVE</span></div><div class="live-people">${users.map(u=>`<div class="live-person" data-id="${esc(u.id)}"><div class="live-avatar">${u.avatar?`<img src="${esc(u.avatar)}" alt="">`:initials(u.name)}</div><div><b>${esc(u.name)}</b><small>@${esc(u.username||'pulse_user')}</small></div><button class="follow-btn">Connect</button></div>`).join('')}</div>`;
  target.parentNode.insertBefore(box,target);
  box.querySelectorAll('.follow-btn').forEach(btn=>btn.addEventListener('click',async()=>{
    const row=btn.closest('.live-person');const id=row.dataset.id;btn.disabled=true;btn.textContent='Connecting…';
    try{await api.follow(id);btn.textContent='Following ✓';btn.classList.add('connected');}catch(e){btn.disabled=false;btn.textContent='Try again';}
  }));
}

let timer=null;
const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(render,120)});
observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});
setTimeout(render,300);
