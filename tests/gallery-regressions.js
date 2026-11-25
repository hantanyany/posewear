const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', 'src');
const sample = { id:'sample', ti:'示例', zh:'示例', en:'sample', no:'1', cat:'示例分类',
  line:'全身', lineEn:'full body', t:'icon-192.png', m:'icon-192.png', i:'icon-192.png', o:'icon-192.png' };
const angles = ['正面', '侧面'].map((zh, i) => ({ ...sample, zh, en:['front view','side view'][i] }));
const data = {
  'poses.json': [{ ...sample, angles }],
  'costumes.json': Array.from({length:80}, (_, i) => ({...sample, id:'dress'+i})),
  'props.json': [{ ...sample, ti:'木吉他', zh:'木吉他', en:'a wooden guitar', angles }],
  'expressions.json': [{ ...sample, ti:'开心', emo:'开心', angles }]
};

async function run() {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH});
  try {
    const ctx = await browser.newContext({reducedMotion:'reduce', serviceWorkers:'block', locale:'zh-CN'});
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let failDepth;
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'posewear.test') return route.abort();
      const file = url.pathname.slice(1) || 'index.html';
      if (file === 'depths.json') {
        failDepth = () => route.fulfill({status:503, body:''});
        return;
      }
      if (file.endsWith('.json')) return route.fulfill({json:data[file] || []});
      const source = path.join(root, file);
      if (fs.existsSync(source)) return route.fulfill({path:source});
      return route.fulfill({status:404, body:''});
    });
    await page.goto('http://posewear.test/#costume');
    const card = page.locator('#grid .card').first();
    await card.waitFor();
    const openImage = card.locator('.phk');
    await openImage.hover();
    assert.equal(await openImage.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    const library = page.locator('#libraryMenu summary');
    await library.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.tab),'pose');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.tab),'furn');
    await page.keyboard.press('Escape');
    assert.ok(await library.evaluate(el => el === document.activeElement && !el.parentElement.open));
    await page.locator('.skip').press('Enter');
    assert.equal(await page.evaluate(() => location.hash), '#costume');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'grid');

    await card.locator('.phk').press('Enter');
    await page.locator('#lbSide .acts [data-x=try]').press('Enter');
    await page.waitForFunction(() => APP.st.tab === 'studio' && WB._W.garments.length === 1);
    await page.locator('#libraryMenu summary').click();
    await page.locator('.tabs [data-tab=costume]').click();
    assert.ok(await page.locator('#trayFab').isVisible());

    await page.locator('#batchBtn').click();
    await page.locator('#bbar [data-b=all]').click();
    assert.equal(await page.locator('#bbN').textContent(), '已选 80');
    await page.locator('#bbar [data-b=x]').click();

    await page.locator('#libraryMenu summary').click();
    await Promise.all([page.waitForRequest('**/depths.json'),page.locator('.tabs [data-tab=depth]').click()]);
    await page.locator('#libraryMenu summary').click();
    await page.locator('.tabs [data-tab=expr]').click();
    await card.waitFor();
    assert.equal(typeof failDepth, 'function');
    await failDepth();
    await page.waitForFunction(() => document.querySelector('#grid .card')?.dataset.k === 'e:sample');
    await page.locator('#q').focus();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200); // The former input blur timer fired after 150 ms.
    assert.ok(await page.locator('#qsug').isVisible());
    assert.equal(await page.evaluate(() => document.activeElement.dataset.q), '开心');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => APP.st.tab), 'expr');
    await page.locator('#batchBtn').click();
    await card.locator('.phk').press('Enter');
    await page.locator('#bbar [data-b=stu]').click();
    await page.waitForFunction(() => APP.st.tab === 'studio' && WB._W.exprs.length === 1);
    assert.equal(await page.evaluate(() => WB._W.garments[0].k), 'c:dress0');

    await page.locator('#libraryMenu summary').click();
    await page.locator('.tabs [data-tab=prop]').click();
    await card.locator('[data-a=try]').press('Enter');
    await page.locator('#trayComboBox summary').click();
    assert.match(await page.locator('#trayText').innerText(), /木吉他/);
    await page.locator('[data-tl=en]').click();
    assert.match(await page.locator('#trayText').innerText(), /wooden guitar/);
    assert.equal(await page.evaluate(() => WB._W.garments[0].k), 'c:dress0');
    await page.getByRole('button', {name:'移除 木吉他'}).press('Enter');
    assert.equal(await page.locator('#trayItems button').count(), 0);
    await page.locator('#trayMin').click();
    await page.locator('#libraryMenu summary').click();
    await page.locator('.tabs [data-tab=pose]').click();
    await card.locator('[data-a=sel]').press('Enter');
    await card.locator('[data-a=ang][data-i="1"]').press('Enter');
    await page.locator('#trayFab').click();
    assert.match(await page.locator('#tgPrompt').inputValue(), /side profile|side view/);
    await page.locator('#tgPrompt').fill('手写描述');
    await page.locator('#trayMin').click();
    await card.locator('[data-a=ang][data-i="0"]').press('Enter');
    await page.locator('#trayFab').click();
    assert.equal(await page.locator('#tgPrompt').inputValue(), '手写描述');
    await page.locator('#trayMin').click();
    await page.locator('#noticeMenu summary').click();
    await page.locator('#help').click();
    await page.keyboard.press('r');
    assert.ok(await page.locator('#lb').isHidden());
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.parentNode.id), 'noticeMenu');

    await page.evaluate(async () => {
      const pic = await (await fetch('icon-192.png')).blob();
      for (const t of [1,2]) await WB.db.put({t, after:pic, mode:'gen', prompt:'历史样例 '+t, prov:'openai'});
    });
    await page.locator('#personalMenu summary').click();
    await page.locator('.tabs [data-tab=history]').click();
    const row = page.locator('.hist-card').first();
    await row.waitFor();
    await Promise.all([page.waitForEvent('download'),row.locator('[data-act=dl]').press('Enter')]);
    assert.ok(await page.locator('#lb').isHidden());
    await row.locator('.hopen').press('Enter');
    await page.locator('.lb-img').evaluate(el => {
      for (const [name, key, x] of [['touchstart','touches',200],['touchend','changedTouches',100]]) {
        const e = new Event(name);
        Object.defineProperty(e, key, {value:[{clientX:x,clientY:100}]});
        el.dispatchEvent(e);
      }
    });
    assert.match(await page.locator('#lbSide .mu').first().innerText(), /第 2 \/ 2 项/);
    assert.equal(await page.evaluate(() => location.hash), '#history');
    await page.keyboard.press('Escape');
    await page.locator('#adultSw').click();
    await page.locator('#ageY').click();
    assert.equal(await page.locator('#adultSw').getAttribute('aria-checked'), 'true');

    await page.evaluate(() => {
      localStorage.sel = JSON.stringify(['c:dress3']);
      localStorage.fav = JSON.stringify(['e:sample']);
    });
    await page.goto('about:blank');
    for (const hash of ['workbench/pose/sample','workbench/pose/sample','workbench']) {
      await page.goto('http://posewear.test/#'+hash);
      await page.locator('#tray').waitFor();
      await page.locator('#trayItems [data-k="c:dress3"]').waitFor();
      assert.ok(await page.locator('#trayItems [data-k="p:sample"]').isVisible());
      assert.deepEqual(await page.evaluate(() => APP.st.sel),['c:dress3','p:sample']);
      assert.deepEqual(await page.evaluate(() => [...APP.st.fav]),['e:sample']);
      await page.locator('#trayMin').click();
    }
    await page.goto('http://posewear.test/#costume');
    await card.waitFor();
    await page.locator('#q').fill('dress');
    await page.waitForFunction(()=>APP.st.q==='dress');
    await page.locator('#sort').selectOption('shuf');
    const deepCard=page.locator('#grid .card').nth(26);
    await deepCard.scrollIntoViewIfNeeded();
    await deepCard.hover();
    const order=await page.locator('#grid .card').evaluateAll(cards=>cards.slice(0,30).map(c=>c.dataset.k));
    const scroll=await page.evaluate(()=>scrollY);
    await deepCard.locator('[data-a=try]').click();
    await page.waitForURL('**/#studio');
    await page.goBack();
    await page.waitForFunction(()=>APP.st.tab==='costume'&&!document.querySelector('#grid').classList.contains('gbusy'));
    assert.equal(await page.locator('#q').inputValue(),'dress');
    assert.deepEqual(await page.locator('#grid .card').evaluateAll(cards=>cards.slice(0,30).map(c=>c.dataset.k)),order);
    assert.ok(Math.abs(await page.evaluate(()=>scrollY)-scroll)<50,'return to the same gallery row');
    await page.locator('#qx').click();
    await page.locator('#sort').selectOption('def');

    assert.deepEqual(errors, []);
    console.log('PASS gallery navigation, selection, keyboard and history regressions');
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
