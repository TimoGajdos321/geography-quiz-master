(() => {
const {levels,thresholds,modes,avatars,select,grade}=Quiz;
const root=document.querySelector('#main');
const mode=document.querySelector('#mode');
const {url,key}=QUIZ_CONFIG;
const online=Boolean(url&&key);
const storage='geography-quiz-demo-v1';
const authStorage='geography-quiz-auth:'+url;
const initial={name:'Geograf',avatar:'🦁',level:1,points:80,history:[
 {difficulty:1,correct:8,total:10,earned:80,previous:1,level:1,points:80}
]};
function read(key,fallback) {
 try {return JSON.parse(localStorage.getItem(key))??fallback;} catch {return fallback;}
}
let demo=read(storage,initial), session=online?read(authStorage,null):null;
let profile=null, history=[], leaders=[], busy=false, status='', run=null, result=null, current=0;
let pickedAvatar=null, lastRoute='', authTask=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>new Intl.NumberFormat('sk').format(v);
const date=v=>v?new Date(v).toLocaleDateString('sk'):'Ukážkový kvíz';
const route=()=>['hlavna','rebricek','profil'].includes(location.hash.slice(1))?location.hash.slice(1):'hlavna';
const player=()=>session?profile:demo;
const records=()=>session?history:demo.history;
const saveDemo=()=>localStorage.setItem(storage,JSON.stringify(demo));
function saveSession(value) {
 session=value;
 if(value) localStorage.setItem(authStorage,JSON.stringify(value));
 else localStorage.removeItem(authStorage);
}
async function request(path,{method='GET',body,token,headers={}}={}) {
 const response=await fetch(url.replace(/\/$/,'')+path,{method,headers:{
  apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers
 },body:body?JSON.stringify(body):undefined});
 const raw=await response.text();
 let data=null;
 try {data=raw?JSON.parse(raw):null;} catch {throw Error('Server poslal neočakávanú odpoveď.');}
 if(!response.ok){
  const error=Error(data?.message||data?.msg||data?.error_description||'Požiadavka zlyhala.');
  error.status=response.status;
  throw error;
 }
 return data;
}
async function token() {
 if(!session) return undefined;
 if(session.expires_at>Date.now()/1000+30) return session.access_token;
 authTask??=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}})
  .then(next=>{saveSession(next);return next.access_token;})
  .catch(error=>{
   if([400,401,403].includes(error.status)){saveSession(null);profile=null;history=[];run=null;result=null;}
   throw error;
  }).finally(()=>{authTask=null;});
 return authTask;
}
async function rpc(name,body={}) {
 return request('/rest/v1/rpc/'+name,{method:'POST',body,token:await token()});
}
async function sync() {
 const access=await token();
 if(!access) return;
 [profile,history]=await Promise.all([
  request('/rest/v1/profiles?select=id,name,avatar,level,points',{token:access}).then(rows=>rows[0]),
  rpc('quiz_history')
 ]);
 if(!profile) throw Error('Profil sa nepodarilo načítať.');
}
function render() {
 const page=route();
 const p=player();
 mode.textContent=session?'Online účet':'Lokálne demo';
 document.querySelectorAll('nav a').forEach(a=>{
  if(a.hash==='#'+page) a.setAttribute('aria-current','page');
  else a.removeAttribute('aria-current');
 });
 root.setAttribute('aria-busy',String(busy));
 const content=page==='profil'?profileView(p):page==='rebricek'?leaderboard():run?quizView():result?resultView():home(p);
 root.innerHTML=(status?'<p class="notice" role="status">'+esc(status)+'</p>':'')+content;
}
function home(p) {
 const stats=records(), correct=stats.reduce((n,r)=>n+r.correct,0), total=stats.reduce((n,r)=>n+r.total,0);
 const target=p&&thresholds[p.level];
 return `<section class="hero">
 <div class="hero-copy"><p class="eyebrow">GEOGRAFICKÝ KVÍZ</p>
 <h1>Svet je plný<br><em>otázok.</em></h1>
 <p class="hero-description">Spoznávaj štáty, mestá, ostrovy a vlajky. Vyber si obtiažnosť a zisti, ako dobre poznáš našu planétu.</p>
 <a class="primary" href="#obtiaznosti" data-action="choose">Vybrať obtiažnosť <span>↓</span></a></div>
 </section>
 ${p?`<section class="stats" aria-label="Štatistiky hráča">
 <div class="stat player"><span class="avatar">${p.avatar}</span><div><small>HRÁČ</small><strong>${esc(p.name)}</strong><span>${levels[p.level-1]}</span></div></div>
 <div class="stat"><small>AKTUÁLNE BODY</small><strong>${fmt(p.points)}${target?` <sub>/ ${fmt(target)}</sub>`:''}</strong>${target?`<progress max="${target}" value="${p.points}" aria-label="Body do ďalšieho levelu"></progress>`:'<span>Najvyšší level</span>'}</div>
 <div class="stat"><small>KVÍZY</small><strong>${fmt(stats.length)}</strong><span>Dokončené</span></div>
 <div class="stat"><small>ÚSPEŠNOSŤ</small><strong>${total?Math.round(correct/total*100)+' %':'—'}</strong><span>Zo všetkých odpovedí</span></div></section>`:''}
 <section id="obtiaznosti" class="section"><h2>Vyber si obtiažnosť</h2><div class="tiles">
 ${modes.map((m,i)=>`<article class="tile ${m.style}"><div class="tile-icon" aria-hidden="true">${m.icon}</div>
 <h3>${m.name}</h3><p>${m.hint}</p><div class="tile-meta"><span>${m.count} otázok</span><span>Max. ${m.count*m.value} bodov</span></div>
 <button data-action="start" data-value="${i+1}" ${busy||!p?'disabled':''}>Spustiť kvíz <span>→</span></button></article>`).join('')}
 </div><p class="fine">Pri postupe na vyšší level sa aktuálne body vynulujú. Na leveli Majster sa body ďalej zbierajú.</p></section>`;
}
function quizView() {
 const q=run.questions[current];
 const count=run.questions.length;
 const answered=run.answers.filter(x=>x!==undefined).length;
 return `<section class="panel quiz"><p class="eyebrow">${modes[run.difficulty-1].name.toUpperCase()} · ${esc(q.topic.toUpperCase())}</p>
 <div class="row"><span>Otázka ${current+1} z ${count}</span><span>${answered}/${count} zodpovedaných</span></div>
 <progress value="${answered}" max="${count}" aria-label="Zodpovedané otázky"></progress><h1 tabindex="-1" id="question">${esc(q.prompt)}</h1>
 ${flag(q)}
 <fieldset class="answers"><legend class="sr-only">Vyber jednu odpoveď</legend>
 ${q.options.map((opt,i)=>`<label><input type="radio" name="answer" value="${i}" ${run.answers[current]===opt?'checked':''}> <span class="letter">${'ABCD'[i]}</span> <span>${esc(opt)}</span></label>`).join('')}
 </fieldset><div class="row controls"><button data-action="back" ${current===0||busy?'disabled':''}>← Späť</button>
 ${current<count-1?`<button class="primary" data-action="next" ${busy?'disabled':''}>Ďalej →</button>`:''}
 <button class="primary" id="finish" data-action="finish" ${answered!==count||busy?'disabled':''}>Vyhodnotiť</button></div>
 <p class="fine">Správne odpovede uvidíš po vyhodnotení.</p></section>`;
}
function flag(q) {
 return q.image?`<img class="flag" src="assets/flags/${esc(q.image)}.svg" alt="Vlajka, ktorú máš rozpoznať">`:'';
}
function resultView() {
 const r=result;
 return `<section class="panel result"><p class="eyebrow">VÝSLEDOK KVÍZU</p><h1 tabindex="-1" id="result-title">Kvíz dokončený</h1>
 <div class="score"><strong>${r.correct}/${r.total}</strong><span>${Math.round(r.correct/r.total*100)} % · +${fmt(r.earned)} bodov</span></div>
 ${r.level>r.previous?`<p class="notice">Nový level <strong>${levels[r.level-1]}</strong>. Aktuálne body sa vynulovali.</p>`:''}
 <button class="primary" data-action="home">Vybrať ďalší kvíz →</button></section>
 <section class="section"><h2>Všetky odpovede</h2><ol class="reviews">
 ${r.review.map(q=>`<li class="review ${q.answer===q.selected?'correct':'incorrect'}"><strong>${q.answer===q.selected?'✓':'✕'} ${esc(q.prompt)}</strong>${flag(q)}
 <span>Tvoja odpoveď · ${esc(q.selected)}</span><span>Správna odpoveď · <b>${esc(q.answer)}</b></span>
 <a href="${esc(q.source)}" target="_blank" rel="noopener noreferrer">Overiť údaj ↗</a></li>`).join('')}
 </ol></section>`;
}
function leaderboard() {
 return `<section class="panel"><p class="eyebrow">GEOGRAPHY QUIZ MASTER</p><h1>Globálny rebríček</h1>
 <p class="muted">Poradie podľa levelu a aktuálnych bodov.</p>
 ${!online?'<p>Online rebríček bude dostupný po pripojení Supabase. Výsledky z dema ostávajú v tomto prehliadači.</p>':
 leaders.length?`<div class="table-wrap"><table><thead><tr><th>Poradie</th><th>Hráč</th><th>Level</th><th>Body</th></tr></thead><tbody>
 ${leaders.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.avatar)} ${esc(p.name)}</td><td>${levels[p.level-1]}</td><td>${fmt(p.points)}</td></tr>`).join('')}
 </tbody></table></div>`:busy?'<p>Načítavam rebríček…</p>':'<p>Zatiaľ tu nie sú žiadni online hráči.</p>'}</section>`;
}
function profileView(p) {
 const stats=records(), currentAvatar=pickedAvatar||p?.avatar;
 const attained=new Map(stats.slice().reverse().filter(r=>r.level>r.previous).map(r=>[r.level,r.date]));
 return `<section class="panel"><p class="eyebrow">${session?'ONLINE ÚČET':'LOKÁLNE DEMO'}</p><h1>Profil hráča</h1>
 ${p?`<form id="profile-form"><label>Meno <input name="name" value="${esc(p.name)}" minlength="2" maxlength="24" required></label>
 <fieldset><legend>Vyber zvierací avatar</legend><div class="avatars">
 ${avatars.map((a,i)=>`<label class="avatar-choice"><input type="radio" name="avatar" value="${a}" ${a===currentAvatar?'checked':''}><span aria-hidden="true">${a}</span><span class="sr-only">${['Lev','Tiger','Medveď','Panda','Líška','Vlk','Koala','Žaba','Opica','Mačka','Pes','Králik','Krava','Prasa','Sova','Tučniak','Korytnačka','Chobotnica','Motýľ','Delfín'][i]}</span></label>`).join('')}
 </div></fieldset><button class="primary" ${busy?'disabled':''}>Uložiť profil</button></form>`:''}</section>
 ${p?`<section class="panel"><h2>História levelov</h2><ol class="levels">
 ${levels.map((name,i)=>`<li class="${p.level===i+1?'current':''}"><span>${i+1}. ${name}</span><span>${i+1<=p.level?(attained.has(i+1)?date(attained.get(i+1)):'Dosiahnutý'):fmt(thresholds[i])+' bodov'}</span></li>`).join('')}
 </ol></section><section class="panel"><h2>História kvízov</h2>
 ${stats.length?`<div class="table-wrap"><table><thead><tr><th>Dátum</th><th>Obtiažnosť</th><th>Výsledok</th><th>Body</th></tr></thead><tbody>
 ${stats.map(r=>`<tr><td>${date(r.date)}</td><td>${modes[r.difficulty-1].name}</td><td>${r.correct}/${r.total}</td><td>+${fmt(r.earned)}</td></tr>`).join('')}
 </tbody></table></div>`:'<p>Zatiaľ nemáš dokončený kvíz.</p>'}</section>`:''}
 ${online?`<section class="panel"><h2>${session?'Online účet':'Prihlásenie a registrácia'}</h2>
 ${session?`<button data-action="logout" ${busy?'disabled':''}>Odhlásiť sa</button>`:`<p>Online účet ukladá výsledky do globálneho rebríčka.</p><form id="auth-form"><label>E-mail <input type="email" name="email" autocomplete="email" required></label><label>Heslo <input type="password" name="password" autocomplete="current-password" minlength="8" required></label>
 <div class="controls"><button class="primary" name="action" value="login" ${busy?'disabled':''}>Prihlásiť sa</button><button name="action" value="signup" ${busy?'disabled':''}>Vytvoriť účet</button></div></form>`}</section>`:''}`;
}
async function act(work,{focus,showBusy=true}={}) {
 if(busy) return;
 busy=true;
 status='';
 if(showBusy) render();
 try {await work();}
 catch(e){status=e.message||'Operácia sa nepodarila.';}
 finally {
  busy=false;
  render();
  if(focus) document.querySelector(focus)?.focus();
 }
}
root.addEventListener('change',e=>{
 const input=e.target;
 if(input.name==='answer'&&run){
  run.answers[current]=run.questions[current].options[Number(input.value)];
  root.querySelector('.quiz .row span:last-child').textContent=run.answers.filter(x=>x!==undefined).length+'/'+run.questions.length+' zodpovedaných';
  root.querySelector('progress').value=run.answers.filter(x=>x!==undefined).length;
  root.querySelector('#finish').disabled=run.answers.filter(x=>x!==undefined).length!==run.questions.length;
 }
 if(input.name==='avatar') pickedAvatar=input.value;
});
root.addEventListener('click',e=>{
 const button=e.target.closest('[data-action]');
 if(!button) return;
 switch(button.dataset.action){
 case 'choose':
  e.preventDefault();
  document.querySelector('#obtiaznosti').scrollIntoView({behavior:'smooth'});
  break;
 case 'start':
  act(async()=>{
   const difficulty=Number(button.dataset.value);
   const next=session?await rpc('quiz_start',{p_difficulty:difficulty}):
    {difficulty,questions:select(DEMO_QUESTIONS,demo.level,difficulty)};
   run={...next,answers:[]};
   current=0;
   result=null;
   if(next.difficulty!==difficulty) status='Pokračuješ v rozhranom kvíze.';
   window.scrollTo(0,0);
  },{focus:'#question'});
  break;
 case 'back': case 'next':
  current+=button.dataset.action==='back'?-1:1;
  render();
  document.querySelector('#question').focus();
  break;
 case 'finish':
  act(async()=>{
   if(session){
    result=await rpc('quiz_finish',{p_run:run.id,p_answers:run.answers});
    profile={...profile,level:result.level,points:result.points};
    if(!history.some(r=>r.id===result.id)) history.unshift(result);
   }else{
    result=grade(demo,run.difficulty,run.questions,run.answers);
    demo={...demo,level:result.level,points:result.points,history:[result,...demo.history]};
    saveDemo();
   }
   run=null;
   window.scrollTo(0,0);
  },{focus:'#result-title'});
  break;
 case 'home': result=null;render();window.scrollTo(0,0);break;
 case 'logout':
  act(async()=>{
   await request('/auth/v1/logout',{method:'POST',token:await token()});
   saveSession(null);profile=null;history=[];run=null;result=null;pickedAvatar=null;
  });
  break;
 }
});
root.addEventListener('submit',e=>{
 e.preventDefault();
 const fields=new FormData(e.target);
 if(e.target.id==='profile-form'){
  const name=fields.get('name').trim(),avatar=fields.get('avatar');
  act(async()=>{
   if(name.length<2||name.length>24||!avatars.includes(avatar)) throw Error('Zadaj meno s 2 až 24 znakmi a vyber avatar.');
   if(session){
    const [saved]=await request('/rest/v1/profiles?id=eq.'+profile.id,{
     method:'PATCH',body:{name,avatar},token:await token(),headers:{Prefer:'return=representation'}});
    if(!saved) throw Error('Profil sa nepodarilo uložiť.');
    profile=saved;
   }else{demo={...demo,name,avatar};saveDemo();}
   pickedAvatar=null;
   status='Profil uložený.';
  },{showBusy:false});
 } else if(e.target.id==='auth-form'){
  const signup=e.submitter?.value==='signup';
  act(async()=>{
   const redirect=location.origin+location.pathname;
   const path=signup?'/auth/v1/signup?redirect_to='+encodeURIComponent(redirect):'/auth/v1/token?grant_type=password';
   const data=await request(path,{method:'POST',body:{email:fields.get('email'),password:fields.get('password')}});
   if(data.access_token){
    saveSession(data);
    run=null;result=null;pickedAvatar=null;
    await sync();
   }else status='Skontroluj e-mail a potvrď registráciu.';
  },{showBusy:false});
 }
});
async function navigate() {
 const page=route();
 if(page!==lastRoute){status='';lastRoute=page;window.scrollTo(0,0);}
 render();
 if(page==='rebricek'&&online&&!busy) await act(async()=>{leaders=await rpc('quiz_leaderboard');});
}
window.addEventListener('hashchange',navigate);
const callback=new URLSearchParams(location.hash.slice(1));
if(online&&(callback.has('access_token')||callback.has('error_description'))){
 if(callback.has('access_token')) saveSession({
  access_token:callback.get('access_token'),refresh_token:callback.get('refresh_token'),
  expires_at:Number(callback.get('expires_at'))||Date.now()/1000+Number(callback.get('expires_in'))
 });
 else status=callback.get('error_description');
 window.history.replaceState(null,'',location.pathname+'#profil');
}
render();
(async()=>{
 if(session) await act(sync);
 await navigate();
})();
})();