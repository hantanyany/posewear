// v17: 生成记录页（PR #8）冒烟：种 3 条记录 → 列表/全选/灯箱对比/删除/计数
const { chromium } = require('playwright');
const path = require('path'), FX = path.join(__dirname, 'fixtures') + '/';
const fs = require('fs');
(async () => {
  const U = process.env.U || 'http://localhost:8787';
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const R = [], errs = [];
  const ok = (n, c, d) => R.push([n, !!c, d || '']);
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(U + '/');
  await p.waitForFunction(() => window.APP, null, { timeout: 15000 });
  // 种记录：2 条试穿（带 before）+ 1 条生图
  const fixtures = Object.fromEntries(['person.png','mk1.png','mk2.png'].map(name => [name,fs.readFileSync(FX+name).toString('base64')]));
  await p.evaluate(async images => {
    const blob = n => new Blob([Uint8Array.from(atob(images[n]), c => c.charCodeAt(0))],{type:'image/png'});
    const b1 = await blob('person.png'), b2 = await blob('mk1.png'), b3 = await blob('mk2.png');
    const db = await new Promise((res, rej) => { const q = indexedDB.open('lk-studio', 1); q.onupgradeneeded = () => q.result.createObjectStore('h', { keyPath: 't' }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    const put = r => new Promise((res, rej) => { const t = db.transaction('h', 'readwrite'); t.objectStore('h').put(r); t.oncomplete = res; t.onerror = () => rej(t.error); });
    const now = Date.now();
    await put({ t: now - 3000, prov: 'openai', model: 'gpt-image-1', prompt: '测试提示词A', mode: 'tryon', label: '记录A', before: b1, after: b2 });
    await put({ t: now - 2000, prov: 'gemini', model: 'gemini-2.5-flash-image', prompt: '测试提示词B', mode: 'tryon', label: '记录B', before: b1, after: b3 });
    await put({ t: now - 1000, prov: 'seedream', model: 'doubao-seedream-5-5-261028', prompt: '测试提示词C', mode: 'gen', label: '记录C', before: null, after: b2 });
    db.close();
  }, fixtures);
  await p.goto(U + '/#history');
  await p.waitForFunction(() => document.querySelectorAll('#histGrid .hist-card').length === 3);
  const n = await p.locator('#histGrid .hist-card').count();
  ok('记录页渲染 3 条', n === 3, 'cards=' + n);
  ok('导航计数 3', await p.evaluate(() => document.querySelector('#nHist').textContent == '3'), await p.evaluate(() => document.querySelector('#nHist').textContent));
  ok('统计行含试穿/生图', await p.evaluate(() => /试穿/.test(document.querySelector('#histStats').textContent) && /生图/.test(document.querySelector('#histStats').textContent)), '');
  // 全选
  await p.check('#histSelAll');
  await p.waitForTimeout(200);
  ok('全选 3 条', await p.evaluate(() => document.querySelector('#histSelN b').textContent == '3' && !document.querySelector('#histZip').disabled && !document.querySelector('#histExp').disabled), '');
  await p.uncheck('#histSelAll');
  // 灯箱：打开第一条（最新=记录C 生图，无对比滑杆）
  await p.click('#histGrid .hist-card .hph');
  await p.waitForTimeout(500);
  ok('灯箱打开', await p.evaluate(() => !document.querySelector('#lb').hidden && /生成记录/.test(document.querySelector('#lbSide').textContent)), '');
  ok('生图记录无对比滑杆', await p.evaluate(() => !document.querySelector('#lbSide .hlb-cmp')), '');
  // 右箭头切到下一条记录B（试穿，有对比滑杆）
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(400);
  ok('方向键切换记录', await p.evaluate(() => /第 2 \/ 3 项/.test(document.querySelector('#lbSide').textContent)), await p.evaluate(() => document.querySelector('#lbSide .mu').textContent));
  ok('试穿记录有对比滑杆', await p.evaluate(() => !!document.querySelector('#lbSide .hlb-cmp input[type=range]')), '');
  await p.keyboard.press('Escape');
  await p.locator('#lb').waitFor({state:'hidden'});
  ok('Esc 关闭灯箱', await p.evaluate(() => document.querySelector('#lb').hidden), '');
  // 删除一条
  await p.click('#histGrid .hist-card [data-act="del"]');
  await p.waitForTimeout(600);
  ok('删除后剩 2 条', await p.evaluate(() => document.querySelectorAll('#histGrid .hist-card').length === 2), '');
  // 切回姿势库页面状态干净
  await p.evaluate(() => window.APP.setTab('pose'));
  await p.waitForTimeout(400);
  ok('切回图库 histSec 隐藏', await p.evaluate(() => document.querySelector('#histSec').hidden && !document.body.classList.contains('histview')), '');
  ok('无页面错误', errs.length === 0, errs.join(' | ').slice(0, 200));
  await b.close();
  process.exitCode = R.some(row => !row[1]) ? 1 : 0;
  R.forEach(r => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0] + (r[2] ? ' — ' + r[2] : '')));
})();
