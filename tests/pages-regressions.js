const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.U || 'http://localhost:8787';

async function run() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const checks = [];
  const failures = [];
  async function check(name, hash, verify, viewport = { width: 1366, height: 900 }) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    page.setDefaultTimeout(8000);
    try {
      await page.goto(base + '/' + hash);
      await page.waitForFunction(() => window.APP && window.WB);
      await verify(page);
      checks.push(name);
    } catch (error) {
      failures.push([name, error.message]);
    } finally {
      await page.close();
    }
  }

  try {
    await Promise.all([
      check('人像进试穿人物槽', '#studio', async page => {
        if (!process.env.POSEWEAR_REAL_PORTRAIT) await page.route('https://ai-portrait-gallery.pages.dev/img/full/**', route =>
          route.fulfill({
            path: require('path').join(__dirname, 'fixtures/person.png'),
            headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' },
          })
        );
        await page.getByRole('button', { name: '从人像库选' }).click();
        await page.locator('#pkG button[data-k]').first().click();
        await page.waitForFunction(() => /人像加载失败|已设为人物照片/.test(document.querySelector('#toast').textContent));
        assert.equal(await page.evaluate(() => WB._W.persons.length), 1);
      }),
      check('场景保留组合入口和正确类型', '#scene/E001', async page => {
        const drawer = page.locator('#lbSide .acts');
        assert.equal(await page.locator('#grid .card [data-a=try]').count(), 0);
        await drawer.locator('[data-x=sel]').click();
        assert.equal(await drawer.locator('[data-x=try]').count(), 0);
        assert.equal(await page.evaluate(() => WB._W.garments.length), 0);
      }),
      check('已选姿势更换角度后同步到生图', '#pose/P001', async page => {
        await page.locator('#lbSide .acts [data-x=sel]').click();
        await page.waitForFunction(() => WB._W.poses.length === 1);
        await page.locator('#lbSide [data-ai]').nth(1).click();
        await page.waitForFunction(() => WB._W.poses[0].ai === 1);
        assert.equal(await page.evaluate(() => APP.st.list[APP.li()].ai), 1);
      }),
      check('服装切换并使用侧面参考', '#costume/C061', async page => {
        const side = page.locator('#lbSide [data-ai]').filter({ hasText: '侧面' });
        await side.click();
        await page.waitForFunction(() => document.querySelector('#lbImg').src.endsWith('_side.webp'));
        await page.locator('#lbSide .acts [data-x=try]').click();
        await page.waitForFunction(() => APP.st.tab === 'studio' && WB._W.garments.length === 1);
        const selected = await page.evaluate(() => {
          const garment = WB._W.garments[0];
          return APP.ITEMS[garment.k].angles[garment.ai].zh;
        });
        assert.equal(selected, '侧面');
      }),
      check('悬浮工作台空状态可直接选材', '#pose', async page => {
        await page.getByRole('button', { name: '打开生图工作台' }).click();
        await page.locator('#tgAddRow [data-add=anime]').click();
        await page.locator('#pkG button[data-k]').first().click();
        await page.locator('#pkDone').click();
        await page.waitForFunction(() => WB._W.garments.length === 1);
        assert.ok(await page.getByText('动画服装', { exact: true }).count());
      }, { width: 390, height: 844 }),
      check('旧收藏迁移并统计未匹配条目', '#fav', async page => {
        await page.locator('#impF').setInputFiles({
          name: 'legacy.json', mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify({ 收藏: [
            { key: 'p:full_single_P001' }, { key: 'a:SPR-0001' },
          ] })),
        });
        await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('已导入'));
        assert.deepEqual(await page.evaluate(() => [...APP.st.fav]), ['p:P001']);
        assert.match(await page.locator('#toast').textContent(), /1 条收藏.*1 条未匹配/);
      }),
      check('旧深度姿势链接可用', '#depth/full_single_P001', async page => {
        await page.locator('#lbSide h2').waitFor();
        assert.equal(new URL(page.url()).hash, '#depth/P001');
      }),
      check('旧姿势详情转到对应详情', '#pose', async page => {
        const response = await page.goto(base + '/pose/full_single_P001/');
        assert.equal(response.status(), 200);
        assert.equal(new URL(page.url()).pathname, '/pose/P001/');
      }),
      check('旧成人姿势链接保留年龄闸', '#pose', async page => {
        await page.goto(base + '/pose/full_sexy_P001/');
        await page.locator('#ageBox').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#lb').isVisible(), false);
      }),
    ]);
  } finally {
    await browser.close();
  }
  for (const name of checks) console.log('PASS', name);
  for (const [name, error] of failures) console.error('FAIL', name, error);
  assert.equal(failures.length, 0);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
