// v15：新模块（表情/发型/CharaDB 并入动画/历代/场景/光影/道具/家具）+ 试穿表情槽位
const {chromium}=require('playwright');const path=require('path'),SS=path.join(__dirname,'screenshots')+'/';require('fs').mkdirSync(SS,{recursive:true});
(async()=>{const U=process.env.U||'http://localhost:8787';const b=await chromium.launch({executablePath:process.env.CHROME_PATH});const errs=[],R=[];const S=SS+'v15-';const T=20000;
const ok=(n,v,d)=>{R.push((v?'PASS ':'FAIL ')+n+(d?' :: '+d:''))};
const W=(pg,f,a)=>pg.waitForFunction(f,a,{timeout:T}).then(()=>true).catch(()=>false);
const ctx=await b.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(''+e));pg.on('console',m=>m.type()=='error'&&!/404/.test(m.text())&&errs.push(m.text()));
await pg.goto(U+'/');ok('home grid',await W(pg,()=>document.querySelectorAll('#grid .card img.ld').length>=5));
// ---- 各新栏目：数据条数 + 卡片渲染 + 导航计数 ----
const EXP={expr:95,hair:54,dyn:57,scene:64,light:50,prop:32,furn:41}; // 历代/四库已剔除上游零视角空壳条目（历代 60−3、场景 68−4、光影 55−5、道具 36−4、家具 48−7）
for(const [t,n] of Object.entries(EXP)){
  await pg.evaluate(t=>APP.setTab(t),t);
  const len=await pg.evaluate(t=>APP.DATA[t].length,t);
  ok(t+' 数据条数 '+len,len==n,'expect '+n);
  ok(t+' 卡片渲染',await W(pg,()=>document.querySelectorAll('#grid .card img.ld').length>=3));
  const nav=await pg.evaluate(t=>{const m={expr:'#nExp',hair:'#nHair',dyn:'#nDyn',scene:'#nSce',light:'#nLig',prop:'#nPro',furn:'#nFur'};return document.querySelector(m[t]).textContent},t);
  ok(t+' 导航计数',+nav==n,nav);
}
// ---- 表情：情绪 + 强度筛选 ----
await pg.click('[data-tab=expr]');await W(pg,()=>APP.st.tab=='expr'&&document.querySelector('#grid .card'));
await pg.evaluate(()=>{APP.st.f={emo:'愤怒'};APP.apply()});
ok('表情情绪筛选',await pg.evaluate(()=>APP.st.list.length==8&&APP.st.list.every(i=>i.emo=='愤怒')));
await pg.evaluate(()=>{APP.st.f={emo:'愤怒',int:'强烈'};APP.apply()});
ok('表情强度筛选',await pg.evaluate(()=>APP.st.list.length>0&&APP.st.list.length<8&&APP.st.list.every(i=>i.int=='强烈')));
await pg.evaluate(()=>{APP.st.f={};APP.apply()});
// ---- 历代：朝代筛选（唐 6 套，另 2 套为零视角空壳已剔除）+ 灯箱切视角 ----
await pg.click('[data-tab=dyn]');await W(pg,()=>APP.st.tab=='dyn'&&document.querySelector('#grid .card'));
await pg.evaluate(()=>{APP.st.f={era:'唐'};APP.apply()});
ok('历代朝代筛选',await pg.evaluate(()=>APP.st.list.length==6&&APP.st.list.every(i=>i.era=='唐')));
await pg.evaluate(()=>document.querySelector('#grid .card .phk').click());
ok('历代灯箱打开',await W(pg,()=>!document.querySelector('#lb').hidden));
const src0=await pg.evaluate(()=>document.querySelector('#lbImg').dataset.src);
await pg.evaluate(()=>{const b=[...document.querySelectorAll('#lbSide [data-ai]')].find(x=>x.textContent.includes('背面'));b&&b.click()});
await pg.waitForTimeout(400);
const src1=await pg.evaluate(()=>document.querySelector('#lbImg').dataset.src);
ok('灯箱切视角换图',src0!=src1&&/_back\.webp/.test(src1||''),src1);
await pg.keyboard.press('Escape');await W(pg,()=>document.querySelector('#lb').hidden);await pg.evaluate(()=>{APP.st.f={};APP.apply()});
// ---- 发型参考与原创动画服装 ----
await pg.evaluate(()=>APP.setTab('hair'));
const hsrc=await pg.evaluate(()=>document.querySelector('#grid .card img').src);
ok('发型图片来自 CC0 人像库',/^https:\/\/ai-portrait-gallery\.pages\.dev\/img\/thumb\//.test(hsrc),hsrc);
ok('发型支持发长筛选',await pg.evaluate(()=>new Set(APP.DATA.hair.map(i=>i.cat)).size==4));
await pg.evaluate(()=>APP.setTab('anime'));
ok('原创动画服装共 64 套',await pg.evaluate(()=>APP.DATA.anime.length==64),await pg.evaluate(()=>''+APP.DATA.anime.length));
ok('原创条目引用本站图',await pg.evaluate(()=>APP.DATA.anime.every(it=>/^AW\d{2}$/.test(it.id)&&it.t.startsWith('a/i/'))));
// ---- 场景/光影抽查：机位筛选 ----
await pg.evaluate(()=>APP.setTab('scene'));await W(pg,()=>APP.st.tab=='scene'&&document.querySelector('#grid .card'));
await pg.evaluate(()=>{APP.st.f={ang:'俯视'};APP.apply()});
ok('场景机位筛选',await pg.evaluate(()=>APP.st.list.length>0&&APP.st.list.every(i=>i.angles.some(a=>a.zh=='俯视'))));
await pg.evaluate(()=>{APP.st.f={};APP.apply()});
// ---- 收藏新模块条目（发型）→ 收藏页渲染 ----
await pg.evaluate(()=>APP.setTab('hair'));await W(pg,()=>APP.st.tab=='hair'&&document.querySelector('#grid .card'));
await pg.evaluate(()=>{const it=APP.DATA.hair[0];APP.toggleFav(it.k,1)});
await pg.evaluate(()=>APP.setTab('fav'));
ok('收藏页含发型条目',await W(pg,()=>document.querySelectorAll('#grid .card').length>=1));
// ---- 试穿：表情槽位（占位 + 数据打通，不做真实生图） ----
await pg.goto(U+'/#studio');await pg.waitForFunction(()=>window.WB&&window.APP,null,{timeout:15000});
const slot=await pg.evaluate(async()=>{await APP.load('expr');const it=APP.DATA.expr.find(i=>i.id=='angry-025');await WB.pick(it);return WB._W.exprs.length});
ok('WB.pick 表情进槽位',slot==1);
ok('表情槽位渲染',await W(pg,()=>document.querySelector('#wbEx .pick')!=null));
await pg.screenshot({path:S+'studio-expr.png'});
await pg.evaluate(()=>{WB._W.pl='zh';document.querySelector('#wbPrompt').value='';WB._W.dirty=false;const ev=new Event('input',{bubbles:true});document.querySelector('#wbExtra').dispatchEvent(ev)});
const pr=await pg.evaluate(()=>document.querySelector('#wbPrompt').value);
ok('提示词含表情迁移句（中）',/只迁移神态/.test(pr)&&/五官、脸型和身份/.test(pr),pr.slice(0,60));
await pg.evaluate(()=>{WB._W.pl='en';document.querySelector('#wbPrompt').value='';WB._W.dirty=false;const ev=new Event('input',{bubbles:true});document.querySelector('#wbExtra').dispatchEvent(ev)});
const pre=await pg.evaluate(()=>document.querySelector('#wbPrompt').value);
ok('提示词含表情迁移句（英）',/Transfer ONLY the expression/.test(pre)&&/identity must remain/.test(pre),pre.slice(0,60));
ok('无页面错误',errs.length==0,errs.slice(0,3).join(' | '));
await b.close();
const fail=R.filter(x=>x.startsWith('FAIL'));console.log(R.join('\n'));console.log(fail.length?('V15 FAIL '+fail.length):'V15 ALL PASS');process.exit(fail.length?1:0)})().catch(e=>{console.error(e);process.exit(1)});
