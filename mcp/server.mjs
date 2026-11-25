import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { catalogIndex, collections, publishedSite, readCatalog } from '../scripts/catalog-source.mjs';
import { reference, formatBrief } from '../src/references.js';

const server = new McpServer({ name:'posewear', version:'1.0.0' }, {
  instructions:'Find references by collection and ID. Use get_reference for available angles. The URL in a reference is a directly usable image.',
});
const source = process.env.POSEWEAR_CATALOG_URL || publishedSite;
const showAdult = process.env.POSEWEAR_ALLOW_ADULT === '1';
const collectionIds = Object.keys(collections);
const collection = z.enum(collectionIds);
const language = z.enum(['zh','en']).default('zh').describe('Prompt and reference-label language.');
const pick = z.object({
  collection,
  id:z.string().min(1).describe('Exact catalog item ID returned by search. IDs are scoped to their collection.'),
  angle:z.number().int().min(0).default(0).describe('Zero-based view or color-variant index returned by get_reference.'),
});
const image = z.object({label:z.string(),url:z.url()});
const summary = z.object({
  collection, id:z.string(), title:z.string(), category:z.string(), angleCount:z.number().int(),
});
const annotations = { readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:true };
let indexPromise;
const records = new Map();

function index() {
  indexPromise ??= catalogIndex(source).catch(error => {indexPromise = undefined; throw error;});
  return indexPromise;
}
function items(type) {
  if (!records.has(type)) {
    const loading = index().then(meta => readCatalog(meta,collections[type].file))
      .then(catalog => catalog.items.filter(item => showAdult || !item.a))
      .catch(error => { records.delete(type); throw error; });
    records.set(type,loading);
  }
  return records.get(type);
}
function summarize(type,item) {
  return {collection:type, id:item.id, title:item.ti || item.zh || item.id,
    category:item.cat || item.sec || '', angleCount:item.angles?.length || 1};
}
function result(value,text = JSON.stringify(value)) {
  return {content:[{type:'text',text}],structuredContent:value};
}
async function resolvePick({collection:type,id,angle},lang) {
  const item = (await items(type)).find(record => record.id === id);
  if (!item) throw new Error(`Reference unavailable: ${type}/${id}. Use posewear_search_references to choose a visible item.`);
  const count = item.angles?.length || 1;
  if (angle >= count) throw new Error(`View ${angle} is unavailable for ${type}/${id}. Choose an index from 0 to ${count-1}.`);
  const view = item.angles?.[angle];
  const {site,assetHost} = await index();
  const ref = reference({...item,type},angle,site,lang,assetHost);
  const prompt = [item[lang], view && (lang === 'en' ? item.lineEn : item.line), view?.[lang]]
    .filter(Boolean).join(lang === 'en' ? ', ' : '，');
  return {item,angle,prompt,ref,page:new URL('#'+type+'/'+encodeURIComponent(id),site).href};
}

server.registerTool('posewear_list_collections',{
  title:'List PoseWear collections',
  description:'Discover all libraries with Chinese, English and Japanese names and visible item counts.',
  inputSchema:z.object({}),
  outputSchema:z.object({collections:z.array(z.object({collection,zh:z.string(),en:z.string(),ja:z.string(),count:z.number()}))}),
  annotations,
}, async () => {
  const list = [];
  for (const type of collectionIds) {
    const [zh,en,ja] = collections[type].names;
    list.push({collection:type,zh,en,ja,count:(await items(type)).length});
  }
  return result({collections:list});
});

server.registerTool('posewear_search_references',{
  title:'Find visual references',
  description:'Search catalog names, descriptions, categories, IDs and view names. Space-separated terms all match. Browse one library with an empty query.',
  inputSchema:z.object({query:z.string().default(''),collection:collection.optional(),
    offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(40).default(8)}),
  outputSchema:z.object({items:z.array(summary),total:z.number(),nextOffset:z.number().nullable()}),
  annotations,
}, async ({query,collection,offset,limit}) => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = [];
  for (const type of collection ? [collection] : collectionIds) {
    for (const item of await items(type)) {
      const names = [item.id,item.ti,item.zh,item.en,item.ja].filter(Boolean).map(value => value.toLowerCase());
      const searchText = [...names,item.kw,item.cat,item.catEn,item.catJa,item.line,item.lineEn,item.lineJa,item.no,
        item.sec,item.len,item.st,item.era,item.emo,item.int,...collections[type].names,
        ...(item.angles || []).flatMap(view => [view.zh,view.en,view.ja])].join(' ').toLowerCase();
      if (!terms.every(term => searchText.includes(term))) continue;
      const words = names.join(' ').split(/[^\p{L}\p{N}]+/u);
      let score = 0;
      for (const term of terms) {
        if (names.includes(term)) score += 4;
        else if (words.includes(term)) score += 2;
        else if (names.some(name => name.includes(term))) score += 1;
      }
      matches.push({type,item,score});
    }
  }
  matches.sort((a,b) => b.score-a.score);
  const page = matches.slice(offset,offset+limit).map(({type,item}) => summarize(type,item));
  return result({items:page,total:matches.length,nextOffset:offset+limit < matches.length ? offset+limit : null});
});

server.registerTool('posewear_get_reference',{
  title:'Get an image and its available views',
  description:'Resolve an exact reference to its selected image URL, prompt, entry page and available camera angles or color variants.',
  inputSchema:pick.extend({language}),
  outputSchema:summary.extend({angle:z.number(),angles:z.array(z.object({angle:z.number(),zh:z.string(),en:z.string()})),
    prompt:z.string(),image,page:z.url()}),
  annotations,
}, async input => {
  const {item,angle,prompt,ref,page} = await resolvePick(input,input.language);
  const angles = (item.angles || []).map((view,angle) => ({angle,zh:view.zh || '',en:view.en || ''}));
  return result({...summarize(input.collection,item),angle,angles,prompt,image:ref,page});
});

server.registerTool('posewear_compose_brief',{
  title:'Compose a prompt with reference images',
  description:'Assemble selected references in order into a copy-ready generation brief. Supply prompt to preserve your own wording, or omit it to combine catalog descriptions.',
  inputSchema:z.object({references:z.array(pick).min(1),prompt:z.string().min(1).optional(),language}),
  outputSchema:z.object({brief:z.string(),references:z.array(image)}),
  annotations,
}, async ({references,prompt,language}) => {
  const resolved = await Promise.all(references.map(selection => resolvePick(selection,language)));
  const images = resolved.map(selection => selection.ref);
  const description = prompt ?? resolved.map(({ref,prompt}) => ref.label+' — '+prompt).join('\n');
  const brief = formatBrief(description,images,language);
  return result({brief,references:images},brief);
});

await server.connect(new StdioServerTransport());
