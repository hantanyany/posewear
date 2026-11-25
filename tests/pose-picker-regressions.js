const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const source = path.join(__dirname,'..','src');
const labels = {正面:'front',侧面:'side',背面:'back'};
function reference(id,depth=false,gated=false) {
  const pose = {id,no:id.split('_').at(-1),ti:id,zh:id,en:id,cat:'立姿',line:'全身',lineEn:'full body',a:gated};
  if (depth) pose.pack='gia-depth';
  const views = depth?['正面','背面','侧面']:['正面','侧面','背面'];
  pose.angles = views.map(zh => {
    const file = '/icon-192.png?view='+labels[zh];
    return {zh,en:labels[zh],t:file,i:file,o:file};
  });
  return pose;
}
const id = n => 'full_single_P'+String(n).padStart(3,'0');
const ordered = ['upper80v2_P052',...Array.from({length:174},(_,i)=>id(i+1))];
const poses = [...ordered.map(key=>reference(key)),reference('private_line',false,true),reference('private_depth'),reference('only_line')];
const depths = [...[...ordered].reverse().map(key=>reference(key,true)),reference('private_line',true),reference('private_depth',true,true),reference('only_depth',true)];
const outfit = {id:'outfit',ti:'服装',zh:'服装',en:'outfit',cat:'服装',t:'/icon-192.png',m:'/icon-192.png',i:'/icon-192.png',o:'/icon-192.png'};
const catalogs = {'poses.json':poses,'depths.json':{items:depths},'costumes.json':[outfit]};
const card = (page,k) => page.locator('#pkG [data-k="'+k+'"]');
const variant = (page,type) => page.locator('#pkPoseTypes [data-pk-type='+type+']');
const materialKeys = page => page.locator('#pkG [data-k]').evaluateAll(cards=>cards.map(el=>el.dataset.k));
async function search(page,query) {
  const old = await page.locator('#pkG').evaluate(grid=>grid.firstElementChild?.outerHTML);
  await page.locator('#pkQ').fill(query);
  await page.waitForFunction(previous=>document.querySelector('#pkG').firstElementChild?.outerHTML!==previous,old);
}
async function check(browser,width) {
  const mobile=width<600;
  const context=await browser.newContext({viewport:{width,height:mobile?780:820},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();
  page.setDefaultTimeout(6000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.route('**/*', route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='posewear.test')return route.abort();
      const file=url.pathname.slice(1)||'index.html';
      if(file.endsWith('.json'))return route.fulfill({json:catalogs[file]||[]});
      const location=path.join(source,file);
      return fs.existsSync(location)?route.fulfill({path:location}):route.fulfill({status:404,body:''});
    });
    await page.addInitScript(locale=>localStorage.setItem('pwUiLocale',locale),mobile?'ja':'en');
    await page.goto('http://posewear.test/#pose');
    const sketchKey='p:'+id(52),depthKey='d:'+id(52);
    // Select a side view via the gallery, before adding the same reference in the picker.
    await page.locator('#q').fill(id(52));
    const galleryCard=page.locator('#grid .card[data-k="'+sketchKey+'"]');
    await galleryCard.locator('[data-a=ang][data-i="1"]').click();
    await page.locator('#trayFab').click();
    await page.locator('#tgPrompt').fill('保留我的提示词');
    const opener=page.locator('#tgAddRow [data-add=pose]');
    await opener.click();
    await card(page,sketchKey).waitFor();
    assert.deepEqual(await page.locator('#pkPoseTypes button').allInnerTexts(),mobile?['線画','深度画像']:['Line art','Depth map']);
    assert.deepEqual((await materialKeys(page)).slice(0,ordered.length),ordered.map(key=>'p:'+key));
    const farKey=id(165);
    await card(page,'p:'+farKey).scrollIntoViewIfNeeded();
    await card(page,'p:'+farKey).click();
    const offset=element=>element.getBoundingClientRect().top-document.querySelector('#pkG').getBoundingClientRect().top;
    const originalOffset=await card(page,'p:'+farKey).evaluate(offset);
    await variant(page,'depth').click();
    await card(page,'d:'+farKey).waitFor();
    assert.deepEqual((await materialKeys(page)).slice(0,ordered.length),ordered.map(key=>'d:'+key));
    assert.ok(Math.abs(await card(page,'d:'+farKey).evaluate(offset)-originalOffset)<=2);
    assert.equal(await card(page,'d:private_depth').count(),0);
    assert.equal(await card(page,'d:private_line').count(),1);
    assert.equal(await card(page,'d:only_depth').count(),1);
    await variant(page,'pose').click();
    await card(page,'p:'+farKey).click();
    assert.equal(await card(page,'p:private_line').count(),0);
    assert.equal(await card(page,'p:private_depth').count(),1);
    assert.equal(await card(page,'p:only_line').count(),1);

    await page.locator('#pkQ').fill('P052');
    await page.waitForFunction(()=>document.querySelectorAll('#pkG [data-k]').length===2);
    await card(page,sketchKey).click();
    assert.match(await card(page,sketchKey).locator('img').getAttribute('src'),/side$/);
    await variant(page,'depth').click();
    assert.equal(await page.locator('#pkQ').inputValue(),'P052');
    assert.deepEqual(await materialKeys(page),['d:upper80v2_P052',depthKey]);
    assert.match(await card(page,depthKey).locator('img').getAttribute('src'),/side$/);
    assert.match(await card(page,'d:upper80v2_P052').locator('img').getAttribute('src'),/front$/);
    await card(page,depthKey).click();
    await variant(page,'pose').click();
    assert.equal(await card(page,sketchKey).getAttribute('aria-pressed'),'true');
    await page.locator('#pkDone').click();
    assert.ok(await opener.evaluate(el=>document.activeElement===el));
    assert.deepEqual(await page.locator('#trayItems img').evaluateAll(images=>images.map(img=>[img.dataset.type,new URL(img.src).search])),[['pose','?view=side'],['depth','?view=side']]);
    assert.equal(await page.locator('#tgPrompt').inputValue(),'保留我的提示词');
    await page.locator('#trayMin').click();
    await page.locator('.tabs [data-tab=studio]').click();

    const studioOpener=page.locator('#studio .sh [data-pick=pose]');
    await page.locator('#wbPo .empty0').click();
    assert.equal(await page.locator('#pkT').innerText(),mobile?'ポーズ参考画像を選択（最大6枚）':'Choose up to 6 pose reference images');
    await variant(page,'depth').click();
    await card(page,depthKey).click();
    await page.keyboard.press('Escape');
    assert.ok(await studioOpener.evaluate(el=>document.activeElement===el));
    const angleSelect=page.locator('#wbPo [data-ang]');
    await angleSelect.selectOption('1'); // depth "back" at 1, line-art "back" at 2.
    await studioOpener.click();
    assert.match(await card(page,sketchKey).locator('img').getAttribute('src'),/back$/);
    await card(page,sketchKey).click();
    await variant(page,'depth').click();
    assert.equal(await card(page,depthKey).getAttribute('aria-pressed'),'true');
    for(const n of [1,2,3,4])await card(page,'d:'+id(n)).click();
    await card(page,'d:'+id(5)).click();
    assert.equal(await card(page,'d:'+id(5)).getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('#pkT').innerText(),mobile?'ポーズ参考画像（6/6枚）':'Pose reference images (6/6)');
    assert.equal(await page.locator('#toast').innerText(),mobile?'ポーズ参考画像は最大6枚です':'Choose up to 6 pose reference images');
    await page.locator('#pkDone').click();
    const selection=await page.evaluate(()=>({poses:WB._W.poses.map(ref=>[ref.k,ref.ai]),garments:WB._W.garments}));
    assert.deepEqual(selection.poses,[[depthKey,1],[sketchKey,2],...[1,2,3,4].map(n=>['d:'+id(n),0])]);
    assert.deepEqual(selection.garments,[]);
    assert.equal(await page.locator('#wbPo .pick').count(),6);
    await page.locator('#wbBoardCards [data-pick=depth]').first().click();
    assert.equal(await variant(page,'depth').getAttribute('aria-pressed'),'true');
    await search(page,'unmatched term');
    assert.equal(await page.locator('#pkG [data-k]').count(),0);
    await variant(page,'pose').click();
    assert.equal(await page.locator('#pkG [data-k]').count(),0);
    await page.locator('#pkX').click();

    await page.locator('#wbG .empty0').click();
    assert.ok(await page.locator('#pkPoseTypes').isHidden());
    await card(page,'c:outfit').click();
    assert.equal(await card(page,'c:outfit').getAttribute('aria-pressed'),'true');
    await page.locator('#pkDone').click();
    await page.locator('#pk').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>WB._W.garments[0].k),'c:outfit');
    assert.deepEqual(errors,[]);
    console.log('PASS '+width+'px paired pose picker ordering, scroll, search, gating, camera angles, limits and drafts');
  } finally { await context.close(); }
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});
  try { for(const width of [1100,390])await check(browser,width); }
  finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
