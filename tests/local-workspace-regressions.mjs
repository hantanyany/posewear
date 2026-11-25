import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { catalogNames } from '../scripts/catalog-source.mjs';

const input = fileURLToPath(new URL('./fixtures/person.png', import.meta.url));
const output = await readFile(new URL('./fixtures/mk1.png', import.meta.url));
const workflow = fileURLToPath(new URL('../docs/comfyui/img2img-api.json', import.meta.url));
const previewScript = fileURLToPath(new URL('../scripts/preview.mjs', import.meta.url));

const checkpoints = ['fashion/base.safetensors','wardrobe-v2.safetensors'];

async function check(browser, profile) {
  const standard = profile === 'default';
  const comfy = profile !== 'sd-cpp';
  const name = comfy ? 'ComfyUI' : 'sd.cpp';
  const prompt = 'A blue linen outfit, photographed in soft light.';
  const requests = [];
  let reachable = true;
  let receivedPrompt, uploadedImage, receivedCheckpoint, outputNode;
  const upstream = http.createServer(async (req,res) => {
    const json = value => res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(value));
    const url = new URL(req.url, 'http://'+req.headers.host);
    const imageURL = url.origin + '/sample.png';
    const route = url.pathname;
    if (route === '/') return res.end('<script src="/app.js"></script>');
    if (route === '/app.js') return res.end(JSON.stringify(catalogNames.map(n => n+'.json')));
    if (route.endsWith('.json')) {
      const item = {id:'fixture', cat:'春季', ti:'蓝色外套', zh:'蓝色外套', en:'blue coat',
        line:'单人', lineEn:'solo', t:imageURL, m:imageURL, i:imageURL, o:imageURL};
      item.angles = route === '/poses.json' ? [{...item, zh:'正面', en:'front'}] : undefined;
      return json([item]);
    }
    if (route === '/sample.png') return res.writeHead(200,{'content-type':'image/png','access-control-allow-origin':'*'}).end(output);

    requests.push(route);
    if (!reachable) return res.writeHead(503).end('fixture engine is offline');
    if (route === '/object_info/CheckpointLoaderSimple') return json({
      CheckpointLoaderSimple:{input:{required:{ckpt_name:[checkpoints,{}]}}}
    });
    if (route === '/system_stats') return json({system:{os:'fixture'}});
    if (route === '/v1/models') return json({data:[{id:'fixture'}]});
    if (route === '/upload/image' || route === '/v1/images/edits') {
      const form = await new Response(Readable.toWeb(req),{headers:req.headers}).formData();
      const image = form.get(route === '/upload/image' ? 'image' : 'image[]');
      uploadedImage = image && {type:image.type, bytes:Buffer.from(await image.arrayBuffer())};
      if (route === '/upload/image') return json({name:'fixture.jpg'});
      receivedPrompt = form.get('prompt');
      return json({data:[{b64_json:output.toString('base64')}]});
    }
    if (route === '/prompt') {
      const {prompt:graph} = await new Response(Readable.toWeb(req)).json();
      const nodes = Object.entries(graph);
      receivedPrompt = nodes.find(([,node])=>node._meta?.title==='PoseWear Prompt')?.[1].inputs.text;
      receivedCheckpoint = nodes.find(([,node])=>node.class_type==='CheckpointLoaderSimple')?.[1].inputs.ckpt_name;
      outputNode = nodes.find(([,node])=>node._meta?.title==='PoseWear Output')?.[0];
      return json({prompt_id:'demo-job'});
    }
    if (route === '/history/demo-job') return json({'demo-job':{outputs:{[outputNode]:{images:[{filename:'result.png',type:'output'}]}}}});
    if (route === '/view') return res.writeHead(200,{'content-type':'image/png'}).end(output);
    res.writeHead(404).end();
  });
  upstream.listen(0,'127.0.0.1');
  await once(upstream,'listening');
  const origin = 'http://127.0.0.1:'+upstream.address().port;
  const env = {...process.env, PORT:'0', POSEWEAR_CATALOG_URL:origin, POSEWEAR_LOCAL_URL:origin};
  delete env.POSEWEAR_LOCAL_ENGINE;
  delete env.POSEWEAR_COMFY_WORKFLOW;
  if (!standard) env.POSEWEAR_LOCAL_ENGINE = comfy ? 'comfyui' : 'sd-cpp';
  if (profile === 'workflow') env.POSEWEAR_COMFY_WORKFLOW = workflow;
  const preview = spawn(process.execPath,[previewScript],{stdio:['ignore','pipe','inherit'],env});
  const context = await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce',locale:'zh-CN'});
  try {
    const lines = createInterface({input:preview.stdout});
    const {value} = await lines[Symbol.asyncIterator]().next();
    const url = value?.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
    assert.ok(url, 'local preview started');
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**', route => route.abort());
    await page.goto(url+'#studio');
    await page.locator('#wbCfg').click();
    const save = page.locator('#cfSave');
    const checkpoint = page.locator('#cfCheckpoint');
    const testConnection = page.locator('#cfTest');
    const status = page.locator('#cfMsg');
    if (standard) {
      assert.equal(await page.locator('[name=prov]:checked').inputValue(),'openai');
      assert.ok(await page.locator('#cfKey').isVisible());
      await page.locator('[name=prov][value=local]').check();
      assert.ok(await checkpoint.isVisible());
      assert.equal(await checkpoint.inputValue(),'');
      if (await save.isEnabled()) await save.click();
      assert.ok(await page.locator('#cfg').isVisible());
      assert.equal(await page.evaluate(()=>WB._cfg.prov),'openai');

      // An older local preset can lack a checkpoint. It still needs a model before generating.
      await page.evaluate(()=>localStorage.setItem('wbCfg',JSON.stringify({prov:'local',model:'',key:''})));
      await page.reload();
      await page.locator('#trayFab').click();
      await page.locator('#tgPrompt').fill('Missing checkpoint');
      await page.locator('#tgGo').click();
      await checkpoint.waitFor();
      assert.equal(await page.evaluate(()=>WB.configured()),false);
      assert.equal(requests.filter(r=>r==='/prompt'||r==='/upload/image').length,0);
      reachable = false;
      const [failure] = await Promise.all([
        page.waitForResponse(r=>r.url().endsWith('/api/local/status')),
        testConnection.click()
      ]);
      assert.ok(!failure.ok());
      await page.locator('#cfMsg.bad').waitFor();
      assert.doesNotMatch(await status.innerText(),/已连接/);
      assert.equal(await checkpoint.inputValue(),'');
      reachable = true;
    } else {
      assert.equal(await page.locator('[name=prov]:checked').inputValue(),'local');
      assert.ok(await checkpoint.isHidden());
    }
    assert.ok(await page.locator('#cfKey').isHidden());
    const [connection] = await Promise.all([
      page.waitForResponse(r=>r.url().endsWith('/api/local/status')),
      testConnection.click()
    ]);
    assert.ok(connection.ok());
    await status.filter({hasText:'已连接'}).waitFor();
    if (standard) {
      assert.deepEqual((await connection.json()).checkpoints,checkpoints);
      await checkpoint.locator('option').filter({hasText:checkpoints[1]}).waitFor({state:'attached'});
      assert.deepEqual(await checkpoint.locator('option').evaluateAll(options=>options.map(o=>o.value).filter(Boolean)), checkpoints);
      assert.equal(await checkpoint.inputValue(),'');
      if (await save.isEnabled()) await save.click();
      assert.ok(await page.locator('#cfg').isVisible());
      await checkpoint.selectOption(checkpoints[1]);
    }
    await save.click();
    if (standard) {
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('wbCfg')).checkpoint),checkpoints[1]);
      await page.locator('#trayMin').click();
    }
    let expectedReference;
    if (comfy) {
      await page.locator('[data-mode=gen]').click();
      await page.locator('#wbGFile').setInputFiles(input);
      await page.locator('#wbG .pick').waitFor();
      expectedReference = await page.evaluate(async()=>{
        const bytes = await crypto.subtle.digest('SHA-256',await WB._W.garments[0].blob.arrayBuffer());
        return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
      });
      await page.locator('details.adv summary').click();
      await page.locator('#wbNeutral').uncheck();
      await page.locator('#wbPrompt').fill(prompt);
      await page.locator('#wbGo').click();
      await page.locator('#wbAfter[src^=blob]').waitFor();
      await page.locator('#personalMenu summary').click();
      await page.locator('.tabs [data-tab=history]').click();
    } else {
      await page.locator('#trayFab').click();
      assert.equal(await page.locator('#tgProv').textContent(),name);
      await page.locator('#tray [data-add=costume]').click();
      await page.locator('#pkG [data-k]').click();
      await page.locator('#pkDone').click();
      await page.locator('#tgPrompt').fill(prompt);
      await page.locator('#tgGo').click();
      await page.locator('#tgRes button').click();
      await page.locator('#tgViewImg[src^=blob]').waitFor();
      await page.locator('#tgHist').click();
    }
    const card = page.locator('#histGrid .hist-card');
    await card.waitFor();
    const recordedModel = standard ? checkpoints[1] : name;
    assert.ok((await card.innerText()).includes(recordedModel));
    await page.reload();
    await card.waitFor();
    const record = await page.evaluate(async () => {
      const [r] = await WB.db.hist();
      return {model:r.model, provider:r.prov, bytes:[...new Uint8Array(await r.after.arrayBuffer())]};
    });
    assert.equal(record.model,recordedModel);
    assert.equal(record.provider,'local');
    assert.deepEqual(Buffer.from(record.bytes),output);
    assert.ok(receivedPrompt?.includes(prompt));
    assert.equal(uploadedImage.type,'image/jpeg');
    if (comfy) {
      assert.equal(createHash('sha256').update(uploadedImage.bytes).digest('hex'),expectedReference);
      assert.equal(receivedPrompt,prompt);
      assert.equal(receivedCheckpoint, standard ? checkpoints[1] : 'YOUR_CHECKPOINT.safetensors');
    }
    assert.deepEqual(requests.filter(r=>!['/system_stats','/object_info/CheckpointLoaderSimple','/v1/models'].includes(r)),
      comfy ? ['/upload/image','/prompt','/history/demo-job','/view'] : ['/v1/images/edits']);
    assert.deepEqual(errors,[]);
    if (standard) console.log('PASS cloud default, local model required, failed connection, live checkpoint selection');
    console.log('PASS '+profile+' local preview, browser generation, displayed result and persisted history');
  } finally {
    await context.close();
    if (preview.exitCode === null && preview.signalCode === null) {
      const stopped = once(preview,'exit');
      preview.kill();
      await stopped;
    }
    upstream.closeAllConnections();
    await new Promise(resolve=>upstream.close(resolve));
  }
}

const browser = await chromium.launch({executablePath:process.env.CHROME_PATH});
try {
  for (const profile of ['default','workflow','sd-cpp']) await check(browser,profile);
} finally {
  await browser.close();
}
