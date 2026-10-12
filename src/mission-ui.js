import { parseOptions, taskFailure, evidenceFreshness, taskState, taskCounts, sourceFreshness, machineTelemetry, serviceState } from './mission-state.js'
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
.opts{margin:0 0 12px;padding:0;list-style:none;display:grid;gap:6px}.opts li{min-width:0}.option{width:100%;min-height:48px;text-align:left;justify-content:space-between;gap:8px;border-radius:10px;background:var(--blue-soft);white-space:normal;overflow-wrap:anywhere;padding:10px 12px}.option[aria-pressed=true]{border:2px solid var(--blue);font-weight:800}.option:active,.send:active{filter:brightness(.88)}button:disabled{cursor:default;opacity:.65}.recommended{font-size:.75rem;border:1px solid currentColor;border-radius:8px;padding:2px 6px;flex-shrink:0}.instructions{margin-top:12px}.instructions label{display:block;font-weight:600;margin-bottom:6px}.instructions textarea{display:block;width:100%;min-height:76px;font:16px/1.45 system-ui;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:10px;resize:vertical;overflow-y:hidden}.instructions .send{margin-top:8px}.answer-status{font-size:.85rem;color:var(--muted);margin:8px 0;overflow-wrap:anywhere}.session-tag{font: .8rem ui-monospace,monospace;background:var(--bar);padding:2px 5px;border-radius:4px;overflow-wrap:anywhere}.answer-status .warn{display:inline-block;padding:6px 8px;border-radius:6px}.answer-status.error{color:var(--red)}.body .instructions{max-width:620px}
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
.m{min-width:0}.m h3{flex-wrap:wrap;overflow-wrap:anywhere;margin:0;font-size:1.05rem;display:flex;gap:8px;align-items:center}.m .heard{font-size:.85rem;color:var(--muted);margin:2px 0 10px}.m.off .heard{color:var(--red);font-weight:700}
.bar{display:grid;grid-template-columns:minmax(0,120px) minmax(0,1fr) 44px;gap:8px;align-items:center;font-size:.85rem;margin:5px 0}.bar i{display:block;height:10px;border-radius:5px;background:var(--bar);overflow:hidden}.bar i b{display:block;height:100%;background:var(--blue);border-radius:5px}.bar i b.hi{background:var(--amber)}.bar em{font-style:normal;text-align:right;font-variant-numeric:tabular-nums}
.m .doing{overflow-wrap:anywhere;font-size:.88rem;margin:8px 0 0}.m details summary{font-size:.85rem;color:var(--blue);padding:8px 0;min-height:40px;display:flex;align-items:center}.m details p{font-size:.85rem;color:var(--muted);margin:2px 0;overflow-wrap:anywhere}
.more{margin-top:8px}.empty{background:var(--card);border:1px dashed var(--line);border-radius:12px;padding:14px;color:var(--muted)}
.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.tools input{font:inherit;min-height:44px;flex:1 1 200px;border:1px solid var(--line);border-radius:22px;padding:0 16px;background:var(--card);color:var(--ink)}
.spend{margin-top:26px;color:var(--muted);font-size:.9rem}.spend b{color:var(--ink)}
@container(min-width:700px){.strip{grid-template-columns:repeat(4,1fr)}.cols{grid-template-columns:repeat(2,1fr)}.mach{grid-template-columns:repeat(2,1fr)}.top h1{font-size:1.9rem}.top .sub{width:auto}}
@container(min-width:1050px){.cols{grid-template-columns:repeat(3,1fr)}.mach{grid-template-columns:repeat(3,1fr)}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style><div id="wrap"><div class="top"><h1>Mission Control</h1><a class="btn" href="/?view=todos">To-do list</a><button class="btn" id="theme" type="button">Dark / light</button><p class="sub" id="fresh" role="status">Loading the latest updates...</p></div>
<nav class="strip" id="strip" aria-label="Summary"></nav>
<details id="source-details"><summary>Source freshness <span id="evidence-n" class="meta"></span></summary><div id="evidence" class="cols"></div></details>
<section id="needs"><h2>Needs you <small id="needs-n"></small></h2><div class="cols" id="decisions"></div><div class="more" id="needs-more"></div></section>
<section id="work"><h2>Work <small id="work-n"></small></h2><div class="tools"><input id="search" type="search" aria-label="Find a task" placeholder="Find a task by name or ID"><button class="btn" id="done-toggle" type="button"></button></div><div id="tasks"></div></section>
<section id="machines"><h2>Machines <small id="mach-n"></small></h2><div class="mach" id="mach"></div></section>
<section id="cloud"><h2>Cloud services</h2><div class="pills" id="services"></div></section>
<p class="spend" id="spend"></p></div><script>
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MOJI=[['â€”','—'],['â€“','–'],['â€™','’'],['â€˜','‘'],['â€œ','“'],['â€\u009d','”'],['â€¦','…'],['â€','—'],['Ã©','é']];
const fix=s=>{s=String(s==null?'':s);if(/[âÃ]/.test(s))for(const[a,b]of MOJI)s=s.split(a).join(b);return s};
const FMT=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
const when=s=>{if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s.slice(5,7)+'/'+s.slice(8,10)+'/'+s.slice(0,4);const t=Date.parse(s);return s&&!isNaN(t)?FMT.format(new Date(t)).replace(',',' at')+' ET':'No date recorded'};
const mins=s=>{const t=Date.parse(s);return s&&!isNaN(t)?Math.max(0,Math.floor((Date.now()-t)/60000)):null};
const rel=m=>m==null?'never':m<1?'just now':m<60?m+' min ago':m<1440?Math.floor(m/60)+' hr ago':Math.floor(m/1440)+' days ago';
const dur=m=>m<60?m+' minutes':m<1440?Math.floor(m/60)+' hours':Math.floor(m/1440)+' days';
const NAMES={halo1:'Halo 1',halo2:'Halo 2',halo3:'Halo 3','frank-mini':"Frank's Mac mini",aries:'Aries Mac mini',nas:'Network storage'};
const MKR={wait:'⏳',unknown:'?',run:'\u{1F7E1}',done:'\u{1F7E2}',bad:'⚠️',ask:'\u{1F534}',stop:'⏸️'};
const parseOptions=${parseOptions.toString()};
const taskFailure=${taskFailure.toString()};
const evidenceFreshness=${evidenceFreshness.toString()};
const taskState=${taskState.toString()};
const taskCounts=${taskCounts.toString()};
const sourceFreshness=${sourceFreshness.toString()};
const machineTelemetry=${machineTelemetry.toString()};
const serviceState=${serviceState.toString()};
let answers=[],answersError=false;const drafts=new Map(),sending=new Map(),sendErrors=new Map(),attempts=new Map();
try{for(const [id,text] of JSON.parse(sessionStorage.missionDrafts||'[]'))drafts.set(id,text)}catch(e){}
function answerStatus(a){if(!a)return '';if(a.received)return 'Received by <code class="session-tag">'+esc(a.received_by||'unknown session')+'</code> at '+esc(clock(a.received))+' ET';const m=mins(a.created);return m>=15?'<span class="w warn">Not read yet, sent '+m+' minutes ago. No session has picked it up.</span>':'Sent '+esc(clock(a.created))+', waiting for a session'}
const clock=s=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(s));
let records=[],todos=[],todoErr=false,showDone=false,showAllAsks=false,loaded=false;const open=new Set();
const num=s=>{const m=/(\d+(?:\.\d+)?)/.exec(String(s==null?'':s));return m?Math.min(100,+m[1]):null};
function bar(label,v){if(v==null)return'<div class="bar"><span>'+label+'</span><i></i><em>n/a</em></div>';return'<div class="bar"><span>'+label+'</span><i><b class="'+(v>=90?'hi':'')+'" style="width:'+v+'%"></b></i><em>'+Math.round(v)+'%</em></div>'}
function taskInfo(r){const d=r.data,state=taskState(r),t=state.evidence.at,m=state.evidence.minutes;
const k={running:'run',waiting:'wait',failed:'bad',done:'done',stopped:'stop',unknown:'unknown'}[state.state];
const word={running:'Running',waiting:'Waiting',failed:'Failed',done:'Done',stopped:'Stopped',unknown:'Status unknown'}[state.state];
const cls=state.failure?'bad':state.state==='done'?'ok':['running','waiting'].includes(state.state)?'warn':'idle';
return{...state,id:r.id,title:fix(d.title)||r.id,step:fix(d.step),report:d.report,t,m,k,word,cls,status:state.state,stuck:state.failure}}
function evidenceLabel(e){return e.status==='missing'?'Evidence missing':e.status==='stale'?'Evidence stale · '+rel(e.minutes):'Evidence '+rel(e.minutes)}
function taskHtml(x){const stepTxt=x.step&&!/^rc=\d+$/.test(x.step)?x.step:'';
return'<details class="task'+(x.stuck?' stuck':'')+'" data-id="'+esc(x.id)+'"'+(open.has(x.id)?' open':'')+'><summary><span class="mk" aria-hidden="true">'+MKR[x.k]+'</span><span class="tt">'+esc(x.title)+'<span class="id">'+esc(x.id)+'</span></span><span class="meta"><span class="w '+x.cls+'">'+esc(x.word)+'</span> · '+esc(evidenceLabel(x.evidence))+'</span>'+(stepTxt?'<span class="step">'+esc(stepTxt)+'</span>':'')+'</summary><div class="body"><p><b>Latest step:</b> '+esc(stepTxt||'Nothing recorded')+'</p><p>Last task evidence: '+esc(x.t?when(x.t):'No progress recorded')+'</p><p class="path">Report: '+esc(x.report||'none recorded')+'</p>'+instructionBox(x.id)+'</div></details>'}
function instructionBox(id){const sent=answers.filter(a=>a.card_id===id&&a.kind==='text').at(-1),text=drafts.get(id)||'',busy=sending.has(id),err=sendErrors.get(id);
return '<div class="instructions" data-card="'+esc(id)+'"><label for="instruction-'+esc(id)+'">Your instructions</label><textarea id="instruction-'+esc(id)+'" data-instruction="'+esc(id)+'" rows="2" maxlength="4000"'+(busy?' disabled':'')+'>'+esc(text)+'</textarea><button type="button" class="btn primary send" data-send="'+esc(id)+'"'+(!text.trim()||busy?' disabled':'')+'>'+(busy?'Sending…':'Send')+'</button><p class="answer-status'+(err?' error':'')+'" role="status" aria-live="polite">'+(busy?'Sending your instructions…':err?esc(err):sent?answerStatus(sent):answersError?'Sent status unavailable. Your draft stays here.':'')+'</p>'+(err?'<button type="button" class="btn" data-retry="'+esc(id)+'">Retry</button>':'')+'</div>'}
function askCard(a){const opts=parseOptions(a.options),chosen=answers.find(x=>x.card_id===a.id&&x.kind==='choice'),locked=!!(chosen&&chosen.received),busy=sending.has(a.id);
return'<article class="ask-card" data-card="'+esc(a.id)+'"><p class="q">'+esc(fix(a.text))+'</p><p class="since">'+(a.dueIso?(a.dueIso<TODAY()?'<b class="w bad">⚠️ Overdue</b> (due '+esc(when(a.dueIso))+'). ':'<b>Due today.</b> '):'')+(a.created?'Waiting since '+esc(when(a.created))+' ('+rel(mins(a.created))+')':(a.dueIso?'':'No date recorded'))+'</p>'+(a.todo?'':(opts.length?'<ul class="opts" aria-label="Your choices">'+opts.map(o=>'<li><button type="button" class="btn option" data-choice="'+esc(o.label)+'" data-card="'+esc(a.id)+'" aria-pressed="'+!!(chosen&&chosen.choice===o.label)+'"'+(locked||busy||answersError?' disabled':'')+'><span>'+esc(fix(o.label))+'</span>'+(o.recommended?'<span class="recommended">Recommended</span>':'')+'</button></li>').join('')+'</ul>':''))+(a.todo?'<a class="btn primary" href="/?view=todos&amp;task='+esc(encodeURIComponent(a.todo_id))+'">Open in to-do list</a>':(chosen?'<p class="answer-status">You chose: '+esc(chosen.choice)+', '+esc(clock(chosen.created))+' ET'+'<br>'+answerStatus(chosen)+(locked?' · Received. Use Your instructions to change it.':'')+'</p>':'')+instructionBox(a.id))+'</article>'}
const TODAY=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date());
const dueIso=s=>{s=String(s||'');let m=/(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);if(m)return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');m=/(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);return m?m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'):''};
function render(){const focused=document.activeElement,focusId=focused&&focused.id,selection=focused&&focused.tagName==='TEXTAREA'?[focused.selectionStart,focused.selectionEnd]:null;const by=k=>records.filter(r=>r.kind===k);
let asks=by('decision').filter(r=>r.data.status!=='done'&&r.data.text).map(r=>({id:r.id,text:r.data.text,options:r.data.options,created:r.data.created||r.updated,todo:false})).concat(todos);
const today=TODAY();const allTodos=asks.filter(a=>a.todo);const dueTodos=allTodos.filter(a=>{a.dueIso=dueIso(a.due);return a.dueIso&&a.dueIso<=today});const otherTodos=allTodos.length-dueTodos.length;
asks=asks.filter(a=>!a.todo||dueTodos.includes(a));
asks.sort((a,b)=>(a.dueIso&&a.dueIso<today?0:1)-(b.dueIso&&b.dueIso<today?0:1)||(a.created?0:1)-(b.created?0:1)||String(a.created).localeCompare(String(b.created)));
const tasks=by('task').map(taskInfo),counts=taskCounts(tasks),running=counts.running,stuck=counts.failed;
const mrows=by('machine');for(const id of Object.keys(NAMES))if(!mrows.some(r=>r.id===id))mrows.push({id,data:{},updated:null});
const mst=mrows.map(r=>({r,...machineTelemetry(r)}));
const svc=by('service').map(r=>({r,...serviceState(r)}));
const svcBad=svc.filter(s=>s.availability==='unavailable'||s.operational==='degraded').length,machOff=mst.filter(x=>x.state==='offline').length,machOn=mst.filter(x=>x.state==='online').length,problems=stuck+machOff+svcBad;
const unknownMachines=mst.length-machOn-machOff;
document.getElementById('strip').innerHTML=
'<a class="tile'+(asks.length?' ask':' ok')+'" href="#needs"><b>'+asks.length+'</b><span>need you</span></a>'+
'<a class="tile" href="#work"><b>'+running+'</b><span>reported running</span></a>'+
'<a class="tile'+(problems?' hot':'')+'" href="#'+(stuck?'work':machOff?'machines':'cloud')+'"><b>'+(problems?'⚠️ ':'')+problems+'</b><span>confirmed issues</span></a>'+
'<a class="tile'+(machOff?' hot':'')+'" href="#machines"><b>'+machOn+' of '+mst.length+'</b><span>machines online'+(unknownMachines?' · '+unknownMachines+' unconfirmed':'')+'</span></a>';
const sources=sourceFreshness(records),staleSources=sources.reduce((n,s)=>n+s.stale,0),missingSources=sources.reduce((n,s)=>n+s.missing,0);
document.getElementById('evidence-n').textContent='· '+staleSources+' stale · '+missingSources+' missing';
document.getElementById('evidence').innerHTML=sources.map(s=>'<article class="empty"><b>'+esc(s.name)+'</b><p class="meta">'+s.current+' current · '+s.stale+' stale · '+s.missing+' missing</p><p class="meta">Latest evidence: '+esc(s.latest?when(s.latest):'Unknown')+'<br>Oldest evidence: '+esc(s.oldest?when(s.oldest):'Unknown')+'</p></article>').join('')||'<p class="meta">No source evidence has reported.</p>';
document.getElementById('needs-n').textContent=asks.length?'oldest first':'';
const shown=showAllAsks?asks:asks.slice(0,6);
document.getElementById('decisions').innerHTML=asks.length?shown.map(askCard).join(''):(todoErr?'':'<div class="empty">No decisions or due to-dos are waiting on you.</div>');
if(todoErr)document.getElementById('decisions').innerHTML+='<div class="empty bad">⚠️ Your Aries to-do items could not be read, so this list may be missing some.</div>';
document.getElementById('needs-more').innerHTML=(otherTodos?'<p class="meta"><a href="/?view=todos">'+otherTodos+' more on your to-do list</a></p>':'')+(asks.length>6?'<button class="btn" id="asks-toggle" type="button">'+(showAllAsks?'Show fewer':'Show all '+asks.length)+'</button>':'');
const q=document.getElementById('search').value.toLowerCase().trim();const cutoff=24*60;
const vis=x=>{if(q)return(x.id+' '+x.title+' '+x.step).toLowerCase().includes(q);return showDone||!(x.k==='done'||x.k==='stop')||(x.m!=null&&x.m<=cutoff)};
const order={bad:0,run:1,wait:2,unknown:3,done:4,stop:5};const sorter=(a,b)=>order[a.k]-order[b.k]||(a.m==null?9e9:a.m)-(b.m==null?9e9:b.m);
const stages=by('project').sort((a,b)=>a.id.localeCompare(b.id)).map(r=>({r,ids:String(r.data.tasks||'').split(/[,\s]+/).filter(Boolean)}));
const claimed=new Set();const groups=stages.map(s=>{const list=tasks.filter(x=>s.ids.includes(x.id));list.forEach(x=>claimed.add(x.id));const t=fix(s.r.data.title||'').split(' · ');return{name:t[0]?t.slice(0,1).join(''):'Stage',head:t.slice(1).join(' · '),goal:fix(s.r.data.done_when),list}});
const rest=tasks.filter(x=>!claimed.has(x.id));if(rest.length)groups.push({name:'Everything else',head:'Tasks that are not part of a plan stage',goal:'',list:rest});
const hiddenN=tasks.filter(x=>!q&&!showDone&&(x.k==='done'||x.k==='stop')&&!(x.m!=null&&x.m<=cutoff)).length;
document.getElementById('work-n').textContent=tasks.length+' tasks';
const dt=document.getElementById('done-toggle');dt.textContent=showDone?'Hide old finished tasks':'Show finished tasks'+(hiddenN?' ('+hiddenN+' older than a day)':'');
document.getElementById('tasks').innerHTML=groups.map(g=>{const l=g.list.filter(vis).sort(sorter);if(!l.length&&q)return'';const c=taskCounts(g.list),nrun=c.running,nbad=c.failed;
return'<div class="proj"><header><h3>'+esc(g.name)+'</h3><span class="counts">'+esc(g.head)+'</span></header>'+(g.goal?'<p class="goal">Done when: '+esc(g.goal)+'</p>':'')+'<p class="counts">'+nrun+' running · '+c.waiting+' waiting'+(nbad?' · ⚠️ '+nbad+' failed':'')+' · '+c.done+' done'+(c.stale?' · '+c.stale+' stale evidence':'')+(c.missing?' · '+c.missing+' missing evidence':'')+'</p>'+(l.length?l.map(taskHtml).join(''):'<p class="meta">Nothing active. Older finished tasks are hidden.</p>')+'</div>'}).join('')||'<div class="empty">No tasks have reported yet.</div>';
document.getElementById('mach-n').textContent=machOn+' of '+mst.length+' online'+(unknownMachines?' · '+unknownMachines+' unconfirmed':'');
document.getElementById('mach').innerHTML=mst.sort((a,b)=>(a.state==='online')-(b.state==='online')).map(x=>{const {r,state,observation,heartbeat}=x,d=r.data,halo=r.id.startsWith('halo'),model=d.models?String(d.models).split(/,\s*/).map(esc).join('<br>'):'';
const online=state==='online',offline=state==='offline',word=online?'Online':offline?'Offline':state==='stale'?'Observation stale':'Unknown';
return'<article class="m'+(offline?' off':'')+'"><h3><span aria-hidden="true">'+(online?MKR.done:offline?MKR.bad:MKR.unknown)+'</span>'+esc(NAMES[r.id]||r.id)+' <span class="pill '+(online?'ok':offline?'bad':'warn')+'">'+word+'</span></h3><p class="heard">Observation: '+esc(observation.at?when(observation.at):'Missing')+'</p>'+
(halo?bar('Rolling busy',num(d.busy)):bar('CPU',num(d.cpu)))+bar('Memory',num(d.memory))+'<div class="bar"><span>Disk</span><span>'+(d.disk?esc(d.disk)+' free':'Unknown')+'</span><em></em></div>'+
'<p class="doing"><b>Current job:</b> '+(x.jobCurrent?esc(fix(x.job)):'Unknown')+'</p><p class="doing"><b>Queue depth:</b> '+(x.queueCurrent?x.queue:'Unknown')+'</p><p class="meta"><b>Runner heartbeat:</b> '+esc(heartbeat.at?when(heartbeat.at)+' · '+heartbeat.status:'Unknown')+'</p>'+
(d.chunk?'<p class="meta"><b>Last recorded work:</b> '+esc(fix(d.chunk))+'</p>':'')+(halo?'<p class="meta">Rolling busy describes recent utilization; it does not identify a current job.</p>':'')+(d.observer?'<p class="meta">Observed by '+esc(d.observer)+'.</p>':'')+
(model||x.job||x.queue!==null?'<details data-id="m-'+esc(r.id)+'"'+(open.has('m-'+r.id)?' open':'')+'><summary>Details</summary>'+(model?'<p>'+model+'</p>':'')+(x.job&&!x.jobCurrent?'<p>Last reported job: '+esc(fix(x.job))+'</p>':'')+(x.queue!==null&&!x.queueCurrent?'<p>Last reported queue depth: '+x.queue+'</p>':'')+'</details>':'')+'</article>'}).join('');
document.getElementById('services').innerHTML=svc.map(({r,evidence,availability,operational})=>{const good=operational==='healthy',bad=operational==='degraded'||availability==='unavailable',cls=good?'ok':bad?'bad':'warn';
const available=availability==='available'?'Reachable':availability==='gated'?'Access gate':availability==='unavailable'?'Unavailable':evidence.status==='stale'?'Check stale':'Availability unknown';
const health=good?'Operational checks passed':operational==='degraded'?'Operational checks degraded':'Operational health unknown';
const queue=r.data.operational&&r.data.operational.queue;
return'<span class="pill '+cls+'" title="'+esc((r.data.detail||'')+(queue?' · Queue: '+queue.pending+' pending, '+queue.failed+' failed':''))+'"><span aria-hidden="true">'+(good?MKR.done:bad?MKR.bad:MKR.unknown)+'</span>'+esc(r.id.replace('.flood.doctor','').replace('.restorationdoctors.com',' (Restoration Doctors)'))+': '+available+' · '+health+'</span>'}).join('')||'<div class="empty">Waiting for the first cloud check.</div>';
const sp=by('spend')[0];const spm=sp?mins(sp.updated):null;document.getElementById('spend').innerHTML=sp?'<b>Spend today:</b> '+esc((String(sp.data.text).match(/^\$[\d,.]+/)||['unknown'])[0])+' at list price'+(spm>20?' <span class="pill bad">⚠️ Spend figure is old</span>':'')+' (Not the amount billed.)':'<span class="pill bad">⚠️ Spend has not reported. That does not mean zero.</span>';
if(focusId){const el=document.getElementById(focusId);if(el){el.focus({preventScroll:true});if(selection)el.setSelectionRange(...selection)}}
for(const el of document.querySelectorAll('textarea[data-instruction]'))grow(el);
}
async function refresh(){const f=document.getElementById('fresh');try{try{const t=await fetch('/api/todos');if(!t.ok)throw Error();const j=await t.json();todos=(j.items||[]).filter(t=>!t.done&&!t.archived&&/frank/i.test((t.assignee||'')+' '+(t.who||''))).map(t=>({id:'Todo-'+t.id,todo_id:String(t.id),text:t.text,created:t.created||t.date||'',due:t.due||'',todo:true}));todoErr=false}catch(e){todoErr=true}
const r=await fetch('/api/mission');if(!r.ok)throw Error('Server answered '+r.status);records=(await r.json()).records;await refreshAnswers();loaded=true;render();f.className='sub';f.textContent='API fetched '+when(new Date().toISOString())+'. Source evidence ages are shown separately. Refreshes every 30 seconds.'}catch(e){f.className='sub bad';f.textContent='⚠️ Updates are not arriving. What you see may be old. ('+e.message+')';if(loaded)render()}}
function grow(el){el.style.height='auto';el.style.height=Math.max(76,el.scrollHeight)+'px'}
function remember(){try{sessionStorage.missionDrafts=JSON.stringify([...drafts])}catch(e){}}
async function refreshAnswers(){try{const r=await fetch('/api/mission/answers',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();answers=(await r.json()).answers;answersError=false}catch(e){answersError=true}}
async function sendAnswer(id,kind,choice){if(sending.has(id))return;const text=drafts.get(id)||'';if(kind==='text'&&!text.trim())return;
let attempt=attempts.get(id);if(!attempt||attempt.kind!==kind||attempt.text!==text||attempt.choice!==choice){attempt={kind,text,choice,request_id:crypto.randomUUID()};attempts.set(id,attempt)}
sending.set(id,kind);sendErrors.delete(id);render();
try{if(!navigator.onLine)throw Error('offline');const r=await fetch('/api/mission/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({card_id:id,...attempt}),signal:AbortSignal.timeout(20000)});let j;try{j=await r.json()}catch(e){throw Error('server')};if(!r.ok)throw Error(j.error||'server');answers=answers.filter(a=>a.id!==j.answer.id).concat(j.answer);answersError=false;if(kind==='text'){drafts.delete(id);remember()}attempts.delete(id)}
catch(e){sendErrors.set(id,e.message==='offline'?'You are offline. Your text is saved here. Retry when connected.':e.name==='TimeoutError'||e.name==='AbortError'?'The reply is slow. Your text is saved here. Retry safely.':e.message==='Failed to fetch'?'Could not send. Your text is saved here. Retry.':e.message);await refreshAnswers()}
finally{sending.delete(id);render()}}
document.addEventListener('input',e=>{const el=e.target;if(!el.dataset||!el.dataset.instruction)return;const id=el.dataset.instruction;drafts.set(id,el.value);remember();grow(el);const b=el.parentElement.querySelector('[data-send]');b.disabled=!el.value.trim()||sending.has(id)});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.choice)sendAnswer(b.dataset.card,'choice',b.dataset.choice);else if(b.dataset.send)sendAnswer(b.dataset.send,'text');else if(b.dataset.retry){const a=attempts.get(b.dataset.retry);sendAnswer(b.dataset.retry,a?a.kind:'text',a&&a.choice)}});
document.addEventListener('toggle',e=>{const d=e.target;if(d.dataset&&d.dataset.id){d.open?open.add(d.dataset.id):open.delete(d.dataset.id)}},true);
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='done-toggle'){showDone=!showDone;render()}if(b.id==='asks-toggle'){showAllAsks=!showAllAsks;render()}});
document.getElementById('search').oninput=()=>loaded&&render();
(()=>{let s='';try{s=localStorage.missionTheme||''}catch(e){}if(s)document.documentElement.dataset.theme=s})();
document.getElementById('theme').onclick=()=>{const dark=matchMedia('(prefers-color-scheme:dark)').matches,cur=document.documentElement.dataset.theme||(dark?'dark':'light'),n=cur==='dark'?'light':'dark';document.documentElement.dataset.theme=n;try{localStorage.missionTheme=n}catch(e){}};
refresh();setInterval(refresh,30000);
</script></html>`
