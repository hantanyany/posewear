// The API settings dialog must report the active endpoint's response, including failures.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const {origin, serveSite} = require('./fixtures/site');

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH});
  try {
    const page = await browser.newPage({serviceWorkers:'block', locale:'zh-CN', reducedMotion:'reduce'});
    await page.route('**/*',serveSite());
    const requests = [];
    let response, release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('https://relay.example/**', async route => {
      const req = route.request();
      const headers = {'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,OPTIONS'};
      if (req.method() === 'OPTIONS') return route.fulfill({status:204,headers});
      requests.push({path:new URL(req.url()).pathname, key:req.headers()['x-goog-api-key']});
      const current = response;
      if (req.url().endsWith('/older-model')) await held;
      await route.fulfill({...current, headers}).catch(() => {});
    });
    await page.goto(origin+'/#studio');
    await page.click('#wbCfg');
    await page.locator('[name=prov][value=custom]').check();
    await page.fill('#cfBase','https://relay.example/v1beta');
    await page.fill('#cfKey','fixture-only');
    await page.selectOption('#cfProto','gemini');
    await page.fill('#cfModel','older-model');

    response={json:{name:'models/older-model'}};
    await Promise.all([
      page.waitForRequest(req=>req.method()==='GET' && req.url().endsWith('/models/older-model')),
      page.click('#cfTest')
    ]);
    await page.fill('#cfModel','current-model');
    response={contentType:'text/html',body:'<!doctype html><title>Gallery</title>'};
    await page.click('#cfTest');
    const error=page.locator('#cfMsg.bad');
    await error.filter({hasText:'接口未返回模型信息'}).waitFor();
    release();

    response={json:{name:'models/current-model',displayName:'Current'}};
    await page.click('#cfTest');
    await page.locator('#cfMsg.good').filter({hasText:'Current'}).waitFor();
    assert.deepEqual(requests.map(r=>r.path),[
      '/v1beta/models/older-model','/v1beta/models/current-model','/v1beta/models/current-model'
    ]);
    assert.ok(requests.every(r=>r.key==='fixture-only'));

    response={json:{data:[]}};
    await page.selectOption('#cfProto','json');
    await page.fill('#cfBase','https://relay.example/v1');
    await page.click('#cfTest');
    await page.locator('#cfMsg.good').filter({hasText:'共 0 个模型'}).waitFor();
    response={json:{data:[{}]}};
    await page.click('#cfTest');
    await error.filter({hasText:'接口未返回模型信息'}).waitFor();
    console.log('PASS custom Gemini path and authentication, stale check cancellation, invalid and empty model lists');
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
