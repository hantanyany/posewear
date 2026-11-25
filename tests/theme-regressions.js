// First paint, live OS changes, explicit choices, and keyboard/touch interaction.
const assert = require('node:assert/strict');
const {origin, serveSite} = require('./fixtures/site');
const {chromium} = require('playwright');

async function expectTheme(page, palette) {
  await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, palette);
  const colors = await page.evaluate(() => [
    getComputedStyle(document.documentElement).colorScheme,
    document.querySelector('meta[name="theme-color"]').content
  ]);
  assert.deepEqual(colors, [palette, palette === 'dark' ? '#111111' : '#ffffff']);
}

async function run() {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH});
  try {
    const desktop = await browser.newContext({colorScheme:'dark',serviceWorkers:'block'});
    await desktop.route('**/*',serveSite());
    const first = await desktop.newPage();
    // Pause the deferred gallery boot to check appearance as soon as HTML is parsed.
    let allowApp;
    const gate = new Promise(resolve => { allowApp = resolve; });
    await first.route('**/app.js',async route => { await gate; await route.fallback(); });
    const navigation = first.goto(origin);
    await first.locator('#theme').waitFor();
    await expectTheme(first,'dark');
    assert.equal(await first.evaluate(() => window.APP), undefined);
    allowApp();
    await navigation;
    assert.equal(await first.locator('[data-theme-choice=system]').getAttribute('aria-pressed'),'true');
    await first.emulateMedia({colorScheme:'light'});
    await expectTheme(first,'light');

    const second = await desktop.newPage();
    await second.goto(origin+'/#studio');
    await first.locator('#theme').focus();
    await first.keyboard.press('ArrowDown');
    await first.keyboard.press('End');
    await first.keyboard.press('Enter');
    assert.equal(await first.locator('#themeMenu').getAttribute('open'),null);
    assert.equal(await first.locator('#theme').evaluate(el => el === document.activeElement),true);
    await expectTheme(first,'dark');
    await expectTheme(second,'dark');
    await first.reload();
    await expectTheme(first,'dark');
    await second.emulateMedia({colorScheme:'light'});
    await expectTheme(second,'dark');
    await second.keyboard.press('t');
    await expectTheme(first,'light');
    await first.locator('#theme').click();
    await first.locator('[data-theme-choice=system]').click();
    await second.emulateMedia({colorScheme:'dark'});
    await expectTheme(first,'light');
    await expectTheme(second,'dark');
    await desktop.close();

    const mobile = await browser.newContext({isMobile:true,hasTouch:true,viewport:{width:320,height:568},
      reducedMotion:'reduce',colorScheme:'dark',serviceWorkers:'block'});
    await mobile.route('**/*',serveSite());
    await mobile.addInitScript(() => { localStorage.theme='light'; localStorage.pwUiLocale='ja'; });
    const phone = await mobile.newPage();
    await phone.goto(origin);
    await expectTheme(phone,'light');
    await phone.getByLabel('外観',{exact:true}).filter({hasNot:phone.locator('button')}).tap();
    const dark = phone.getByRole('button',{name:'ダーク',exact:true});
    const rect = await dark.boundingBox();
    assert.ok(rect && rect.height >= 44 && rect.x >= 0 && rect.x + rect.width <= 320);
    assert.equal(await phone.locator('.theme-pop').evaluate(el=>getComputedStyle(el).animationName),'none');
    await dark.tap();
    await expectTheme(phone,'dark');
    await phone.locator('#theme').tap();
    await phone.keyboard.press('Escape');
    assert.equal(await phone.locator('#themeMenu').getAttribute('open'),null);
    await mobile.close();
    console.log('Theme: initial paint, system/explicit preferences, persistence, tab sync, keyboard, phone and reduced motion passed.');
  } finally {
    await browser.close();
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
