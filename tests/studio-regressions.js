// The browser drives the same workbench used in production. Every provider request is intercepted.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
  const base = process.env.U || 'http://localhost:8787';
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'mk1.png'));
    const hits = [], errors = [], imageRequests = [];
    let failNext = false, rejectInput = false, heldImage;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (sessionStorage.studioTest) return;
      sessionStorage.studioTest = '1';
      localStorage.wbCfg = JSON.stringify({ prov: 'openai', key: 'fixture-only', proxy: false });
      localStorage.wbNeutral = 'false';
      localStorage.introX = '1';
    });
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === 'POST') {
        assert.equal(url.hostname, 'api.openai.com');
        const type=request.headers()['content-type'];
        const form=type.includes('multipart')?await new Response(request.postDataBuffer(),{headers:{'content-type':type}}).formData():null;
        const refs=form?form.getAll('image[]'):[];
        const prompt=form?form.get('prompt'):request.postDataJSON().prompt;
        assert.ok(refs.every(file=>file.size>0&&file.type==='image/jpeg'));
        hits.push({refs:refs.length,edited:prompt.includes('EDITED_MARKER'),prompt,path:url.pathname});
        if (rejectInput) {
          rejectInput=false;
          return route.fulfill({status:400,json:{error:{code:'moderation_blocked',message:'Blocked by the safety system'}}});
        }
        if (failNext) {
          failNext = false;
          return route.fulfill({ status: 429, json: { error: { message: 'mock limit' } } });
        }
        return route.fulfill({ json: { data: [{ b64_json: fixture.toString('base64') }] } });
      }
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: {
          'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST',
          'access-control-allow-headers': '*'
        } });
      }
      if (/\.webp$/.test(url.pathname)) {
        imageRequests.push(url.pathname);
        if (heldImage && url.pathname === heldImage.pathname) {
          heldImage.started();
          await heldImage.wait;
        }
        return route.fulfill({ body: fixture, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }).catch(() => {});
      }
      if (url.origin === new URL(base).origin) return route.continue();
      return route.abort();
    });
    await page.goto(base + '/#studio');
    await page.waitForFunction(() => window.WB && window.APP);
    await page.evaluate(async () => {
      await Promise.all(['costume', 'pose', 'prop', 'portrait'].map(t => APP.load(t)));
      await WB.show();
    });

    assert.equal(await page.locator('[data-mode=gen]').getAttribute('aria-pressed'),'true');
    await page.click('#wbCfg');
    await page.locator('[name=prov][value=gemini]').check();
    assert.equal(await page.inputValue('#cfKey'), '');
    await page.fill('#cfBase', 'http://example.test');
    await page.click('#cfSave');
    assert.match(await page.locator('#cfMsg').textContent(), /HTTPS/);
    await page.click('#cfgX');
    assert.equal(await page.evaluate(() => WB._cfg.prov), 'openai');

    await page.setInputFiles('#wbFile', path.join(__dirname, 'fixtures', 'person.png'));
    await page.waitForFunction(() => WB._W.persons.length === 1);
    const firstQuick = await page.evaluate(async () => {
      const groups = { pose: APP.DATA.pose.slice(0, 2) };
      WB.selectionPrompt(groups);
      const r = await WB.quick({ selection: groups, n: 1 });
      return [WB._W.persons.length, r.got.length, r.got[0]?.before === null];
    });
    assert.deepEqual(firstQuick, [1, 1, true]);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].refs, 2);

    const posePath = await page.evaluate(() => new URL(APP.DATA.pose[2].angles[0].i, location.href).pathname);
    let release, started;
    const reached = new Promise(resolve => { started = resolve; });
    heldImage = { pathname: posePath, started, wait: new Promise(resolve => { release = resolve; }) };
    const cancelled = page.evaluate(async () => {
      const r = await WB.quick({ selection: { pose: [APP.DATA.pose[2]] }, n: 1 });
      return r.cancelled && r.got.length === 0;
    });
    await Promise.race([reached, page.waitForTimeout(10000).then(() => { throw Error('Pose image request did not start'); })]);
    await page.evaluate(() => WB.stop());
    release();
    assert.equal(await cancelled, true);
    assert.equal(hits.length, 1);
    heldImage = null;

    await page.evaluate(async () => {
      await WB.setSel({ garment: APP.DATA.costume.slice(0, 2), pose: APP.DATA.pose.slice(0, 2) });
      const prompt = document.querySelector('#wbPrompt');
      prompt.value = 'Use EDITED_MARKER in every picture';
      prompt.dispatchEvent(new Event('input'));
    });
    assert.equal(await page.locator('[data-mode=tryon]').getAttribute('aria-pressed'),'true');
    failNext = true;
    await page.click('#wbGo');
    await page.waitForSelector('#wbRetry');
    assert.equal(hits.length, 3);
    assert.ok(hits.slice(1).every(x => x.edited && x.refs === 4));
    await page.click('#wbRetry');
    await page.waitForFunction(() => !WB.busy() && WB._W.results.length === 2);
    assert.equal(hits.length, 4);
    assert.ok(hits[3].edited);

    await page.reload();
    await page.waitForFunction(() => window.WB && WB._W.garments.length === 2);
    assert.equal(await page.locator('#wbPrompt').inputValue(),'Use EDITED_MARKER in every picture');
    const legacy = await page.evaluate(async () => {
      const fresh = (await WB.db.hist()).find(r => r.inputs.garments.length === 2);
      await WB.restoreRecord(fresh);
      const count = WB._W.garments.length;
      await WB.restoreRecord({ mode: 'gen', before: null, prompt: 'old prompt' });
      return { count, oldPersons: WB._W.persons.length, prompt: document.querySelector('#wbPrompt').value };
    });
    assert.deepEqual(legacy, { count: 2, oldPersons: 0, prompt: 'old prompt' });
    const unsaved = await page.evaluate(async () => {
      const before = (await WB.db.hist()).length;
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = () => { throw new DOMException('mock quota', 'QuotaExceededError'); };
      try {
        const r = await WB.quick({ selection: { garment: APP.DATA.costume.slice(0, 1) }, n: 1 });
        return [before === (await WB.db.hist()).length, r.got.length, r.unsaved, r.warns.length > 0];
      } finally { IDBObjectStore.prototype.put = original; }
    });
    assert.deepEqual(unsaved, [true, 1, 1, true]);

    // The default studio can start from a single prop with no implicit person or outfit.
    await page.evaluate(()=>{
      localStorage.removeItem('wbDraft'); // A legacy installation has selections, but no saved editor draft.
      localStorage.wbMode=JSON.stringify('tryon');
      localStorage.wbNeutral='true';
      localStorage.wbSel=JSON.stringify({g:['t:T001']});
    });
    await page.reload();
    await page.waitForFunction(()=>window.WB?._W.extraRefs[0]?.k==='t:T001');
    assert.deepEqual(await page.evaluate(()=>WB._W.garments),[]);
    assert.equal(await page.locator('[data-mode=tryon]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#wbGo').isEnabled(),true);
    await page.click('#wbGo');
    await page.waitForFunction(()=>!WB.busy()&&WB._W.results.length===1);
    const prop=hits.at(-1);
    assert.equal(prop.path,'/v1/images/edits');
    assert.equal(prop.refs,1);
    assert.match(prop.prompt,/Prop \(image 1\):.*acoustic guitar/i);
    assert.doesNotMatch(prop.prompt,/fashion|mannequin|east asian|try-on/i);
    const stored=await page.evaluate(()=>WB._W.results[0].inputs.extraRefs);
    assert.deepEqual(stored,[{k:'t:T001',ai:0}]);
    rejectInput=true;
    await page.click('#wbGo');
    await page.locator('#wbErr [data-ef=prompt]').click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'wbPrompt');
    assert.equal(await page.locator('#wbErr [data-ef=cos]').count(),0);
    const mixed=await page.evaluate(async()=>{
      const prop=APP.ITEMS['t:T001'],pose=APP.DATA.pose[0];
      const result=await WB.quick({selection:{pose:[pose],extra:[{k:prop.k,ai:1}]},n:1,lang:'en'});
      return {ref:prop.angles[1].i,view:prop.angles[1].en,record:result.got[0].inputs.extraRefs};
    });
    assert.ok(imageRequests.includes(new URL(mixed.ref,base).pathname));
    assert.equal(hits.at(-1).refs,2);
    assert.match(hits.at(-1).prompt,/Prop \(image 2\)/);
    assert.ok(hits.at(-1).prompt.includes(mixed.view));
    assert.deepEqual(mixed.record,[{k:'t:T001',ai:1}]);

    await page.evaluate(()=>WB.setSel({}));
    assert.equal(await page.inputValue('#wbPrompt'),'');
    assert.ok(await page.locator('#wbGo').isDisabled());
    const total=hits.length;
    const empty=await page.evaluate(async()=>{const r=await WB.quick({selection:{},prompt:' '});return r.errs.length});
    assert.equal(empty,1);
    assert.equal(hits.length,total);
    const note='A single ceramic vase, white background.';
    await page.locator('#wbPrompt').fill(note);
    await page.click('#wbGo');
    await page.waitForFunction(note=>!WB.busy()&&WB._W.results[0]?.prompt===note,note);
    assert.deepEqual(hits.at(-1),{refs:0,edited:false,prompt:note,path:'/v1/images/generations'});
    await page.evaluate(()=>WB.setSel({}));
    await page.locator('[data-mode=gen]').click();
    await page.locator('#wbChar summary').click();
    await page.locator('[data-char=custom]').click();
    await page.locator('#wbCharTxt').fill('A silver-haired cellist.');
    assert.equal(await page.inputValue('#wbPrompt'),'A silver-haired cellist.');
    assert.ok(await page.locator('#wbGo').isEnabled());
    assert.deepEqual(errors, []);
    console.log('PASS studio config, isolated tray, cancellation, edited prompts, partial retry, draft restore, history, optional materials, selected image views and text-only generation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
