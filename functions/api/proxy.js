// 衣姿 PoseWear 转发代理（v10）：只转发、不记录、不存储任何请求内容或密钥。
// 限制：① 只接受本站页面发起的请求（Origin / Referer 同源）；② 官方接口只走标准 https；
// 自定义中转必须使用部署者配置的 HTTPS 主机，并使用公开的图像接口路径。
// ③ 结果图片只从官方结果 CDN 下载；④ 每 IP 频率限制。
const API_PATH=/^\/(api\/v3|v\d+(beta|alpha)?)\/(images\/(edits|generations)|models(\/[^/]+(:generateContent)?)?)$/;
const OFFICIAL=[/^api\.openai\.com$/,/^generativelanguage\.googleapis\.com$/,/^ark\.[a-z0-9-]+\.volces\.com$/,/^ark\.[a-z0-9-]+\.bytepluses\.com$/];
const IMG_HOSTS=[/^oaidalleapiprodscus\.blob\.core\.windows\.net$/,/(^|\.)volces\.com$/,/(^|\.)bytepluses\.com$/,/(^|\.)googleusercontent\.com$/];
const customHosts=env=>new Set((env?.POSEWEAR_PROXY_HOSTS||'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean));
const DROP=['host','x-target-url','x-proxy-kind','x-proxy-custom','cookie','origin','referer','x-forwarded-for','x-forwarded-proto','x-real-ip','content-length','sec-fetch-site','sec-fetch-mode','sec-fetch-dest'];
// 每个 isolate 的内存限流（尽力而为）；正式防护建议在 Cloudflare 控制台为 /api/proxy 加速率限制规则。
const RL=new Map(),WIN=60e3,MAX_API=20,MAX_IMG=40;
function limited(ip,kind){const now=Date.now(),k=kind+'|'+ip;let e=RL.get(k);if(!e||now-e.t>WIN){e={t:now,n:0};RL.set(k,e)}e.n++;
  if(RL.size>5000)for(const[x,v]of RL)if(now-v.t>WIN)RL.delete(x);return e.n>(kind==='img'?MAX_IMG:MAX_API)}
// 同一机房内共享的计数（Cache API，近似值，非原子）
async function cacheCount(ip,kind,ctx){try{const c=caches.default,m=Math.floor(Date.now()/WIN),key=new Request(`https://rl.invalid/${kind}/${encodeURIComponent(ip)}/${m}`);
  const r=await c.match(key),n=(r?+(await r.text())||0:0)+1;const p=c.put(key,new Response(String(n),{headers:{'cache-control':'max-age=120'}}));await p;return n}catch(e){return 0}}
async function over(ip,kind,ctx){const mem=limited(ip,kind);const n=await cacheCount(ip,kind,ctx);return mem||n>(kind==='img'?MAX_IMG:MAX_API)}
function sameSite(req){const self=new URL(req.url).host;for(const h of['origin','referer']){const v=req.headers.get(h);if(v){try{return new URL(v).host===self}catch(e){return false}}}return false}
export async function onRequest(ctx){const {request}=ctx;
  if(request.method==='OPTIONS')return new Response(null,{status:204});
  if(!['GET','POST'].includes(request.method))return j(405,'只支持 GET / POST');
  if(!sameSite(request))return j(403,'只接受本站页面发起的请求');
  let t;try{t=new URL(request.headers.get('x-target-url')||'')}catch(e){return j(400,'缺少或无效的 x-target-url')}
  if(t.username||t.password)return j(400,'目标地址不能带账号密码');
  const official0=OFFICIAL.some(r=>r.test(t.hostname));
  if(t.protocol!=='https:'||t.port)return j(400,'目标必须使用标准 HTTPS 地址');
  const ip=request.headers.get('cf-connecting-ip')||'0';
  const img=request.headers.get('x-proxy-kind')==='image';
  if(img){if(request.method!=='GET')return j(405,'图片下载只支持 GET');
    if(!IMG_HOSTS.some(r=>r.test(t.hostname)))return j(403,'该图片地址不在允许范围内');
    if(await over(ip,'img',ctx))return j(429,'请求过于频繁，请稍后再试');
    const r=await fetch(t.toString(),{redirect:'manual'}).catch(()=>null);const ct=r&&r.headers.get('content-type')||'';
    if(!r||!r.ok||!/^image\//.test(ct))return j(502,'结果图片下载失败');return new Response(r.body,{headers:{'content-type':ct,'cache-control':'no-store','x-content-type-options':'nosniff'}})}
  const official=official0,custom=request.headers.get('x-proxy-custom')==='1';
  if(!official&&(!custom||!customHosts(ctx.env).has(t.hostname)))return j(403,'该中转地址未配置本站转发，请使用浏览器直连');
  const path=t.pathname.replace(/\/+$/,'');
  if(official?!API_PATH.test(path):!/\/(images\/(edits|generations)|models(\/[^/]+(:generateContent)?)?)$/.test(path))return j(403,'该路径不允许通过代理转发');
  if(await over(ip,'api',ctx))return j(429,'请求过于频繁，请稍后再试');
  const h=new Headers();for(const[k,v]of request.headers){const l=k.toLowerCase();if(!DROP.includes(l)&&!l.startsWith('cf-'))h.set(k,v)}
  try{const r=await fetch(t.toString(),{method:request.method,headers:h,body:request.method==='POST'?request.body:undefined,redirect:'manual'});
    const oh=new Headers();['content-type'].forEach(k=>r.headers.get(k)&&oh.set(k,r.headers.get(k)));oh.set('cache-control','no-store');
    return new Response(r.body,{status:r.status,headers:oh})}
  catch(e){return j(502,'代理无法连接目标服务')}
}
const j=(s,m)=>new Response(JSON.stringify({error:{message:m}}),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
