export function installInteractionFixes(){
  if(typeof document==='undefined'||document.getElementById('zuno-interaction-fixes'))return;
  const marker=document.createElement('meta');marker.id='zuno-interaction-fixes';marker.dataset.ready='1';document.head.appendChild(marker);
  const wire=()=>document.querySelectorAll('.chat-row').forEach(row=>{if(row.dataset.zunoWired)return;row.dataset.zunoWired='1';row.addEventListener('click',()=>{if(window.innerWidth<=900)document.body.classList.add('mobile-chat-open')},{capture:true})});
  wire();
  new MutationObserver(wire).observe(document.body,{childList:true,subtree:true});
}