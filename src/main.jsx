import React,{useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Search,Plus,MessageCircle,Users,Settings,Send,Paperclip,Smile,Phone,Video,MoreVertical,CheckCheck,Menu,X} from 'lucide-react';
import './styles.css';

const initialChats=[
 {id:1,name:'Aisha',initials:'AK',status:'online',last:'Are we still meeting today?',time:'20:42',messages:[['them','Hey! 👋'],['me','Hey Aisha! Yes, definitely.'],['them','Are we still meeting today?']]},
 {id:2,name:'Brian',initials:'BK',status:'last seen recently',last:'That sounds great 🔥',time:'19:18',messages:[['me','Did you finish the project?'],['them','Almost!'],['them','That sounds great 🔥']]},
 {id:3,name:'ZUNO Team',initials:'ZT',status:'5 members',last:'Welcome to ZUNO 🎉',time:'Yesterday',group:true,messages:[['them','Welcome to ZUNO 🎉']]},
 {id:4,name:'Mercy',initials:'MN',status:'online',last:'See you tomorrow',time:'Yesterday',messages:[['them','See you tomorrow']]}
];

function App(){
 const [chats,setChats]=useState(initialChats); const [active,setActive]=useState(1); const [text,setText]=useState(''); const [search,setSearch]=useState(''); const [mobile,setMobile]=useState(false); const [tab,setTab]=useState('chats');
 const current=chats.find(c=>c.id===active)||chats[0];
 const filtered=useMemo(()=>chats.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())),[chats,search]);
 function send(){if(!text.trim())return; const value=text.trim(); setChats(cs=>cs.map(c=>c.id===active?{...c,last:value,time:'Now',messages:[...c.messages,['me',value]]}:c)); setText('');}
 return <div className="app">
  <aside className={`sidebar ${mobile?'mobile-open':''}`}>
   <div className="brand"><div className="logo">Z</div><span>ZUNO</span><button className="close" onClick={()=>setMobile(false)}><X size={20}/></button></div>
   <div className="profile"><div className="avatar me-avatar">E</div><div><b>My Account</b><small>Available</small></div><button><MoreVertical size={19}/></button></div>
   <div className="tabs"><button className={tab==='chats'?'active':''} onClick={()=>setTab('chats')}><MessageCircle size={18}/> Chats</button><button className={tab==='groups'?'active':''} onClick={()=>setTab('groups')}><Users size={18}/> Groups</button></div>
   <div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations"/></div>
   <div className="chat-list">{filtered.filter(c=>tab==='chats'||c.group).map(c=><button className={`chat-row ${active===c.id?'selected':''}`} key={c.id} onClick={()=>{setActive(c.id);setMobile(false)}}><div className="avatar">{c.initials}</div><div className="chat-info"><div><b>{c.name}</b><time>{c.time}</time></div><p>{c.last}</p></div></button>)}</div>
   <button className="new-chat"><Plus size={18}/> New conversation</button>
   <div className="side-bottom"><button><Settings size={19}/> Settings</button></div>
  </aside>
  <main className="chat">
   <header className="chat-head"><button className="hamb" onClick={()=>setMobile(true)}><Menu/></button><div className="avatar">{current.initials}</div><div className="head-info"><b>{current.name}</b><span className={current.status==='online'?'online':''}>{current.status}</span></div><div className="head-actions"><button><Phone/></button><button><Video/></button><button><MoreVertical/></button></div></header>
   <section className="messages"><div className="day">TODAY</div>{current.messages.map((m,i)=><div key={i} className={`bubble-wrap ${m[0]==='me'?'mine':''}`}><div className="bubble">{m[1]}{m[0]==='me'&&<span className="checks"><CheckCheck size={14}/></span>}</div></div>)}</section>
   <div className="composer"><button><Paperclip/></button><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Write a message..."/><button><Smile/></button><button className="send" onClick={send}><Send size={18}/></button></div>
  </main>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
