// Selected library items keep their category in the picker, reference board and saved workspace.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.U || 'http://127.0.0.1:8787';

async function check(browser, width) {
  const mobile = width < 700;
  const ctx = await browser.newContext({
    viewport:{width,height:880},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce',serviceWorkers:'block'
  });
  try {
    await ctx.addInitScript(()=>{
      if (!sessionStorage.seeded) {
        localStorage.wbSel=JSON.stringify({g:['t:T001']});
        sessionStorage.seeded='1';
      }
    });
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/#studio');
    const board=page.locator('#wbBoardCards'),extras=page.locator('#wbOther'),picker=page.locator('#pk');
    await board.locator('[data-pk-key="t:T001"]').waitFor();
    assert.deepEqual(await page.locator('.primary-materials .sh b').allTextContents(),['人物','服装','姿势']);
    assert.equal(await extras.getAttribute('open'),null);
    assert.equal(await page.locator('#wbOtherCount').textContent(),'1');
    assert.equal(await page.locator('#wbG .pick').count(),0);
    assert.equal(await board.locator('[data-pk-key="t:T001"] span').textContent(),'道具');
    assert.equal(await page.locator('#wbGo').isEnabled(),true);
    assert.equal(await page.locator('#wbPrompt').isVisible(),true);
    await extras.locator('summary').click();
    const guitar=extras.locator('.pick[data-type="prop"]');
    assert.match(await guitar.textContent(),/木吉他.*道具.*T001/);
    const angle=guitar.locator('select');
    await angle.selectOption({index:1});
    const changedSrc=await board.locator('[data-pk-key="t:T001"] img').getAttribute('src');
    assert.equal(await guitar.locator('img').getAttribute('src'),changedSrc);
    await extras.locator('[data-pick=expr]').click();
    const kinds=picker.locator('#pkMaterialTypes [data-pk-material]');
    assert.deepEqual(await kinds.evaluateAll(els=>els.map(el=>el.dataset.pkMaterial)),
      ['expr','hair','scene','light','prop','furn']);
    await picker.locator('#pkG button').first().click();
    await picker.locator('[data-pk-material=prop]').click();
    await picker.locator('#pkG [data-k="t:T001"][aria-pressed=true]').waitFor();
    await picker.locator('#pkG [data-k="t:T002"]').click();
    await picker.locator('#pkDone').click();
    assert.equal(await page.locator('#wbOtherCount').textContent(),'3');
    assert.equal(await board.locator('[data-type=prop]').count(),2);
    assert.equal(await board.locator('[data-type=expr]').count(),1);
    await page.reload();
    await board.locator('[data-pk-key="t:T002"]').waitFor();
    assert.equal(await board.locator('[data-pk-key="t:T001"] img').getAttribute('src'),changedSrc);
    await extras.locator('summary').click();
    await extras.locator('.pick[data-type=expr] [data-rm]').click();
    const open=page.locator('#wbG .empty0');
    await open.click();
    assert.deepEqual(await kinds.evaluateAll(els=>els.map(el=>el.dataset.pkMaterial)),['costume','anime','dyn']);
    await picker.locator('[data-pk-material=dyn]').click();
    await picker.locator('#pkG button.dyn').first().click();
    await picker.locator('#pkDone').click();
    await page.locator('#wbG .pick[data-type=dyn]').waitFor();
    assert.equal(await board.locator('[data-type=dyn] span').textContent(),'历代服饰');
    // A mode change cannot erase a manually edited brief.
    const prompt=page.locator('#wbPrompt');
    await prompt.fill('Draw the guitar under soft lighting.');
    await page.locator('[data-mode=gen]').click();
    assert.equal(await prompt.inputValue(),'Draw the guitar under soft lighting.');
    assert.deepEqual(errors,[]);
    console.log('PASS '+width+'px studio material groups, migrated guitar, saved angle, picker tabs, board and draft');
  } finally {await ctx.close()}
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});
  try {for(const width of [1280,390])await check(browser,width)} finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
