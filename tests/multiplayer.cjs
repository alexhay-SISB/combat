// Run: node tests/multiplayer.cjs
// Tests real application modules in isolated Node VM contexts with an in-memory
// RTDB test double. This does not test real Firebase rules, transport or rendering.
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('node:assert/strict');
const root=process.env.COMBAT_SOURCE || path.resolve(__dirname,'..');
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
class Database {
  constructor(){this.data={};this.listeners=[];this.serial=0;this.denied=false;}
  read(p){return p.split('/').filter(Boolean).reduce((v,k)=>v?.[k],this.data)??null;}
  write(p,value){const ks=p.split('/').filter(Boolean);let obj=this.data;for(const k of ks.slice(0,-1)) obj=obj[k]??={};if(value===null)delete obj[ks.at(-1)];else obj[ks.at(-1)]=clone(value);this.emit(p);}
  snap(p){return {val:()=>clone(this.read(p)),key:p.split('/').at(-1)};}
  emit(p){for(const l of [...this.listeners])if(p===l.p||p.startsWith(l.p+'/')||l.p.startsWith(p+'/'))l.fn(this.snap(l.p));}
  ref(p){const db=this;return {
    push:()=>({key:'cloud'+(++db.serial)}),
    async set(v){if(db.denied)throw Error('PERMISSION_DENIED');db.write(p,v)},
    async update(v){if(db.denied)throw Error('PERMISSION_DENIED');db.write(p,{...(db.read(p)||{}),...v})},
    async once(){if(db.denied)throw Error('PERMISSION_DENIED');return db.snap(p)},
    async transaction(fn){if(db.denied)throw Error('PERMISSION_DENIED');const out=fn(clone(db.read(p)));if(out===undefined)return {committed:false,snapshot:db.snap(p)};db.write(p,out);return {committed:true,snapshot:db.snap(p)};},
    on(event,fn,onError){if(db.denied){onError?.(Error('PERMISSION_DENIED'));return fn}db.listeners.push({p,fn});fn(db.snap(p));return fn},
    off(event,fn){db.listeners=db.listeners.filter(l=>l.p!==p||l.fn!==fn)},
    async remove(){db.write(p,null)}
  };}
}
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i],get length(){return map.size}}}
function client(db,role){
 const elements=new Map();
 const element=id=>{if(!elements.has(id)){const classes=new Set();const el={id,value:'',textContent:'',innerHTML:'',disabled:false,style:{},dataset:{},classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:v=>classes.has(v)},setAttribute(){},addEventListener(){},querySelector(){return element(id+'-content')},querySelectorAll(){return []},focus(){},remove(){elements.delete(id)}};elements.set(id,el)}return elements.get(id)};
 const document={getElementById:id=>elements.get(id)||null,createElement:()=>({style:{},setAttribute(){},remove(){elements.delete(this.id)}}),body:{appendChild:e=>elements.set(e.id,e),classList:{add(){},remove(){}}},addEventListener(){}};
 // Populate fixture IDs from the actual page rather than an invented UI.
 const html=fs.readFileSync(path.join(root,role==='teacher'?'teacher.html':'student.html'),'utf8');
 for(const m of html.matchAll(/id="([^"]+)"/g))element(m[1]);
 const errors=[],alerts=[];const ctx=vm.createContext({document,window:{addEventListener(){}},localStorage:storage(),sessionStorage:storage(),TOURNAMENT_ID:'default',console:{log(){},warn(){},error:(...e)=>errors.push(e)},setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},alert:x=>alerts.push(x),confirm:()=>true,location:{reload(){}},firebase:{database:Object.assign(()=>db,{ServerValue:{TIMESTAMP:1}})}});
 const run=s=>vm.runInContext(s,ctx);
 const load=f=>run(fs.readFileSync(path.join(root,'js',f),'utf8'));
 load('firebase.js');ctx.FB=run('Firebase');ctx.FB.db=db;ctx.FB.initialized=true;
 if(role==='teacher'){
   load('teacher.js');ctx.Lobby=run('Lobby');ctx.Round=run('RoundManager');ctx.Teacher=run('Teacher');
   // Spectator canvas rendering is outside this sync suite.
   run('Spectator.attachFirebase=()=>{};');
 }else{
   load('lobby-student.js');ctx.Student=run('StudentLobby');ctx.launches=[];
   ctx.Game={state:'lobby',startQuiz(q,c){this.state='quiz';ctx.launches.push({q,c,id:ctx.sessionStorage.getItem('combat:currentMatchId'),num:ctx.sessionStorage.getItem('combat:myPlayerNum')})},detectNetworkRole(){},applyTeacherSettings(){}};
 }
 return {ctx,run,element,errors,alerts};
}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('teacher-created player and student on another device share one ID',async()=>{const db=new Database(),t=client(db,'teacher'),a=client(db,'student');await t.ctx.Lobby.addPlayer('Alex');const id=t.ctx.Lobby.players[0].id;await a.ctx.Student.joinLobby(' alex ');assert.equal(a.ctx.Student.myStudentId,id);assert.equal(a.ctx.Student.myName,'Alex');assert.equal(Object.keys(db.read('tournaments/default/players')).length,1)});
test('simultaneous same-name registration resolves a single identity',async()=>{const db=new Database(),a=client(db,'student'),b=client(db,'student');const [x,y]=await Promise.all([a.ctx.FB.registerPlayer('Sam'),b.ctx.FB.registerPlayer('SAM')]);assert.equal(x.id,y.id);assert.equal(Object.keys(db.read('tournaments/default/players')).length,1)});
test('rejoining preserves stats and existing legacy ID',async()=>{const db=new Database();db.write('tournaments/default/players/old-id',{name:'Alex',wins:7,kills:12,rating:850,active:false});const a=client(db,'student');await a.ctx.Student.joinLobby('Alex');assert.equal(a.ctx.Student.myStudentId,'old-id');assert.equal(db.read('tournaments/default/players/old-id/wins'),7);assert.equal(db.read('tournaments/default/players/old-id/active'),true)});
test('cloud roster replaces conflicting teacher local IDs',async()=>{const db=new Database(),t=client(db,'teacher'),a=client(db,'student');t.ctx.Lobby.players=[{id:'wrong-local',name:'Alex'}];await a.ctx.Student.joinLobby('Alex');t.ctx.Teacher.attachFirebaseListeners();assert.equal(t.ctx.Lobby.players[0].id,a.ctx.Student.myStudentId)});
test('two students see each other; teacher pairs them; host/client launch once',async()=>{const db=new Database(),t=client(db,'teacher'),a=client(db,'student'),b=client(db,'student');t.ctx.Teacher.attachFirebaseListeners();a.ctx.Student.tryAttachFirebaseListener();b.ctx.Student.tryAttachFirebaseListener();await a.ctx.Student.joinLobby('Alex');await b.ctx.Student.joinLobby('Sam');assert.equal(t.ctx.Lobby.players.length,2);assert.equal(a.ctx.Student._players.length,2);assert.equal(b.ctx.Student._players.length,2);t.element('t-quiz-timer').value='90';t.element('t-combat-timer').value='180';await t.ctx.Round.startRound();assert.equal(a.ctx.launches.length,1);assert.equal(b.ctx.launches.length,1);assert.equal(a.ctx.launches[0].id,b.ctx.launches[0].id);assert.notEqual(a.ctx.launches[0].num,b.ctx.launches[0].num);assert.equal(a.ctx.launches[0].q,90);assert.equal(b.ctx.launches[0].c,180);db.emit('tournaments/default/pairings');a.ctx.Student.poll();assert.equal(a.ctx.launches.length,1);assert.equal(a.ctx.Student.state,'in_match')});
test('cloud pending pair is not erased by empty local polling',()=>{const db=new Database(),a=client(db,'student');a.ctx.Student.myStudentId='a';a.ctx.Student.myName='Alex';a.ctx.Student.firebaseListenerActive=true;a.ctx.Student.handlePairingsUpdate({match0:{matchId:'m',p1Id:'a',p2Id:'b',p1Name:'Alex',p2Name:'Sam',status:'pending',round:1}});a.ctx.localStorage.setItem('combat:pairings','[]');a.ctx.Student.poll();assert.equal(a.ctx.Student.state,'paired')});
test('leave and rejoin update both teacher and student rosters without losing stats',async()=>{const db=new Database(),t=client(db,'teacher'),a=client(db,'student');t.ctx.Teacher.attachFirebaseListeners();a.ctx.Student.tryAttachFirebaseListener();await a.ctx.Student.joinLobby('Alex');const id=a.ctx.Student.myStudentId;await a.ctx.FB.updatePlayerStats(id,{wins:3});await a.ctx.Student.leaveLobby();assert.equal(t.ctx.Lobby.players.length,0);await a.ctx.Student.joinLobby('Alex');assert.equal(a.ctx.Student.myStudentId,id);assert.equal(db.read(`tournaments/default/players/${id}/wins`),3);assert.equal(t.ctx.Lobby.players.length,1)});
test('bulk add uses the shared roster and case-insensitive IDs',async()=>{const db=new Database(),t=client(db,'teacher');t.ctx.Teacher.attachFirebaseListeners();t.element('bulk-add-input').value='Alex\nSam\nALEX';await t.ctx.Lobby.bulkAdd();assert.equal(t.ctx.Lobby.players.length,2);assert.equal(Object.keys(db.read('tournaments/default/players')).length,2)});
test('three players produce one match plus a bye with no null-player launch',async()=>{const db=new Database(),t=client(db,'teacher');t.ctx.Teacher.attachFirebaseListeners();for(const name of ['Alex','Sam','Jo'])await t.ctx.Lobby.addPlayer(name);await t.ctx.Round.startRound();assert.equal(t.ctx.Round.pairings.length,2);const bye=t.ctx.Round.pairings.find(p=>p.status==='bye');assert(bye);const a=client(db,'student');a.ctx.Student.myStudentId=bye.p1Id;a.ctx.Student.myName=bye.p1Name;a.ctx.Student.handlePairingsUpdate(db.read('tournaments/default/pairings'));assert.equal(a.ctx.launches.length,0);assert.equal(a.ctx.Student.state,'waiting')});
test('reset round clears cloud pairings',async()=>{const db=new Database(),t=client(db,'teacher');await t.ctx.FB.setPairings([{matchId:'old',round:2,status:'in_progress'}]);await t.ctx.Round.reset();assert.equal(Object.keys(db.read('tournaments/default/pairings')).length,0)});
test('match completion reaches teacher, preserves results overlay and cannot replay on return',async()=>{const db=new Database(),t=client(db,'teacher'),a=client(db,'student'),b=client(db,'student');t.ctx.Teacher.attachFirebaseListeners();a.ctx.Student.tryAttachFirebaseListener();b.ctx.Student.tryAttachFirebaseListener();await a.ctx.Student.joinLobby('Alex');await b.ctx.Student.joinLobby('Sam');await t.ctx.Round.startRound();const p=t.ctx.Round.pairings[0];assert(await a.ctx.FB.endMatch(p.matchId,p.p1Id,p.p2Id,p.p1Name,p.p2Name,p.p1Name,2,1,15,10));assert.equal(t.ctx.Round.pairings[0].status,'done');assert.equal(a.ctx.Student.state,'in_match');a.ctx.Student.returnToLobby();const old={...p,status:'in_progress'};a.ctx.Student.handlePairingsUpdate({match0:old});assert.equal(a.ctx.launches.length,1);await t.ctx.Round.startRound();assert.equal(a.ctx.launches.length,2)});
test('finishing an old match never overwrites a newer pairing',async()=>{const db=new Database(),a=client(db,'student');const x=await a.ctx.FB.registerPlayer('A'),y=await a.ctx.FB.registerPlayer('B');await a.ctx.FB.setPairings([{matchId:'new',p1Id:x.id,p2Id:y.id,status:'in_progress'}]);await a.ctx.FB.endMatch('old',x.id,y.id,'A','B',null,0,0,0,0);assert.equal(db.read('tournaments/default/pairings/match0/status'),'in_progress')});
test('permission denial does not falsely enter lobby and displays explanation',async()=>{const db=new Database(),a=client(db,'student');db.denied=true;await a.ctx.Student.joinLobby('Alex');assert.equal(a.ctx.Student.myStudentId,null);assert.equal(a.ctx.Student.state,'name');assert.equal(a.element('lobby-join-btn').disabled,false);assert.match(a.ctx.document.getElementById('sync-error').textContent,/denied/)});
test('server confirmation timeout is reported and does not claim success',async()=>{const a=client(new Database(),'student');await assert.rejects(a.ctx.FB.confirmWithin(new Promise(()=>{}),5),/timed out/)});
test('all local HTML script, stylesheet and navigation paths exist',()=>{for(const file of ['index.html','student.html','teacher.html']){const html=fs.readFileSync(path.join(root,file),'utf8');for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(/^https?:/.test(m[1]))continue;assert(fs.existsSync(path.join(root,m[1].split('?')[0])),`${file}: ${m[1]}`)}}});
test('Firebase startup signs in before enabling database writes',async()=>{
 const db=new Database(),a=client(db,'student');db.denied=true;
 let release,calls=0;const auth={currentUser:null,signInAnonymously(){calls++;return new Promise(resolve=>{release=()=>{auth.currentUser={uid:'anonymous-test'};db.denied=false;resolve({user:auth.currentUser})}})}};
 a.ctx.firebase.apps=[];a.ctx.firebase.initializeApp=()=>a.ctx.firebase.apps.push({});a.ctx.firebase.auth=()=>auth;a.ctx.window.firebase=a.ctx.firebase;a.ctx.FB.initialized=false;a.ctx.FB.db=null;
 const first=a.ctx.FB.init({}),second=a.ctx.FB.init({});
 assert.equal(a.ctx.FB.isInitialized(),false);assert.equal(a.ctx.FB.db,null);assert.equal(calls,1);
 const joining=a.ctx.Student.joinLobby('Alex');assert.equal(a.ctx.Student.myStudentId,null);
 release();assert(await first);assert(await second);await joining;
 assert(a.ctx.Student.myStudentId);assert.equal(a.ctx.Student.state,'waiting');assert.equal(calls,1);
});
test('existing authenticated session is reused',async()=>{
 const a=client(new Database(),'student');a.ctx.FB.initialized=false;a.ctx.FB.db=null;
 a.ctx.firebase.apps=[{}];a.ctx.firebase.initializeApp=()=>{throw Error('duplicate app')};a.ctx.firebase.auth=()=>({currentUser:{uid:'existing'},signInAnonymously(){throw Error('unnecessary sign-in')}});a.ctx.window.firebase=a.ctx.firebase;
 assert(await a.ctx.FB.init({}));assert(a.ctx.FB.isInitialized());
});
test('disabled anonymous provider blocks joins with a specific setup message',async()=>{
 const a=client(new Database(),'student');a.ctx.FB.initialized=false;a.ctx.FB.db=null;
 a.ctx.firebase.apps=[{}];a.ctx.firebase.initializeApp=()=>{};a.ctx.firebase.auth=()=>({currentUser:null,signInAnonymously:()=>Promise.reject(Object.assign(Error('Disabled'),{code:'auth/operation-not-allowed'}))});a.ctx.window.firebase=a.ctx.firebase;
 assert.equal(await a.ctx.FB.init({}),false);assert.equal(a.ctx.FB.db,null);await a.ctx.Student.joinLobby('Alex');
 assert.equal(a.ctx.Student.myStudentId,null);assert.match(a.ctx.document.getElementById('sync-error').textContent,/enable Anonymous/);
});
test('both entry pages load the authentication SDK before Firebase manager',()=>{
 for(const file of ['student.html','teacher.html']){const html=fs.readFileSync(path.join(root,file),'utf8');assert(html.indexOf('firebase-auth-compat.js')>html.indexOf('firebase-app-compat.js'));assert(html.indexOf('firebase-auth-compat.js')<html.indexOf('js/firebase.js?'));assert(html.includes('APP_VERSION = 28'));}
});
(async()=>{let failed=0;const selected=tests.filter(([name])=>!process.env.TEST_FILTER || new RegExp(process.env.TEST_FILTER).test(name));for(const [name,fn]of selected){try{await fn();console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.stack)}}console.log(`${selected.length-failed}/${selected.length} tests passed (isolated clients; simulated database, not a live browser).`);process.exitCode=failed?1:0})();
