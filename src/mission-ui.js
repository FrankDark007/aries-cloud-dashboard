export const MISSION_HTML = String.raw`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mission Control</title><style>
:root{color-scheme:light;--bg:#eef3f9;--card:#fff;--ink:#14202e;--muted:#566474;--line:#d3dce7;--blue:#1565c0;--blue-soft:#d9e8fb;--green:#1b6b2f;--green-soft:#dff3e1;--amber:#8a4b00;--amber-soft:#fdeccd;--red:#a8201a;--red-soft:#fbe0de;--bar:#e3e9f1}
:root[data-theme=dark]{color-scheme:dark;--bg:#0c141d;--card:#15212e;--ink:#eaf1f8;--muted:#9fb0c1;--line:#2b3c4e;--blue:#7ab4f5;--blue-soft:#17304d;--green:#72d58a;--green-soft:#163a22;--amber:#ffc66d;--amber-soft:#40300f;--red:#ff9b94;--red-soft:#4a1b19;--bar:#2a3b4d}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--bg:#0c141d;--card:#15212e;--ink:#eaf1f8;--muted:#9fb0c1;--line:#2b3c4e;--blue:#7ab4f5;--blue-soft:#17304d;--green:#72d58a;--green-soft:#163a22;--amber:#ffc66d;--amber-soft:#40300f;--red:#ff9b94;--red-soft:#4a1b19;--bar:#2a3b4d}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
a{color:var(--blue)}button,summary,a.tile{cursor:pointer}:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
#wrap{container-type:inline-size;max-width:1280px;margin:0 auto;padding:14px 16px 56px}
.top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:4px 0 14px}.top h1{font-size:1.5rem;margin:0;flex:1 1 auto;letter-spacing:-.01em}
.top .sub{width:100%;margin:0;color:var(--muted);font-size:.9rem}.top .sub.bad{color:var(--red);font-weight:700}
.btn{font:inherit;font-weight:600;min-height:44px;padding:0 16px;border-radius:22px;border:1px solid var(--line);background:var(--card);color:var(--ink);display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}:root[data-theme=dark] .btn.primary{color:#07182b}
.strip{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0 10px}
a.tile{display:block;text-decoration:none;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 14px;min-height:64px}
a.tile b{display:block;font-size:1.9rem;line-height:1.1;font-variant-numeric:tabular-nums}a.tile span{font-size:.9rem;color:var(--muted)}
a.tile.hot{background:var(--red-soft);border-color:var(--red)}a.tile.hot b,a.tile.hot span{color:var(--red)}a.tile.ask{background:var(--blue-soft);border-color:var(--blue)}a.tile.ask b{color:var(--blue)}a.tile.ok b{color:var(--green)}
section{margin-top:26px;scroll-margin-top:130px}h2{font-size:1.2rem;margin:0 0 10px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}h2 small{font-weight:400;color:var(--muted);font-size:.9rem}
.pills{display:flex;flex-wrap:wrap;gap:8px}.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 14px;font-weight:600;font-size:.9rem;border:1px solid transparent;min-height:36px}
.ok{background:var(--green-soft);color:var(--green)}.warn{background:var(--amber-soft);color:var(--amber)}.bad{background:var(--red-soft);color:var(--red)}.idle{background:var(--bar);color:var(--muted)}
.cols{display:grid;gap:12px;grid-template-columns:1fr}
.ask-card{background:var(--card);border:1px solid var(--line);border-left:6px solid var(--blue);border-radius:14px;padding:16px}
.ask-card .q{font-size:1.1rem;font-weight:600;margin:0 0 8px;overflow-wrap:anywhere}.ask-card .since{color:var(--muted);font-size:.85rem;margin:0 0 10px}
.opts{margin:0 0 12px;padding:0;list-style:none;display:grid;gap:6px}.opts li{background:var(--blue-soft);border-radius:10px;padding:8px 12px;font-size:.95rem}
.proj{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px;margin-bottom:14px}
.proj>header{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline;margin-bottom:6px}.proj h3{margin:0;font-size:1.05rem}.proj .counts{color:var(--muted);font-size:.85rem}
.proj .goal{margin:0 0 6px;color:var(--muted);font-size:.9rem}
details.task{border-top:1px solid var(--line)}details.task:first-of-type{border-top:0}
details.task>summary{list-style:none;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;padding:10px 0;min-height:48px}details.task>summary::-webkit-details-marker{display:none}
.mk{font-size:1.15rem;line-height:1.4;grid-row:1/4}.tt{font-weight:600;overflow-wrap:anywhere}.tt .id{font-weight:400;font-size:.78rem;color:var(--muted);margin-left:6px}
.meta{font-size:.85rem;color:var(--muted)}.meta .w{font-weight:700}.meta .w.bad,.meta .w.warn{background:none}.meta .w.bad{color:var(--red)}.meta .w.warn{color:var(--amber)}.meta .w.ok{color:var(--green);background:none}
.step{font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.task.stuck>summary{background:var(--red-soft);border-radius:10px;padding:10px;margin:2px 0}
.body{padding:2px 0 12px 34px;font-size:.92rem;overflow-wrap:anywhere}.body p{margin:4px 0}.body .path{color:var(--muted);font-size:.8rem}
.mach{display:grid;gap:12px;grid-template-columns:1fr}
.m{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}.m.off{border:2px solid var(--red);background:var(--red-soft)}
.m h3{margin:0;font-size:1.05rem;display:flex;gap:8px;align-items:center}.m .heard{font-size:.85rem;color:var(--muted);margin:2px 0 10px}.m.off .heard{color:var(--red);font-weight:700}
.bar{display:grid;grid-template-columns:70px 1fr 44px;gap:8px;align-items:center;font-size:.85rem;margin:5px 0}.bar i{display:block;height:10px;border-radius:5px;background:var(--bar);overflow:hidden}.bar i b{display:block;height:100%;background:var(--blue);border-radius:5px}.bar i b.hi{background:var(--amber)}.bar em{font-style:normal;text-align:right;font-variant-numeric:tabular-nums}
.m .doing{font-size:.88rem;margin:8px 0 0}.m details summary{font-size:.85rem;color:var(--blue);padding:8px 0;min-height:40px;display:flex;align-items:center}.m details p{font-size:.85rem;color:var(--muted);margin:2px 0;overflow-wrap:anywhere}
.more{margin-top:8px}.empty{background:var(--card);border:1px dashed var(--line);border-radius:12px;padding:14px;color:var(--muted)}
.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.tools input{font:inherit;min-height:44px;flex:1 1 200px;border:1px solid var(--line);border-radius:22px;padding:0 16px;background:var(--card);color:var(--ink)}
.spend{margin-top:26px;color:var(--muted);font-size:.9rem}.spend b{color:var(--ink)}
@container(min-width:700px){.strip{grid-template-columns:repeat(4,1fr)}.cols{grid-template-columns:repeat(2,1fr)}.mach{grid-template-columns:repeat(2,1fr)}.top h1{font-size:1.9rem}.top .sub{width:auto}}
@container(min-width:1050px){.cols{grid-template-columns:repeat(3,1fr)}.mach{grid-template-columns:repeat(3,1fr)}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style><div id="wrap"><div class="top"><h1>Mission Control</h1><a class="btn" href="/">To-do list</a><button class="btn" id="theme" type="button">Dark / light</button><p class="sub" id="fresh" role="status">Loading the latest updates...</p></div>
<nav class="strip" id="strip" aria-label="Summary"></nav>
<section id="needs"><h2>Needs you <small id="needs-n"></small></h2><div class="cols" id="decisions"></div><div class="more" id="needs-more"></div></section>
<section id="work"><h2>Work <small id="work-n"></small></h2><div class="tools"><input id="search" type="search" aria-label="Find a task" placeholder="Find a task by name or ID"><button class="btn" id="done-toggle" type="button"></button></div><div id="tasks"></div></section>
<section id="machines"><h2>Machines <small id="mach-n"></small></h2><div class="mach" id="mach"></div></section>
<section id="cloud"><h2>Cloud services</h2><div class="pills" id="services"></div></section>
<p class="spend" id="spend"></p></div><script>
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MOJI=[['â€”','—'],['â€“','–'],['â€™','’'],['â€˜','‘'],['â€œ','“'],['â€\u009d','”'],['â€¦','…'],['â€','—'],['Ã©','é']];
const fix=s=>{s=String(s==null?'':s);if(/[âÃ]/.test(s))for(const[a,b]of MOJI)s=s.split(a).join(b);return s};
const FMT=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'numeric',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
const when=s=>{if(/^\d{4}-\d{2}-\d{2}$/.test(s))return+s.slice(5,7)+'/'+ +s.slice(8,10)+'/'+s.slice(0,4);const t=Date.parse(s);return s&&!isNaN(t)?FMT.format(new Date(t)).replace(',',' at')+' ET':'No date recorded'};
const mins=s=>{const t=Date.parse(s);return s&&!isNaN(t)?Math.max(0,Math.floor((Date.now()-t)/60000)):null};
const rel=m=>m==null?'never':m<1?'just now':m<60?m+' min ago':m<1440?Math.floor(m/60)+' hr ago':Math.floor(m/1440)+' days ago';
const dur=m=>m<60?m+' minutes':m<1440?Math.floor(m/60)+' hours':Math.floor(m/1440)+' days';
const NAMES={halo1:'Halo 1',halo2:'Halo 2',halo3:'Halo 3','frank-mini':"Frank's Mac mini",aries:'Aries Mac mini',nas:'Network storage'};
const MKR={run:'\u{1F7E1}',done:'\u{1F7E2}',bad:'⚠️',ask:'\u{1F534}',stop:'⏸️'};
let records=[],todos=[],todoErr=false,showDone=false,showAllAsks=false,loaded=false;const open=new Set();
const num=s=>{const m=/(\d+(?:\.\d+)?)/.exec(String(s==null?'':s));return m?Math.min(100,+m[1]):null};
function bar(label,v){if(v==null)return'<div class="bar"><span>'+label+'</span><i></i><em>n/a</em></div>';return'<div class="bar"><span>'+label+'</span><i><b class="'+(v>=90?'hi':'')+'" style="width:'+v+'%"></b></i><em>'+Math.round(v)+'%</em></div>'}
function taskInfo(r){const d=r.data,t=d.status_source?d.source_updated:r.updated,m=mins(t);let k,word,cls;
if(d.status==='running'){if(m!=null&&m>40){k='bad';word='Stuck: no news for '+dur(m);cls='bad'}else{k='run';word='Running';cls='warn'}}
else if(d.status==='failed'){k='bad';word='Failed';cls='bad'}else if(d.status==='waiting'){k='run';word='Waiting';cls='warn'}
else if(d.status==='done'){k='done';word='Done';cls='ok'}else{k='stop';word='Stopped';cls='idle'}
return{id:r.id,title:fix(d.title)||r.id,step:fix(d.step),report:d.report,t,m,k,word,cls,status:d.status,stuck:k==='bad'}}
function taskHtml(x){const stepTxt=x.step&&!/^rc=\d+$/.test(x.step)?x.step:'';
return'<details class="task'+(x.stuck?' stuck':'')+'" data-id="'+esc(x.id)+'"'+(open.has(x.id)?' open':'')+'><summary><span class="mk" aria-hidden="true">'+MKR[x.k]+'</span><span class="tt">'+esc(x.title)+'<span class="id">'+esc(x.id)+'</span></span><span class="meta"><span class="w '+x.cls+'">'+esc(x.word)+'</span> · updated '+(x.t?rel(x.m):'never')+'</span>'+(stepTxt?'<span class="step">'+esc(stepTxt)+'</span>':'')+'</summary><div class="body"><p><b>Latest step:</b> '+esc(stepTxt||'Nothing recorded')+'</p><p>Last update: '+esc(x.t?when(x.t):'No progress recorded')+'</p><p class="path">Report: '+esc(x.report||'none recorded')+'</p></div></details>'}
function askCard(a){const opts=a.options?String(a.options).split(/;\s+|,?\s+or\s+/).map(s=>s.trim()).filter(Boolean):[];
return'<article class="ask-card"><p class="q">'+esc(fix(a.text))+'</p><p class="since">'+(a.created?'Waiting since '+esc(when(a.created))+' ('+rel(mins(a.created))+')':'No date recorded')+'</p>'+(a.todo?'':(opts.length?'<ul class="opts" aria-label="Your choices">'+opts.map(o=>'<li>'+esc(fix(o))+'</li>').join('')+'</ul>':''))+(a.todo?'<a class="btn primary" href="/">Open in to-do list</a>':'')+'</article>'}
function render(){const by=k=>records.filter(r=>r.kind===k);
const asks=by('decision').filter(r=>r.data.status!=='done'&&r.data.text).map(r=>({id:r.id,text:r.data.text,options:r.data.options,created:r.data.created||r.updated,todo:false})).concat(todos);
asks.sort((a,b)=>(a.created?0:1)-(b.created?0:1)||String(a.created).localeCompare(String(b.created)));
const tasks=by('task').map(taskInfo);const running=tasks.filter(x=>x.k==='run'&&x.status==='running').length,stuck=tasks.filter(x=>x.stuck).length;
const mrows=by('machine');for(const id of Object.keys(NAMES))if(!mrows.some(r=>r.id===id))mrows.push({id,data:{},updated:null});
const mst=mrows.map(r=>{const m=mins(r.updated),on=r.updated!=null&&m<5&&r.data.reachable!==false;return{r,m,on}});
const svc=by('service').map(r=>{const m=mins(r.updated),st=m>10?'stale':r.data.status;return{r,m,st}});
const svcBad=svc.filter(s=>s.st==='down'||s.st==='stale').length,machOff=mst.filter(x=>!x.on).length,problems=stuck+machOff+svcBad;
document.getElementById('strip').innerHTML=
'<a class="tile'+(asks.length?' ask':' ok')+'" href="#needs"><b>'+asks.length+'</b><span>need you</span></a>'+
'<a class="tile" href="#work"><b>'+running+'</b><span>running</span></a>'+
'<a class="tile'+(problems?' hot':' ok')+'" href="#'+(stuck?'work':machOff?'machines':'cloud')+'"><b>'+(problems?'⚠️ ':'')+problems+'</b><span>'+(problems?'broken or stuck':'nothing broken')+'</span></a>'+
'<a class="tile'+(machOff?' hot':' ok')+'" href="#machines"><b>'+(mst.length-machOff)+' of '+mst.length+'</b><span>machines online'+(machOff?' ('+machOff+' offline)':'')+'</span></a>';
document.getElementById('needs-n').textContent=asks.length?'oldest first':'';
const shown=showAllAsks?asks:asks.slice(0,6);
document.getElementById('decisions').innerHTML=asks.length?shown.map(askCard).join(''):(todoErr?'':'<div class="empty">Nothing is waiting on you.</div>');
if(todoErr)document.getElementById('decisions').innerHTML+='<div class="empty bad">⚠️ Your Aries to-do items could not be read, so this list may be missing some.</div>';
document.getElementById('needs-more').innerHTML=asks.length>6?'<button class="btn" id="asks-toggle" type="button">'+(showAllAsks?'Show fewer':'Show all '+asks.length)+'</button>':'';
const q=document.getElementById('search').value.toLowerCase().trim();const cutoff=24*60;
const vis=x=>{if(q)return(x.id+' '+x.title+' '+x.step).toLowerCase().includes(q);return showDone||!(x.k==='done'||x.k==='stop')||(x.m!=null&&x.m<=cutoff)};
const order={bad:0,run:1,done:2,stop:3};const sorter=(a,b)=>order[a.k]-order[b.k]||(a.m==null?9e9:a.m)-(b.m==null?9e9:b.m);
const stages=by('project').sort((a,b)=>a.id.localeCompare(b.id)).map(r=>({r,ids:String(r.data.tasks||'').split(/[,\s]+/).filter(Boolean)}));
const claimed=new Set();const groups=stages.map(s=>{const list=tasks.filter(x=>s.ids.includes(x.id));list.forEach(x=>claimed.add(x.id));const t=fix(s.r.data.title||'').split(' · ');return{name:t[0]?t.slice(0,1).join(''):'Stage',head:t.slice(1).join(' · '),goal:fix(s.r.data.done_when),list}});
const rest=tasks.filter(x=>!claimed.has(x.id));if(rest.length)groups.push({name:'Everything else',head:'Tasks that are not part of a plan stage',goal:'',list:rest});
const hiddenN=tasks.filter(x=>!q&&!showDone&&(x.k==='done'||x.k==='stop')&&!(x.m!=null&&x.m<=cutoff)).length;
document.getElementById('work-n').textContent=tasks.length+' tasks';
const dt=document.getElementById('done-toggle');dt.textContent=showDone?'Hide old finished tasks':'Show finished tasks'+(hiddenN?' ('+hiddenN+' older than a day)':'');
document.getElementById('tasks').innerHTML=groups.map(g=>{const l=g.list.filter(vis).sort(sorter);if(!l.length&&q)return'';const nrun=g.list.filter(x=>x.status==='running').length,nbad=g.list.filter(x=>x.stuck).length;
return'<div class="proj"><header><h3>'+esc(g.name)+'</h3><span class="counts">'+esc(g.head)+'</span></header>'+(g.goal?'<p class="goal">Done when: '+esc(g.goal)+'</p>':'')+'<p class="counts">'+nrun+' running'+(nbad?' · ⚠️ '+nbad+' stuck or failed':'')+' · '+g.list.filter(x=>x.k==='done').length+' done</p>'+(l.length?l.map(taskHtml).join(''):'<p class="meta">Nothing active. Older finished tasks are hidden.</p>')+'</div>'}).join('')||'<div class="empty">No tasks have reported yet.</div>';
document.getElementById('mach-n').textContent=mst.length-machOff+' of '+mst.length+' online';
document.getElementById('mach').innerHTML=mst.sort((a,b)=>a.on-b.on).map(({r,m,on})=>{const d=r.data,halo=r.id.startsWith('halo'),busy=halo?num(d.busy):null,model=d.models?String(d.models).split(/,\s*/).map(esc).join('<br>'):'';
return'<article class="m'+(on?'':' off')+'"><h3><span aria-hidden="true">'+(on?MKR.done:MKR.bad)+'</span>'+esc(NAMES[r.id]||r.id)+' <span class="pill '+(on?'ok':'bad')+'">'+(on?'Online':'Offline')+'</span></h3><p class="heard">'+(r.updated?(on?'Last heard '+rel(m):'Offline: last heard '+dur(m)+' ago'):'Offline: never heard from')+'</p>'+
(halo?bar('Busy',busy):bar('Working',num(d.cpu)))+bar('Memory',num(d.memory))+'<div class="bar"><span>Disk</span><span>'+(d.disk?esc(d.disk)+' free':'n/a')+'</span><em></em></div>'+(d.chunk?'<p class="doing"><b>Doing:</b> '+esc(fix(d.chunk))+'</p>':'')+(d.observer?'<p class="meta">Read by '+esc(d.observer)+'; no agent on this box.</p>':'')+
(model||d.runner_updated?'<details data-id="m-'+esc(r.id)+'"'+(open.has('m-'+r.id)?' open':'')+'><summary>Details</summary>'+(model?'<p>'+model+'</p>':'')+(d.runner_updated?'<p>Runner last reported '+esc(when(d.runner_updated))+'</p>':'')+'<p>Last heard '+esc(when(r.updated))+'</p></details>':'')+'</article>'}).join('');
document.getElementById('services').innerHTML=svc.map(({r,m,st})=>{const good=st==='up',cls=good?'ok':st==='waiting'?'warn':'bad',word=good?'Up':st==='waiting'?'Login page only':st==='stale'?'No recent check':'Down';return'<span class="pill '+cls+'" title="'+esc(r.data.detail||'')+'"><span aria-hidden="true">'+(good?MKR.done:st==='waiting'?MKR.run:MKR.bad)+'</span>'+esc(r.id.replace('.flood.doctor','').replace('.restorationdoctors.com',' (Restoration Doctors)'))+': '+word+'</span>'}).join('')||'<div class="empty">Waiting for the first cloud check.</div>';
const sp=by('spend')[0];const spm=sp?mins(sp.updated):null;document.getElementById('spend').innerHTML=sp?'<b>Spend today:</b> '+esc((String(sp.data.text).match(/^\$[\d,.]+/)||['unknown'])[0])+' at list price'+(spm>20?' <span class="pill bad">⚠️ Spend figure is old</span>':'')+' (Not the amount billed.)':'<span class="pill bad">⚠️ Spend has not reported. That does not mean zero.</span>';
}
async function refresh(){const f=document.getElementById('fresh');try{try{const t=await fetch('/api/todos');if(!t.ok)throw Error();const j=await t.json();todos=(j.items||[]).filter(t=>!t.done&&!t.archived&&/frank/i.test((t.assignee||'')+' '+(t.who||''))).map(t=>({id:'Todo-'+t.id,text:t.text,created:t.created||t.date||'',todo:true}));todoErr=false}catch(e){todoErr=true}
const r=await fetch('/api/mission');if(!r.ok)throw Error('Server answered '+r.status);records=(await r.json()).records;loaded=true;render();f.className='sub';f.textContent='Updated '+when(new Date().toISOString())+'. Refreshes every 30 seconds.'}catch(e){f.className='sub bad';f.textContent='⚠️ Updates are not arriving. What you see may be old. ('+e.message+')';if(loaded)render()}}
document.addEventListener('toggle',e=>{const d=e.target;if(d.dataset&&d.dataset.id){d.open?open.add(d.dataset.id):open.delete(d.dataset.id)}},true);
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='done-toggle'){showDone=!showDone;render()}if(b.id==='asks-toggle'){showAllAsks=!showAllAsks;render()}});
document.getElementById('search').oninput=()=>loaded&&render();
(()=>{let s='';try{s=localStorage.missionTheme||''}catch(e){}if(s)document.documentElement.dataset.theme=s})();
document.getElementById('theme').onclick=()=>{const dark=matchMedia('(prefers-color-scheme:dark)').matches,cur=document.documentElement.dataset.theme||(dark?'dark':'light'),n=cur==='dark'?'light':'dark';document.documentElement.dataset.theme=n;try{localStorage.missionTheme=n}catch(e){}};
refresh();setInterval(refresh,30000);
</script></html>`
