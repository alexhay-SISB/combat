// Run with: firebase emulators:exec --project demo-combat-security --only database,auth 'node tests/browser.cjs'
const {chromium}=require('playwright');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+'/')||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(resolve=>server.listen(8080,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const errors=[]; const contexts=[];
 async function page(role){const context=await browser.newContext();contexts.push(context);await context.route('https://www.gstatic.com/firebasejs/10.4.0/*',async route=>{const name=route.request().url().split('/').pop();const disk=path.join('/tmp/combat-sdk',name);if(fs.existsSync(disk))await route.fulfill({path:disk,contentType:'application/javascript'});else await route.continue();});
 await context.route('**/js/firebase-config.js*',route=>route.fulfill({contentType:'application/javascript',body:`const FIREBASE_CONFIG = {apiKey:'demo-key',authDomain:'demo-combat-security.firebaseapp.com',databaseURL:'https://demo-combat-security-default-rtdb.firebaseio.com',projectId:'demo-combat-security'};const TOURNAMENT_ID='default'; const realInit=firebase.initializeApp;firebase.initializeApp=function(...args){const app=realInit.apply(firebase,args);app.auth().useEmulator('http://127.0.0.1:9099',{disableWarnings:true});app.database().useEmulator('127.0.0.1',9000);return app;};`}));
 const pg=await context.newPage();pg.on('pageerror',e=>errors.push(`${role}: ${e.message}`));pg.on('console',msg=>{if(msg.type()==='error')errors.push(`${role}: ${msg.text()}`)});pg.on('dialog',d=>d.accept());await pg.goto(`http://127.0.0.1:8080/${role==='teacher'?'teacher':'student'}.html`);return pg;}
 try {
 const teacher=await page('teacher');assert(await teacher.locator('#teacher-auth').isVisible());assert(!await teacher.locator('.teacher-shell').isVisible());
 const token=[Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:'google-teacher',email:'alexander.hay@sisbschool.com',email_verified:true,iss:'https://accounts.google.com',aud:'demo-combat-security',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),''].join('.');
 await teacher.evaluate(token=>firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(token)),token);
 await teacher.waitForFunction(()=>typeof Firebase!=='undefined'&&Firebase.isInitialized()&&document.querySelector('.teacher-shell').hidden===false);
 await teacher.locator('.bulk-add summary').click();
 await teacher.locator('#bulk-add-input').fill('Alex\nSam');
 await teacher.locator('#bulk-add-btn').click();
 await teacher.waitForFunction(()=>Lobby.players.length===2);
 await teacher.locator('#csv-file').setInputFiles({name:'security-test.csv',mimeType:'text/csv',buffer:Buffer.from('question_text,answer_1,answer_2,answer_3,answer_4,correct_answer,difficulty,subject\nWhat does a business sell?,Goods,Clouds,Stars,Moon,1,easy,Business\n')});
 await teacher.waitForFunction(()=>Teacher.questionsLabel.includes('security-test.csv'));
 const student1=await page('student1'),student2=await page('student2');
 for(const [pg,name] of [[student1,'Alex'],[student2,'Sam']]){await pg.waitForFunction(()=>Firebase.isInitialized());await pg.locator('#lobby-name-input').fill(name);await pg.locator('#lobby-join-btn').click();}
 await teacher.locator('#join-requests button', {hasText:'Approve'}).first().waitFor();
 for(let i=0;i<2;i++){await teacher.locator('#join-requests button').filter({hasText:'Approve'}).first().click();}
 await student1.waitForFunction(()=>StudentLobby.state==='waiting');await student2.waitForFunction(()=>StudentLobby.state==='waiting');
 await teacher.waitForFunction(()=>Lobby.players.length===2);
 await teacher.locator('#t-quiz-timer').selectOption('30');await teacher.locator('#t-combat-timer').selectOption('60');
 await teacher.locator('#start-round-btn').click();
 await student1.waitForFunction(()=>Game.state==='quiz');await student2.waitForFunction(()=>Game.state==='quiz');
 for(const pg of [student1,student2]){
   await pg.waitForFunction(()=>Game.quizzes[Game.myPlayerNum-1].canAnswer());
   const slot=await pg.evaluate(()=>Game.myPlayerNum);
   await pg.locator(`#p${slot}-options button`).first().click();
   await pg.waitForFunction(()=>Game.quizzes[Game.myPlayerNum-1].score===5);
 }
 // End each quiz through the existing UI; normal timer length is unchanged.
 await student1.locator('#quiz-skip-btn').click();await student2.locator('#quiz-skip-btn').click();
 await student1.waitForFunction(()=>Game.state==='combat');await student2.waitForFunction(()=>Game.state==='combat');
 const role1=await student1.evaluate(()=>Game.networkRole);const host=role1==='host'?student1:student2,client=role1==='host'?student2:student1;
 await client.waitForFunction(()=>Game._firstStateLogged===true);
 const before=await host.evaluate(()=>({x:Game.tanks[1].x,y:Game.tanks[1].y}));
 await client.keyboard.down('ArrowUp');
 await host.waitForFunction(pos=>Math.hypot(Game.tanks[1].x-pos.x,Game.tanks[1].y-pos.y)>3,before);
 await client.keyboard.up('ArrowUp');
 await host.keyboard.press('Space');
 await host.waitForFunction(()=>Game.bullets.length>0);
 await teacher.waitForFunction(()=>Spectator.matches.size>0);
 await host.screenshot({path:'/tmp/combat-match.png'});
 // Shorten just this test match's clock; exercise the real update/end/result flow.
 await host.evaluate(()=>{Game.timeRemaining=0.03;});
 await host.waitForFunction(()=>Game.state==='results');await client.waitForFunction(()=>Game.state==='results');
 await teacher.waitForFunction(async()=>{const id=RoundManager.pairings[0]?.matchId;return id && (await Firebase.db.ref(`tournaments/default/matches/${id}/resultApplied`).once('value')).val()===true;});
 await teacher.screenshot({path:'/tmp/combat-teacher.png'});
 const result=await teacher.evaluate(async()=>{const match=RoundManager.pairings[0].matchId;return (await Firebase.db.ref(`tournaments/default/matches/${match}`).once('value')).val()});assert.equal(result.resultApplied,true);
 assert.equal(result.result.p1QuizScore,5);assert.equal(result.result.p2QuizScore,5);
 await teacher.locator('#use-test-bank').click();
 await student1.waitForFunction(()=>window.LOADED_QUESTIONS.length>1);
 for(const pg of [student1,student2])await pg.evaluate(()=>StudentLobby.returnToLobby());
 await teacher.locator('#start-round-btn').click();await student1.waitForFunction(()=>Game.state==='quiz');await student2.waitForFunction(()=>Game.state==='quiz');
 // Reset only after ending both test quizzes/match; then verify removals and wipe.
 await student1.locator('#quiz-skip-btn').click();await student2.locator('#quiz-skip-btn').click();
 await student1.waitForFunction(()=>Game.state==='combat');await student2.waitForFunction(()=>Game.state==='combat');
 const host2=await student1.evaluate(()=>Game.networkRole)==='host'?student1:student2;await host2.evaluate(()=>{Game.timeRemaining=0.03;});
 await teacher.waitForFunction(()=>RoundManager.pairings.every(p=>p.status==='done'));
 await teacher.locator('#reset-leaderboard').click();await teacher.waitForFunction(()=>Object.values(Leaderboard.getData()).every(p=>p.wins===0&&p.kills===0));
 assert.deepEqual(errors,[], 'No console errors during normal two-round gameplay');
 await teacher.locator('#player-list .remove-btn').first().click();await teacher.waitForFunction(()=>Lobby.players.length===1);
 await teacher.locator('#wipe-everything-btn').click();await teacher.waitForFunction(()=>Lobby.players.length===0&&RoundManager.pairings.length===0);
 // Revocation intentionally closes student subscriptions; permission notices during removal are expected.
 const unexpected=errors.filter(e=>!/permission_denied|permission-denied|PERMISSION_DENIED|access was denied|unavailable.*unload/i.test(e));
 assert.deepEqual(unexpected,[]);
 console.log('PASS browser: teacher sign-in gate, bulk roster, CSV sync, two approvals, quiz answers, host/client movement and firing, spectator, results, next round, reset stats, remove and wipe.');
 console.log('Unexpected browser errors:',unexpected.length);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
