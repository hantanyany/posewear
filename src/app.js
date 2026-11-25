'use strict';
const _u=new URLSearchParams(location.search);let Q0=(_u.get('q')||'').slice(0,60),QT=_u.get('t')||'';
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),LS=k=>{try{return JSON.parse(localStorage[k]||'null')}catch(e){return null}},SV=(k,v)=>{try{localStorage[k]=JSON.stringify(v)}catch(e){}};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)'),HOVER=matchMedia('(hover:hover) and (pointer:fine)').matches;
const ITEMS={},DATA={},LOAD={},TABS=['pose','depth','costume','anime','portrait','expr','hair','dyn','scene','light','prop','furn','studio','fav','recent','history'],TNAME={pose:'姿势库',depth:'深度姿势',costume:'服装库',anime:'动画服装库',portrait:'人像库',expr:'表情库',hair:'发型库',dyn:'历代服饰',scene:'场景库',light:'光影库',prop:'道具库',furn:'家具库',studio:'工作台',fav:'我的收藏',recent:'最近浏览',history:'生成记录'};
const PFX={pose:'p:',depth:'d:',costume:'c:',anime:'a:',portrait:'r:',expr:'e:',hair:'h:',dyn:'y:',scene:'s:',light:'l:',prop:'t:',furn:'f:'},KT={p:'pose',d:'depth',c:'costume',a:'anime',r:'portrait',e:'expr',h:'hair',y:'dyn',s:'scene',l:'light',t:'prop',f:'furn'},TL=it=>({pose:'姿势',depth:'深度姿势',costume:'服装',anime:'动画服装',portrait:'人像',expr:'表情',hair:'发型',dyn:'历代服饰',scene:'场景',light:'光影',prop:'道具',furn:'家具'})[it.type];
const LEGACY_IDS={};
const resolveKey=k=>typeof k==='string'?(LEGACY_IDS[k]||k):k;
const storedKeys=name=>[...new Set((LS(name)||[]).map(resolveKey))];
const storedRecT=Object.fromEntries(Object.entries(LS('recT')||{}).map(([k,v])=>[resolveKey(k),v]));
const st={tab:'pose',q:'',f:{},sort:'def',lang:LS('lang')||'zh',tl:LS('tl')||'zh',fav:new Set(storedKeys('fav')),sel:storedKeys('sel'),rec:storedKeys('rec'),recT:storedRecT,ang:LS('ang')||{},list:[],n:0,adult:LS('adult')===true};
const ok=it=>it&&(st.adult||!it.a);
function load(t){return LOAD[t]||(LOAD[t]=fetch({pose:'poses.json',depth:'depths.json',costume:'costumes.json',anime:'anime.json',portrait:'portraits.json',expr:'expressions.json',hair:'hair.json',dyn:'dynasties.json',scene:'scenes.json',light:'lights.json',prop:'props.json',furn:'furniture.json'}[t]).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(raw=>{const a=Array.isArray(raw)?raw:(raw.items||[]);if(t=='depth')DATA.depthMeta=raw.pack||null;a.forEach((it,i)=>{it.type=t;it.k=PFX[t]+it.id;it.ord=i;if(it.angles)it.ai=it.angles[st.ang[it.k]]?Number(st.ang[it.k]):0;ITEMS[it.k]=it});DATA[t]=a;counts();return a}).catch(e=>{delete LOAD[t];throw e}))}
function counterpartType(item){
 if(item.type==='pose')return 'depth';
 if(item.type==='depth'&&item.pack==='gia-depth')return 'pose';
 return null;
}
function poseCounterpart(item,index=item.ai){
 const type=counterpartType(item);
 if(!type||!ok(item))return null;
 const other=ITEMS[PFX[type]+item.id];
 if(!ok(other)||!counterpartType(other))return null;
 const angle=other.angles.findIndex(a=>a.zh===item.angles[index]?.zh);
 return angle<0?null:{item:other,angle};
}
const flippedCards=new Map();
function cardFace(origin){
 const face=flippedCards.get(origin.k);
 return ok(face)?face:origin;
}
const needKeys=ks=>Promise.all([...new Set(ks.map(k=>KT[k[0]]).filter(Boolean))].map(load));
const AH='';const ath=u=>u.startsWith('http')?u:AH+u;
const thumb=it=>ath(it.angles?it.angles[it.ai].t:it.t),big=it=>it.angles?it.angles[it.ai].i:(innerWidth*(devicePixelRatio||1)>1500?it.i:it.m);
const orig=it=>{const src=it.angles?it.angles[it.ai].o:it.o;return it.ext||!src?'':src.startsWith('https://')?src:(AH||'/')+src};
function prompt(it,lang){const angle=it.angles?.[it.ai];return [it[lang],angle&&(lang==='en'?it.lineEn:it.line),angle?.[lang]].filter(Boolean).join(lang==='en'?', ':'，')}
const title=it=>it.type=='pose'||it.type=='depth'?it.zh:it.ti;
const subtitle=(it,layout=it.type)=>layout=='depth'?it.ja:st.lang=='en'?prompt(it,'en'):layout=='pose'?`${it.cat} · ${it.angles.length} 个角度`:layout=='portrait'?`${it.sec} · ${it.len}${it.rk?' · 人气第 '+it.rk:''}`:it.zh;
function recordNotice(text){const last=$('#noticeAction');last.textContent=text;last.hidden=false}
function toast(t,undo){recordNotice(t);const e=$('#toast');e.textContent=t;if(undo){const b=document.createElement('button');b.textContent='撤销';b.onclick=()=>{e.classList.remove('on','act');undo()};e.append(b)}e.classList.toggle('act',!!undo);e.classList.remove('on');void e.offsetWidth;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on','act'),undo?4500:1800)}
const EI={'fav': '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>', 'rec': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>', 'q': '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'};
async function copy(text,label){
 try {await navigator.clipboard.writeText(text)}
 catch {
  const field=document.createElement('textarea'),opener=document.activeElement;
  field.value=text;field.style.cssText='position:fixed;opacity:0';document.body.append(field);field.select();
  const copied=document.execCommand('copy');field.remove();opener?.focus({preventScroll:true});
  if(!copied)return toast('复制失败，请检查剪贴板权限');
 }
 toast('已复制'+(label?'「'+label+'」':''));
}
// Copied references use the public deployment origin, including when previewing locally.
const publicSite=document.querySelector('link[rel=canonical]').href;
const copyRefs=$('#copyRefs');
copyRefs.checked=LS('copyRefs')!==false;
copyRefs.onchange=()=>SV('copyRefs',copyRefs.checked);
function copyBrief(text, items, lang, label){
 if(!copyRefs.checked)return copy(text,label);
 const refs=items.map(it=>it && PoseWearReferences.reference(it,it.ai??0,publicSite,lang,AH||publicSite));
 return copy(PoseWearReferences.formatBrief(text,refs,lang),label);
}
function counts(){
 const bars=$$('#libraryMenu [data-tab]');
 const quantities=[];
 for(const button of bars){
  const n=button.querySelector('[data-stat]'),items=DATA[button.dataset.tab];
  if(items){
   n.dataset.n=items.filter(it=>!it.a).length;
   n.dataset.na=items.length;
  }
  const count=Number((st.adult&&n.dataset.na)||n.dataset.n);
  n.textContent=String(count);quantities.push(count);
 }
 const maximum=Math.max(1,...quantities);
 bars.forEach((button,index)=>button.style.setProperty('--share',quantities[index]/maximum));
 const nf=[...st.fav].filter(k=>!ITEMS[k]||ok(ITEMS[k])).length;
 $('#nFav').textContent=nf||'';$('#nRec').textContent=st.rec.filter(k=>!ITEMS[k]||ok(ITEMS[k])).length||'';
}
const FDEF={pose:[['line','系列'],['cat','分类'],['ang','角度']],depth:[['line','系列'],['cat','分类'],['ang','角度']],costume:[['cat','分类'],['col','颜色'],['item','单品'],['ang','角度']],anime:[['cat','分类'],['col','颜色'],['item','单品']],portrait:[['sec','类型'],['len','发长'],['st','发型']],expr:[['emo','情绪'],['int','强度']],hair:[['cat','分类']],dyn:[['era','朝代'],['ang','角度']],scene:[['cat','分类'],['ang','机位']],light:[['cat','分类'],['ang','机位']],prop:[['cat','分类'],['ang','视角']],furn:[['cat','分类'],['ang','视角']],fav:[['type','类型']],recent:[['type','类型']]};
const FLAB={sec:'类型',len:'发长',st:'发型',line:'系列',cat:'分类',ang:'角度',col:'颜色',item:'单品',type:'类型',emo:'情绪',int:'强度',era:'朝代'};
const COLS={'黑':'black','白':'white','红':'red','粉':'pink','蓝':'blue','藏青':'navy','棕':'brown','米':'beige','象牙白':'ivory','灰':'grey','绿':'green','黄':'yellow','紫':'purple','金':'gold','银':'silver','卡其':'khaki','酒红':'burgundy','橙':'orange','奶油':'cream','薄荷':'mint','薰衣草':'lavender','橄榄':'olive'};
const ITEMK={'连衣裙':'dress','半身裙':'skirt','短裤':'shorts','长裤':'trousers','牛仔裤':'jeans','大衣':'coat','夹克':'jacket','开衫':'cardigan','衬衫':'blouse','毛衣':'sweater','吊带':'camisole','文胸':'bra','泳衣':'swimsuit','靴子':'boots','高跟鞋':'high heels','运动鞋':'sneakers','凉鞋':'sandals','连裤袜':'tights','长筒袜':'stockings'};
const SUGG={pose:['站姿','坐姿','回头','双手抱头','可爱','躺卧','比心','跪立'],depth:['站姿','坐姿','上半身','全身','俯拍','侧面','可爱','跪立'],costume:['连衣裙','黑色','泳装','针织','蕾丝','冬季','牛仔','高跟鞋'],anime:['连衣裙','黑色','泳装','针织','蕾丝','冬季','牛仔','制服'],portrait:['短发','波波','狼尾','刘海','卷','奶茶','黑发','正脸'],expr:['开心','大笑','愤怒','害羞','搞怪','严肃'],hair:['长发','双马尾','刘海','发饰','瞳色'],dyn:['唐','宋','明','曲裾','齐胸'],scene:['客厅','庭院','街道','海岸'],light:['伦勃朗','窗光','黄昏','夜景'],prop:['吉他','油纸伞','灯笼','相机'],furn:['餐椅','沙发','造型台','床榻'],fav:[],recent:[]};
function base(){return(st.tab=='fav'?[...st.fav].reverse().map(k=>ITEMS[k]):st.tab=='recent'?st.rec.map(k=>ITEMS[k]):DATA[st.tab]||[]).filter(ok)}
function val(it,key){if(key=='ang')return (it.angles||[]).map(a=>a.zh);if(key=='type')return[TL(it)];
 if(key=='col'){if(!it.kw)return[];if(!it._c){const w=' '+it.kw+' ';it._c=Object.keys(COLS).filter(c=>w.includes(' '+COLS[c]+' '))}return it._c}
 if(key=='item'){if(!it.kw)return[];if(!it._i){const e=' '+it.en.replace(/,/g,' ')+' ';it._i=Object.keys(ITEMK).filter(z=>e.includes(' '+ITEMK[z]+' '))}return it._i}return it[key]?[it[key]]:[]}
function drawFilters(){
 const filters = $('#filters');
 const positions = new Map();
 let focusedChip;
 if (filters.dataset.filterTab === st.tab) {
  for (const row of filters.querySelectorAll('.frow')) {
   positions.set(row.dataset.filter, row.scrollLeft);
  }
  const active = document.activeElement;
  if (filters.contains(active) && active.matches('.chip')) focusedChip = active.dataset;
 }
 const b=base();const rows=FDEF[st.tab].map(([key,lab])=>{const c={};b.forEach(it=>val(it,key).forEach(v=>c[v]=(c[v]||0)+1));const ent=Object.entries(c).sort((a,b)=>b[1]-a[1]);if(ent.length<2&&!st.f[key])return'';
 return `<div class="frow" role="group" data-filter="${key}" aria-label="${lab}"><label>${lab}</label><button class="chip ${!st.f[key]?'on':''}" data-k="${key}" data-v="" aria-pressed="${!st.f[key]}">全部</button>${ent.map(([v,n])=>`<button class="chip ${st.f[key]==v?'on':''}" data-k="${key}" data-v="${esc(v)}" aria-pressed="${st.f[key]==v}">${esc(v)}<i>${n}</i></button>`).join('')}</div>`}).join('');
 filters.innerHTML=`<div class="dh"><b>筛选</b><button class="sm pri" data-done>完成</button></div>`+rows;
 filters.dataset.filterTab = st.tab;
 for (const row of filters.querySelectorAll('.frow')) {
  row.scrollLeft = positions.get(row.dataset.filter) ?? 0;
 }
 if (focusedChip) {
  const replacement = [...filters.querySelectorAll('.chip')].find(chip =>
   chip.dataset.k === focusedChip.k && chip.dataset.v === focusedChip.v);
  replacement?.focus({preventScroll:true});
 }
 const act=Object.entries(st.f).filter(e=>e[1]);$('#active').innerHTML=act.map(([k,v])=>`<button data-k="${k}" title="移除此条件">${FLAB[k]}：${esc(v)} ✕</button>`).join('');$('#fN').textContent=act.length||'';$('#clearAll').hidden=!(act.length||st.q)}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a}
function apply(previousView){const q=st.q.toLowerCase().trim().split(/\s+/).filter(Boolean);
 let L=base().filter(it=>Object.entries(st.f).every(([k,v])=>!v||val(it,k).includes(v))&&q.every(w=>(it._s||(it._s=[it.id,it.ti,it.zh,it.en,it.ja,it.kw,it.cat,it.catEn,it.catJa,it.line,it.lineJa,it.no,it.sec,it.len,it.st,...(it.angles||[]).flatMap(a=>[a.zh,a.en,a.ja])].join(' ').toLowerCase())).includes(w)));
 if(st.f.ang){
  for(const it of L){
   const index=it.angles.findIndex(a=>a.zh===st.f.ang);
   if(index<0)continue;
   it.ai=index;
   if(flippedCards.has(it.k)){
    const mate=poseCounterpart(it,index);
    if(mate)mate.item.ai=mate.angle;else flippedCards.delete(it.k);
   }
  }
  tray();
 }
 if(st.sort=='id')L=L.slice().reverse();else if(st.sort=='shuf'){
  const order=previousView?.order;
  L=order?L.sort((a,b)=>(order.get(a.k)??Infinity)-(order.get(b.k)??Infinity)):shuffle(L);
 }else if(st.sort=='rank')L=L.slice().sort((a,b)=>(a.rk||a.rc&&a.rc+10||999)-(b.rk||b.rc&&b.rc+10||999));else if(st.sort=='fav')L=L.slice().sort((a,b)=>st.fav.has(b.k)-st.fav.has(a.k));
 st.list=L;window.X?.filterBatch?.(L.map(cardFace));const tot=base().length;const imgs=a=>a.reduce((n,it)=>n+(it.angles?it.angles.length:1),0);
 $('#count').innerHTML=st.tab=='depth'?(L.length==tot?`共 <b>${tot}</b> 组 · ${imgs(base())} 张`:`<b>${L.length}</b> / ${tot} 组 · ${imgs(L)} 张`):(L.length==tot?`共 <b>${tot}</b> 项`:`<b>${L.length}</b> / ${tot} 项`);$('#grid').innerHTML='';st.n=0;
 const em=!L.length;$('#empty').hidden=!em;$('#clearAll').hidden=!(Object.values(st.f).some(Boolean)||st.q);
 document.body.classList.toggle('none0',(st.tab=='fav'||st.tab=='recent')&&!tot);
 if(em){const none=(st.tab=='fav'||st.tab=='recent')&&!tot;$('#emptyT').textContent=none?(st.tab=='fav'?'还没有收藏':'还没有浏览记录'):'没有找到匹配的内容';
  $('#emptyP').textContent=none?(st.tab=='fav'?'看到喜欢的，点卡片右上角的 ♡。收藏只存在这台设备的浏览器里，可以导出备份。':'打开过的大图会按时间排在这里，最多保留 100 条。'):'换个关键词试试，或者看看这些热门搜索：';
  $('#sugg').innerHTML=none?'':(SUGG[st.tab]||[]).map(s=>`<button class="chip" data-s="${s}">${s}</button>`).join('');$('#reset').hidden=none;$('#empty .emo').innerHTML=none?(st.tab=='fav'?EI.fav:EI.rec):EI.q;$('#emptyGo').innerHTML=none?'<button class="sm" data-go="pose">逛姿势库</button><button class="sm" data-go="depth">逛深度姿势</button><button class="sm" data-go="costume">逛服装库</button><button class="sm" data-go="anime">逛动画服装</button><button class="sm" data-go="portrait">逛人像库</button><button class="sm" data-go="expr">逛表情库</button><button class="sm" data-go="dyn">逛历代服饰</button><button class="sm" data-go="scene">逛场景库</button>':''}
 more(previousView?.count||30)}
const STUDIO_SLOT = {portrait:'portrait',costume:'garment',anime:'garment',dyn:'garment',pose:'pose',depth:'pose',expr:'expr'};
const studioSlot=type=>STUDIO_SLOT[type]||'extra';
function tryLabel(it, selecting=false) {
 if(selecting)return st.sel.includes(it.k)?'移出工作台':'加入工作台';
 const slot=STUDIO_SLOT[it.type];
 return {portrait:'用作人物参考',garment:'试穿这套',pose:'用作姿势参考',expr:'用作表情参考'}[slot] || '加入生图组合';
}
function useReference(it) {
 if (STUDIO_SLOT[it.type]) return window.WB?.pick(it);
 if (!st.sel.includes(it.k)) toggleSel(it.k);
 openTray();
}
function cardBadges(it){
 const mate=poseCounterpart(it),label=it.type==='pose'?'切换到深度图':'切换到线稿';
 const number=mate?`<button class="badge card-flip" type="button" data-a="flip" title="${label}" aria-label="${label}"><span>${esc(it.no)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6l2 2m0-5v5h-5M21 12a9 9 0 0 1-15 6l-2-2m0 5v-5h5"/></svg></button>`:`<span class="badge">${esc(it.no)}</span>`;
 return `<div class="card-badges">${number}${it.a?'<span class="badge age">18+</span>':''}</div>`;
}
function loadCardPairs(){
 if(!['pose','depth','fav','recent'].includes(st.tab))return;
 const missing=new Set(base().map(counterpartType).filter(type=>type&&!DATA[type]));
 for(const type of missing)load(type).then(()=>{
  for(const badges of grid.querySelectorAll('.card-badges')){
   const it=cardFace(ITEMS[badges.closest('.card').dataset.k]);
   if(counterpartType(it)===type&&poseCounterpart(it))badges.outerHTML=cardBadges(it);
  }
 },()=>{});
}
function cardAngles(origin,it){
 const angles=it.angles.map((angle,index)=>({name:angle.zh,index}));
 if(it!==origin){
  const order=new Map(origin.angles.map((angle,index)=>[angle.zh,index]));
  angles.sort((a,b)=>(order.get(a.name)??order.size)-(order.get(b.name)??order.size));
 }
 return angles.map(({name,index})=>`<button type="button" data-a="ang" data-i="${index}" aria-pressed="${index===it.ai}" class="${index===it.ai?'on':''}">${esc(name)}</button>`).join('');
}
function card(origin,d){const it=cardFace(origin),isS=st.sel.includes(it.k),isF=st.fav.has(it.k),P=it.type=='pose',D=it.type=='depth',A2=P||D||!!it.angles,t=title(it);
 const tags=P||D?[[it.line,''],[it.cat,'c']]:it.type=='portrait'?[[it.sec,'c'],[it.len,'']]:[[it.cat,'c'],...val(it,'item').slice(0,3).map(x=>[x,''])];
 const miss=D?`<a class="miss" href="${esc(it.site)}" target="_blank" rel="noopener">请前往原站查看</a>`:'';
 return `<article class="card ${window.X?.batchPicked?.(it.k)?'picked':''} ${isS?'sel':''}" data-k="${origin.k}"${origin!==it?` data-show="${it.k}"`:''} style="animation-delay:${d||0}ms"><div class="ph ${D?'depth':P?'pose':'cos'}" data-a="open"><img loading="lazy" decoding="async"${D?` referrerpolicy="${esc(it.ref||'no-referrer')}"`:''} src="${esc(thumb(it))}" alt="${esc(t)}" width="${A2?300:it.type=='portrait'?400:360}" height="${A2?400:it.type=='portrait'?500:540}" draggable="false">${miss}<button class="phk" data-a="open" aria-label="${esc(t)}"></button>
 ${it.rk?`<span class="badge rk">TOP ${it.rk}</span>`:''}${A2?`${P||D?cardBadges(it):`<span class="badge">${esc(it.no)}</span>${it.a?'<span class="badge age">18+</span>':''}`}<div class="angs">${cardAngles(origin,it)}</div>`:''}
 ${st.tab=='recent'?'<button data-a="unrec" class="unrec" title="从记录中移除" aria-label="从记录中移除">✕</button>':''}<div class="cbtns"><button data-a="fav" class="${isF?'on':''}" title="${isF?'取消收藏':'收藏'}" aria-label="收藏" aria-pressed="${isF}">${isF?'♥':'♡'}</button><button data-a="sel" class="${isS?'on':''}" title="${isS?'移出组合':'加入组合'}" aria-label="加入组合" aria-pressed="${isS}">${isS?'✓':'＋'}</button></div>${D?'':`<button class="try" data-a="try">${tryLabel(it,trayOpen)}</button>`}</div>
 <div class="info"><div class="card-heading"><h3 title="${esc(t)}">${esc(t)}</h3><button class="card-copy" data-a="copy" title="复制提示词" aria-label="复制提示词"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 5V4H5v11h1"/></svg></button></div><div class="sub">${esc(subtitle(it,origin.type))}</div>${origin.type==='depth'?`<div class="sub dim">${esc(it.line)} · ${esc(it.cat)}</div>`:''}<div class="tags">${tags.map(([x,c])=>`<span class="tag ${c}">${esc(x)}</span>`).join('')}</div>
 </div></article>`}
function grp(k){const t=st.recT[k];if(!t)return'更早';const d=new Date();d.setHours(0,0,0,0);return t>=d?'今天':t>=d-864e5?'昨天':t>=d-6*864e5?'近 7 天':'更早'}
function more(count=30){if(st.n>=st.list.length)return;const G=st.tab=='recent'&&!st.q&&!Object.values(st.f).some(Boolean);let pg=G&&st.n?grp(st.list[st.n-1].k):'';const h=st.list.slice(st.n,st.n+count).map((it,i)=>{let x='';if(G){const g=grp(it.k);if(g!=pg){x=`<h4 class="grp">${g}</h4>`;pg=g}}return x+card(it,motionPreference.matches?0:Math.min(i,14)*35)}).join('');st.n+=count;$('#grid').insertAdjacentHTML('beforeend',h)}
const grid=$('#grid');
grid.addEventListener('load',e=>{if(e.target.tagName=='IMG'){e.target.classList.add('ld');e.target.parentNode.classList.remove('err');e.target.parentNode.classList.add('done')}},true);
grid.addEventListener('error',e=>{if(e.target.tagName=='IMG'){e.target.parentNode.classList.add('err','done')}},true);
new IntersectionObserver(e=>e[0].isIntersecting&&more(),{rootMargin:'1400px'}).observe($('#sentinel'));
function replaceCard(el,prepared){
 const origin=ITEMS[el.dataset.k],oldImage=el.querySelector('img'),wrapper=document.createElement('div');
 wrapper.innerHTML=card(origin);
 const n=wrapper.firstElementChild,ph=n.querySelector('.ph'),img=ph.querySelector('img');
 n.style.animation='none';
 const active=document.activeElement;
 const action=el.contains(active)&&active.dataset.a;
 if(prepared){
  for(const name of ['alt','width','height','draggable'])prepared.setAttribute(name,img.getAttribute(name));
  prepared.classList.add('ld');img.replaceWith(prepared);ph.classList.add('done');
  if(!motionPreference.matches&&oldImage.complete&&oldImage.naturalWidth){
   const outgoing=oldImage.cloneNode();
   outgoing.className='ld flip-previous';
   outgoing.alt='';outgoing.setAttribute('aria-hidden','true');
   ph.classList.add('pair-turn');prepared.after(outgoing);
   outgoing.addEventListener('animationend',()=>{outgoing.remove();ph.classList.remove('pair-turn')},{once:true});
  }
 }else if(img.getAttribute('src')===oldImage.getAttribute('src')){
  const oldFace=oldImage.parentElement;
  ph.classList.toggle('done',oldFace.classList.contains('done'));
  ph.classList.toggle('err',oldFace.classList.contains('err'));
  img.replaceWith(oldImage);
 }
 el.replaceWith(n);
 if(action) n.querySelector(`button[data-a="${CSS.escape(action)}"]`+(active.dataset.i!=null?`[data-i="${CSS.escape(active.dataset.i)}"]`:''))?.focus({preventScroll:true});
}
function refreshCard(k){
 const key=CSS.escape(k);
 grid.querySelectorAll(`.card[data-show="${key}"],.card[data-k="${key}"]:not([data-show])`).forEach(el=>replaceCard(el));
}
async function flipCard(el,button,it){
 const mate=poseCounterpart(it);
 if(!mate||button.hasAttribute('aria-busy'))return;
 button.setAttribute('aria-busy','true');
 const image=new Image(),view=mate.item.angles[mate.angle];
 if(mate.item.type==='depth')image.referrerPolicy=mate.item.ref||'no-referrer';
 image.src=ath(view.t);
 try{await image.decode()}catch{
  if(button.isConnected){button.removeAttribute('aria-busy');toast('图片加载失败，请重试')}
  return;
 }
 if(!button.isConnected||!ok(mate.item)||document.body.classList.contains('batch')){
  button.removeAttribute('aria-busy');return;
 }
 if(mate.item.ai!==mate.angle)setAng(mate.item,mate.angle);
 if(mate.item.k===el.dataset.k)flippedCards.delete(el.dataset.k);
 else flippedCards.set(el.dataset.k,mate.item);
 replaceCard(el,image);
}
function setAng(it,i){it.ai=i;st.ang[it.k]=i;SV('ang',st.ang);refreshCard(it.k);if(st.sel.includes(it.k))tray()}
function dropCard(k){const el=grid.querySelector(`.card[data-k="${CSS.escape(k)}"]`);const i=st.list.findIndex(x=>x.k==k);if(i>=0){st.list.splice(i,1);st.n=Math.max(0,st.n-1)}const fin=()=>{el&&el.remove();if(!st.list.length)apply();else{const tot=base().length;$('#count').innerHTML=st.list.length==tot?`共 <b>${tot}</b> 项`:`<b>${st.list.length}</b> / ${tot} 项`;grid.querySelectorAll('.grp').forEach(g=>{const n=g.nextElementSibling;if(!n||n.classList.contains('grp'))g.remove()})}};if(el&&!motionPreference.matches)el.animate([{opacity:1,transform:'none'},{opacity:0,transform:'scale(.92)'}],{duration:220,easing:'cubic-bezier(.4,0,.2,1)'}).finished.then(fin);else fin()}
function toggleFav(k,quiet){const on=!st.fav.has(k);on?st.fav.add(k):st.fav.delete(k);SV('fav',[...st.fav]);counts();if(!quiet)toast(on?'已加入收藏':'已取消收藏',on?null:()=>{toggleFav(k,1);if(st.tab=='fav')apply()});refreshCard(k);
 if(st.tab==='fav'){
  if(!$('#lb').hidden)pend.add(k);
  else if(on)apply();else dropCard(k);
 }
 if(!$('#lb').hidden)lbDraw()}
function unRec(k){const old=st.rec.slice();st.rec=st.rec.filter(x=>x!=k);SV('rec',st.rec);counts();dropCard(k);toast('已从记录中移除',()=>{st.rec=old;SV('rec',old);counts();apply()})}
function toggleSel(k){
 const index=st.sel.indexOf(k),added=index<0;
 if(added)st.sel.push(k);else st.sel.splice(index,1);
 SV('sel',st.sel);refreshCard(k);tray(added?k:null);
 const message=added?'已加入组合':'已移出组合';
 if(trayOpen)recordNotice(message);else toast(message);
 if(!$('#lb').hidden)lbDraw();
}
function visibleSelection(){
 const items=st.sel.map(k=>ITEMS[k]).filter(ok);
 const poses=items.filter(counterpartType);
 if(!poses.some(it=>it.type==='pose')||!poses.some(it=>it.type==='depth'))return items;
 const groups=new Map();
 for(const it of poses){
  if(!groups.has(it.id))groups.set(it.id,{});
  groups.get(it.id)[it.type]=it;
 }
 const ordered=[...groups.values()].flatMap(({pose,depth})=>[pose,depth].filter(Boolean));
 const rest=items.filter(it=>!counterpartType(it));
 rest.splice(items.indexOf(poses[0]),0,...ordered);
 return rest;
}
function compactSelection(selected){
 if(selected.length<=3)return selected;
 const recent=new Set();
 for(let i=st.sel.length-1;i>=0&&recent.size<3;i--){
  const it=ITEMS[st.sel[i]];
  if(!ok(it)||recent.has(it))continue;
  recent.add(it);
  const type=counterpartType(it);
  const other=type&&ITEMS[PFX[type]+it.id];
  if(recent.size<3&&other&&counterpartType(other)&&selected.includes(other))recent.add(other);
 }
 return selected.filter(it=>recent.has(it));
}

function combo(lang){
 return visibleSelection().map(it=>{
  const {label}=PoseWearReferences.reference(it,it.ai??0,publicSite,lang,AH||publicSite);
  return label+' — '+prompt(it,lang);
 }).join('\n');
}
let trayOpen=false;
function trayThumbnail(item){
 return `<img data-type="${item.type}" src="${esc(thumb(item))}"${item.ref?` referrerpolicy="${esc(item.ref)}"`:''} alt="">`;
}
function trayItem(it){
 const type=counterpartType(it);
 const name=type?[it.no,title(it),it.angles[it.ai].zh].join(' · '):title(it);
 const action=type==='depth'?'添加同视角深度姿势':'添加同视角姿势';
 const pairButton=type?`<button class="tray-pair" data-pair="${esc(it.k)}" title="${action}" aria-label="${action}" hidden>＋</button>`:'';
 return `<div title="${esc(name)}">${trayThumbnail(it)}<em>${TL(it)}</em>${pairButton}<button data-k="${esc(it.k)}" type="button" title="移除" aria-label="移除 ${esc(type?TL(it)+' · '+name:name)}">×</button></div>`;
}
function showTrayPairs(){
 for(const button of $$('#trayItems [data-pair]')){
  const mate=poseCounterpart(ITEMS[button.dataset.pair]);
  button.hidden=!mate||st.sel.includes(mate.item.k);
 }
}
function tray(addedKey){
 const selected=visibleSelection(),n=selected.length,fab=$('#trayFab'),badge=$('#trayFabN');
 fab.hidden=trayOpen;fab.setAttribute('aria-expanded',String(trayOpen));
 badge.textContent=n;badge.hidden=!n;
 $('#trayFilm').innerHTML=compactSelection(selected).map(trayThumbnail).join('');
 if(addedKey&&!trayOpen&&!motionPreference.matches)fab.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:300});
 $('#tray').hidden=!trayOpen;
 document.body.classList.toggle('tray',trayOpen);
 if(!trayOpen)return;
 $('#tgEmpty').hidden=n>0;$('#trayClear').hidden=!n;$('#trayComboBox').hidden=!n;
 $('#trayN').textContent=n ? String(n) : '';
 $$('[data-tl]').forEach(b=>b.classList.toggle('on',b.dataset.tl==st.tl));
 const strip=$('#trayItems');
 strip.innerHTML=selected.map(trayItem).join('');
 showTrayPairs();
 const missing=new Set(selected.map(counterpartType).filter(t=>t&&!DATA[t]));
 if(missing.size)Promise.all([...missing].map(load)).then(showTrayPairs,()=>{});
 if(addedKey){
  const added=strip.querySelector(`[data-k="${CSS.escape(addedKey)}"]`)?.parentElement;
  if(added){
   const bounds=strip.getBoundingClientRect(),item=added.getBoundingClientRect();
   const shift=item.left<bounds.left?item.left-bounds.left:Math.max(0,item.right-bounds.right);
   if(shift)strip.scrollBy({left:shift,behavior:motionPreference.matches?'instant':'smooth'});
   if(!motionPreference.matches)added.animate([{opacity:.35,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:220});
  }
 }
 $('#trayText').textContent=combo(st.tl);tgSync()
}
$('#trayItems').onclick=e=>{
 const source=e.target.closest('button[data-pair]');
 if(source){
  const mate=poseCounterpart(ITEMS[source.dataset.pair]);
  if(!mate||st.sel.includes(mate.item.k))return;
  setAng(mate.item,mate.angle);toggleSel(mate.item.k);
  $('#trayItems').querySelector(`[data-k="${CSS.escape(mate.item.k)}"]`).focus({preventScroll:true});
  return;
 }
 const button=e.target.closest('button[data-k]');if(!button)return;
 const pos=[...$$('#trayItems [data-k]')].indexOf(button);toggleSel(button.dataset.k);
 const buttons=$$('#trayItems [data-k]');
 (buttons[Math.min(pos,buttons.length-1)]||$('#tgAddRow button')).focus({preventScroll:true});
};$('#trayCopyEn').onclick=()=>copyBrief(combo('en'),visibleSelection(),'en','组合英文提示词');$('#trayCopyZh').onclick=()=>copyBrief(combo('zh'),visibleSelection(),'zh','组合中文描述');
$$('[data-tl]').forEach(b=>b.onclick=()=>{st.tl=b.dataset.tl;SV('tl',st.tl);tray()});
function setTrayOpen(open){
 trayOpen=open;
 tray();
 for(const button of grid.querySelectorAll('[data-a="try"]')){
 const item=cardFace(ITEMS[button.closest('.card').dataset.k]);
  button.textContent=tryLabel(item,open);
 }
}
function openTray(){setTrayOpen(true);$('#tray').focus({preventScroll:true})}
function closeTray(restore=true){setTrayOpen(false);if(restore)$('#trayFab').focus({preventScroll:true})}
$('#trayMin').onclick=()=>closeTray();
$('#trayFab').onclick=openTray;
$('#tgAddRow').onclick=e=>{
 const button=e.target.closest('[data-add]');if(!button||!window.WB)return;
 const menu=button.closest('details');
 if(menu){menu.open=false;menu.querySelector('summary').focus({preventScroll:true})}
 WB.openPicker(button.dataset.add,{
  keys:()=>st.sel.slice(),
  toggle:(k,ai)=>{
   const item=ITEMS[k];
   if(ai!=null&&item.ai!==ai&&!st.sel.includes(k))setAng(item,ai);
   toggleSel(k);
   return st.sel.includes(k);
  }
 });
};
$('#trayClear').onclick=()=>{const s=st.sel;st.sel=[];SV('sel',[]);s.forEach(refreshCard);tray();$('#tgAddRow button').focus({preventScroll:true});toast('已清空组合')};
// —— 托盘简易生图：组合直接同步到试穿台选材，在托盘内生成
const trayDraft=LS('trayDraft');
let tgAutoPrompt='',tgEdited=trayDraft?.prompt!=null,tgBusy=false,tgRecs=[],tgUrls=[],tgCur=0;
if(trayDraft){
 $('#tgPrompt').value=trayDraft.prompt??'';
 $('#tgN').value=trayDraft.count;
 $('#tgAR').value=trayDraft.ratio;
}
function saveTrayDraft(){
 SV('trayDraft',{prompt:tgEdited?$('#tgPrompt').value:null,count:$('#tgN').value,ratio:$('#tgAR').value});
}
function groupSelection(items) {
 const groups={portrait:[],garment:[],pose:[],expr:[],extra:[]};
 for(const it of items)groups[studioSlot(it.type)].push(it);
 return groups;
}
const traySelection=()=>groupSelection(visibleSelection());
function tgSync(){
 const editor=$('#tgPrompt');
 $('#tgProv').textContent=window.WB&&WB.configured()?WB.provLabel():'未配置 API';
 $('#tgCfg .dot').classList.toggle('on',!!window.WB?.configured());
 if(!visibleSelection().length){tgAutoPrompt='';if(!tgEdited)editor.value='';return}
 if(!window.WB)return;
 tgAutoPrompt=WB.selectionPrompt(traySelection(),st.tl);
 if(!tgEdited)editor.value=tgAutoPrompt;
}
$('#tgCopyDraft').onclick=()=>{
 const g=traySelection();
 const inputs=[...g.portrait.slice(0,1),...g.garment.slice(0,2),...g.pose.slice(0,6),...g.expr.slice(0,1)];
 const other=visibleSelection().filter(it=>!inputs.includes(it));
 copyBrief($('#tgPrompt').value,[...inputs,...other],st.tl,'提示词');
};
$('#tgPrompt').oninput=e=>{tgEdited=e.target.value!==tgAutoPrompt;saveTrayDraft()};
$('#tgN').onchange=$('#tgAR').onchange=saveTrayDraft;
function tgStat(t){const s=$('#tgStat');if(!s)return;s.hidden=!t;if(t)s.textContent=t}
function tgRender(){tgUrls.forEach(u=>URL.revokeObjectURL(u));tgUrls=tgRecs.map(r=>URL.createObjectURL(r.after));$('#tgRes').innerHTML=tgUrls.map((u,i)=>`<button data-tg="${i}" title="查看大图"><img src="${u}" alt="生成结果 ${i+1}"></button>`).join('')}
$('#tgRes').onclick=e=>{const b=e.target.closest('[data-tg]');if(!b)return;tgCur=+b.dataset.tg;$('#tgViewImg').src=tgUrls[tgCur];openDialog($('#tgView'),$('#tgViewX'),b)};
const tgClose=()=>closeDialog($('#tgView'));
$('#tgViewX').onclick=tgClose;$('#tgView').addEventListener('click',e=>{if(e.target.classList.contains('tgv-bg'))tgClose()});
$('#tgDl').onclick=()=>{const r=tgRecs[tgCur];if(r&&window.X)window.X.dl(r.after,`posewear-gen-${tgCur+1}.png`)};
$('#tgHist').onclick=()=>{tgClose();closeTray(false);navigate('history')};
$('#tgCfg').onclick=()=>window.WB&&WB.cfgOpen();
$('#cfg').addEventListener('click',e=>{
 if(trayOpen&&e.target.closest('#cfSave,#cfClr'))tgSync();
});
async function sendToStudio(items,append=false,draft) {
 const groups=groupSelection(items);
 try {
  if(items.length||draft)await (append?WB.addSelection:WB.setSel)(groups,'',draft);
  await navigate('studio');
  return true;
 } catch {toast('素材未能载入，请重试');return false}
}
$('#tgStudio').onclick=async()=>{
 const items=visibleSelection(),prompt=$('#tgPrompt').value.trim();
 const draft=items.length||prompt?{prompt:tgEdited?prompt:'',lang:st.tl,count:$('#tgN').value,ratio:$('#tgAR').value}:null;
 if(await sendToStudio(items,false,draft)){closeTray(false);$('#stT').focus({preventScroll:true})}
};
$('#tgStop').onclick=()=>window.WB&&WB.stop();
$('#tgGo').onclick=async()=>{if(tgBusy)return;if(!window.WB)return;if(!WB.configured()){WB.cfgOpen();return}
 if(!visibleSelection().length&&!$('#tgPrompt').value.trim())return $('#tgPrompt').focus();tgSync();tgBusy=true;const go=$('#tgGo');go.disabled=true;go.textContent='生成中…';$('#tgStop').hidden=false;tgStat('正在准备素材…');
 const pv=$('#tgPrompt').value.trim(),o={selection:traySelection(),lang:st.tl,n:+$('#tgN').value||1,ar:$('#tgAR').value,onTick:(d,t)=>tgStat(`生成中… 已完成 ${d} / ${t}`)};if(pv)o.prompt=pv;
 try{
  const r=await WB.quick(o);
  if(r.got.length){tgRecs=r.got;tgRender()}
  const messages=[];
  if(r.got.length)messages.push(r.unsaved?`完成 ${r.got.length} 张，其中 ${r.unsaved} 张未存入生成记录，请立即下载`:`完成 ${r.got.length} 张，已存入生成记录`);
  if(r.cancelled)messages.push('已取消');
  else if(r.errs.length){const err=r.errs.find(x=>x.safe)||r.errs[0];messages.push(err.safe?'被服务商的安全审核拦下了':'生成失败：'+WB.nice(err).split('\n')[0])}
  if(r.warns?.length)messages.push(...r.warns);
  if(r.nokey)messages.push('请先配置 API');
  tgStat(messages.join('；'));
 }catch(e){tgStat('生成失败：'+(e.message||e))}finally{tgBusy=false;go.disabled=false;go.textContent='生成图片';$('#tgStop').hidden=true}};

grid.onclick=e=>{if(e.target.closest('a.miss'))return;const a=e.target.closest('[data-a]');if(!a)return;const c=e.target.closest('.card'),origin=ITEMS[c.dataset.k],it=cardFace(origin),k=it.k;e.stopPropagation();
 const ph=c.querySelector('.ph');if(a.dataset.a=='open'&&ph.classList.contains('err')){const im=ph.querySelector('img');ph.classList.remove('err','done');im.src=thumb(it)+'?r='+Date.now();return}
 ({open:()=>lbOpen(st.list.indexOf(origin),c),flip:()=>flipCard(c,a,it),fav:()=>toggleFav(k),unrec:()=>unRec(origin.k),sel:()=>toggleSel(k),copy:()=>copyBrief(prompt(it,st.lang),[it],st.lang,'提示词'),try:()=>trayOpen?toggleSel(it.k):useReference(it),ang:()=>setAng(it,+a.dataset.i)})[a.dataset.a]()};
function viewT(fn){
 if(motionPreference.matches){fn();return Promise.resolve()}
 if(document.startViewTransition){
  const transition=document.startViewTransition(fn);
  transition.ready.catch(()=>{}); // Transitions may be skipped while navigating quickly.
  return transition.updateCallbackDone;
 }
 fn();
 grid.classList.add('fade');
 requestAnimationFrame(()=>requestAnimationFrame(()=>grid.classList.remove('fade')));
 return Promise.resolve();
}
function drawer(o){$('#filters').classList.toggle('open',o);$('#fBtn').classList.toggle('on',o);$('#fBtn').setAttribute('aria-expanded',String(o))}
function scrollHorizontal(event) {
 const mode = event.deltaMode;
 if (!event.cancelable || event.ctrlKey || event.shiftKey || event.deltaX || !event.deltaY) return;

 const row = event.target.closest('.tabs, .frow');
 if (!row || row.scrollWidth <= row.clientWidth) return;

 const start = row.scrollLeft;
 const unit = mode === WheelEvent.DOM_DELTA_LINE ? 16
  : mode === WheelEvent.DOM_DELTA_PAGE ? row.clientWidth : 1;
 row.scrollLeft += event.deltaY * unit;
 if (row.scrollLeft !== start) event.preventDefault();
}
$('.tabs').addEventListener('wheel', scrollHorizontal, {passive:false});
$('#filters').addEventListener('wheel', scrollHorizontal, {passive:false});
$('#fBtn').onclick=()=>drawer(!$('#filters').classList.contains('open'));$('#drawerBg').onclick=()=>drawer(false);
$('#filters').onclick=e=>{if(e.target.closest('[data-done]'))return drawer(false);const b=e.target.closest('.chip');if(!b)return;st.f[b.dataset.k]=b.dataset.v;viewT(()=>{drawFilters();apply()})};
$('#active').onclick=e=>{const b=e.target.closest('button');if(b){st.f[b.dataset.k]='';viewT(()=>{drawFilters();apply()})}};
const clearAll=()=>{st.f={};st.q='';$('#q').value='';$('#qx').hidden=true;viewT(()=>{drawFilters();apply()})};$('#reset').onclick=clearAll;$('#clearAll').onclick=clearAll;
$('#sugg').onclick=e=>{const s=e.target.closest('[data-s]');if(s){st.f={};$('#q').value=st.q=s.dataset.s;$('#qx').hidden=false;drawFilters();apply()}};
$('#sort').onchange=e=>{st.sort=e.target.value;viewT(apply)};
$('#qDone').onclick=()=>$('#libraryMenu summary').focus({preventScroll:true});
let qt;$('#q').oninput=e=>{$('#qx').hidden=!e.target.value;clearTimeout(qt);qt=setTimeout(()=>{st.q=e.target.value;apply()},160)};$('#qx').onclick=()=>{$('#q').value='';st.q='';$('#qx').hidden=true;apply();$('#q').focus()};
function randPick(){if(!st.list.length)return toast('当前没有可选的内容');const i=Math.random()*st.list.length|0;lbOpen(i)}
$('#rand').onclick=randPick;
// 语言
function setLang(l,quiet){st.lang=l;SV('lang',l);document.documentElement.dataset.lang=l;$$('button[data-lang]').forEach(b=>b.classList.toggle('on',b.dataset.lang==l));grid.querySelectorAll('.card').forEach(c=>{const origin=ITEMS[c.dataset.k];if(origin)c.querySelector('.sub').textContent=subtitle(cardFace(origin),origin.type)});if(!quiet)toast(l=='zh'?'描述语言：中文':'描述语言：英文提示词')}
$$('button[data-lang]').forEach(b=>b.onclick=()=>setLang(b.dataset.lang));
// 标签页
function selectTab(tab){
 const active=$(`.tabs [data-tab="${tab}"]`);
 const library=active.closest('#libraryMenu'),personal=active.closest('#personalMenu');
 $('#libraryLabel').textContent=library?TNAME[tab]:'素材库';
 $('#personalLabel').textContent=personal?TNAME[tab]:'我的';
 $('#collectionTitle').textContent=TNAME[tab];
 for(const button of $$('.tabs [data-tab]')){
  button.classList.toggle('on',button===active);
  if(button===active)button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
 }
 for(const menu of $$('.tabs details')){
  menu.classList.toggle('current',menu===library||menu===personal);
  menu.open=false;
 }
}
document.addEventListener('pointerdown',event=>{
 for(const menu of $$('.shell-menu[open]'))if(!menu.contains(event.target))menu.open=false;
});
for(const menu of $$('.shell-menu')){
 menu.addEventListener('focusout',event=>{
  if(event.relatedTarget&&!menu.contains(event.relatedTarget))menu.open=false;
 });
 menu.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&menu.open){
   event.preventDefault();event.stopPropagation();menu.open=false;
   menu.querySelector('summary').focus();
  }
  const items=[...menu.querySelectorAll('[data-tab],[data-theme-choice]')];
  if(!items.length)return;
  const index=items.indexOf(event.target);
  let next;
  switch(event.key){
   case 'ArrowDown':next=(index+1)%items.length;break;
   case 'ArrowUp':next=index<=0?items.length-1:index-1;break;
   case 'Home':next=0;break;
   case 'End':next=items.length-1;break;
   default:return;
  }
  event.preventDefault();event.stopPropagation();menu.open=true;items[next].focus();
 });
}
// Keep the gallery position while the user works in the studio or checks a result.
let galleryReturn=null,tabRequest=0;
const isWorkspace=tab=>tab==='studio'||tab==='history';
function navigate(tab){
 const hash='#'+tab;
 if(location.hash!==hash){
  if(history.state?.galleryItem)history.replaceState(null,'',hash);
  else history.pushState(null,'',hash);
 }
 const openingStudio=tab==='studio'&&st.tab!=='studio';
 const ready=setTab(tab);
 if(openingStudio)$('#stT').focus({preventScroll:true});
 return ready;
}
async function setTab(t,openId,workbenchId){
 const request=++tabRequest,changed=st.tab!==t;
 clearTimeout(qt);
 if(changed&&st.tab&&!isWorkspace(st.tab)&&isWorkspace(t)){
  galleryReturn={tab:st.tab,query:$('#q').value,filters:{...st.f},count:st.n,scroll:scrollY,
   cardKey:document.activeElement.closest('.card')?.dataset.k,
   order:st.sort==='shuf'?new Map(st.list.map((item,i)=>[item.k,i])):null};
 }
 const previous=isWorkspace(st.tab)&&!openId&&workbenchId===undefined&&galleryReturn?.tab===t?galleryReturn:null;
 if(changed&&!isWorkspace(t))galleryReturn=null;
 if(changed){window.X?.closeBatch?.();flippedCards.clear()}
 st.tab=t;tray();
document.body.classList.toggle('depth',t=='depth');if(t=='studio'){selectTab(t);document.title='工作台 · 衣姿 PoseWear';history.replaceState(null,'','#studio');document.body.classList.add('studio');document.body.classList.remove('histview');$('#studio').hidden=false;$('#histSec').hidden=true;scrollTo({top:0});window.WB&&WB.show();return}
 if(t=='history'){selectTab(t);document.title='生成记录 · 衣姿 PoseWear';history.replaceState(null,'','#history');document.body.classList.remove('studio');document.body.classList.add('histview');$('#studio').hidden=true;$('#histSec').hidden=false;scrollTo({top:0});window.HIS&&HIS.show();return}
 if(document.body.classList.contains('studio')){document.body.classList.remove('studio');$('#studio').hidden=true}
 if(document.body.classList.contains('histview')){document.body.classList.remove('histview');$('#histSec').hidden=true}
 if(changed)grid.classList.add('gbusy');
 st.f=previous?.filters||{};st.q=previous?.query||'';
 $('#q').value=st.q;$('#qx').hidden=!st.q;
 selectTab(t);
 document.title=TNAME[t]+' · 衣姿 PoseWear';if(!openId)history.replaceState(null,'','#'+t);
 $('#rand').hidden=t=='fav'||t=='recent';$('#favTools').hidden=t!='fav';$('#clrRec').hidden=t!='recent';$('#sort').hidden=t=='recent';$('#q').placeholder=t=='depth'?'搜姿势名、系列、分类':(innerWidth<=760?'搜索':'搜姿势、颜色、单品');$('#sort option[value=rank]').hidden=t!='portrait';if(t!='portrait'&&st.sort=='rank'){st.sort='def';$('#sort').value='def'}
 document.body.classList.toggle('compact',t=='fav'||t=='recent');
 if((!DATA[t]&&!(t=='pose'&&grid.querySelector('.ssr')))||t=='fav'||t=='recent'){grid.innerHTML='<div class="skel"></div>'.repeat(10);$('#empty').hidden=true}
 try{if(t=='fav')await needKeys([...st.fav]);else if(t=='recent')await needKeys(st.rec);else await load(t)}catch(e){if(request!==tabRequest)return;grid.innerHTML='';$('#empty').hidden=false;$('#emptyT').textContent='数据加载失败';$('#emptyP').textContent='请检查网络后刷新页面重试';$('#sugg').innerHTML='';$('#reset').hidden=true;$('#empty .emo').innerHTML=EI.q;grid.classList.remove('gbusy');$('#emptyGo').innerHTML='<button class="sm pri" id="retry">重新加载</button>';$('#retry').onclick=()=>setTab(t,openId,workbenchId);return}
 if(request!==tabRequest)return;if(Q0){st.q=Q0;$('#q').value=Q0;$('#qx').hidden=false;Q0=''}const go=()=>{if(request===tabRequest){drawFilters();apply(previous);loadCardPairs()}};if(changed)await viewT(go);else go();if(request!==tabRequest)return;grid.classList.remove('gbusy');
 if(workbenchId!==undefined){
  const it=ITEMS[PFX[t]+workbenchId];
  if(it&&!it.a&&!st.sel.includes(it.k))toggleSel(it.k);
  openTray();
 }else if(openId)openById(openId)
 else if(previous){
  scrollTo({top:previous.scroll,behavior:'instant'});
  if(previous.cardKey)grid.querySelector('.card[data-k="'+CSS.escape(previous.cardKey)+'"] .phk')?.focus({preventScroll:true});
 }
 else if(changed&&scrollY>$('#bar').offsetTop)scrollTo({top:0})}
$('.tabs').onclick=e=>{
 const button=e.target.closest('[data-tab]');if(!button)return;
 const tab=button.dataset.tab,menu=button.closest('details');
 if(menu){menu.open=false;menu.querySelector('summary').focus({preventScroll:true})}
 if(tab===st.tab){scrollTo({top:0,behavior:motionPreference.matches?'auto':'smooth'});return}
 navigate(tab);
};
addEventListener('resize',()=>hdr());
const dialogOpeners=new WeakMap();
function openDialog(dialog,initial,opener=document.activeElement){
 dialogOpeners.set(dialog,opener);dialog.hidden=false;
 (initial||dialog.querySelector('button')).focus({preventScroll:true});
}
function closeDialog(dialog){
 dialog.hidden=true;dialogOpeners.get(dialog)?.focus({preventScroll:true});
 dialogOpeners.delete(dialog);
}
function trapTab(e,dialog) {
 const focusable=[...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(el=>el.tabIndex>=0&&el.getClientRects().length);
 if(!focusable.length)return;
 const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
 if(!dialog.contains(active)||(e.shiftKey?active===first:active===last)){
  e.preventDefault();(e.shiftKey?last:first).focus();
 }
}
$('#themeMenu').addEventListener('click',event=>{
 const option=event.target.closest('[data-theme-choice]');
 if(!option)return;
 window.PoseWearTheme.select(option.dataset.themeChoice);
 $('#themeMenu').open=false;
 $('#theme').focus({preventScroll:true});
});
$('#help').onclick=()=>{const menu=$('#noticeMenu');menu.open=false;openDialog($('#helpBox'),null,menu.querySelector('summary'))};
$('#helpBox').onclick=e=>{if(e.target.id==='helpBox'||e.target.closest('[data-close]'))closeDialog($('#helpBox'))};
$('.skip').onclick=e=>{
 e.preventDefault();
 const target=$(st.tab==='studio'?'#studio':st.tab==='history'?'#histSec':'#grid');
 target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'start'});
};
// 滚动
const hdr=()=>document.documentElement.style.setProperty('--hdr',$('#top').offsetHeight+'px');
new ResizeObserver(hdr).observe($('#top'));
let sc=false;addEventListener('scroll',()=>{const s=scrollY>24;if(s!=sc){sc=s;document.body.classList.toggle('scrolled',s);setTimeout(hdr,420)}$('#toTop').classList.toggle('on',scrollY>900)},{passive:true});
$('#toTop').onclick=()=>scrollTo({top:0,behavior:motionPreference.matches?'auto':'smooth'});
// 收藏导入导出 / 最近
$('#exp').onclick=()=>{if(!st.fav.size)return toast('还没有收藏可导出');const items=[...st.fav].map(k=>ITEMS[k]).filter(Boolean).map(it=>({类型:TL(it),编号:it.id,名称:title(it),中文:prompt(it,'zh'),英文:prompt(it,'en'),key:it.k}));
 const b=new Blob([JSON.stringify({app:'衣姿 PoseWear',导出时间:new Date().toLocaleString('zh-CN'),收藏:items},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='衣姿-收藏-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast('已导出 '+items.length+' 条收藏')};
$('#imp').onclick=()=>$('#impF').click();$('#impF').onchange=async e=>{try{const j=JSON.parse(await e.target.files[0].text());const ks=(j.收藏||[]).map(x=>resolveKey(x?.key)).filter(k=>typeof k==='string'&&/^[pcradehysltf]:/.test(k));await needKeys(ks);let n=0;ks.forEach(k=>{if(ITEMS[k]&&!st.fav.has(k)){st.fav.add(k);n++}});SV('fav',[...st.fav]);counts();setTab('fav');toast('已导入 '+n+' 条收藏')}catch(err){toast('导入失败：文件格式不正确')}e.target.value=''};
$('#clrRec').onclick=()=>{if(!st.rec.length)return;const old=st.rec.slice();st.rec=[];SV('rec',[]);counts();viewT(apply);toast(`已清空 ${old.length} 条记录`,()=>{st.rec=old;SV('rec',old);counts();viewT(apply)})};
$('#clrFav').onclick=()=>{if(!st.fav.size)return toast('还没有收藏');const old=[...st.fav];st.fav=new Set();SV('fav',[]);counts();viewT(apply);toast(`已清空 ${old.length} 条收藏`,()=>{st.fav=new Set(old);SV('fav',old);counts();viewT(apply)})};
document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)navigate(b.dataset.go)});
addEventListener('offline',()=>toast('网络已断开，看过的图片还能继续浏览'));addEventListener('online',()=>toast('网络已恢复'));
function addRec(k){st.rec=[k,...st.rec.filter(x=>x!=k)].slice(0,100);st.recT[k]=Date.now();const r={};st.rec.forEach(x=>st.recT[x]&&(r[x]=st.recT[x]));st.recT=r;SV('rec',st.rec);SV('recT',r);counts()}
addEventListener('storage',e=>{if(!['fav','rec','recT','adult','sel'].includes(e.key))return;st.fav=new Set(storedKeys('fav'));st.rec=storedKeys('rec');st.recT=storedRecT;st.sel=storedKeys('sel');if(e.key=='adult'&&st.adult!=(LS('adult')===true))ageSet(LS('adult')===true);counts();needKeys([...st.fav,...st.rec,...st.sel]).then(()=>{tray();if((st.tab=='fav'||st.tab=='recent')&&$('#lb').hidden)apply()}).catch(()=>{})});
// 大图
let li=0,srcCard=null;const pre=new Map();function preload(src){if(pre.has(src))return pre.get(src);const p=new Promise(r=>{const i=new Image();if(/^https?:/i.test(src))i.referrerPolicy='no-referrer';i.onload=()=>r(src);i.onerror=()=>r(null);i.src=src});pre.set(src,p);if(pre.size>80)pre.delete(pre.keys().next().value);return p}
function rectAnim(el,from,rev){const to=el.getBoundingClientRect();if(!from||!to.width)return el.animate([{opacity:0,transform:'scale(.94)'},{opacity:1,transform:'none'}],{duration:rev?220:380,easing:'cubic-bezier(.16,1,.3,1)',direction:rev?'reverse':'normal',fill:'both'});
 const dx=from.left+from.width/2-(to.left+to.width/2),dy=from.top+from.height/2-(to.top+to.height/2),s=Math.max(from.width/to.width,.08);
 return el.animate([{transform:`translate(${dx}px,${dy}px) scale(${s})`,opacity:.2,borderRadius:'40px'},{transform:'none',opacity:1,borderRadius:'20px'}],{duration:rev?320:520,easing:rev?'cubic-bezier(.4,0,.2,1)':'cubic-bezier(.16,1,.3,1)',direction:rev?'reverse':'normal',fill:'both'})}
// li always indexes the gallery the user entered from, even while its paired image is on screen.
let lbVariant=null,lbVisitedPair=false;
const previewItem=()=>lbVariant||st.list[li];
function drawPosePair(it,slot){
 const type=counterpartType(it);
 if(!type||!ok(it))return;
 const show=()=>{
  if(!slot.isConnected||$('#lb').hidden||closing||previewItem()!==it||!poseCounterpart(it))return;
  slot.innerHTML='<div class="seg" role="group" aria-label="姿势图类型">'+
   [['pose','线稿'],['depth','深度图']].map(([kind,label])=>
    `<button data-variant="${kind}" class="${kind===it.type?'on':''}" aria-pressed="${kind===it.type}">${label}</button>`
   ).join('')+'</div>';
 };
 if(DATA[type])show();
 else load(type).then(show,()=>{});
}
let lbPushed=false;const pend=new Set();function lbOpen(i,c){if(!ok(st.list[i]))return;li=i;lbVariant=c?.dataset.show?ITEMS[c.dataset.show]:null;lbVisitedPair=!!lbVariant;{const it=previewItem(),h='#'+it.type+'/'+it.id;if(location.hash!=h&&!location.hash.includes('/')){history.pushState({galleryItem:true},'',h);lbPushed=true}}const lb=$('#lb');if(lb.hidden)srcCard=document.activeElement;lb.hidden=false;document.body.style.overflow='hidden';lbDraw();
 if(!motionPreference.matches){$('.lb-bg').animate([{opacity:0},{opacity:1}],{duration:300});rectAnim($('.lb-box'),c&&c.querySelector('.ph').getBoundingClientRect())}$('.lb-x').focus({preventScroll:true})}
let closing=false;function lbClose(navigate=false,immediate=false){if($('#lb').hidden||closing)return;
 const leaving=navigate===true,fromHistory=st.tab==='history';
 if(lbPushed){lbPushed=false;if(!leaving)history.back()}
 const it=st.list[li],c=it&&grid.querySelector(`.card[data-k="${CSS.escape(it.k)}"]`),r=c&&c.querySelector('.ph').getBoundingClientRect();
 const vis=r&&r.bottom>0&&r.top<innerHeight;const done=()=>{closing=false;lbVariant=null;$('#lb').hidden=true;document.body.style.overflow='';$('.lb-box').getAnimations().forEach(a=>a.cancel());if(!leaving&&location.hash.includes('/'))history.replaceState(null,'','#'+st.tab);
 if(!leaving&&lbVisitedPair&&(st.tab==='recent'||(st.tab==='fav'&&pend.size)))apply();
 else if(st.tab==='fav')pend.forEach(k=>!st.fav.has(k)&&dropCard(k));
 lbVisitedPair=false;pend.clear();
 if(fromHistory)window.HIS?.closed?.(!leaving);
 else {
  const img=$('#lbImg');delete img.dataset.src;img.removeAttribute('srcset');img.removeAttribute('src');$('#lbSide').replaceChildren();
  if(!leaving){
   const back=srcCard?.isConnected&&srcCard!==document.body?srcCard:it&&grid.querySelector(`.card[data-k="${CSS.escape(it.k)}"] .phk`);
   back?.focus({preventScroll:true});
  }
 }};
 if(motionPreference.matches||leaving||immediate)return done();closing=true;$('.lb-bg').animate([{opacity:1},{opacity:0}],{duration:220,fill:'both'}).finished.then(a=>a.cancel());rectAnim($('.lb-box'),vis?r:null,true).finished.then(done)}
function lbDraw(){const it=previewItem();if(!ok(it)||st.tab==='history')return;const img=$('#lbImg'),box=$('.lb-img'),src=big(it),D=it.type=='depth';addRec(it.k);
 history.replaceState(history.state,'','#'+it.type+'/'+it.id);
 box.classList.toggle('ext',!!it.ext);box.classList.remove('fail');const miss=$('#lbMiss');if(it.site)miss.href=it.site;
 img.referrerPolicy=it.ref||'';img.onerror=()=>{if(D&&img.dataset.src==src){box.classList.add('fail');box.classList.remove('loading')}};
 if(img.dataset.src!=src){img.dataset.src=src;img.removeAttribute('srcset');img.src=thumb(it);img.classList.add('lo');box.classList.add('loading');preload(src).then(s=>{if(img.dataset.src!=src)return;if(s){img.src=s;if(!it.angles&&(it.type=='costume'||it.type=='anime')){img.sizes='(max-width:760px) 100vw, 60vw';img.srcset=`${it.m} 1080w, ${it.i} 1366w`}img.classList.remove('lo');box.classList.remove('loading');box.classList.remove('fail')}else{box.classList.toggle('fail',D);box.classList.remove('loading');img.classList.remove('lo')}})}
 [1,-1,2].forEach(d=>{const n=st.list[(li+d+st.list.length)%st.list.length];if(ok(n))preload(big(n))});if(it.angles)it.angles.forEach(a=>preload(a.i));
 const original=orig(it),format=original.split('.').pop().toLowerCase();
 const P=it.type=='pose',isF=st.fav.has(it.k),isS=st.sel.includes(it.k);img.alt=title(it);
 const zh=`<div class="pbox"><small>中文描述</small><p>${esc(prompt(it,'zh'))}</p><button class="sm pri" data-c="zh">复制中文</button></div>`,en=`<div class="pbox en"><small>英文提示词 · PROMPT</small><p>${esc(prompt(it,'en'))}</p><button class="sm" data-c="en">复制英文</button></div>`;
 const ang=!!it.angles, meta=ang?it.line+' · '+it.cat+(D?' · '+it.angles[it.ai].zh:'')+' · 编号 '+it.no:it.type=='portrait'?it.sec+' · '+it.len+' · 编号 '+it.no+(it.rk?' · 人气第 '+it.rk+' 名':''):it.cat+' · 编号 '+it.id;
 const jaLine=D?`<div class="jp">日文原名：${esc(it.ja)}</div><div class="jp">${esc(it.lineJa)} · ${esc(it.catJa)} · ${esc(it.angles[it.ai].ja)}</div>`:(P?`<div class="jp">日文原名：${esc(it.ja)}</div>`:'');
 const sourceCredit=D?`<p class="creditln">${esc(it.unofficial||'非官方汉化')} · ${esc(it.credit||'')} <a href="${esc(it.site)}" target="_blank" rel="noopener">在原站查看</a></p>`:it.type==='portrait'?'<p class="creditln">CC0 1.0，AI 生成的虚构人物，请勿用于冒充真人</p>':'';
 $('#lbSide').innerHTML=`<div class="mu">${TNAME[st.tab]} · 第 ${li+1} / ${st.list.length} 项</div><h2>${esc(title(it))}</h2><div class="mu">${esc(meta)}</div>
 ${jaLine}${P||D?'<div id="lbPair"></div>':''}${ang?`<div class="angsel" role="group" aria-label="拍摄角度">${it.angles.map((a,i)=>`<button class="chip ${i==it.ai?'on':''}" data-ai="${i}" aria-pressed="${i==it.ai}">${esc(a.zh)}</button>`).join('')}</div>`:''}
 ${st.lang=='en'?en+zh:zh+en}${ang?'':it.type=='portrait'?`<div class="jp">日文原名：${esc(it.ja)}</div>`:`<div class="jp">原始关键词：${esc(it.kw)}</div>`}
 <div class="mact"><button data-x="fav" class="${isF?'on':''}" aria-label="${isF?'取消收藏':'收藏'}">${isF?'♥':'♡'}</button><button data-x="share">分享</button>${D?'':`<button data-x="try" class="pri">${tryLabel(it)}</button>`}</div> <div class="acts"><button data-x="fav">${isF?'♥ 已收藏':'♡ 收藏'}</button><button data-x="sel" class="${isS?'':'pri'}">${isS?'✓ 已在组合中':'＋ 加入组合'}</button>${D?'':`<button data-x="try">${tryLabel(it)}</button>`}<button data-x="share">分享链接</button>${D?'':`${it.ext?'':`<button data-x="dlx">下载图片</button><button data-x="cpimg">复制图片</button>${original?`<a href="${esc(original)}" data-download-original download="posewear-${it.type}-${it.id}${it.angles?'-'+it.ai:''}.${esc(format)}" class="dl"><button tabindex="-1">下载原图 ${esc(format.toUpperCase())}</button></a>`:''}`}${P||it.type=='portrait'?'':`<a href="https://s.taobao.com/search?q=${encodeURIComponent([...val(it,'col').slice(0,1),...val(it,'item').slice(0,2)].join(' ')||'女装 '+it.cat)}" target="_blank" rel="noopener" class="dl"><button tabindex="-1">淘宝搜同款 ↗</button></a>`}`}</div>
<div id="lbSim"></div><p class="mu" style="margin-top:22px;line-height:2.1"><kbd>←</kbd><kbd>→</kbd>切换　${ang?'<kbd>↑</kbd><kbd>↓</kbd>角度　':''}<kbd>F</kbd>收藏　<kbd>A</kbd>组合　<kbd>C</kbd>复制　<kbd>S</kbd>分享</p>${sourceCredit}`;if(P||D)drawPosePair(it,$('#lbPair'));window.X&&X.lb(it)}
function share(){
 const it=previewItem(),url=new URL(location.href);
 if(counterpartType(it))url.hash=it.type+'/'+it.id+'/'+encodeURIComponent(it.angles[it.ai].zh);
 copy(url.href,'分享链接');
}
$('#lbSide').onclick=e=>{const it=previewItem(),t=e.target.closest('button');if(!t||!ok(it)||st.tab==='history')return;
 if(t.dataset.variant){
  const pair=poseCounterpart(it);
  if(!pair||pair.item.type!==t.dataset.variant)return;
  lbVisitedPair=true;lbVariant=pair.item;setAng(pair.item,pair.angle);lbDraw();
  $('#lbPair [aria-pressed="true"]')?.focus({preventScroll:true});return;
 }
 if(t.dataset.ai){setAng(it,+t.dataset.ai);lbDraw();$('#lbSide [data-ai="'+it.ai+'"]').focus({preventScroll:true})}if(t.dataset.c)copyBrief(prompt(it,t.dataset.c),[it],t.dataset.c,t.dataset.c=='en'?'英文提示词':'中文描述');if(t.dataset.x=='fav')toggleFav(it.k);if(t.dataset.x=='sel')toggleSel(it.k);if(t.dataset.x=='share')share();if(t.dataset.x=='try'){lbClose(!!STUDIO_SLOT[it.type]);useReference(it)}};
const step=d=>{li=(li+d+st.list.length)%st.list.length;lbVariant=null;lbDraw();if(!motionPreference.matches)$('#lbImg').animate([{opacity:.3,transform:`translateX(${d*30}px)`},{opacity:1,transform:'none'}],{duration:320,easing:'cubic-bezier(.16,1,.3,1)'})};
$('.lb-bg').onclick=lbClose;$('.lb-x').onclick=lbClose;$('.prev').onclick=()=>step(-1);$('.next').onclick=()=>step(1);
addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('.shell-menu[open]'))return;const ae=document.activeElement,inp=ae&&/^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName);
 if(!$('#cfg').hidden||!$('#pk').hidden)return;
 const modal=$('#ageBox:not([hidden]),#privBox:not([hidden]),#helpBox:not([hidden]),#tgView:not([hidden])');
 if(modal){
  if(e.key==='Escape'||(modal.id==='helpBox'&&e.key==='?')){e.preventDefault();closeDialog(modal);if(modal.id==='ageBox')ageCb=null}
  else if(e.key==='Tab')trapTab(e,modal);
  return;
 }
 if(trayOpen&&$('#lb').hidden&&$('#tray').contains(ae)&&e.key==='Escape'){
  e.preventDefault();closeTray();
  return;
 }
 if(!$('#lb').hidden&&e.key==='Tab'){trapTab(e,$('#lb'));return}
 if(e.key==='Escape'){if(!$('#lb').hidden)return lbClose();drawer(false);if(inp)ae.blur();return}if(inp)return;
 if(e.key==='?'){openDialog($('#helpBox'));return}const k=(e.key||'').toLowerCase();
 if($('#lb').hidden){if(e.key==='/'&&FDEF[st.tab]){e.preventDefault();$('#q').focus()}else if(k==='r'&&FDEF[st.tab]&&!$('#rand').hidden)randPick();else if(k==='t')window.PoseWearTheme.toggle();else if(k==='l')setLang(st.lang==='zh'?'en':'zh');else if('123456789'.includes(e.key)&&TABS[e.key-1])navigate(TABS[e.key-1]);return}
 if(st.tab==='history')return;
 const it=previewItem();if(!ok(it))return;if(e.key=='ArrowLeft')step(-1);else if(e.key=='ArrowRight')step(1);
 else if(/Arrow(Up|Down)/.test(e.key)&&it.angles){e.preventDefault();setAng(it,(it.ai+(e.key=='ArrowUp'?-1:1)+it.angles.length)%it.angles.length);lbDraw()}
 else if(k=='f')toggleFav(it.k);else if(k=='a')toggleSel(it.k);else if(k=='c')copyBrief(prompt(it,'zh'),[it],'zh','中文描述');else if(k=='s')share();
});
let tx,ty;$('.lb-img').addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY},{passive:true});$('.lb-img').addEventListener('touchend',e=>{const d=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;if(Math.abs(d)>50&&Math.abs(d)>Math.abs(dy))(d<0?$('.next'):$('.prev')).click();else if(dy>90)lbClose()});
// 数字滚动
// 路由
function openById(id){
 const prefix=PFX[st.tab];if(prefix)id=resolveKey(prefix+id).slice(2);
 const it=st.list.find(x=>x.id===id)||(DATA[st.tab]||[]).find(x=>x.id===id);
 if(!it)return toast('未找到该条目');
 if(!ok(it))return ageAsk(()=>openById(id));
 const sharedAngle=location.hash.split('/')[2];
 if(sharedAngle&&counterpartType(it)){
  const angle=it.angles.findIndex(a=>encodeURIComponent(a.zh)===sharedAngle);
  if(angle>=0)setAng(it,angle);
 }
 if(!st.list.includes(it)){st.f={};st.q='';$('#q').value='';drawFilters();apply()}
 lbOpen(st.list.indexOf(it));
}
function route(){const [t,id,ref]=location.hash.slice(1).split('/');
 if(t==='workbench')return setTab(Object.hasOwn(PFX,id)?id:'pose',null,ref||'');
 const tab=TABS.includes(t)?t:'pose';if(!id&&tab==st.tab&&st.list.length)return;if(tab!=st.tab||!st.list.length||!id)setTab(tab,id&&decodeURIComponent(id));else openById(decodeURIComponent(id))}
// 成人内容开关
function ageSet(on,anim){st.adult=on;SV('adult',on);if(on)SV('ageOk',true);document.body.classList.toggle('adult',on);$('#adultSw').setAttribute('aria-checked',on);$('#adultSw').title=on?'成人向内容已显示，点击关闭':'成人向内容已隐藏，点击打开';counts();
 const origin=!$('#lb').hidden&&st.tab!=='history'&&st.list[li];
 if(origin&&(!ok(origin)||!ok(previewItem())))lbClose(false,true);
 if(FDEF[st.tab]){const f=()=>{if(FDEF[st.tab]){drawFilters();apply();tray();
  if(origin&&!$('#lb').hidden&&!closing){li=st.list.indexOf(origin);if(li<0)lbClose(false,true);else lbDraw()}
 }};anim?viewT(f):f()}window.WB&&WB.show&&st.tab=='studio'&&WB.show()}
let ageCb=null;function ageAsk(cb){ageCb=cb||null;const seen=LS('ageOk');$('#ageT').textContent=cb?'这是成人向内容':'显示成人向内容？';$('#ageP').textContent=(cb?'要查看它，需要打开顶部的「18+」开关。':'包括双人互动、性感类姿势、深度姿势里的双人图，以及内衣、性感类服装。')+(seen?'打开后随时可以再关上。':'仅适合已满 18 岁的用户。只需确认一次，之后用顶部开关随时打开或关闭。');$('#ageY').textContent=seen?'打开 18+ 开关':'我已满 18 岁，打开';openDialog($('#ageBox'),$('#ageY'))}
$('#adultSw').onclick=()=>{if(st.adult){ageSet(false,1);toast('已关闭成人向内容')}else if(LS('ageOk')){ageSet(true,1);toast('已显示成人向内容')}else ageAsk()};
$('#ageY').onclick=()=>{closeDialog($('#ageBox'));ageSet(true,!ageCb);toast('已显示成人向内容，可用顶部开关关闭');const c=ageCb;ageCb=null;c&&c()};
$('#ageN').onclick=$('#ageBox').onclick=e=>{if(e.target.id!='ageN'&&e.target.id!='ageBox')return;closeDialog($('#ageBox'));ageCb=null};
document.addEventListener('click',e=>{const b=e.target.closest('[data-age]');if(!b)return;st.adult?(ageSet(false),toast('已隐藏成人内容')):ageAsk()});
$('#privO').onclick=e=>{e.preventDefault();openDialog($('#privBox'))};$('#privBox').onclick=e=>{if(e.target.id=='privBox'||e.target.closest('[data-close]'))closeDialog($('#privBox'))};
addEventListener('hashchange',()=>{const id=location.hash.split('/')[1];if(!$('#lb').hidden){if(id)return;lbPushed=false;lbClose();setTimeout(route,closing?280:0);return}route()});
if(innerWidth<=760)$('#q').placeholder='搜索';setLang(st.lang,true);ageSet(st.adult);hdr();needKeys([...st.sel]).then(()=>tray()).catch(()=>{});st.tab='';if(Q0&&!location.hash)history.replaceState(null,'','?q='+encodeURIComponent(Q0)+'#'+(TABS.includes(QT)?QT:'costume'));route();
if('serviceWorker'in navigator&&location.protocol!='file:')addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));

window.APP={ok,resolveKey,counterpartType,poseCounterpart,cardFace,studioSlot,suggestions:SUGG,sendToStudio,ageAsk,toggleFav,toggleSel,lbOpen,lbClose,previewItem,apply,li:()=>li,load,ITEMS,DATA,thumb,big,ath,title,prompt,toast,esc,setTab:navigate,st,copy,copyBrief,needKeys};
