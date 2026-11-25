// v15：新模块（表情/发型/CharaDB 并入动画/历代/场景/光影/道具/家具）+ 试穿表情槽位
const {chromium}=require('playwright');const path=require('path'),SS=path.join(__dirname,'screenshots')+'/';require('fs').mkdirSync(SS,{recursive:true});
(async()=>{const U=process.env.U||'http://localhost:8787';const b=await chromium.launch({executablePath:process.env.CHROME_PATH});const errs=[],R=[];const S=SS+'v15-';const T=20000;
const ok=(n,v,d)=>{R.push((v?'PASS ':'FAIL ')+n+(d?' :: '+d:''))};
const W=(pg,f,a)=>pg.waitForFunction(f,a,{timeout:T}).then(()=>true).catch(()=>false);
const ctx=await b.newContext({viewport:{width:1440,height:900}});const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(''+e));pg.on('console',m=>m.type()=='error'&&!/404/.test(m.text())&&errs.push(m.text()));
await pg.goto(U+'/');ok('home grid',await W(pg,()=>document.querySelectorAll('#grid .card img.ld').length>=5));
// A tab can become active before its view-transition callback paints the new cards.
async function openLibrary(type) {
  await pg.click('#libraryMenu summary');
  await pg.click(`[data-tab=${type}]`);
  await pg.waitForFunction(t => {
    const card = document.querySelector('#grid:not(.gbusy) .card');
    return APP.st.tab === t && APP.ITEMS[card?.dataset.k]?.type === t;
  }, type, {timeout:T});
}
// ---- 各新栏目：数据条数 + 卡片渲染 + 导航计数 ----
const EXP={expr:95,hair:122,dyn:57,scene:64,light:50,prop:32,furn:41}; // 历代/四库已剔除上游零视角空壳条目（历代 60−3、场景 68−4、光影 55−5、道具 36−4、家具 48−7）
for(const [t,n] of Object.entries(EXP)){
  await openLibrary(t);
  await pg.evaluate(t=>APP.load(t),t);
  const len=await pg.evaluate(t=>APP.DATA[t].length,t);
  ok(t+' 数据条数 '+len,len==n,'expect '+n);
  ok(t+' 卡片渲染',await W(pg,()=>document.querySelectorAll('#grid .card img.ld').length>=3));
  const nav=await pg.evaluate(t=>{const m={expr:'#nExp',hair:'#nHair',dyn:'#nDyn',scene:'#nSce',light:'#nLig',prop:'#nPro',furn:'#nFur'};return document.querySelector(m[t]).textContent},t);
  ok(t+' 导航计数',+nav==n,nav);
}
// ---- 表情：情绪 + 强度筛选 ----
await openLibrary('expr');
await pg.evaluate(()=>{APP.st.f={emo:'愤怒'};APP.apply()});
ok('表情情绪筛选',await pg.evaluate(()=>APP.st.list.length==8&&APP.st.list.every(i=>i.emo=='愤怒')));
await pg.evaluate(()=>{APP.st.f={emo:'愤怒',int:'强烈'};APP.apply()});
ok('表情强度筛选',await pg.evaluate(()=>APP.st.list.length==4&&APP.st.list.every(i=>i.int=='强烈')));
await pg.evaluate(()=>{APP.st.f={};APP.apply()});
// ---- 历代：朝代筛选（唐 6 套，另 2 套为零视角空壳已剔除）+ 灯箱切视角 ----
await openLibrary('dyn');
await pg.evaluate(()=>{APP.st.f={era:'唐'};APP.apply()});
ok('历代朝代筛选',await pg.evaluate(()=>APP.st.list.length==6&&APP.st.list.every(i=>i.era=='唐')));
await pg.evaluate(()=>document.querySelector('#grid .card .phk').click());
ok('历代灯箱打开',await W(pg,()=>!document.querySelector('#lb').hidden));
const src0=await pg.evaluate(()=>document.querySelector('#lbImg').dataset.src);
await pg.evaluate(()=>{const b=[...document.querySelectorAll('#lbSide [data-ai]')].find(x=>x.textContent.includes('背面'));b&&b.click()});
await pg.waitForTimeout(400);
const src1=await pg.evaluate(()=>document.querySelector('#lbImg').dataset.src);
ok('灯箱切视角换图',src0!=src1&&/_back\.webp/.test(src1||''),src1);
await pg.keyboard.press('Escape');await pg.evaluate(()=>{APP.st.f={};APP.apply()});
// ---- 发型：热链 + 发色变体 ----
await openLibrary('hair');
const hsrc=await pg.evaluate(()=>document.querySelector('#grid .card img').src);
ok('发型图片热链原站',/^https:\/\/charadb-2fi\.pages\.dev\/thumb\//.test(hsrc),hsrc);
ok('发型分组带 5 个发色变体',await pg.evaluate(()=>{const g=APP.DATA.hair.find(i=>i.angles);return g&&g.angles.length==5}));
ok('发型单品条数',await pg.evaluate(()=>APP.DATA.hair.filter(i=>!i.angles).length==76));
// ---- CharaDB 并入动画服装 ----
await openLibrary('anime');
ok('动画服装总数 1760',await pg.evaluate(()=>APP.DATA.anime.length==1760),await pg.evaluate(()=>''+APP.DATA.anime.length));
ok('charadb 条目在位且标记 ext',await pg.evaluate(()=>{const it=APP.DATA.anime.find(i=>i.id=='charadb-O001');return !!it&&it.ext==1&&/^https:\/\/charadb/.test(it.t)}));
ok('charadb 敏感条目默认隐藏',await pg.evaluate(()=>APP.DATA.anime.filter(i=>i.ext&&i.a).length==44&&APP.st.list.every(i=>!i.a)));
// ---- 场景/光影抽查：机位筛选 ----
await openLibrary('scene');
await pg.evaluate(()=>{APP.st.f={ang:'俯视'};APP.apply()});
ok('场景机位筛选',await pg.evaluate(()=>APP.st.list.length>0&&APP.st.list.every(i=>i.angles.some(a=>a.zh=='俯视'))));
await pg.evaluate(()=>{APP.st.f={};APP.apply()});
// ---- 收藏新模块条目（发型）→ 收藏页渲染 ----
await openLibrary('hair');
await pg.evaluate(()=>{const it=APP.DATA.hair[0];APP.toggleFav(it.k,1)});
await pg.click('#personalMenu summary');await pg.click('[data-tab=fav]');
ok('收藏页含发型条目',await W(pg,()=>document.querySelectorAll('#grid .card').length>=1));
// ---- 试穿：表情槽位（占位 + 数据打通，不做真实生图） ----
await pg.goto(U+'/#studio');await pg.waitForFunction(()=>window.WB&&window.APP,null,{timeout:15000});
const slot=await pg.evaluate(async()=>{await APP.load('expr');const it=APP.DATA.expr.find(i=>i.id=='angry-025');await WB.pick(it);return WB._W.exprs.length});
ok('WB.pick 表情进槽位',slot==1);
ok('表情槽位渲染',await W(pg,()=>document.querySelector('#wbEx .pick')!=null));
await pg.screenshot({path:S+'studio-expr.png'});
await pg.locator('[data-pl=zh]').click();
const pr=await pg.inputValue('#wbPrompt');
ok('单张表情图（中）',/第 1 张/.test(pr)&&/只迁移神态/.test(pr)&&!/人物照片/.test(pr));
await pg.locator('[data-pl=en]').click();
const pre=await pg.inputValue('#wbPrompt');
ok('单张表情图（英）',/expression: image 1/i.test(pre)&&/transfer the expression only/i.test(pre)&&!/person photo/i.test(pre));
await pg.setInputFiles('#wbFile',path.join(__dirname,'fixtures','person.png'));
await pg.waitForFunction(()=>WB._W.persons.length===1);
const withPerson=await pg.inputValue('#wbPrompt');
ok('有人物照片时保留身份（英）',/expression: image 2/i.test(withPerson)&&/identity from the person photo/i.test(withPerson));
await pg.locator('[data-pl=zh]').click();
const withPersonZh=await pg.inputValue('#wbPrompt');
ok('有人物照片时保留身份（中）',/表情：第 2 张/.test(withPersonZh)&&/五官、脸型和身份/.test(withPersonZh));
ok('无页面错误',errs.length==0,errs.slice(0,3).join(' | '));
await b.close();
const fail=R.filter(x=>x.startsWith('FAIL'));console.log(R.join('\n'));console.log(fail.length?('V15 FAIL '+fail.length):'V15 ALL PASS');process.exit(fail.length?1:0)})().catch(e=>{console.error(e);process.exit(1)});
