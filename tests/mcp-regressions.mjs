// Exercise the real stdio transport against a self-contained, fingerprinted gallery.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { collections } from '../scripts/catalog-source.mjs';

const media = 'https://cdn.example/';
const site = 'https://gallery.example/';
const files = new Map();
const sample = {id:'look-one', ti:'蓝外套', zh:'蓝色外套', en:'blue jacket', cat:'春季',
  t:'c/t/coat.webp', m:'c/m/coat.webp', i:'c/i/coat.webp'};
for (const [type,{file}] of Object.entries(collections)) {
  let items = [];
  if (type === 'costume') items = [{...sample,id:'skirt',en:'light petticoat'},sample,{...sample,id:'outerwear',en:'wool coat'},{...sample,id:'hidden-only',a:1}];
  if (type === 'pose') items = [{id:'standing',zh:'站立',en:'standing',line:'单人',lineEn:'solo',
    angles:[{zh:'正面',en:'front',i:'p/i/front.webp'},{zh:'侧面',en:'side',i:'p/i/side.webp'}]}];
  if (type === 'hair') items = [{...sample,id:'H001', ext:1,
    angles:[{zh:'棕发',en:'brown',i:'https://charadb-2fi.pages.dev/img/H001.jpg'}]}];
  if (type === 'prop') items = [{id:'lute',ti:'琵琶',zh:'琵琶',en:'lute',o:'o/t/lute.webp'}];
  const body = JSON.stringify(type === 'depth' ? {items} : items);
  const hash = createHash('sha256').update(body).digest('hex').slice(0,10);
  files.set('/assets/'+file+'.'+hash+'.json',body);
}
const app = "const AH='"+media+"';\nconst urls="+JSON.stringify([...files.keys()])+';';
files.set('/assets/app.1234567890.js',app);
files.set('/','<link rel="canonical" href="'+site+'"><script src="/assets/app.1234567890.js" defer></script>');

const web = http.createServer((req,res) => {
  const body = files.get(req.url);
  res.writeHead(body === undefined ? 404 : 200).end(body);
});
await new Promise(resolve => web.listen(0,'127.0.0.1',resolve));
const script = fileURLToPath(new URL('../mcp/server.mjs',import.meta.url));
const client = new Client({name:'posewear-smoke',version:'1'});
const transport = new StdioClientTransport({command:process.execPath,args:[script],
  env:{POSEWEAR_CATALOG_URL:'http://127.0.0.1:'+web.address().port+'/'}});
async function call(name,args) {
  const response = await client.callTool({name:'posewear_'+name,arguments:args});
  assert(!response.isError,JSON.stringify(response.content));
  return response.structuredContent;
}
try {
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length,4);
  const {collections:list} = await call('list_collections',{});
  assert.equal(list.length,12);
  assert.equal(list.find(item => item.collection === 'costume').count,3);
  assert.equal(list.find(item => item.collection === 'depth').count,0);
  const found = await call('search_references',{query:'blue jacket',collection:'costume',limit:1});
  assert.equal(found.items[0].id,'look-one');
  assert.equal((await call('search_references',{query:'coat',limit:1})).items[0].id,'outerwear');
  const page2 = await call('search_references',{query:'',limit:1,offset:1});
  assert.equal(page2.nextOffset,2);
  assert.equal((await call('search_references',{query:'hidden-only'})).total,0);
  const side = {collection:'pose',id:'standing',angle:1};
  const pose = await call('get_reference',{...side,language:'en'});
  assert.equal(pose.angles[1].en,'side');
  assert.equal(pose.image.url,site+'p/i/side.webp');
  assert.match(pose.prompt,/side/);
  assert.equal(pose.page,site+'#pose/standing');
  const input = [side,{collection:'costume',id:'look-one'},{collection:'hair',id:'H001'},{collection:'prop',id:'lute'}];
  const handoff = await call('compose_brief',{references:input,prompt:'Keep this composition.',language:'en'});
  assert.deepEqual(handoff.references.map(image => image.url),[
    site+'p/i/side.webp',site+'c/m/coat.webp','https://charadb-2fi.pages.dev/img/H001.jpg',media+'o/t/lute.webp']);
  assert.match(handoff.brief,/^Keep this composition\.\n\nReference images/);
  for (const image of handoff.references) assert(handoff.brief.includes(image.url));
  for (const input of [{...side,angle:8},{collection:'costume',id:'hidden-only'}]) {
    const response = await client.callTool({name:'posewear_get_reference',arguments:input});
    assert.equal(response.isError,true);
  }
  console.log('PASS MCP stdio discovery, scoped search, pagination, views, source links and mixed briefs');
} finally {
  await client.close();
  await new Promise(resolve => web.close(resolve));
}
