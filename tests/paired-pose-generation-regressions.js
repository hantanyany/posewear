// Check the prompt, number of jobs and actual multipart uploads together.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

(async () => {
  const base = new URL(process.env.U || 'http://localhost:8787');
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH});
  try {
    const page = await browser.newPage({serviceWorkers:'block',reducedMotion:'reduce'});
    const errors = [], requests = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.wbMode = JSON.stringify('gen');
      localStorage.wbCfg = JSON.stringify({prov:'openai',key:'fixture-only',proxy:false});
      localStorage.wbNeutral = 'false';
    });
    const fixture = fs.readFileSync(path.join(__dirname,'fixtures/mk1.png'));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() === 'POST') {
        assert.equal(url.origin,'https://api.openai.com');
        const form = await new Response(req.postDataBuffer(),{headers:{'content-type':req.headers()['content-type']}}).formData();
        requests.push({prompt:form.get('prompt'),images:form.getAll('image[]').length});
        return route.fulfill({json:{data:[{b64_json:fixture.toString('base64')}]}});
      }
      if (/\.(?:png|jpg|webp)$/.test(url.pathname)) {
        return route.fulfill({body:fixture,contentType:'image/png',headers:{'access-control-allow-origin':'*'}});
      }
      if (url.origin === base.origin) return route.continue();
      return route.abort();
    });
    await page.goto(base.href+'#studio');
    const [paired, distinct] = await page.evaluate(async () => {
      await WB.show();
      await Promise.all(['pose','depth','costume'].map(APP.load));
      const sketch=APP.DATA.pose.find(it=>!it.a && it.id==='full_single_P001');
      const depth=APP.DATA.depth.find(it=>it.id===sketch.id);
      const side=sketch.angles.findIndex(a=>a.zh==='侧面');
      const dSide=depth.angles.findIndex(a=>a.zh==='侧面');
      const front=sketch.angles.findIndex(a=>a.zh==='正面');
      const pair=[{k:depth.k,ai:dSide},{k:sketch.k,ai:side}];
      return [pair,[pair[0],{k:sketch.k,ai:front},pair[1]]];
    });

    async function select(poses) {
      await page.evaluate(poses => WB.setSel({garment:[APP.DATA.costume[0]],pose:poses}),poses);
    }
    await select(paired);
    assert.equal(await page.locator('#wbBatch').isHidden(),true);
    assert.equal(await page.locator('#wbEst').innerText(),'将生成 1 张');
    const getPrompt=(p,lang)=>page.evaluate(([refs,lang])=>WB.selectionPrompt({pose:refs},lang),[p,lang]);
    const zh=await getPrompt(paired,'zh'), en=await getPrompt(paired,'en');
    assert.match(zh,/第 1 张（深度图）＋第 2 张（姿势线稿）对应同一动作和机位/);
    assert.match(en,/image 1 \(depth map\) \+ image 2 \(pose sketch\) together show the same pose/);
    assert.match(en,/depth map for near\/far relationships and occlusion/);
    assert.doesNotMatch(en,/panels/);
    assert.doesNotMatch(await getPrompt([paired[0]],'en'),/pose sketch|panels/);
    assert.doesNotMatch(await getPrompt([paired[1]],'zh'),/深度图|画 \d+ 格/);

    // Interleave another view between the two matching references.
    await select(distinct);
    assert.equal(await page.locator('#wbBatch').isVisible(),true);
    assert.equal(await page.locator('#wbEst').innerText(),'将生成 2 张');
    const sheet=await getPrompt(distinct,'en');
    assert.match(sheet,/draw 2 panels/);
    assert.match(sheet,/image 1 \(depth map\) \+ image 3 \(pose sketch\) together show the same pose/);

    await page.click('#wbGo');
    await page.waitForFunction(()=> !WB.busy() && WB._W.results.length===2);
    assert.deepEqual(requests.map(x=>x.images).sort(),[2,3]);
    const pairJob=requests.find(x=>x.images===3);
    assert.match(pairJob.prompt,/image 2 \(depth map\) \+ image 3 \(pose sketch\) together show the same pose/);
    assert.doesNotMatch(pairJob.prompt,/panels/);
    assert.deepEqual(await page.evaluate(()=>WB._W.results.find(r=>r.inputs.poses.length===2).inputs.poses),paired);
    const quick = await page.evaluate(async refs=>{
      const result=await WB.quick({selection:{pose:refs},lang:'en',n:1});
      return result.got.map(item=>({pose:item.inputs.poses,label:item.label}));
    },distinct);
    assert.deepEqual(quick.map(record=>record.pose),[distinct]);
    assert.match(quick[0].label,/侧面.*正面/);
    assert.equal(requests[2].images,3);
    assert.match(requests[2].prompt,/draw 2 panels/);

    const independent=await page.evaluate(refs=>{
      const depth=APP.ITEMS[refs[0].k];
      const key='d:independent-test';
      APP.ITEMS[key]={...depth,k:key,pack:'another-pack'};
      const prompt=WB.selectionPrompt({pose:[{k:key,ai:refs[0].ai},refs[1]]},'en');
      delete APP.ITEMS[key];
      return prompt;
    },paired);
    assert.match(independent,/draw 2 panels/);
    assert.doesNotMatch(independent,/together show the same pose/);
    const visibility=await page.evaluate(refs=>{
      // A previously saved selection may omit its angle index.
      const [depth,sketch]=refs.map(ref=>APP.ITEMS[ref.k]);
      const id='pair-visibility-test';
      const d={...depth,k:'d:'+id,id,ai:refs[0].ai};
      const p={...sketch,k:'p:'+id,id,ai:refs[1].ai,a:1};
      const previous=APP.st.adult;
      Object.assign(APP.ITEMS,{[d.k]:d,[p.k]:p});
      const stored={pose:[{k:p.k},{k:d.k}]};
      APP.st.adult=false;
      const plain=WB.selectionPrompt({pose:[{k:d.k}]},'en');
      const hiddenMate=APP.poseCounterpart(d,d.ai);
      APP.st.adult=true;
      const optedIn=WB.selectionPrompt(stored,'en');
      APP.st.adult=previous;
      delete APP.ITEMS[d.k]; delete APP.ITEMS[p.k];
      return {plain,hiddenMate,optedIn};
    },paired);
    assert.equal(visibility.hiddenMate,null);
    assert.doesNotMatch(visibility.plain,/pose sketch|panels/);
    assert.match(visibility.optedIn,/image 1 \(pose sketch\) \+ image 2 \(depth map\) together show the same pose/);
    assert.deepEqual(errors,[]);
    console.log('PASS paired sketch/depth roles, angle identity, image order and job counts');
  } finally { await browser.close(); }
})().catch(err=>{console.error(err);process.exitCode=1});
