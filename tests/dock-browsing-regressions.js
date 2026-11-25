const assert = require('node:assert/strict');
const {chromium} = require('playwright');

async function scrollGallery(page, mobile) {
  const tray = await page.locator('#tray').boundingBox();
  const y = Math.min(360, tray.y - 12);
  await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
  if (mobile) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    await touch('touchStart',[{x:24,y}]);
    for (let offset=20; offset<=100; offset+=20) await touch('touchMove',[{x:24,y:y-offset}]);
    await touch('touchEnd',[]);
    await cdp.detach();
  } else {
    await page.mouse.move(24,y);
    await page.mouse.wheel(0,170);
  }
  await page.waitForFunction(() => scrollY > 10, null, {timeout:4000});
}

// Put the target in the part of the gallery above or beside the dock. A normal
// click/tap still has to pass hit-testing, including for photo and angle buttons.
async function reveal(control) {
  await control.evaluate(el => {
    const r = el.getBoundingClientRect(), dock = document.querySelector('#tray').getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;
    const top = document.querySelector('#bar').getBoundingClientRect().bottom + 6;
    const bottom = (x > dock.left && x < dock.right ? dock.top : innerHeight) - 6;
    if (y < top || y > bottom) window.scrollBy({top:y-(top+bottom)/2,behavior:'instant'});
  });
}

async function checkTwoReferenceLayout(panel,mobile) {
  const layout = await panel.evaluate(el => {
    const rect = selector => el.querySelector(selector).getBoundingClientRect();
    const left = rect('.dock-materials'), prompt = rect('#tgPrompt'), row = rect('.tgen-row');
    return {
      sideBySide:left.right<=prompt.left, stacked:left.bottom<=prompt.top,
      belowRow:left.bottom-row.bottom, aboveRow:row.top-prompt.bottom,
      promptHeight:prompt.height, viewportFraction:el.getBoundingClientRect().height/innerHeight
    };
  });
  const measured = JSON.stringify(layout);
  if (mobile) {
    assert.ok(layout.stacked && layout.promptHeight<=96 && layout.viewportFraction<=0.5,measured);
  } else {
    assert.ok(layout.sideBySide && layout.belowRow<=16 && layout.aboveRow<=16,measured);
  }
}

async function check(browser, width, height, deviceScaleFactor) {
  const mobile = width < 800;
  const context = await browser.newContext({viewport:{width,height},
    deviceScaleFactor,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',serviceWorkers:'block'});
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const errors=[];
  page.on('pageerror',error => errors.push(error.message));
  const activate = el => mobile ? el.tap() : el.click();
  const panel = page.locator('#tray');
  const launcher = page.locator('#trayFab');
  try {
    await page.goto((process.env.U || 'http://127.0.0.1:8787')+'/#costume',{waitUntil:'domcontentloaded'});
    const outfits = page.locator('#grid .card[data-k^="c:"]');
    await outfits.first().waitFor();
    await launcher.waitFor();
    await activate(launcher);
    await panel.waitFor();
    assert.notEqual(await panel.getAttribute('aria-modal'),'true','the open dock hides the gallery from assistive technology');
    await scrollGallery(page,mobile);
    for (const index of [0,1,2]) {
      const primary = !mobile && index === 1;
      const pick = outfits.nth(index).locator(primary ? '[data-a=try]' : '[data-a=sel]');
      await reveal(pick);
      if (!mobile) await pick.hover();
      if (primary) assert.equal(await pick.innerText(),'加入工作台');
      await activate(pick);
      if (primary) {
        assert.equal(new URL(page.url()).hash,'#costume','the primary action left the current gallery');
        assert.equal(await pick.innerText(),'移出工作台');
      }
      if (index===1) await checkTwoReferenceLayout(panel,mobile);
    }
    assert.equal(await page.locator('#trayItems [data-k^="c:"]').count(),3);
    await page.locator('#tgPrompt').fill('Keep this edited studio draft.');
    await activate(page.locator('#libraryMenu summary'));
    await activate(page.locator('#libraryMenu [data-tab=pose]'));
    const pose = page.locator('#grid .card[data-k^="p:"]').first();
    await pose.waitFor();
    assert.ok(await panel.isVisible(),'switching collections closed the dock');
    const addPose = pose.locator('[data-a=sel]');
    await reveal(addPose);
    if (!mobile) await addPose.hover();
    await activate(addPose);
    const angle = pose.locator('[data-a=ang][data-i="1"]');
    await reveal(angle);
    await activate(angle);
    assert.equal(await angle.getAttribute('aria-pressed'),'true');
    const selected = await page.locator('#trayItems img').evaluateAll(imgs => imgs.map(img => img.src));
    assert.equal(selected.length,4);
    assert.equal(selected.at(-1),await pose.locator('img').evaluate(el => el.src),'the dock kept the previous angle');

    const photo = pose.locator('.phk');
    await reveal(photo);
    await activate(photo);
    await page.locator('#lb').waitFor();
    await page.waitForFunction(() => document.querySelector('#lb').contains(document.activeElement));
    if (mobile) await activate(page.locator('#lb .lb-x'));
    else await page.keyboard.press('Escape');
    await page.locator('#lb').waitFor({state:'hidden'});
    assert.ok(await photo.evaluate(el => el === document.activeElement),'lightbox did not return focus to the card');
    assert.ok(await panel.isVisible(),'closing the lightbox also closed the dock');
    assert.equal(await page.locator('#tgPrompt').inputValue(),'Keep this edited studio draft.');
    await page.keyboard.press('/');
    assert.equal(await page.evaluate(() => document.activeElement.id),'q');
    await page.keyboard.press('Escape');
    assert.ok(await panel.isVisible(),'a gallery keyboard shortcut closed the dock');
    await page.locator('#tgGo').focus();
    await page.keyboard.press('Tab');
    assert.ok(await panel.evaluate(el => !el.contains(document.activeElement)),'Tab stayed trapped in the dock');
    await page.locator('#trayMin').focus();
    await page.keyboard.press('Escape');
    assert.ok(await launcher.evaluate(el => el === document.activeElement));
    assert.deepEqual(await page.locator('#trayFilm img').evaluateAll(imgs => imgs.map(img => img.src)),selected.slice(-3));
    assert.equal(await page.locator('#trayFabN').innerText(),'4');
    await activate(launcher);
    await panel.waitFor();
    assert.deepEqual(await page.locator('#trayItems img').evaluateAll(imgs => imgs.map(img => img.src)),selected,
      'reopening the panel lost selected references or their chosen angle');
    assert.equal(await page.locator('#tgPrompt').inputValue(),'Keep this edited studio draft.');
    assert.deepEqual(errors,[]);
    console.log('PASS '+width+'px @'+deviceScaleFactor+'x '+(mobile?'touch':'desktop')+' launcher, panel, browsing, angles, lightbox and keyboard');
  } finally { await context.close(); }
}

async function checkPosePair(browser) {
  const context = await browser.newContext({permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce',serviceWorkers:'block'});
  try {
    const page = await context.newPage();
    await page.goto((process.env.U || 'http://127.0.0.1:8787')+'/#pose',{waitUntil:'domcontentloaded'});
    await page.fill('#q','full_single_P052');
    const card = page.locator('#grid .card[data-k="p:full_single_P052"]');
    await card.locator('[data-a=ang]').filter({hasText:'侧面'}).click();
    await card.hover();
    await card.locator('[data-a=sel]').click();
    const other = await page.evaluate(async()=>{
      const keys=[];
      for(const type of ['costume','portrait']){
        const items=await APP.load(type), item=items.find(APP.ok);
        APP.toggleSel(item.k); keys.push(item.k);
      }
      return keys;
    });
    await page.click('#trayFab');
    const p='p:full_single_P052', d='d:full_single_P052';
    const addDepth=page.locator('#trayItems [data-pair="'+p+'"]');
    await addDepth.locator('..').hover();
    await addDepth.click();
    const keys=()=>page.locator('#trayItems [data-k]').evaluateAll(buttons=>buttons.map(b=>b.dataset.k));
    assert.deepEqual(await keys(),[p,d,...other]);
    assert.equal(await page.locator('#trayItems img[data-type=depth]').evaluate(i=>i.src.split('/').pop()),'full_single_P052_side.jpg');
    await page.click('#trayComboBox summary');
    await page.click('#trayCopyZh');
    const brief=await page.evaluate(()=>navigator.clipboard.readText());
    assert.ok(brief.includes('full_single_P052_side.webp')&&brief.includes('full_single_P052_side.png'));
    await page.click('#trayMin');
    assert.deepEqual(await page.locator('#trayFilm img').evaluateAll(imgs=>imgs.map(i=>i.dataset.type)),['pose','depth','portrait']);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.click('#trayFab');
    await page.waitForFunction(()=>document.querySelectorAll('#trayItems [data-k]').length===4);
    assert.deepEqual(await keys(),[p,d,...other]);
    await page.locator('#trayItems [data-k="'+p+'"]').locator('..').hover();
    await page.locator('#trayItems [data-k="'+p+'"]').click();
    const addPose=page.locator('#trayItems [data-pair="'+d+'"]');
    await addPose.locator('..').hover(); await addPose.click();
    const restored = await keys();
    assert.equal(restored.indexOf(d),restored.indexOf(p)+1);
    assert.equal(await page.locator('#trayItems img[data-type=pose]').evaluate(i=>i.src.split('/').pop()),'full_single_P052_side.webp');
    console.log('PASS matching pose/depth references stay adjacent in the tray, filmstrip and clipboard, across reload and both add directions');
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH});
  try {
    await checkPosePair(browser);
    for (const [width,height,scale] of [[1280,844,1],[1024,675,1.25],[390,844,3],[320,568,2]])
      await check(browser,width,height,scale);
  }
  finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
