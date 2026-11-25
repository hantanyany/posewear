import { createHash } from 'node:crypto';

export const publishedSite = 'https://posewear.pages.dev/';
export const collections = {
  pose:     { file:'poses',       names:['姿势','Poses','ポーズ'] },
  depth:    { file:'depths',      names:['深度姿势','Depth poses','深度ポーズ'] },
  costume:  { file:'costumes',    names:['服装','Outfits','衣装'] },
  anime:    { file:'anime',       names:['动画服装','Anime outfits','アニメ衣装'] },
  portrait: { file:'portraits',   names:['人像','Portraits','人物'] },
  expr:     { file:'expressions', names:['表情','Expressions','表情'] },
  hair:     { file:'hair',        names:['发型','Hairstyles','髪型'] },
  dyn:      { file:'dynasties',   names:['历代服饰','Historical dress','歴代衣装'] },
  scene:    { file:'scenes',      names:['场景','Scenes','背景'] },
  light:    { file:'lights',      names:['光影','Lighting','照明'] },
  prop:     { file:'props',       names:['道具','Props','小物'] },
  furn:     { file:'furniture',   names:['家具','Furniture','家具'] },
};
export const catalogNames = Object.values(collections).map(collection => collection.file);

async function checkedText(url) {
  const response = await fetch(url, { signal:AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Could not load ${url.pathname} (HTTP ${response.status})`);
  return response.text();
}

// Read the filenames that the actual SPA loads. Published builds carry a content hash;
// the source preview serves the same catalogs without a hash.
export async function catalogIndex(base) {
  const home = new URL(base);
  const html = await checkedText(home);
  const app = html.match(/<script\b[^>]*\bsrc=["']((?:\/assets\/app\.[a-f0-9]+|\/?app)\.js)["']/);
  if (!app) throw new Error('The site does not contain the PoseWear gallery script');
  const script = await checkedText(new URL(app[1],home));
  const files = new Map();
  for (const match of script.matchAll(/["']((?:\/assets\/)?([a-z]+)(?:\.([a-f0-9]+))?\.json)["']/g)) {
    files.set(match[2], { url:new URL(match[1],home), digest:match[3] });
  }
  const missing = catalogNames.filter(name => !files.has(name));
  if (missing.length) throw new Error('Missing catalog filenames: '+missing.join(', '));
  const canonical = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/);
  const site = new URL(canonical?.[1] || home,home).href;
  const assetPath = script.match(/\bconst AH=['"]([^'"]*)['"]/);
  return { files, site, assetHost:new URL(assetPath?.[1] || site,site).href };
}

export async function readCatalog(index,name) {
  const {url,digest} = index.files.get(name);
  const text = await checkedText(url);
  if (digest && createHash('sha256').update(text).digest('hex').slice(0,digest.length) !== digest) {
    throw new Error('Catalog fingerprint mismatch: '+name);
  }
  const payload = JSON.parse(text);
  const items = Array.isArray(payload) ? payload : payload.items;
  if (!Array.isArray(items)) throw new Error('Invalid catalog records: '+name);
  return {text,items};
}
