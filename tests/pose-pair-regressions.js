// Reordered views, colliding display numbers, restricted pairs and independent packs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const src = path.resolve(__dirname, '../src');
const directions = {front:'正面', side:'侧面', top:'俯拍'};
function entry(type, id, views, extra = {}) {
  return {
    id, no:'P001', line:'全身', lineEn:'full body', cat:'站姿',
    zh:type+' '+id, en:type+' reference '+id, ja:id,
    ...(type === 'depth' ? {pack:'gia-depth',site:'https://example.test/'} : {}),
    angles:views.map(view => {
      const image = 'media/'+type+'/'+id+'/'+view;
      return {zh:directions[view], en:view, ja:view, t:image+'-thumb.png', i:image+'.png', o:image+'.png'};
    }),
    ...extra
  };
}
const paired = 'full_stand_P001', unpaired = 'unpaired_P001', gated = 'full_sexy_P001';
const extension = 'ext_P001', partial = 'partial_P001';
const pose = [
  entry('pose',paired,['front','side']), entry('pose',unpaired,['front']),
  entry('pose',gated,['front'],{a:1}), entry('pose',extension,['front']),
  entry('pose',partial,['front','top'])
];
const depth = [
  entry('depth',paired,['side','front']), entry('depth',gated,['front']),
  entry('depth',extension,['front'],{pack:'community'}), entry('depth',partial,['front'])
];
const site = 'http://posewear.test/';
const variant = (page,type) => page.locator('#lbPair [data-variant="'+type+'"]');
const card = (page,key) => page.locator('#grid [data-k="'+key+'"] .phk');

async function checkGalleryFaces(browser, serve) {
  for (const mobile of [false,true]) {
    const context=await browser.newContext({serviceWorkers:'block',locale:'zh-CN',reducedMotion:'reduce',
      hasTouch:mobile,isMobile:mobile,viewport:mobile?{width:390,height:844}:{width:1200,height:850}});
    await context.route('**/*',serve);
    await context.addInitScript(dark=>{
      if(dark)localStorage.theme='dark';
      Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.lastCopied=text}}});
    },mobile);
    const page=await context.newPage(),errors=[];
    page.setDefaultTimeout(6000);
    page.on('pageerror',err=>errors.push(err.message));
    const origin=mobile?'depth':'pose',other=mobile?'pose':'depth',key=origin[0]+':'+paired;
    const row=page.locator('#grid .card[data-k="'+key+'"]');
    const flip=row.locator('button[data-a=flip]');
    const image=(type,view)=>row.locator('.ph img[src$="media/'+type+'/'+paired+'/'+view+'-thumb.png"]');
    await page.goto(site+'#'+origin);
    await flip.waitFor();
    const missing=mobile?[gated,extension]:[unpaired,extension];
    for (const id of missing) {
      assert.ok(await page.locator('#grid .card[data-k="'+origin[0]+':'+id+'"] .phk').isVisible());
      assert.equal(await page.locator('#grid .card[data-k="'+origin[0]+':'+id+'"] [data-a=flip]:visible').count(),0);
    }
    if (!mobile) {
      const incomplete=page.locator('#grid .card[data-k="p:'+partial+'"]');
      await incomplete.getByRole('button',{name:'俯拍',exact:true}).click();
      assert.equal(await incomplete.locator('[data-a=flip]:visible').count(),0);
    }
    await row.getByRole('button',{name:'侧面',exact:true}).click();
    const angles=await row.locator('.angs button').allTextContents();
    await image(origin,'side').waitFor();
    if (mobile) {
      assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
      assert.ok(await flip.evaluate(el=>getComputedStyle(el).opacity!=='0'));
      await flip.tap();
    } else {
      const target='**/media/depth/'+paired+'/side-thumb.png';
      const failed=page.waitForResponse(response=>response.url().endsWith('/depth/'+paired+'/side-thumb.png')&&response.status()===503);
      await page.route(target,route=>route.fulfill({status:503,body:''}),{times:1});
      await flip.press('Enter');
      await failed;
      await row.locator('button[data-a=flip]:not([aria-busy=true])').waitFor();
      assert.ok(await image(origin,'side').isVisible());
      const pending=page.waitForRequest(target);
      let release;
      const gate=new Promise(resolve=>{release=resolve});
      await page.route(target,async route=>{await gate;await route.fallback()});
      await flip.press('Enter');
      await pending;
      assert.equal(await flip.getAttribute('aria-busy'),'true');
      assert.ok(await image(origin,'side').evaluate(el=>el.complete&&el.naturalWidth>0&&getComputedStyle(el).opacity!=='0'));
      release();
    }
    await image(other,'side').waitFor();
    assert.deepEqual(await row.locator('.angs button').allTextContents(),angles);
    assert.equal(await row.getAttribute('data-show'),other[0]+':'+paired);
    assert.equal(await row.locator('.angs [aria-pressed=true]').textContent(),'侧面');
    assert.equal(await page.evaluate(()=>location.hash),'#'+origin);
    assert.ok(await page.locator('#lb').isHidden());
    if (!mobile) {
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.a),'flip');
      await row.locator('[data-a=fav]').press('Enter');
      await row.locator('[data-a=sel]').press('Enter');
      assert.deepEqual(await page.evaluate(()=>[[...APP.st.fav],APP.st.sel]),[['d:'+paired],['d:'+paired]]);
      assert.equal(await row.locator('[data-a=fav]').getAttribute('aria-pressed'),'true');
      assert.equal(await row.locator('[data-a=sel]').getAttribute('aria-pressed'),'true');
      await row.locator('[data-a=copy]').press('Enter');
      assert.ok((await page.evaluate(()=>lastCopied)).includes('media/depth/'+paired+'/side.png'));
      await row.locator('.phk').click();
      assert.equal(await page.locator('#lbImg').getAttribute('data-src'),'media/depth/'+paired+'/side.png');
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>location.hash==='#pose'&&document.querySelector('#lb').hidden);
      await page.locator('#batchBtn').click();
      await row.locator('.phk').click();
      await page.evaluate(()=>{window.lastCopied=''});
      await page.locator('#bbar [data-b=cp]').click();
      assert.ok((await page.evaluate(()=>lastCopied)).includes('media/depth/'+paired+'/side.png'));
      await page.locator('#bbar [data-b=x]').click();
    }
    await row.getByRole('button',{name:'正面',exact:true}).click();
    if(mobile)await flip.tap();else await flip.press('Space');
    await image(origin,'front').waitFor();
    assert.equal(await row.locator('.angs [aria-pressed=true]').textContent(),'正面');
    assert.equal(await row.locator('[data-a=fav]').getAttribute('aria-pressed'),'false');
    assert.equal(await row.locator('[data-a=sel]').getAttribute('aria-pressed'),'false');
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log('PASS gallery pose/depth flips in place with the same view, visible-face actions, keyboard and dark touch controls');
}

async function run(){
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});
  try {
    const ctx=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce',locale:'zh-CN'});
    const errors=[],images=[];
    let releaseDepth, releaseImage;
    const depthGate=new Promise(resolve=>{releaseDepth=resolve});
    const imageGate=new Promise(resolve=>{releaseImage=resolve});
    const serve=async route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='posewear.test')return route.abort();
      const file=url.pathname.slice(1)||'index.html';
      if(file==='poses.json')return route.fulfill({json:pose});
      if(file==='depths.json'){await depthGate;return route.fulfill({json:{items:depth}})}
      if(file.endsWith('.json'))return route.fulfill({json:[]});
      if(file.startsWith('media/')){
        images.push([file,route.request().resourceType()]);
        if(file==='media/depth/'+paired+'/side.png')await imageGate;
        return route.fulfill({path:path.join(__dirname,'fixtures/mk1.png')});
      }
      const local=path.join(src,file);
      return fs.existsSync(local)?route.fulfill({path:local}):route.fulfill({status:404,body:''});
    };
    await ctx.route('**/*',serve);
    await ctx.addInitScript(()=>{
      Object.defineProperty(navigator,'clipboard',{value:{
        writeText:async text=>{window.lastCopied=text}
      }});
    });
    ctx.on('page',p=>p.on('pageerror',err=>errors.push(err.message)));
    const page=await ctx.newPage();
    const side=page.locator('#lbSide');
    await page.goto(site+'#pose');
    await card(page,'p:'+paired).click();
    await page.keyboard.press('ArrowRight');
    releaseDepth();
    await page.waitForFunction(()=>!!APP.DATA.depth);
    assert.equal(await side.locator('h2').textContent(),'pose '+unpaired);
    assert.equal(await side.locator('[data-variant]').count(),0);
    assert.equal(images.some(([src])=>src.startsWith('media/depth/')),false);

    await page.keyboard.press('ArrowLeft');
    await side.locator('[data-ai="1"]').click();
    await variant(page,'depth').press('Enter');
    assert.equal(await page.locator('#lbImg').getAttribute('data-src'),'media/depth/'+paired+'/side.png');
    assert.equal(await page.evaluate(()=>location.hash),'#depth/'+paired);
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.variant),'depth');
    assert.deepEqual(await page.evaluate(()=>[APP.st.tab,APP.previewItem().ai]),['pose',0]);
    await variant(page,'pose').click();
    const delayed=page.waitForResponse(response=>response.url().endsWith('media/depth/'+paired+'/side.png'));
    releaseImage();
    await (await delayed).finished();
    await page.waitForFunction(()=>document.querySelector('#lbImg').src.endsWith('/pose/full_stand_P001/side.png'));
    await variant(page,'depth').click();
    await side.locator('[data-c=en]').click();
    await page.waitForFunction(()=>window.lastCopied?.includes('Reference images'));
    assert.match(await page.evaluate(()=>lastCopied),new RegExp('media/depth/'+paired+'/side.png'));
    await side.locator('.acts [data-x=sel]').click();
    await page.keyboard.press('f');
    assert.deepEqual(await page.evaluate(()=>[...APP.st.fav,...APP.st.sel]),['d:'+paired,'d:'+paired]);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('s');
    const link=await page.evaluate(()=>lastCopied);
    assert.equal(new URL(link).hash,'#depth/'+paired+'/'+encodeURIComponent('正面'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>location.hash==='#pose'&&document.querySelector('#lb').hidden);
    assert.equal(await page.evaluate(()=>document.activeElement.closest('.card')?.dataset.k),'p:'+paired);

    // A shared view overrides this recipient's saved selection and restores their library on close.
    await page.evaluate(key=>{localStorage.ang=JSON.stringify({...JSON.parse(localStorage.ang),[key]:0})},'d:'+paired);
    const recipient=await ctx.newPage();
    await recipient.goto(link);
    await variant(recipient,'depth').waitFor();
    assert.equal(await recipient.locator('#lbImg').getAttribute('data-src'),'media/depth/'+paired+'/front.png');
    assert.equal(await recipient.evaluate(()=>APP.st.tab),'depth');
    await variant(recipient,'pose').click();
    assert.equal(await recipient.locator('#lbImg').getAttribute('data-src'),'media/pose/'+paired+'/front.png');
    const download=recipient.waitForEvent('download');
    await recipient.locator('#lbSide [data-x=dlx]').click();
    assert.equal((await download).suggestedFilename(),'posewear-pose-'+paired+'.png');
    assert.ok(images.some(([src,type])=>src==='media/pose/'+paired+'/front.png'&&type==='fetch'));
    await recipient.keyboard.press('Escape');
    await recipient.waitForFunction(()=>location.hash==='#depth'&&document.querySelector('#lb').hidden);
    await card(recipient,'d:'+gated).click();
    assert.equal(await variant(recipient,'pose').count(),0);
    assert.equal(images.some(([src])=>src.includes('media/pose/'+gated+'/')),false);
    await recipient.keyboard.press('Escape');
    await card(recipient,'d:'+extension).click();
    assert.equal(await variant(recipient,'pose').count(),0);
    await recipient.close();

    await page.locator('#personalMenu summary').click();
    await page.locator('.tabs [data-tab=fav]').click();
    await card(page,'d:'+paired).click();
    await variant(page,'pose').click();
    await side.locator('.acts [data-x=fav]').click();
    await page.keyboard.press('Escape');
    await card(page,'p:'+paired).waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement.closest('.card')?.dataset.k),'d:'+paired);
    await page.locator('#libraryMenu summary').click();
    await page.locator('.tabs [data-tab=pose]').click();
    await card(page,'p:'+extension).click();
    assert.equal(await variant(page,'depth').count(),0);
    await page.keyboard.press('Escape');
    await card(page,'p:'+partial).click();
    await variant(page,'depth').waitFor();
    await side.locator('[data-ai="1"]').click();
    assert.equal(await variant(page,'depth').count(),0);
    await side.locator('[data-ai="0"]').click();
    await page.keyboard.press('Escape');
    await page.locator('#personalMenu summary').click();
    await page.locator('.tabs [data-tab=recent]').click();
    await card(page,'p:'+partial).click();
    await variant(page,'depth').click();
    await page.keyboard.press('Escape');
    await card(page,'d:'+partial).waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement.closest('.card')?.dataset.k),'p:'+partial);
    await page.locator('#libraryMenu summary').click();
    await page.locator('.tabs [data-tab=pose]').click();
    await page.locator('#adultSw').click();
    await page.locator('#ageY').click();
    await card(page,'p:'+gated).click();
    await variant(page,'depth').click();
    const settings=await ctx.newPage();
    await settings.goto(site+'#depth');
    await settings.locator('#adultSw').click();
    await page.locator('#lb').waitFor({state:'hidden'});
    assert.equal(await card(page,'p:'+gated).count(),0);
    assert.equal(await page.locator('#lbImg').getAttribute('src'),null);
    assert.deepEqual(errors,[]);
    console.log('PASS lightbox pose/depth: angle matching, actions, shared view, restrictions, independent packs, late catalog and image');
    await checkGalleryFaces(browser,serve);
  } finally {await browser.close()}
}
run().catch(err=>{console.error(err);process.exitCode=1});
