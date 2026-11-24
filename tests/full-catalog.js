const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = process.env.U || 'http://localhost:8789';
const expected = {
  pose: ['#nPose', 98, 288],
  depth: ['#nDepth', 233, 288],
  costume: ['#nCos', 1068, 1407],
  anime: ['#nAni', 1380, 1760],
  portrait: ['#nPor', 1499, 1499],
  expr: ['#nExp', 95, 95],
  hair: ['#nHair', 122, 122],
  dyn: ['#nDyn', 57, 57],
  scene: ['#nSce', 64, 64],
  light: ['#nLig', 50, 50],
  prop: ['#nPro', 32, 32],
  furn: ['#nFur', 41, 41],
};

async function run() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('fav', JSON.stringify(['p:P001', 'd:P001']));
    });
    assert.equal((await page.goto(root + '/#pose')).status(), 200);
    await page.waitForFunction(() => !!window.APP && !!window.WB);
    const data = await page.evaluate(async keys => {
      await Promise.all(keys.map(key => APP.load(key)));
      return keys.map(key => APP.DATA[key].length);
    }, Object.keys(expected));
    assert.deepEqual(data, Object.values(expected).map(([, , total]) => total));
    for (const [, [selector, visible]] of Object.entries(expected)) {
      assert.equal(Number(await page.locator(selector).textContent()), visible, selector);
    }
    assert.equal(await page.evaluate(() => APP.DATA.pose.reduce((n, p) => n + p.angles.length, 0)), 1439);
    assert.equal(await page.evaluate(() => APP.DATA.depth.reduce((n, p) => n + p.angles.length, 0)), 1439);
    console.log('PASS all 12 default counts, 12 totals and both angle counts');

    await page.locator('#adultSw').click();
    await page.locator('#ageY').click();
    await page.waitForFunction(() => APP.st.adult);
    for (const [, [selector, , total]] of Object.entries(expected)) {
      assert.equal(Number(await page.locator(selector).textContent()), total, selector);
    }
    await page.locator('#adultSw').click();
    await page.waitForFunction(() => !APP.st.adult);
    console.log('PASS 18+ gate and total counters');

    const restored = ['pose', 'depth', 'costume', 'anime', 'hair'];
    const media = process.env.MEDIA_ORIGIN || new URL(root).origin;
    const imageUrls = await page.evaluate(tabs => tabs.flatMap(tab => APP.DATA[tab].flatMap(item =>
      [item, ...(item.angles || [])].flatMap(image => ['t', 'm', 'i', 'o'].map(field => image[field]).filter(Boolean))
    )), restored);
    const unique = [...new Set(imageUrls)];
    assert.equal(unique.length, 15429);
    for (const src of unique) {
      const url = new URL(src, root);
      assert.equal(url.origin, media, src);
      assert.ok(url.pathname.startsWith('/original/'), src);
    }
    console.log('PASS all 15,429 original image URLs use the configured host');

    for (const tab of restored) {
      await page.evaluate(tab => APP.setTab(tab), tab);
      const first = page.locator('#grid .card img').first();
      await first.scrollIntoViewIfNeeded();
      await page.waitForFunction(media => {
        const img = document.querySelector('#grid .card img');
        return img?.naturalWidth > 0 && new URL(img.src).origin === media;
      }, media);
    }
    console.log('PASS all five restored galleries display original assets');

    const reference = await page.evaluate(async () => {
      const outfit = APP.DATA.anime.find(item => item.id === 'charadb-O001');
      const [pose] = APP.DATA.pose;
      const responses = await Promise.all([outfit.i, pose.angles[0].o].map(url => fetch(url)));
      return responses.map(response => [response.status, response.headers.get('content-type')]);
    });
    assert.deepEqual(reference, [[200, 'image/jpeg'], [200, 'image/png']]);
    console.log('PASS archived CharaDB outfit and pose PNG readable in browser');

    await page.evaluate(() => APP.setTab('fav'));
    assert.equal(await page.locator('#grid .card').count(), 2);
    assert.deepEqual((await page.evaluate(() => [...APP.st.fav])).sort(), ['d:full_single_P001', 'p:full_single_P001']);
    console.log('PASS old fork pose favorites migrate');

    const response = await page.goto(root + '/pose/P001/');
    assert.equal(response.status(), 200);
    assert.equal(new URL(page.url()).pathname, '/pose/full_single_P001/');
    await page.waitForFunction(() => document.querySelector('.im img')?.naturalWidth > 0);
    console.log('PASS former detail URL redirects to real original image');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
